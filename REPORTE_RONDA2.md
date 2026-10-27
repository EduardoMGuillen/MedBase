# Correcciones de Emil, ronda 2: reporte

Rama `correcciones-emil-4`, un commit por punto. El plan está en `PLAN_RONDA2.md`.

**Verificación al cerrar:**
- `tsc -b` sin errores.
- `oxlint`: 37 advertencias, las mismas que antes de empezar; ninguna nueva.
- `npm run build` compila.
- Pruebas: 133 de 133 pasan. Hay 12 pruebas nuevas en `server/ronda2.test.ts`.
- Lo probé en el navegador con Playwright y Chromium, con el rol de cada punto, en escritorio y a 390 px.
- No hubo errores en la consola. Encontré uno que ya existía (claves repetidas de React) y lo corregí.

## 1. Estado por punto

| Punto | Estado | Archivos principales | Cómo lo pruebas |
|---|---|---|---|
| **N1** Menú desplegable | Hecho | `src/app/AppShell.tsx`, `src/modules.css` | 1. Toca «Pacientes»: se cierra y aparece el contador sumado (ej. «Pacientes 5»). 2. Recarga: sigue cerrado. 3. Entra a Hospitalizados desde el buscador: el grupo se abre. Igual con «Mi consultorio» (Dra. López) y en el menú del celular. |
| **A3** Sin autorización de hospitalización en observación | Hecho | `server/db.ts` (v26), `server/routes/inpatient.ts` | 1. Abre a un paciente en observación, pestaña Anexos: no hay tarjeta «No aplica» ni botón de hospitalización. 2. «Pasar a hospitalización»: aparece la autorización de hospitalización «Pendiente de firma» con su alerta. |
| **A1** Hospitalización: firma en pantalla y escaneo | Hecho | `src/app/ConsentSigning.tsx`, `src/components/SignaturePad.tsx`, `src/app/ScanUpload.tsx`, `src/app/Authorization.tsx`, `server/routes/consent.ts`, `server/consentPdf.ts`, `server/routes/files.ts`, `src/lib/pdf.ts`, `src/lib/files.ts` | 1. Lic. Ríos, Anexos, «Firmar en pantalla»: representante con testigo, lectura, firmas y «Guardar firma del paciente». Queda «Firmó el paciente · falta el médico». 2. Dra. Herrera, «Firmar como médico»: contraseña y firma. Queda «Firmada (virtual)», sin botón de editar. 3. «Ver e imprimir» muestra el PDF con las firmas y la constancia. |
| **A2** Quirúrgica: lo mismo | Hecho | Los mismos de A1; `InpatientFile.tsx` (`ProcedureNote`) | 1. Crea dos autorizaciones quirúrgicas. 2. Firma una en pantalla y la otra con «Subir hoja firmada» (PDF de varias páginas más fotos). 3. Escribe la nota de procedimiento: dice «Autorización firmada ✓ (virtual)» o «(papel)» con fecha y hora. |
| **O1** Sets de órdenes | Hecho | `src/components/OrderSets.tsx`, `src/app/OrderSetsPage.tsx`, `src/lib/orderSets.ts`, `src/lib/useOrderSets.ts`, `server/routes/orderSets.ts`, `Consultation.tsx`, `InpatientFile.tsx` (`NoteEditor`), `Medications.tsx` | 1. En una nota escribe órdenes con «Ayuno de ___ a ___» y «Guardar estas órdenes como set». 2. En otro paciente, «Set de órdenes»: los huecos salen en amarillo y «Guardar nota» no se activa hasta llenarlos. 3. Mi cuenta, «Abrir mis sets»: edita, reordena, duplica y elimina. |
| **P1** Epicrisis | Hecho | `src/app/Epicrisis.tsx`, `server/epicrisis.ts`, `server/routes/epicrisis.ts`, egreso en `server/routes/inpatient.ts`, `FullRecord.tsx`, `PatientChart.tsx` | 1. Da el alta a un hospitalizado: se abre la vista previa de la epicrisis. 2. Corrige el texto si hace falta y «Emitir»: queda bloqueada, con «Imprimir o guardar PDF», «Enviar por WhatsApp» y «Anular». 3. En la Biblioteca, pestaña Hospitalizaciones, una alta anterior tiene «Generar epicrisis». |
| **S1** Hoja de signos vitales | Hecho | `src/app/VitalsSheet.tsx`, `src/lib/vitalsSheet.ts`, `src/components/VitalsFields.tsx`, `src/lib/vitalsForm.ts`, `MedAlerts.tsx`, `server/routes/inpatient.ts`, `Settings.tsx` | 1. Pestaña «Signos vitales», «+ Registrar signos vitales», sólo la temperatura 38,6: aparece en rojo con su valor y en las alertas. 2. Cambia «Toma cada» a 4 h (médico): cambia la cuadrícula. 3. «Expediente completo» e imprime: la curva se entiende en blanco y negro. |
| Impresión del expediente completo | Hecho | `src/app/FullRecord.tsx` | Hospitalización, en este orden: hoja, notas de evolución, notas de enfermería, signos vitales (7 días por hoja), medicamentos, laboratorios, autorizaciones con la hoja firmada (PDF virtual o escaneo) y epicrisis. Observación: igual, sin notas de enfermería. |

