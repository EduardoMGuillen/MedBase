# Correcciones de Emil, ronda 2 (cuarta ronda en el repositorio): plan

Rama `correcciones-emil-4`, un commit por punto. Emil llama «ronda 2» a este documento; en el repositorio ya existen
`PLAN_CORRECCIONES_2.md` y `_3.md`, así que este archivo se llama `PLAN_RONDA2.md`, como pidió, y el reporte será
`REPORTE_RONDA2.md`.

## Lo que encontré en el código

| Tema | Estado actual |
|---|---|
| Stack | React 19 + Vite, Express 5, Postgres (PGlite en local, Neon en Vercel), zod. Sin librería de gráficas (las de Reportes son SVG a mano, `src/components/Charts.tsx`) ni de PDF: todo se imprime con `window.print()`. |
| Esquema | `server/db.ts`, versión 25. Un SQL idempotente más funciones de datos que corren al cambiar la versión. Todo aditivo. |
| Autorizaciones | Tabla `authorizations` (`template` hospital/surgical, `status` pending/signed/refused/revoked/not_applicable, `file_id`). Hojas en `src/app/Authorization.tsx`, textos en `src/lib/consent.ts`, generación en `server/authorizations.ts`, rutas en `server/routes/inpatient.ts`. Sólo firma en papel. |
| A3 | La ronda 3 ya no crea la de hospitalización en observación; las pendientes viejas pasaron a `not_applicable`, y esa tarjeta es la que Emil ve en Anexos. |
| Archivos | `attachments` guarda el archivo dentro de la base. El límite es de 3 MB porque Vercel acepta como máximo 4,5 MB por petición y por respuesta. |
| Signos vitales | Tabla `vitals` (preclínica) con todos los campos opcionales. Rangos en `src/lib/vitals.ts`. Formulario y validación al salir del campo dentro de `VitalsModal` (`src/app/WaitingRoom.tsx`). Las notas de enfermería son texto libre, sin signos estructurados. |
| Órdenes frecuentes | Sólo en la consulta externa (`FREQUENT_ORDERS`, una constante en `Consultation.tsx`). No hay datos en la base. Las notas de evolución no la tienen. |
| Egreso | `Discharge` en `InpatientFile.tsx`, `POST /api/inpatient/:id/discharge`. Receta de salida en `prescriptions`. No hay epicrisis. |
| Menú | `src/app/AppShell.tsx`: lista plana con títulos de grupo. |
| Documentos emitidos | La constancia (`Certificate.tsx`, `server/routes/certificates.ts`) ya tiene emitir, anular con motivo y enviar por WhatsApp (`whatsappUrl`). La epicrisis sigue ese patrón. |

## Dependencias nuevas

- `pdf-lib`: arma el PDF de la autorización firmada en el servidor (texto, firmas, constancia, SHA-256) y une en el
  navegador un PDF de varias páginas con varias fotos.
- `pdfjs-dist`: dibuja las páginas de un PDF como imágenes. Sirve para la vista previa antes de subir, para ver la
  autorización firmada igual que impresa y para meter las hojas firmadas (virtuales o escaneadas) en el expediente
  completo impreso. Se carga sólo cuando hace falta (import dinámico).

## Esquema v26 (todo aditivo)

- `authorizations`: `archived_at`, `archived_reason`, `signing` (JSON: quién firma, representante, testigo,
  motivo si no puede firmar, firmas como PNG, dispositivo), `method` (`virtual` | `paper`), `pdf_id` (PDF final
  generado), `pdf_sha256`, `file_history` (JSON: escaneos reemplazados, que no se borran).
- `staff.signature` (PNG de la firma guardada del médico).
- `upload_parts` (subida por partes de hasta 15 MB; se unen al terminar) y lectura por rangos en
  `GET /api/attachments/:id`.
- `order_sets` (id, clinic_id, owner_id, name, items JSON, shared, use_count, last_used_at, archived_at, fechas).
- `epicrises` (id, clinic_id, hospitalization_id, patient_id, version, status draft/issued/voided, data JSON,
  autor, emisión, anulación con motivo, `replaces_id`).
- `vitals`: `hospitalization_id`, `recorded_at`, `voided_at`, `voided_by`, `void_reason`.
- `hospitalizations.vitals_every_hours`.
- `clinics.temp_low` (36.0) y `clinics.temp_high` (38.0).

Migraciones de datos: las autorizaciones `not_applicable` se archivan. Las estancias activas que vinieron de
observación y no tienen autorización de hospitalización reciben una pendiente.

## Puntos

