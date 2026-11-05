# Plan de la ronda 14

Pedido: `docs/ronda14/PEDIDO_RONDA14.md` (copia de `Rev 14/prompt_correcciones_clinara_ronda14.md`). Capturas del Word en
`docs/ronda14/capturas/` (14, en el orden del documento). Catálogo de material: `data/listado_material_medico_quirurgico.md`.
Esquema: 81 → 82.

## Lo que ya existía (revisado antes de tocar)

- **«Aplicar en la clínica» crea la observación**: `server/app.ts` (firma de la consulta) calcula
  `stayKind = admit ? 'hospital' : observe || items.some(applyInClinic) ? 'observation' : null`. Basta un medicamento
  marcado para crear la estancia. Además, con ingreso, el servidor marca **todos** los medicamentos como «Aplicar en la
  clínica» (van a la hoja) y no emite receta.
- **«Generar receta» (ME12)** lista solo `file.meds` (la hoja). En la captura 9 la observación nació del error anterior: a la
  hoja solo pasó el medicamento marcado (`stayItemsOf` en `server/medOrders.ts`); los dos analgésicos fueron a la receta de
  la consulta y nunca a la hoja, por eso no salen.
- **¿La clínica tiene laboratorio o imágenes?** Ya existe: Configuración › «Áreas de servicio» (`clinics.has_lab`,
  `clinics.has_imaging`; `settings.hasLab/hasImaging`), lo cambia Administración y decide la bandeja (`areaFor`). No hace
  falta crear interruptores.
- **Valor de «En la clínica | Externo»**: `newExam` en `components/Exams.tsx` pone siempre `place: 'clinic'`; un set guarda
  el lugar con que se guardó.
- **Orden al terminar la consulta**: un solo lote (`insertExams`) con externos y de la clínica; la orden muestra solo los
  externos si hay alguno (`ExamOrder.tsx`), de ahí el texto «Los estudios que se hacen en la clínica no van en esta orden».
- **Casilla «Incluir el diagnóstico en la orden»**: viene de EX2 (ronda 8), en `ExamOrder.tsx`; no se guarda.
- **Ventana «Imprimir orden de laboratorio» (EX5)**: `PrintPending` en `ExamsTab.tsx` (casillas, externos marcados,
  `POST /api/print-jobs` kind `exams`). El botón de la tarjeta de la nota es un enlace directo al lote (`NoteExams`).
- **Turnos de enfermería**: ya existen (`DEPT_SHIFTS.nursing`, rol de turnos DP6): Mañana 07–15, Tarde 15–23, Noche 23–07.
  Se reutilizan en RU1 (en vez de los de A10).
- **Campos de texto**: no hay un componente compartido; son `<input>`/`<textarea>` con clases `input`/`textarea`.
- **Excel**: el proyecto no tiene librería (solo CSV en Reportes).

## Por punto

| Punto | Archivos | Base de datos |
|---|---|---|
| GE10 | `lib/autocap.ts` (nuevo, un solo lugar), `main.tsx`; `data-nocap` en buscadores y campos de dato | — |
| CX6 | `Consultation.tsx`, `clinical.css` | — |
| EX9 | `components/Exams.tsx` (`ExamsBlock`), `clinical.css` | — |
| EX8 | `lib/exams.ts` (`defaultPlace`), `Exams.tsx`, `Consultation.tsx`, `InpatientFile.tsx`, `NoteColumns.tsx` (etiqueta «En la clínica») | — (usa `has_lab`/`has_imaging`) |
| EX11 | `ExamsTab.tsx` (`PrintPending` exportada como `ExamPrintModal`), `NoteColumns.tsx`, `ExamOrder.tsx`, `server/routes/printJobs.ts` | — |
| EX10 | `server/app.ts` (dos lotes), `Consultation.tsx`, `Prescriptions.tsx`, `ExamOrder.tsx`, `clinicalConfig.ts` (motivo nuevo de «No se realizó») | — |
| ME13 | `server/app.ts`, `server/routes/applications.ts` (nuevo), `Medications.tsx`, `Consultation.tsx`, `WaitingRoom.tsx`, `PatientChart.tsx`, `components/ApplyMeds.tsx` (nuevo), `clinicalConfig.ts` (motivos) | v82: `consult_applications` |
| ME14 | `server/app.ts` (receta con ingreso), `server/medOrders.ts`, `server/routes/printJobs.ts` (medicamentos de la nota que no están en la hoja), `GenerateRx.tsx`, `InpatientFile.tsx`, `PatientChart.tsx` | — |
| RU1 | Configuración › «Material médico quirúrgico», carga del `.md` (rama `ronda14-ru`) | v82: catálogo y configuración del periodo |
| RU2 | «Uso de medicamentos y material» (rama `ronda14-ru`) | v82: registros de material y anulaciones |
| RU3 | Impresión y Excel (ExcelJS) (rama `ronda14-ru`) | — |
| PQ3 | Hoja de anestesia (rama `ronda14-pq`) | v82: hojas de anestesia |

Dependencias: EX9 → EX8 (la lista nueva lleva el valor por defecto). EX11 reutiliza la ventana de EX5 y EX10 la usa para
reimprimir. ME13 crea `consult_applications`, que RU2 lee (contrato fijado antes de empezar). ME14 depende de ME13 (con
ingreso, la casilla «Aplicar en la clínica» decide qué va a la hoja y qué a la receta). RU2 depende de RU1 y ME13. PQ3 usa
IM1 y la subida de Anexos.

Reglas: un commit por punto `[ronda14][XX]`; migración idempotente probada sobre una copia; permisos en el servidor;
pruebas en `server/ronda14*.test.ts`; typecheck, lint, pruebas y build al cerrar cada punto. RU y PQ3 se hacen en paralelo en
sus ramas y se unen a `main` al final.
