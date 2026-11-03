# Plan de la ronda 9

Pedido: `docs/ronda9/PEDIDO_RONDA9.md`. Un commit por punto (`[ronda9][CÓDIGO] …`). Constantes nuevas en
`src/lib/clinicalConfig.ts` con `VALIDAR: Emil`. Migraciones idempotentes en `server/db.ts` (SCHEMA_VERSION 64 → 67).

Orden seguido (el de la sección 5 del pedido): GE3 → NE6 → EG1 → ME3/ME4 → ME5 → PQ1/PQ2 → GE4.

| Punto | Archivos principales | Base de datos | Reutiliza / crea |
|---|---|---|---|
| GE3 | `src/lib/dateInput.ts`, `src/components/DateTimeField.tsx`, `src/lib/format.ts`, `scripts/check-dates.mjs` (en el build) y los 25 campos nativos que había | — | Crea `DateTimeField`, `DateField`, `TimeField` propios (24 h, dd/mm/aaaa, hora de Honduras) |
| NE6 | `src/app/InpatientFile.tsx` (editor), `src/components/NoteColumns.tsx` (tarjeta e impresión) | — | — |
| EG1 | `src/app/DischargeNote.tsx` | — | `Modal` con pie fijo (el de la nota de evolución) y el mismo borrador |
| ME3/ME4 | `src/lib/medExtras.ts`, `src/components/MedExtras.tsx`, `MedForm` (notas) y `MedicationForm` (consulta, recetas, egreso), servidor | v65: `hosp_meds.nebulization` | Una sola lógica para los dos formularios |
| ME5 | `src/lib/lnme/*`, `server/lnmeLoader.ts`, `scripts/me5-build.ts`, `DrugSuggestion.tsx`, Configuración › Vademécum | v66: columnas LNME en `clinic_drugs` | La misma tabla `clinic_drugs` (búsqueda, Mi vademécum, permisos ya existentes) |
| PQ1/PQ2 | `src/app/PostopNote.tsx`, `NoteEditor` (variante `postop`), `server/routes/inpatient.ts`, epicrisis, referencia | — (va en `hosp_notes.data`, formato `postop`) | La ventana de evolución completa (órdenes, borrador, pie), `DiagnosisPicker`, `DateTimeField`, la regla de autorización del procedimiento mayor |
| GE4 | `server/grace.ts`, rutas de notas, dosis, signos vitales, consulta y exámenes; `src/components/Grace.tsx` | v67: `record_versions`, `print_log` | Los mismos formularios de cada registro, con «Guardar corrección» |

Dependencias: PQ1 usa GE3 (horas), ME3/ME4 (columna de órdenes) y la ventana de evolución. GE4 va al final porque toca
todos los registros, incluidos la nota postquirúrgica y la nebulización.

## GE4: lista final de tipos de registro y decisión

Regla común: sólo el autor; 5 minutos (`GRACE_MINUTES`, `VALIDAR: Emil`) desde la **primera** firma o registro, sin reiniciarse; la
hora la decide el servidor; cada corrección guarda la versión anterior completa en `record_versions` (nunca se borra), con
«Motivo de la corrección» opcional, y queda en la bitácora. Lo que se ve y se imprime es la última versión, con
«Corregida · vN» y «Ver versiones». Vencido el plazo: 409, el texto queda en el borrador y se ofrece la adenda.

| Registro | Decisión |
|---|---|
| Nota de ingreso y de evolución (Estándar y SOAP) | **Sí.** Lo escrito, los diagnósticos y las órdenes que nadie cumplió (la hoja y Exámenes se actualizan). Lo cumplido o impreso, bloqueado; con revisiones de enfermería u otra nota posterior, la columna de órdenes queda como se firmó. La cadena MC7/NE4 lee la última versión |
| Nota postquirúrgica | **Sí**, igual que la evolución (diagnósticos, horas, anestesia, procedimiento, descripción, equipo) |
| Nota de procedimiento | **Sí** (nombre, hora, texto). Su autorización no se toca |
| Nota de enfermería | **Sí** (texto) |
| Nota de consulta externa | **Sí** (motivo, historia, examen, diagnósticos, plan), sus exámenes sin muestra y sus seguimientos sin aviso enviado (v69). La receta va aparte (abajo) |
| Receta | **Sí si no se imprimió ni descargó**; impresa: bloqueada con «Ya se imprimió la receta. Corrígelo con una adenda.» |
| Administración de medicamentos (aplicada, no aplicada, omitida, inicio de infusión, nebulización) | **Sí** (hora real, estado, observación). La hoja recalcula el estado |
| Signos vitales y preclínica | **Sí** (los valores y la hora; en la preclínica, también el motivo) |
| Resultados de exámenes | **Sí** mientras el médico no los haya revisado |
| Nota de egreso | **No en esta ronda** (el pedido permite excluirla): corregirla toca la receta de salida y el cierre de la estancia. Se corrige con adenda |
| Hoja de referencia, constancias, órdenes de exámenes | **No en esta ronda**: son documentos que se entregan; siguen con anulación y nuevo documento |
| Suspensión de infusión, toma de muestra | **No en esta ronda** (se corrigen con la corrección de dosis o anulación que ya existen) |
| Pagos y caja, autorizaciones y consentimientos firmados, agenda, anulaciones | **No aplica** (exclusiones del pedido) |
