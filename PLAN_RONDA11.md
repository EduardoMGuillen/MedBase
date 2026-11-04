# Plan de la ronda 11

Pedido: `docs/ronda11/PEDIDO_RONDA11.md` (copia de `prompt_correcciones_clinara_ronda11.md`). Capturas revisadas (6, en el
orden del mapa; todas corresponden a su punto). Un commit por punto (`[ronda11][…]`). Esquema: 73 → 74 (o más).

## Lo que ya existe (antes de tocar nada)

- **Roles**: `admin`, `doctor`, `nurse`, `reception`, `assistant` (consultorio). El servidor ya preveía los roles `lab` e
  `imaging` en la bandeja (`trayAreas` en `server/routes/exams.ts`), pero no existen como rol.
- **Áreas de servicio** (Configuración, EX1 de la ronda 4): casillas «Laboratorio propio» e «Imágenes propias»
  (`clinics.has_lab`, `has_imaging`). Al ordenar, cada examen guarda su `area` (`lab`, `imaging`, `nursing` o `none` si es
  externo, `areaFor` en `src/lib/exams.ts`). La bandeja `GET /api/exams/tray` ya filtra por área, y mientras no haya nadie
  con rol de laboratorio o de imágenes, enfermería recibe todo.
- **Estados de examen**: `ordered → sample → result → reviewed` (laboratorio) y `ordered → done → result → reviewed`
  (imagen), más `cancelled`. Cada cambio queda en `exam_events` (autor, hora).
- **Rol de turnos**: solo el de médicos (`duty_roster`, AD3 de la ronda 5, y el «Panel del día» de TU1). **TU2 (enfermería),
  la repetición, «copiar semana» y PE1 (cargos Licenciada/Auxiliar) no existen**: el pedido de la ronda 6 llegó cortado
  (REPORTE_RONDA6). DP1 y DP6 los necesitan, así que se hacen aquí (cargo por persona y rol de turnos por departamento).
- **Impresiones**: `print_jobs` y `print_log` (EX5/ME10), con bloqueo de GE4.

## Por punto

| Punto | Archivos | Base de datos | Reutiliza |
|---|---|---|---|
| GE8 | `src/clinical.css`, `NoteColumns.tsx` | — | — |
| GE7 | `src/components/TabRow.tsx` (nuevo), las filas de pestañas (`InpatientFile`, `PatientChart`, `Settings`, `Staff`, `Billing`, `Followups`) | — | — |
| CA7 | `ExamCatalogAdmin.tsx`, `server/routes/exams.ts`, `server/ronda11.ts` | Limpieza de archivados (una vez por clínica, copia en `config_backups`) | condición de borrado de CA5 |
| CA6 | `imagingCatalog.ts`, `exams.ts`, `clinicalConfig.ts`, `Exams.tsx`, `ExamCatalogAdmin.tsx`, `server/ronda11.ts` | `exam_orders.subject` («¿De qué?»); carga `ca6:<clínica>` | chips y «Falta…» de CA5 |
| ME11 | `DrugSuggestion`/franja «No está en el vademécum», `server/routes/drugs.ts` | — (origen «Catálogo base Clinara») | buscador de ME8 |
| ME12 | `PrintJob.tsx`, `server/routes/printJobs.ts`, `InpatientFile.tsx` (Anexos, hoja, tarjeta) | `print_jobs.kind = 'rx'` con días y cantidad por renglón | plantilla de receta de ME10 |
| EX6 | `ExamsTab.tsx`, `ExamResultSheet` (nuevo, plantilla de EX2), `server/routes/printJobs.ts` | `print_jobs.kind = 'results'` | `FilePreview` de EX4 |
| DP1 | `permissions.ts`, `types.ts`, `Staff.tsx`, `server/app.ts`, `AppShell.tsx` | `staff.position` (cargo), roles `lab` e `imaging` en el CHECK | selector de rol de AD5/GE1 |
| DP4 | `permissions.ts`, rutas del expediente, `InpatientFile`/`PatientChart` | — | página del paciente con menos pestañas |
| DP2 | `src/app/DeptTray.tsx` (nuevo), `server/routes/exams.ts` | `exam_orders.not_done_*`, `location` | acciones de `ExamsTab` |
| DP3 | `DeptTray.tsx` (ventana «Paciente ambulatorio»), Recepción, Administración | `exam_orders.requested_by_*`, `order_file_id` | `NewPatient`, `ExamPicker`, Caja |
| DP5 | `Settings`/menú «Configuración de laboratorio/imágenes» | permisos `dept.manage` | tarjetas de catálogo y umbrales |
| DP6 | `Roster.tsx`, `server/routes/roster.ts` | `duty_roster.dept`, `shift` | calendario de TU1 |
| DM2 | `server/demoData.ts`/`db.ts` | 4 usuarios demo, órdenes y turnos | flujo normal |

Orden: GE8 → GE7 → CA7 → CA6 → ME11 → ME12 → EX6 → DP1 → DP4 → DP2 → DP3 → DP5 → DP6 → DM2. Valores por defecto: los de la
sección 6 del pedido. Despliegue al terminar (subir a `main`).
