# Plan de correcciones de Emil (Clinara / MedBase)

Rama de trabajo: `correcciones-emil`. Un commit por punto.

## 1. Lo que encontré al explorar

| Tema | Cómo está |
|---|---|
| Stack | React 19 + Vite 8 + React Router 7 (SPA en `src/`), API Express 5 en `server/`, Postgres: PGlite embebido en local y Neon en Vercel (`api/index.ts` envuelve la API como función). Zod valida en el servidor. Sin librería de PDF: se imprime con `window.print()` y CSS `@media print`. |
| Esquema | `server/db.ts`, una sola cadena `SCHEMA` idempotente (`CREATE … IF NOT EXISTS`, `ALTER … ADD COLUMN IF NOT EXISTS`) que se vuelve a aplicar cuando sube `SCHEMA_VERSION` (hoy `9`). Las migraciones de datos van en funciones dentro de la misma transacción. |
| Roles y permisos | `src/lib/permissions.ts` (matriz compartida cliente/servidor). Servidor: `need(...)` por ruta + validaciones por registro. Cliente: `Guard` en rutas y `can()` en la interfaz. |
| Datos en el cliente | `src/lib/store.tsx`: `/api/bootstrap` carga personal, pacientes, citas (90 días atrás + futuro), recetas, camas, hospitalizaciones activas, seguimientos. Se refresca cada 30 s. |
| Componentes que se reutilizan | `Modal` (hoja inferior en celular), `PatientPicker`, `DxPicker`, `IdentificationForm`, `VitalsModal`, `MedForm` y `Discharge` (hospitalización), `PrescriptionSheet`, `Certificate`, `FullRecord`, `ClinicLogo`. |
| Horarios | Ya existe `staff.schedule` (JSON `{days, start, end, slot}`), editable por administración en Configuración. Solo una franja por día y solo lo usa la reserva en línea. |
| Bitácora | Tabla `audit` de solo inserción (trigger que impide UPDATE/DELETE). |
| Despliegue | Vercel: `vercel.json` compila con `npm run build` y publica `api/index.ts`. La primera petición de cada instancia aplica el esquema. |
| Línea base | `tsc -b` sin errores; `npm test`: 39/39; `oxlint`: 0 errores y 42 advertencias previas (no son de esta rama). Con Node 20.15 npm no instala el binario nativo de oxlint (pide ≥ 20.19); lo instalé con `--no-save`. |

## 2. Cambios de esquema (versión 10, todos aditivos)

| Tabla | Cambio | Para |
|---|---|---|
| `patients` | `pending BOOLEAN DEFAULT FALSE`, `birth_date` y `sex` admiten NULL, `guardian_name`, `guardian_dni`, `guardian_relation` | R2 paciente pendiente de registro; M5 menor sin identidad |
| `appointments` | `reassigned_from`, `reassigned_by`, `reassigned_at`; `reason` admite vacío | M1, R2 |
| `vitals` | `glucose` pasa de INTEGER a DOUBLE PRECISION (ampliación, sin pérdida) | E1 decimales |
| `consultations` | `indications TEXT` (JSON) | M2 indicaciones separadas de los medicamentos |
| `prescriptions` | `standalone BOOLEAN DEFAULT FALSE`, `indications TEXT` | M7 receta sin consulta |
| `staff.schedule` | Se agrega `week: {día: [{start,end}]}` dentro del mismo JSON; se conservan `days/start/end` derivados para compatibilidad. Lectura normalizada en `src/lib/schedule.ts` | R2 horario por día con varias franjas |
| `clinic_drugs` (nueva) | Vademécum de la clínica: genérico, comercial, presentación, concentración, vía, clave normalizada única por clínica, activo, autor y fecha | M3 |
| `certificates` (nueva) | Constancias emitidas: número correlativo por clínica, tipo, datos, autor, fecha, anulación | M4 |
| `hospitalizations` | `kind ('hospital','observation') DEFAULT 'hospital'`, `bed_id` admite NULL, `observation_at`, `converted_at`, `converted_by` | M6 observación en la misma tabla, para que pasar a hospitalización conserve notas, medicamentos y laboratorios |
| `hosp_notes` | CHECK de `kind` admite `procedure`; `data` guarda `{orders, checklist}` o los datos del procedimiento | H1, H2 |
| `order_marks` (nueva, solo inserción) | Marca y desmarca de órdenes: nota, número de orden, acción, motivo, quién y cuándo | H1 |
| `authorizations` (nueva) | Plantilla, datos llenados, estado (pendiente, firmada, rechazada, revocada), archivo firmado, autor y fechas | H3 |
| `clinics` | `obs_alert_hours DEFAULT 24`, `obs_order_checklist DEFAULT FALSE` | M6 |