### Lo que probé de la revisión final (sección 7)

**Flujo de punta a punta, en el navegador:**
- **Observación:** no hay autorización de hospitalización. Creé una quirúrgica y la firmé en pantalla desde un celular de 390 px, con el médico firmando en la misma sesión. La nota de procedimiento la reconoce.
- **Signos:** tomas cada 8 h con una fiebre de 38.6 °C y una hipotermia de 35.4 °C. Salen en rojo y en azul, con su valor, y en las alertas.
- **Pasar a hospitalización** (prueba de servidor): se crea la autorización pendiente.
- **Firma de un representante con testigo:** en pantalla. Otra autorización en papel con un PDF de 3 páginas y 3 fotos, unidos en un solo documento de 6 páginas.
- **Sets:** guardé las órdenes como set y lo apliqué en otro paciente, llenando los huecos `___`.
- **Alta:** epicrisis generada, revisada, emitida e impresa.
- **Expediente completo:** sale en el orden de la sección 6, con la curva legible en blanco y negro.
- **Altas anteriores:** generé la epicrisis de una (prueba de servidor; el botón está en Anexos y en la Biblioteca).
- **Menú:** en ambos modos, con el estado recordado y el contador sumado.

**A 390 px:** la firma en pantalla (el recuadro no desplaza la página), la curva (se desplaza a lo ancho, la página no) y el menú.

**Permisos por URL directa:**
- **Recepción y administración:** no entran a la epicrisis, al expediente, a las autorizaciones ni a los sets; la API responde 403.
- **Enfermería:** ve la epicrisis, el expediente y las autorizaciones; no ve los sets.
- **Médico:** entra a todo.

**Migración, sobre una base v25 creada con el código de `main`:**
- Ninguna tabla perdió filas.
- La «No aplica» quedó archivada, no borrada.
- La estancia que pasó a hospitalización sin autorización recibió una pendiente.
- También probé una base local antigua (v7 → v30), sin pérdida de filas.

**Lo que no pude probar:**
- Un celular o tablet reales con el dedo: usé Chromium simulando 390 px y el mouse.
- Safari de iOS.
- Una impresora real: revisé la vista de impresión y el PDF que genera Chrome.
- El despliegue en Vercel con Neon: no publiqué esta rama.
- La subida por partes y la lectura por rangos son la solución al límite de 4,5 MB de Vercel. Funcionan en local y en las pruebas, pero conviene confirmarlas en el despliegue.

## 2. Base de datos y migraciones

Todo es aditivo y nada se borra. Va de la versión 25 a la 30, un salto por punto.

| Versión | Cambio |
|---|---|
| v26 (A3) | `authorizations.archived_at` y `archived_reason`. Las autorizaciones «No aplica (observación)» **se archivan**: siguen en la base, pero el expediente no las muestra ni las cuenta. Las estancias **activas** que vinieron de observación sin autorización de hospitalización reciben una pendiente de firma, con su registro en la bitácora. |
| v27 (A1, A2) | `authorizations.method` (`virtual` o `paper`), `signing`, `pdf_id`, `pdf_sha256`, `revocation` y `file_history`. Las que ya tenían hoja subida quedan como `paper`. `staff.signature` guarda la firma del médico. Tabla `upload_parts` para los archivos grandes. |
| v28 (O1) | Tablas `order_sets` y `order_set_uses`. **«Órdenes frecuentes»** era una lista fija en el código (`FREQUENT_ORDERS` en `Consultation.tsx`), sin datos en la base: no había nada que migrar. La lista se quitó de la pantalla. |
| v29 (P1) | Tabla `epicrises` (versión, borrador, emitida o anulada, y reemplazo). Las altas anteriores **no** reciben una epicrisis automática: se genera con el botón, para no crear documentos que nadie revisó. |
| v30 (S1) | `vitals.hospitalization_id`, `recorded_at`, `voided_at`, `voided_by` y `void_reason`: la hoja usa la misma tabla que la preclínica. `hospitalizations.vitals_every_hours`. `clinics.temp_low` y `temp_high`, con 36.0 y 38.0 por defecto. |

