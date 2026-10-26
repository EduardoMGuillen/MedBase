# Correcciones de Emil, segunda ronda: plan de implementación

Rama `correcciones-emil-2`, un commit por punto. Línea base al empezar: 61 pruebas pasan, `tsc -b` sin errores, `oxlint` con 38 advertencias (todas anteriores).

## Diagnóstico (lo que encontré en el código)

| Síntoma | Causa en el código |
|---|---|
| M1: los medicamentos de la consulta con ingreso no llegan a la hoja | `POST /api/consultations` (`server/app.ts`) guarda los medicamentos sólo en `prescriptions.items` (la receta). La hoja (`MedSheet` en `src/app/InpatientFile.tsx`) lee `hosp_meds`, que únicamente llena `applyMeds` de `POST /api/inpatient/:id/notes`. Ni la observación creada al firmar ni `POST /api/inpatient` (ingreso desde la consulta) crean filas en `hosp_meds`. Son tres rutas distintas y sólo una escribe en la hoja. |
| M1: el segundo ingreso no jala nada | `POST /api/inpatient` sólo vincula la consulta si llega `consultationId` en la URL; desde "Ingresar paciente" no llega, y aunque llegue no copia medicamentos. |
| M4: pide otra nota de ingreso | `MedicalNotes` calcula `hasAdmission` sólo con una nota `admission`, observación o `observationAt`; el servidor responde "Primero va la nota de ingreso" con la misma regla. La consulta de origen (`consultation_id`) no cuenta en hospitalización. Además el ingreso a hospitalización se crea después de firmar, en un segundo paso que se puede abandonar. |
| M6: no está el botón Procedimiento | Sigue la ruta `/procedure-notes`, pero el botón sólo aparece si `hasAdmission`: en una hospitalización desde consulta sin nota de ingreso desaparece (mismo defecto que M4). |
| M2: el medicamento sale abajo | En `NoteEditor` y `SoapNote` todos los medicamentos van en la columna derecha, mezclados con las órdenes, y el formulario va al final. |
| M3: días obligatorios | `MedicationForm` exige duración salvo dosis única; no sabe el tipo de atención. |
| E1: sólo un día | `MedSheet` tiene flechas de día, pero no vista Semana ni botón Hoy; registra dosis de días pasados sin motivo. |

**Corrección de raíz de M1:** `hosp_meds` pasa a ser la única fuente de verdad de las órdenes de medicamento, con origen (`source`, `source_id`, `source_index`) y un índice único que hace idempotente cualquier creación. Una sola función de servidor, `createMedOrders` (archivo nuevo `server/medOrders.ts`), es la única que inserta órdenes; la usan la firma de consulta con ingreso, el ingreso manual, las notas de evolución/observación y la migración. La hoja sigue leyendo `hosp_meds`.

## Esquema (v22, todo aditivo)

- `hosp_meds`: `patient_id`, `source` (`consultation` | `note`), `source_id`, `source_index`, `days` (NULL = hasta nueva orden), `stop_reason`, `replaces_id`. Índice único `(hospitalization_id, source_id, source_index)` donde `source_id` no es NULL.
- `consultations`: `admit_kind` (`hospital` | `observation`), `meds` (JSON de los medicamentos con `applyInClinic`).
- `hosp_doses`: `corrected_at`, `corrected_by`, `correction_reason`, `previous` (JSON del registro anterior).
- `authorizations`: la restricción de `template` admite además `hospital` y `surgical`; las filas `general` y `procedure` se conservan y se muestran como "anteriores" (la `procedure` se lee como quirúrgica).
- `prescriptions`: `patient_id` admite NULL; `guest` (JSON del paciente no registrado), `linked_at`, `linked_by`.
- `clinics.dni_mask` (por defecto `0000-0000-00000`).
- Migraciones de datos: identidades de 13 dígitos sin guiones → `0000-0000-00000` (`patients.dni`, `guardian_dni`); hospitalizaciones sin consulta ni nota de ingreso → se vinculan a la consulta del mismo paciente en las 24 h anteriores al ingreso, y si siguen activas se crean sus órdenes desde esa consulta sin duplicar fármacos activos.

## Bloques y archivos