No se borra ninguna columna ni tabla. `hosp_procedures` se conserva: sus registros viejos se muestran como notas de procedimiento sin estado (H2) o como autorizaciones anteriores (H3).

## 3. Plan por punto (en el orden de implementación)

### Arreglos rápidos
- **E1** — `src/lib/vitals.ts` (nuevo): rangos centralizados (imposible y fuera de rango, adulto y pediátrico por edad), `parseDecimal` con punto o coma y `checkVital`. `VitalsModal` (`WaitingRoom.tsx`): campos de texto con `inputMode="decimal"`, validación al salir del campo o al guardar, rojo + "Revise el valor" + confirmación, ámbar + "Fuera de rango, el médico verá la alerta", aviso si PAS < PAD, dolor vacío. `VitalsGrid` (`PatientChart.tsx`) usa los mismos rangos. El servidor solo rechaza lo físicamente imposible de guardar (límites amplios), porque un valor confirmado se guarda.
- **M5** — Causa: la identidad sí viaja del registro a la receta (lo comprobé con la API). El recuadro aparece cuando el expediente realmente no tiene identidad: pacientes que entraron por la reserva en línea (no la pide), pacientes de la demo sin identidad y el ejemplo "0801-1990-00000" del campo, que parece un dato ya escrito. Corrección en el origen: reserva en línea con identidad opcional, ejemplo con formato `0000-0000-00000`, formato automático, menor sin identidad con datos del responsable (receta, constancia), y la receta lee siempre del expediente (sin copias). Reviso teléfono, fecha de nacimiento y alergias en el mismo recorrido.
- **M1 (errores visuales)** — Separador "·", `age()` con "1 mes", "N meses" y días para menores de 1 mes, y el contraste de "En consulta": la regla `.row__who span` pintaba de gris todas las etiquetas dentro de la tarjeta; se limita a hijos directos.
- **H5** — `POST /api/inpatient/meds/:id/doses` acepta `inpatient.care` o `inpatient.orders`; en la hoja, "Aplicado por Dra. Herrera, médico, 21:15".