«Restablecer demo» vacía también las tablas nuevas.

## 3. Valores por defecto (sección 6) y decisiones propias

**Valores de la sección 6, usados tal cual:**
1. Observación lleva la pestaña «Signos vitales».
2. La pestaña va después de «Notas de evolución».
3. El orden del expediente impreso es el indicado.
4. Toma cada 8 h si no hay otra indicación.
5. Banda normal de 36.0 a 38.0 °C, configurable. Desde 38.0 es fiebre; por debajo de 36.0, hipotermia.
6. Los huecos `___` bloquean la firma. También lo valida el servidor.
7. Los sets son personales; compartir es opcional y sólo en modo Clínica.
8. La epicrisis es un documento aparte y además va al final del expediente.
9. El médico firma con su contraseña y su firma guardada. Si no tiene, la dibuja una vez y se guarda.
   - La app no tiene PIN: se usa la contraseña.

**Lo que decidiste tú durante la ronda (O1):**
- Un set sirve en todos los servicios. En consulta externa, un medicamento sin días se marca como falta de duración.
- Un medicamento que no está en el vademécum se inserta con el aviso «No está en el vademécum de la clínica».

**Decisiones propias que conviene confirmar:**

*Firma en pantalla:*
- **Orden de los pasos:** quién firma → lectura → firmas → médico. El personal elige quién firma antes de pasarle el aparato al paciente, y la lectura ya sale con su nombre.
- **Si la gestiona enfermería:** la firma del paciente se guarda y la autorización sigue **pendiente**, con su alerta, hasta que un médico entra con su usuario y pone su firma desde Anexos. Con la sesión de enfermería abierta no se puede confirmar «con la sesión del médico».
- **Rechazo y revocación:** «No autoriza» y la revocación no llevan firma del médico, como las casillas de la hoja en papel.
- **Revocación:** se registra aparte; el documento firmado original se conserva.
- **El PDF final:**
  - Lo genera el servidor (pdf-lib) con fuentes estándar.
  - La huella SHA-256 se guarda en la base y se muestra en la app y en el expediente impreso. No va dentro del PDF, porque cambiaría la huella.
  - El dispositivo se toma del navegador; por ejemplo, «Tableta · Chrome en Android».

*Escaneo:*
- Hasta 15 MB.
- Las fotos se reducen a 1800 px y se comprimen a JPEG.
- Se sube y se lee por partes de 3 MB, por el límite de Vercel.

*Sets de órdenes:*
- «Los más usados» se cuenta por médico.
- Eliminar un set lo archiva.
- Duplicar uno compartido crea una copia personal.

*Epicrisis:*
- **Cuándo se crea:** se genera sola sólo al dar el alta en hospitalización. En observación es con el botón. Una estancia que terminó en **referencia** no ofrece epicrisis, porque ya tiene su hoja de referencia.
- **De dónde sale cada dato:**
  - HEA: de la consulta que lo ingresó o, si no hay, del subjetivo de la nota de ingreso.
  - Médico tratante: quien lo ingresó.
  - Firma: la de quien la emite.
  - Días de estancia: por fecha de calendario, con mínimo 1.
- **Medicamentos:** sólo los que tienen dosis aplicadas en la hoja, agrupados por medicamento, dosis, vía y frecuencia, con inicio y fin («hasta el egreso» si siguieron hasta el alta).
- **Lo obligatorio para emitir:** diagnóstico de ingreso, HEA, evolución e indicaciones (o la cita de control).
- **Lo que se puede corregir en la vista previa:** el texto (HEA, evolución, condición, cita de control e indicaciones), quitar secciones agregadas y elegir laboratorios. Los diagnósticos y los medicamentos salen del expediente y no se editan ahí.
- **PDF:** se guarda con «Guardar como PDF» del diálogo de impresión, como el resto de la app.
- **WhatsApp:** envía un resumen en texto, como la constancia. La app no envía archivos ni tiene portal del paciente.

