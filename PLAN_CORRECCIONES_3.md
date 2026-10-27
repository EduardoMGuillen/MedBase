# Correcciones de Emil, tercera ronda: plan

Rama `correcciones-emil-3`, un commit por punto. Esta ronda reemplaza lo que choque de las rondas 1 y 2.

## P3. Medicamentos a la hoja (primero; ya hecho en `cca2839`)

**Causa reproducida.** Una prueba en `server/corrections3.test.ts` fallaba igual que en producción.
- José Aguilar se atendió a las 15:11 del 26/10 con la versión anterior a la ronda 2, que llegó a `main` después de las 18:34. Esa versión dejaba los medicamentos de una consulta con «Ingreso a observación» sólo en la receta y creaba la observación sin órdenes.
- La ronda 2 creaba órdenes únicamente al firmar la consulta, y no rellenó las estancias que ya existían.
- «Pasar a hospitalización» (hipótesis f) no pasaba por la función que crea órdenes, así que tampoco lo corrigió al hospitalizarlo.
- Las pruebas de la ronda 2 sólo usaban consultas firmadas con el código nuevo y no cubrían una estancia anterior ni la conversión.

**Corrección.**
- `syncStayOrders` (`server/medOrders.ts`) es la única función que crea o completa las órdenes de una estancia; la usan todas las rutas de la tabla.
- La nota de evolución sigue con `createMedOrders` (el mismo módulo) y lleva un identificador para no duplicarse.
- En hospitalización pasan todos los medicamentos de la consulta.
- Las órdenes con días vencen solas (`courseEnd`).
- No hay dosis anteriores a la llegada.
- Relleno: la v24, más `scripts/med-orders.ts` con `--dry-run`, `--apply` y `--check`.

## P2. Indicaciones y medicamentos a la derecha

- `src/lib/inpatient.ts` (`splitOrders`): sin cambios de datos.
- **Vistas:**
  - `SoapNote` y el editor (`NoteEditor`) en `InpatientFile.tsx`: izquierda = texto clínico; derecha = Indicaciones numeradas y debajo «Medicamentos» con guion.
  - La nota de ingreso (`ConsultEntry` → `ConsultationBody` en `PatientChart.tsx`) pasa a dos columnas con el mismo componente.
  - También se aplica en «Ver nota completa» (`ConsultNote.tsx`) y en la impresión (`FullRecord.tsx`, sin partir el bloque de medicamentos).
- **Componente compartido nuevo:** `NoteColumns` (`src/components/NoteColumns.tsx`).
- **Examen físico:** sólo las líneas de la guía que tienen contenido.
- **Captura rápida:** `MedForm` de la nota gana «Guardar y agregar otro».

## P4. Segundo formato de nota

- `hosp_notes.data.format`: `soap` (por defecto, también en las notas que ya existen) o `dx` (Diagnóstico · Examen físico · Observaciones).
- Los diagnósticos se guardan con el buscador CIE-11 (`DiagnosisPicker`).
- El formato se recuerda por médico en `staff.prefs` (columna nueva, JSON).
- **Validación:**
  - SOAP: los 4 campos, igual que hoy.
  - Formato 2: al menos un campo, una indicación o un medicamento.
- **Archivos:** `server/routes/inpatient.ts`, `server/mappers.ts`, `src/lib/types.ts`, `InpatientFile.tsx`, `FullRecord.tsx`.

## P1. «Editar datos generales»

- **Servidor:** `PATCH /api/inpatient/:id` acepta sólo cama (no en observación), acompañante, teléfono del acompañante y teléfono del paciente. Ya no acepta hora de ingreso, motivo ni diagnósticos, y no vuelve a vincular la consulta.
- **Datos del paciente:** se guardan con `PATCH /api/patients/:id` (el expediente). Se agrega bitácora campo por campo: valor anterior y nuevo.
- **Autorización:** la de hospitalización pendiente se actualiza; la firmada no.
- **Interfaz:** `AdmitModal` en modo edición se reemplaza por `GeneralDataModal`. Ningún texto dice «Corregir ingreso».
- **Permisos:**
  - Enfermería y administración editan los datos generales (`inpatient.general`, permiso nuevo).
  - La cama sólo la edita quien también puede ver la hospitalización.
  - Administración no tiene acceso a la estancia clínica, así que la edición es desde el endpoint y no le muestro el expediente (anotado como decisión).

## P5. Autorización quirúrgica mínima

- **Formulario:** sólo Procedimiento y Diagnóstico. El diagnóstico se precarga con los diagnósticos vigentes; el campo sólo aparece si no hay.
- **Sin pestañas:** el botón abre sólo la quirúrgica; la de hospitalización se maneja desde Anexos y el aviso.
- **Texto genérico fijo** en `src/lib/consent.ts`. Lo que la hoja trae para llenar a mano son líneas.
- Las autorizaciones ya emitidas no se tocan: la hoja vieja se sigue imprimiendo con sus datos.

## P6. Referencia en el consultorio y observación sin autorización

- **Botón:** si `features(settings).office`, «Referencia» en lugar de «Pasar a hospitalización».
- **Tabla nueva `referrals`:** número correlativo, datos congelados, destino, estado emitida/anulada.
- **Rutas:**
  - `POST /api/inpatient/:id/referral`: emite, cierra la observación con `outcome = 'referred'` y la deja en Anexos.
  - `GET /api/referrals/:id`.
  - `POST /api/referrals/:id/void`.
- **Datos precargados:**
  - de la consulta de origen: HEA, examen y diagnóstico;
  - de la última nota: examen;
  - de la preclínica: signos;
  - de la hoja: dosis aplicadas;
  - de la estancia: indicaciones y laboratorios.
  - Lo que falta queda en blanco con línea.
- **Observación sin autorización de hospitalización:**
  - Se genera sólo al hospitalizar: ingreso directo o «Pasar a hospitalización».
  - Las pendientes de observación pasan a `not_applicable` (estado nuevo); las firmadas no se tocan.
- **Biblioteca:** el filtro de estado no ofrece «Hospitalizado» en un consultorio.

## P7. Zona horaria

**Causa encontrada:**
- El servidor en Vercel corre en UTC.
- Los datos de demostración del consultorio se crearon a las 00:3x UTC del 27/10 (18:3x en Honduras del 26/10), así que «hoy» fue el 27.
- Las horas locales sin zona («08:30») se leyeron como UTC: 02:30 del 27/10 en Honduras.

**Corrección:**
- El servidor fija `TZ = America/Tegucigalpa` (o `CLINIC_TZ`) al arrancar.
- Las horas de la demo se leen en la hora de Honduras.
- Se corrigen los datos de demostración del consultorio que quedaron desfasados (sólo los de la semilla, identificados por su id).

## Esquema (v24)

- `staff.prefs` (JSON).
- `hospitalizations.outcome`, `outcome_note`.
- `authorizations.status` admite `not_applicable`.
- Tabla `referrals`.
- Permiso nuevo `inpatient.general`.
- Relleno de órdenes.

Todo es aditivo.