### Recepción
- **R1** — `src/app/Arrivals.tsx` (nuevo): lista "Por llegar" (citas de hoy programadas o confirmadas) ordenada por hora, con teléfono (llamar y WhatsApp), médico, "retrasado N min", etiqueta "Nuevo" y botón "Llegó" (mismo `setStatus('arrived')`; si es paciente nuevo, primero se completa el registro). La tarjeta "Por llegar" del inicio lleva a la lista y usa el mismo conteo. Recepción y administración marcan la llegada; médico (sus pacientes) y enfermería solo ven.
- **R3** — `GET /api/patients/index`: por paciente, fecha de registro, última consulta y su médico, próxima cita, seguimientos activos y estado (activo, hospitalizado, en observación), calculado en el servidor sobre todo el historial y no solo los 90 días que carga la app. `Patients.tsx`: botón "Filtros" (panel en escritorio, hoja inferior en celular), chips con X, "Limpiar filtros", "12 de 76 expedientes", filtros en la URL. La lista no está paginada (se cargan todos los expedientes de la clínica), así que el filtro se aplica sobre la lista completa.
- **R2** — `src/lib/schedule.ts` (franjas por día). Editor de horario reutilizable (Configuración → Horarios para administración, Mi cuenta → Mi horario para el médico, `PATCH /api/staff/:id/schedule` con permiso propio o de administración). Modal "Nueva cita": buscador de paciente con "Paciente nuevo" (nombre + teléfono, identidad opcional, aviso "¿Es esta persona?"), sin duración, hora como lista de franjas del horario del médico ("El Dr. Paz no atiende los jueves"), aviso suave si la hora ya tiene cita, motivo y tipo bajo "Más detalles". El paciente nuevo se guarda como `patients.pending = true`: aparece en agenda y "Por llegar", no en la biblioteca, y al llegar se completa con `IdentificationForm` precargado (`POST /api/patients/:id/complete`; si existe uno igual, la cita se pasa a ese expediente y el pendiente queda marcado como fusionado). En el calendario cada cita se dibuja con 30 min fijos. La reserva en línea usa el mismo cálculo de franjas en el servidor.

### Consulta externa
- **M1** — `WaitingRoom.tsx`: "Mis pacientes" por defecto y elección recordada; en "Toda la clínica" cada tarjeta muestra el médico; "Atender" en la de otro médico con confirmación. `POST /api/appointments/:id/take`: `UPDATE … WHERE doctor_id = ? AND status = 'triaged'`, de modo que si dos médicos lo toman a la vez solo uno lo obtiene y el otro recibe "Otro médico ya está atendiendo…". Guarda `reassigned_from/by/at` y bitácora. El médico original ve "Lo atiende Dra. Herrera".
- **M2** — `src/components/Medications.tsx` (nuevo): `MedicationForm` (vademécum, presentación, dosis, vía, frecuencia, duración, cantidad total, indicaciones; precarga los valores habituales del vademécum), `MedicationList` (filas editables y eliminables, "Acetaminofén 500 mg tableta — 1 g VO cada 8 h por 3 días"), alerta de alergia y de duplicado. `Consultation.tsx`: "Plan y manejo" en dos bloques, Indicaciones arriba (con "Órdenes frecuentes…" y la sugerencia "¿Agregarlo como medicamento?") y Medicamentos abajo con "+ Agregar medicamento". Firma: al menos una indicación o un medicamento. La receta imprime los medicamentos y, aparte, las indicaciones.
- **M3** — Tabla `clinic_drugs`, `GET/POST/PATCH /api/drugs`. En el buscador sin resultados: "Agregar '[texto]' como nuevo medicamento". Sin duplicados por mayúsculas, tildes o espacios (clave normalizada, también contra el vademécum base). Administración edita y desactiva en Configuración → Vademécum.
- **M7** — Menú "Recetas" para médicos. `Prescriptions.tsx`: paciente → medicamentos (componente de M2/M3) → indicaciones → emitir; historial filtrable por paciente y fecha, "Repetir receta". `POST /api/prescriptions` (receta sin consulta, `standalone`). La hoja dice "Receta sin consulta" y usa la identidad del expediente. Se agrega "Enviar por WhatsApp" (mensaje de texto con la receta; WhatsApp no permite adjuntar el PDF desde un enlace).
- **M4** — Tabla `certificates`, `POST /api/certificates`, `POST /api/certificates/:id/void`, `GET /api/certificates/:id`. `Certificate.tsx` se vuelve editor (atención con hora de inicio y fin, incapacidad con desde/hasta, libre, para el acompañante) con vista previa; al emitir se guarda con número `CM-AAAA-0001`, se reimprime y no se edita (se anula y se emite otra). "Incluir diagnóstico" desmarcado por defecto. Si el médico no tiene colegiado, se le pide una vez (`PATCH /api/me`). Botón "Generar constancia" en la nota de consulta y en el expediente.