*Signos vitales:*
- **Cuadrícula y tomas esperadas:** se alinean con la **primera toma registrada en la hoja**, redondeada a la hora. Si enfermería tomó a las 14:05 y es cada 8 h, se esperan a las 22:00, 06:00 y 14:00. Lo elegí así para no marcar tomas pendientes que no lo son. Si prefieres un horario fijo (ej. 06-14-22), es un cambio pequeño.
- **Frecuencia:** si el médico no la eligió, se lee de la orden («Signos vitales cada 4 horas», «SV c/6h») en las notas o en la consulta que lo ingresó.
- **Alertas:** fiebre o hipotermia de las últimas 24 h, y tomas pendientes de las últimas 24 h, con una hora de margen.
- **Marcas y rango:** las de antipiréticos están siempre (acetaminofén, metamizol, ibuprofeno); el pulso está apagado por defecto. El rango inicial es toda la estancia, o 7 días si hay muchas tomas.
- **Impresión:** 7 días por hoja; la tabla se parte en bloques de 14 tomas para que quepa en la hoja carta.

*Menú (N1):* el estado se recuerda en el navegador, por usuario. En modo Clínica también se puede plegar «Administración», por coherencia.

*A3:* la autorización faltante sólo se crea para estancias **activas**, porque en una egresada no se puede firmar.

*Permisos:* administración sigue **sin** acceso al expediente clínico, igual que en las rondas anteriores, aunque la tabla dice «Ver» para la hoja de signos y la epicrisis. Si quieres que la vea, es un permiso nuevo de sólo lectura.

## 4. Lo que debes validar tú o el abogado de la clínica

**La firma en pantalla.** Es una firma electrónica **simple**, no la **avanzada** con certificado digital de la Ley sobre Firmas Electrónicas (Decreto 149-2013, reformado por el 33-2020).
- La app guarda la evidencia: fecha y hora, usuario, dispositivo, huella SHA-256 del PDF y los datos de quien firma.
- La app no dice en ningún lugar que tenga «validez legal plena». La constancia del PDF dice expresamente que es una firma simple.
- Tú y el asesor legal deben confirmar si es suficiente para la autorización de hospitalización y para la quirúrgica. La opción de papel con escaneo sigue disponible.

**Los textos.**
- De las autorizaciones, del rechazo informado y de la revocación: `src/lib/consent.ts`, función `consentDocument`.
- De la constancia: `SIGNATURE_NOTICE` en el mismo archivo.

**La banda de temperatura.**
- 36.0 a 38.0 °C, con fiebre desde 38.0 y hipotermia por debajo de 36.0.
- Ojo: el rango de la preclínica (`src/lib/vitals.ts`) es otro, de 35.5 a 37.9. Por eso un 38.9 sale en ámbar en el formulario («fuera de rango») y en rojo en la curva («fiebre»).
- Conviene que decidas si unificarlos.

**El contenido de la epicrisis:**
- Que los medicamentos «administrados» sean sólo los que tienen dosis registradas.
- Que la firma sea la del médico que la emite.

## 5. Errores y mejoras que encontré

**Corregido de paso:**
- **Claves repetidas de React** en las listas de medicamentos del egreso y de la nota («Acetaminofén» tiene varias presentaciones). Salía un error en la consola.
- **Dos pruebas que ya fallaban en `main`** antes de esta rama: «días pasados» y «formato 2». Con los casos de demo de la v25, tomaban una estancia que ya tenía otra Ceftriaxona y notas en el formato 2. Ahora eligen su propio registro.

**Pendiente, sólo lo reporto:**
- **Archivos de laboratorio:** siguen con el límite de 3 MB y su PDF no se imprime dentro del expediente. Ya existen la subida por partes y el visor de páginas (`PdfPages`), que podrían usarse también aquí.
- **«Volver a los anexos»:** el botón de la página de una autorización siempre lleva a la ruta de hospitalización. Funciona también en observación, pero la dirección dice «hospitalizados».
- **Nombre del plan:** este archivo se llama `PLAN_RONDA2.md`, como pediste, pero en el repositorio ya hay un `PLAN_CORRECCIONES_2.md` de otra ronda. Para las siguientes conviene numerarlas seguido.