### N1. Menú desplegable (`src/app/AppShell.tsx`, `src/index.css`)
Grupos con botón (chevron, `aria-expanded`, `aria-controls`) y animación corta con `grid-template-rows`. Abierto al
cargar si la ruta está dentro. Preferencia en `localStorage` por usuario. Cerrado, suma los contadores de sus
opciones junto al título. Aplica a «Pacientes», «Mi consultorio» y, por coherencia, «Administración».

### A3. Sin autorización de hospitalización en observación
- **Servidor:** `GET /api/inpatient/:id` no devuelve las archivadas. Migración de datos v26.
- **Cliente:** Anexos en observación sin ningún texto ni botón de la autorización de hospitalización, y el contador
  la excluye.
- **Prueba:** ingreso a observación → 0 autorizaciones; «Pasar a hospitalización» → 1 pendiente.

### A1 y A2. Firma en pantalla y escaneo (un solo componente para todas las autorizaciones)
- **`src/components/SignaturePad.tsx`:** lienzo con eventos de puntero, `touch-action: none` (la página no se mueve
  al dibujar), «Borrar y volver a firmar». Rechaza un recuadro vacío o un trazo mínimo (largo y alto/ancho
  mínimos).
- **`src/app/ConsentSigning.tsx`**, a pantalla completa y en letra grande:
  1. Lectura del documento con los datos.
  2. Quién firma (paciente o representante con nombre, identidad y parentesco obligatorios).
  3. «El paciente no puede firmar» con testigo obligatorio y motivo; testigo opcional en los demás casos.
  4. Casilla «He leído…».
  5. Firma.
  6. Firma del médico: contraseña otra vez (`POST /api/auth/confirm`) y su firma guardada; si no tiene, la dibuja
     una vez y se guarda en `staff.signature`.
  - Si quien gestiona es enfermería, la firma del paciente queda guardada y la autorización espera la firma del
    médico. Sigue pendiente y con la alerta hasta que firme el médico.
- **`server/consentPdf.ts`:**
  - Arma el PDF tamaño carta con el texto, los datos, las firmas incrustadas y la constancia: «Firmado
    electrónicamente en Clinara el …, gestionado por …, dispositivo …».
  - Lo guarda como adjunto, con su SHA-256.
  - Las mismas rutas sirven para aceptar, para «No autoriza» y para revocar.
- **Rutas nuevas:**
  - `POST /api/authorizations/:id/sign`: virtual (`patient` | `doctor` | `refuse` | `revoke`).
  - `POST /api/authorizations/:id/scan`: papel, nuevo o reemplazo con historial.
- **Escaneo:** `ScanUpload`.
  - Une varias fotos y un PDF de varias páginas en un solo PDF, en orden y reordenable.
  - Comprime las fotos (lado mayor de 1800 px, JPEG).
  - Vista previa con pdf.js.
  - Límite de 15 MB y cámara directa.
  - Se sube por partes.
- **Estados:** Pendiente de firma, Firmada (virtual), Firmada (papel escaneado), No autoriza y Revocada.
- **Firmada:** sin editar. Sólo «Ver e imprimir», «Revocar» y «Reemplazar escaneo» (si es en papel).
- **A2:** la nota de procedimiento muestra «Autorización firmada ✓ (virtual)» o «(papel)», con fecha y hora.
- **Textos:** ningún texto dice «validez legal plena». La constancia dice «firma electrónica simple registrada en
  Clinara».

### O1. Sets de órdenes
- **Servidor:** `server/routes/orderSets.ts`.
  - CRUD: «eliminar» archiva.
  - Duplicar.
  - `use`: contador, última vez y bitácora.
  - Compartir sólo en modo Clínica. Sólo el autor edita.
- **Ítems:** `{ text }` o `{ med }`.
  - El medicamento va con la estructura de la nota (fármaco, presentación, dosis, vía, cada N horas, PRN, días,
    indicaciones).
  - En consulta externa se convierte a la receta (frecuencia y duración en texto).
- **`src/components/OrderSets.tsx`:** selector «Set de órdenes» con buscador, los más usados primero y los
  compartidos aparte; «Guardar estas órdenes como set».
- **Pantalla «Mis sets de órdenes»:** `/app/sets-de-ordenes`, enlazada desde Mi cuenta. Permite editar, reordenar
  arrastrando (y con flechas para teclado o celular), duplicar, renombrar y eliminar.
- **Aplicar:**
  - Se agrega al final, editable y eliminable.
  - Nunca firma.
  - Los huecos `___` se resaltan en amarillo y bloquean la firma con un mensaje.
  - Aviso de duplicado.
  - Un medicamento que no está en el vademécum se inserta con la etiqueta «No está en el vademécum de la clínica».
  - En consulta externa, un medicamento sin días se marca como hueco: falta la duración.