### Hospitalización
- **H2** — Nota de procedimiento como `hosp_notes.kind = 'procedure'`: nombre, fecha y hora del procedimiento (obligatoria, editable, no futura) y texto. Se muestran dos horas. Va en la línea de tiempo con la etiqueta "Procedimiento". Aviso si no hay autorización firmada en 24 h, con opción de crearla o de marcar "Urgencia, sin autorización previa" con justificación (validado también en el servidor). Los registros viejos de `hosp_procedures` se muestran sin estado.
- **H1** — Nota en dos columnas (encabezado con quién, rol, fecha y hora; SOAP a la izquierda; órdenes numeradas a la derecha; se apila en celular). Editor con columna de órdenes donde pegar varias líneas crea varias órdenes. Tabla `order_marks`: enfermería marca "revisada" ("✓ Lic. Ríos 21:05"); desmarcar pide motivo; todo queda en la bitácora. Alertas: contador en el menú de enfermería y lista en su inicio ("3 órdenes nuevas — Juan Pérez, cuarto 104, Dra. Herrera, 20:39"), más la lista de pendientes por paciente.
- **H3** — Tabla `authorizations`, `src/lib/consent.ts` (plantillas y biblioteca de 9 procedimientos, editables en el formulario), hoja imprimible carta (`src/app/Authorization.tsx`), estados con subida de foto o PDF desde el celular (cámara). Se vincula a la nota de procedimiento ("Autorización firmada ✓ 22/10 17:40"). El texto lleva el comentario de validación legal.

### Observación
- **M6** — `hospitalizations.kind = 'observation'` (sin cama). Casilla "Ingreso a observación" en la consulta (excluyente con hospitalización); al firmar se crea la observación en la misma transacción. Menú "Observación" con contador entre Consulta externa y Hospitalizados. Lista con tiempo transcurrido y resalte pasadas 24 h (configurable). Expediente (`InpatientFile.tsx` con modo observación): Datos generales, Notas de evolución (la primera es la nota de consulta), Hoja de medicamentos (enfermería y médico aplican), Laboratorio; sin notas ni órdenes de enfermería. Botones Egreso (reutiliza la nota de egreso), Pasar a hospitalización (`POST /api/inpatient/:id/convert`: misma fila con cama asignada, todo se conserva en orden) y Autorización. Recepción y caja ven "En observación" (estado del paciente y filtro de R3).

### Impresión
- **H4** — `FullRecord.tsx` reescrito: índice en pantalla y "Imprimir / Descargar PDF". Orden: hoja de hospitalización (1 página), notas de evolución con la nota de consulta, procedimientos y egreso en su lugar cronológico (una por página, en dos columnas con las marcas de enfermería), notas de enfermería de corrido, hoja de medicamentos, laboratorios y autorizaciones como anexos. El encabezado se repite en cada página con `<thead>` (Chrome lo repite al imprimir) y el pie "Página X de Y" usa los márgenes de `@page` (Chrome 131 o posterior). Así no hace falta una librería. Observación: mismo formato, sin notas de enfermería.

## 4. Permisos nuevos

Se agregan `schedule.manage` (administración), `drugs.manage` (administración) y `orders.review` (enfermería). El resto usa los permisos que ya existen, con controles adicionales en el servidor (médico solo su horario, solo médicos toman pacientes de otro médico, etc.), según la tabla de la sección 4 de las instrucciones.

## 5. Valores por defecto de la sección 6

Se aplican tal cual: franjas cada 30 min (el `slot` del horario, 30 por defecto), paciente nuevo pendiente sin expediente, enfermería aplica medicamentos en observación, autorizaciones al final como anexos, nota de consulta como primera nota de evolución, alerta de observación a las 24 h configurable, desmarcar con motivo, órdenes de observación sin checklist (activable por clínica).