### 1. Arreglos rápidos
- **M8 identidad**: `formatDni`/`normalizeDni`/`dniDigits` en `src/lib/format.ts` con máscara configurable; componente `DniInput` (`src/components/DniInput.tsx`, cursor estable, borra a través del guion, teclado numérico, aviso al salir del campo). Reemplaza los campos de `PatientForms.tsx`, `Agenda.tsx`, `Booking.tsx`, `Authorization.tsx`, `Certificate.tsx`, receta para no registrado. Servidor normaliza en pacientes, reserva, autorizaciones, constancias y recetas. Búsqueda con o sin guiones (`Inpatients.tsx` `PatientPicker`, `Agenda.tsx`, `Patients.tsx`, `Search.tsx`). Configuración: campo "Formato de identidad" en `Settings.tsx`.
- **M3 días**: `MedicationForm` recibe `requireDuration` y `applyInClinic`; `Consultation.tsx` pasa `requireDuration = !(admit || observe)` y lista "falta la duración de X" si cambia a ambulatorio. Cantidad total calculada (`autoQuantity` en `format.ts`). `medicationOrder` escribe "hasta nueva orden" sin duración. Servidor: ítems ambulatorios sin duración → 400. En la nota de evolución, `MedForm` gana "Días (opcional)". La hoja muestra "Día N" / "Día N de M". Suspender desde la hoja con motivo (`POST /api/inpatient/meds/:id/stop`). Egreso: lista de órdenes abiertas para pasarlas a la receta pidiendo los días.
- **M7 receta sin biblioteca**: `POST /api/prescriptions` acepta `guest` en lugar de `patientId`; `POST /api/prescriptions/:id/link`. `Prescriptions.tsx`: "Receta para paciente no registrado", aviso "¿Es esta persona?" (`similarPatients`), historial con etiqueta y búsqueda por nombre, repetir; hoja con los datos escritos; "Registrar paciente" (registro precargado que vincula) y "Vincular a un expediente".

### 2. Raíz de medicamentos
- **M1**: `server/medOrders.ts` (`createMedOrders`, `pullConsultationOrders`, `findAdmissionConsult`) y helpers compartidos en `src/lib/inpatient.ts` (`frequencyHours`, `durationDays`, `orderFromItem`, `medOrigin`). `POST /api/consultations` con `admit`/`observe` crea la estancia (hospitalización sin cama todavía, u observación) y sus órdenes en la misma transacción; no emite receta. `POST /api/inpatient` vincula la consulta reciente con ingreso y jala sus órdenes. `PATCH /api/inpatient/:id` corrige el ingreso (cama, hora, motivo, diagnósticos, acompañante) sin rehacerlo. Respuesta con el número de órdenes creadas para avisar al médico. Hoja: origen de cada orden, suspendida/modificada con motivo y autor.
- **M4**: la consulta de origen cuenta como nota de ingreso (cliente y servidor); etiqueta "Nota de ingreso"; tras firmar se abre el expediente con "Completar ingreso: cama y acompañante" (`AdmitModal` en modo edición). Tablero: sección "Sin cama asignada".
- **M2**: `splitOrders` en `src/lib/inpatient.ts` separa medicamentos e indicaciones conservando el índice del checklist. `NoteEditor`: izquierda SOAP + medicamentos (activos con OMITIR/Cambiar y nuevos); derecha indicaciones. `SoapNote` y `NoteBody` (impresión) con el mismo reparto. Se apilan en celular.
- **Pruebas** (`server/corrections2.test.ts`): orden médica → hoja (los tres casos reales, idempotencia, conversión, reingreso), consulta con ingreso → nota de ingreso, validación de días.

### 3. E1 hoja Día/Semana
`MedSheet` con selector Día/Semana, Hoy, flechas (no antes del ingreso; hasta 7 días adelante), día actual resaltado, semana en rejilla con desplazamiento horizontal. Días pasados en lectura; "Corregir registros" pide motivo: registrar tarde (`reason`) y corregir una dosis (`PATCH /api/inpatient/doses/:id`), con auditoría. Aplica igual a observación.

### 4. M6 Procedimiento
Botón siempre visible para el médico en hospitalización y observación; selector con procedimientos frecuentes + texto libre; la línea de tiempo ordena por hora realizada; vínculo con autorización quirúrgica o de hospitalización firmada; enfermería no lo ve (403 en el servidor).

### 5. M5 Autorizaciones
`hospital` (nueva, una por estancia, se genera al ingresar y se reutiliza al pasar de observación; acompañante con nombre y teléfono) y `surgical` (la de hoy, ampliada). `POST /api/inpatient/:id/authorizations` para enfermería y médico; reabre la de hospitalización vigente. Pestaña "Anexos" en el expediente, aviso "Autorización pendiente de firma", botón "Autorización quirúrgica" junto a Nota/Procedimiento/Egreso. Hojas en `Authorization.tsx` y textos en `src/lib/consent.ts` (marcados como borrador a validar).

### 6. Impresión
`FullRecord.tsx`: nota de ingreso primero, procedimientos por hora realizada, dos columnas, anexos al final con ambas autorizaciones.

## Decisiones propias previstas (se confirman en el reporte)
- Con ingreso, los medicamentos van a la hoja y no se emite receta en esa consulta; la receta sale en el egreso.
- "Aplicar en la clínica" en una consulta ambulatoria marca "Ingreso a observación", porque la hoja de medicamentos vive dentro de una estancia.
- Administración ("Ver" en la tabla de permisos) sigue sin acceso al expediente clínico, como se confirmó en la ronda anterior; queda para que Emil decida.