- **Dónde:** `Consultation.tsx` (se quita «Órdenes frecuentes») y `NoteEditor` (hospitalización, observación y
  nota de ingreso).

### P1. Epicrisis
- **`server/epicrisis.ts`, `buildEpicrisis`:** junta los datos de la estancia en el orden pedido.
  - HEA de la consulta de origen o de la nota de ingreso.
  - Medicamentos agrupados por orden con inicio y fin.
  - Procedimientos, evolución y diagnósticos de egreso, condición, receta de salida e indicaciones.
  - Firma y sello.
- **Rutas** en `server/routes/epicrisis.ts`:
  - `POST /api/inpatient/:id/epicrisis`: genera el borrador.
  - `PATCH /api/epicrisis/:id`: corrige el borrador.
  - `POST /api/epicrisis/:id/issue`: emite.
  - `POST /api/epicrisis/:id/void`: anula y crea la versión siguiente en borrador.
  - `GET /api/epicrisis/:id`.
- **Alta en hospitalización:** el egreso genera el borrador en la misma transacción y el médico pasa directo a la
  vista previa.
- **Observación:** botón opcional.
- **Altas anteriores:** botón «Generar epicrisis».
- **`src/app/Epicrisis.tsx`:**
  - Vista previa editable con los campos obligatorios que faltan señalados.
  - Secciones «agregadas» que se pueden quitar.
  - Laboratorios a elegir.
  - Emitir, imprimir en carta, guardar como PDF desde la impresión (como el resto de la app) y enviar por WhatsApp
    (como la constancia).
- **Dónde se ve:** Anexos («Documentos de egreso») y el historial del paciente en la Biblioteca.

### S1. Hoja de signos vitales
- **`src/components/VitalsFields.tsx`:** los campos y la validación de la preclínica, extraídos de `VitalsModal`.
  Los usan la preclínica y la hoja.
- **Rutas:**
  - `POST /api/inpatient/:id/vitals`: hora de la toma no futura; guarda también la hora de registro.
  - `POST /api/vitals/:id/void`: con motivo.
  - `PATCH /api/inpatient/:id/vitals-frequency`: sólo el médico.
- **Expediente:** `GET /api/inpatient/:id` devuelve las tomas de la estancia más la preclínica de la consulta de
  origen como primera toma (una sola fuente: la tabla `vitals`).
- **`src/app/VitalsSheet.tsx`, la pestaña después de «Notas de evolución», en hospitalización y observación:**
  - Curva térmica en SVG:
    - Días de estancia y cuadrícula según la frecuencia.
    - Banda configurable.
    - Fiebre en rojo y con triángulo; hipotermia en azul y con cuadrado; valor escrito.
    - Tomas esperadas que faltan.
    - Pulso opcional y marcas de antipirético.
    - Rango 24 h, 3 días, 7 días o toda la estancia.
    - Detalle al tocar un punto.
  - Tarjetas por parámetro con sparkline y tendencia.
  - Tabla clásica con la primera columna fija.
- **Alertas del expediente:** fiebre o hipotermia de las últimas 24 h y tomas esperadas que no se registraron.
- **Configuración:** la banda la configura administración (o el médico titular en el consultorio).

### Impresión del expediente completo (`src/app/FullRecord.tsx`)
- **Hospitalización:** hoja, notas de evolución, notas de enfermería, **signos vitales** (curva en blanco y negro,
  7 días por página, y la tabla), hoja de medicamentos, laboratorios, anexos con la hoja firmada (las páginas del
  PDF virtual o del escaneo) y **epicrisis**.
- **Observación:** el mismo orden, sin notas de enfermería.

## Permisos (tabla de la sección 4)

| Función | Permiso |
|---|---|
| Firma en pantalla y escaneo | `inpatient.orders` o `inpatient.care` (médico, enfermería y asistente de consultorio). |
| Firmar como médico | `inpatient.orders`, más contraseña. |
| Registrar signos | `vitals.record` más acceso a la estancia. |
| Cambiar frecuencia | `inpatient.orders`. |
| Banda | `settings.manage`. |
| Emitir y anular epicrisis | `inpatient.orders`. |
| Reimprimir epicrisis | `inpatient.view`. Recepción no. |
| Sets | `consult.write`. |

Administración («Ver») sigue sin acceso al expediente clínico, como se decidió en las rondas anteriores. Lo anoto
para que Emil lo confirme.

## Decisiones de Emil a preguntas de este plan
- Un set de órdenes sirve en todos los servicios; en consulta externa, a un medicamento sin días se le marca la falta
  de duración y no se firma hasta completarla.
- Un medicamento del set que ya no está en el vademécum se inserta con aviso.
