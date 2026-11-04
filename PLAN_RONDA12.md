# Plan de la ronda 12

Pedido: `docs/ronda12/PEDIDO_RONDA12.md` (ordenado por punto a partir de `rev12/correcioens ronda 12.docx`). Capturas en
`docs/ronda12/capturas/` (12, en el orden del documento). Esquema: 79 → 80.

## Lo que ya existía

- **Valores de referencia** (UM1, ronda 8): salen de `data/valores_referencia_laboratorio.md` por `npm run um1:build`
  (`src/lib/labRef/`). Cada fila del .md se empareja con un examen y, si tiene, un analito (`mapping.ts`). Las filas
  «resultado esperado» sin analito (todo el EGO salvo densidad y pH, los líquidos, los cultivos, las serologías) se juntaban
  en un solo texto del examen: por eso el EGO solo tenía dos casillas.
- **Umbrales críticos** (AD1/UM2): tarjeta en Configuración y en Configuración de laboratorio; el servidor marcaba
  `critical` al cargar el resultado y salía «Valor crítico» en alertas, bandejas y PDF.
- **Notas de hospitalización y observación**: `NoteEditor` y `ProcedureNoteForm` en una ventana (`Modal`), que tapa el expediente.
- **Consulta externa**: la columna de antecedentes y la última consulta; el expediente completo solo desde la Biblioteca.
- **Laboratorio e Imágenes** (ronda 11): sin «Inicio» (entraban a la bandeja), una sola bandeja con todas las ubicaciones,
  «Paciente ambulatorio» con el registro completo, y la página parcial del paciente sin pestañas.

## Por punto

| Punto | Archivos | Base de datos |
|---|---|---|
| LB2 | `data/valores_referencia_laboratorio.md`, `src/lib/labRef/{mapping,build,parseMd}.ts`, `generated.ts`, `src/lib/labReference.ts`, `server/refLoader.ts` | Carga del .md nuevo; lo que ya no trae así (resultado esperado sin analito, rangos iniciales de gases) queda archivado |
| LB1 | `src/app/ExamsTab.tsx` (`ResultModal`), `src/components/SourceTag.tsx`, `src/modules.css` | — |
| LB3 | `server/routes/exams.ts`, `server/ronda12.ts`, `server/demoData.ts`, `ExamsTab`, `ExamPanels`, `ResultSheet`, `Settings`, `DeptPages`, `src/lib/alerts.ts` | v80: `exam_orders.critical = FALSE` |
| LB4 | `src/app/ExamCatalogAdmin.tsx` (`ExamForm`, `RefEditor`) | — |
| AN1, AN2 | `src/lib/format.ts`, `src/lib/types.ts`, `PatientChart.tsx`, `PatientForms.tsx`, `Consultation.tsx`, `clinical.css` | — (Toxicomanías se arma con los tres campos de antes hasta que se guarde) |
| SG1 | `src/app/Followups.tsx` | — |
| CE1 | `Prescriptions.tsx`, `ExamOrder.tsx` (`ExamBatchSheets`), `PatientChart.tsx` | — |
| CE2 | `PatientChart.tsx` (`embedded`), `Consultation.tsx` | — |
| HO1 | `src/components/ui.tsx` (`Modal inline`), `InpatientFile.tsx` (`MedicalNotes` siempre montada) | — |
| LB5, IM1 | `src/app/DeptHome.tsx` (nuevo), `DeptTray.tsx` (áreas), `AppShell.tsx`, `App.tsx`, `server/routes/dept.ts` (`/dept/count` por área) | — |
| LB6 | `Ambulatory.tsx` (`QuickPatient`), `server/routes/dept.ts` (`/dept/quick-patient`) | — |
| LB7 | `DeptPages.tsx` (`DeptPatient` con pestañas) | — |
| IM2 | `src/lib/permissions.ts` (`inpatient.notes`), `server/routes/inpatient.ts`, `InpatientFile.tsx`, `src/lib/hooks.ts` | — |

Pruebas: `server/ronda12.test.ts`. Despliegue al terminar (subir a `main`).
