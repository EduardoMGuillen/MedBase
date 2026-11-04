# Plan de la ronda 13

Pedido: `docs/ronda13/PEDIDO_RONDA13.md` (copia de `rev13/prompt_correcciones_clinara_ronda13.md`). Capturas del Word en
`docs/ronda13/capturas/` (7, en el orden del documento; cada una corresponde a su punto). Esquema: 80 → 81.

## Lo que ya existía (revisado antes de tocar)

- **Impresión**: HTML con estilos de impresión y `window.print()` (no hay librería de PDF en el cliente). Cada documento armaba
  su encabezado: `DocHeader` (receta, órdenes, resultados, constancia, referencia; con el médico en el membrete), un encabezado
  propio (epicrisis, autorizaciones, nota de consulta, recibo) y la receta en media carta (`@page half-letter`).
- **Antecedentes**: una sola ventana (`BackgroundForm`, `PatientForms.tsx`) y una sola tarjeta (`BackgroundView`,
  `PatientChart.tsx`), usadas en todos los lugares. Los campos salen de `BACKGROUND_GROUPS` (`src/lib/format.ts`).
- **Expediente a la vista** (ronda 12): `PatientChart embedded` dentro de `Consultation.tsx`, con `max-height: 75vh` y su
  propia barra. No había botón flotante «Ir a la nota» ni en consulta ni en hospitalización.
- **Nota en la estancia** (ronda 12): `MedicalNotes` siempre montada en `InpatientFile.tsx`, pero colocada **antes** de las
  pestañas Signos vitales, Enfermería, Exámenes y Anexos (por eso la nota salía encima).
- **Agrupación del catálogo**: el «subgrupo» del examen (`Área › Sección`), dibujado por `byArea` en «Ordenar exámenes» y en
  Configuración › Catálogo. No hay campo «Categoría».
- **Perfiles**: al ordenar se expanden en exámenes sueltos; la orden no guarda el perfil.

## Inventario de documentos imprimibles

| Documento | Archivo | Plantilla IM1 |
|---|---|---|
| Receta (consulta externa, sin consulta, de egreso) | `Prescriptions.tsx` (`PrescriptionSheet`) | Sí |
| Receta de la estancia («Generar receta» ME12 y «No hay en la clínica» ME10) | `PrintJob.tsx` (`HospRxSheet`) | Sí |
| Orden de laboratorio / de imagen y gabinete (lote, pendientes EX5, con la receta CE1, «Órdenes impresas») | `ExamOrder.tsx` (`ExamOrderSheet`) | Sí |
| Resultados (EX6) | `ResultSheet.tsx` | Sí |
| Constancias (atención, incapacidad, acompañante, libre) | `Certificate.tsx` | Sí |
| Hoja de referencia (y las de antes de la ronda 8) | `Referral.tsx` | Sí |
| Epicrisis | `Epicrisis.tsx` | Sí |
| Autorizaciones (general, quirúrgica, quirúrgica genérica, hospitalización) | `Authorization.tsx` | Sí |
| Nota de consulta impresa | `ConsultNote.tsx` | Sí |
| Recibo de caja | `Billing.tsx` | Sí |
| Expediente completo (compilación por secciones) | `FullRecord.tsx` | No (ver reporte) |
| PDF de la autorización firmada en pantalla | `server/consentPdf.ts` | No (ver reporte) |

## Por punto

| Punto | Archivos | Base de datos |
|---|---|---|
| AP3 | `PatientChart.tsx` (`BackgroundView`) | — |
| AP4 | `format.ts` (`BACKGROUND_GROUPS`, `RETIRED_BACKGROUND`), `PatientForms.tsx`, `clinical.css` | — (lo escrito no se toca) |
| NE8 | `InpatientFile.tsx`, `components/GoToNote.tsx` (nuevo), `clinical.css` | — |
| CX5 | `Consultation.tsx`, `PatientChart.tsx` (`embedded`), `GoToNote.tsx`, `clinical.css` | — |
| IM1 | `components/ClinicalDoc.tsx` (nuevo; reemplaza `DocHeader`), los 10 documentos, `clinicalConfig.ts`, `modules.css` | — |
| IM2 | `Prescriptions.tsx`, `PrintJob.tsx`, `lib/doseText.ts` (nuevo), `format.ts`, `inpatient.ts`, `server/app.ts`, `server/routes/printJobs.ts`, `server/mappers.ts`, `types.ts` | v81: `prescriptions.include_dx`, `print_jobs.include_dx`, `print_log.with_dx` |
| IM3 | `lib/exams.ts` (`orderGroups`), `ExamOrder.tsx` | — |

Dependencias: IM1 es la base de IM2 e IM3 (la casilla y la orden agrupada se dibujan en la plantilla). CX5 y NE8 comparten
el botón flotante «Ir a la nota».

Pruebas: `server/ronda13.test.ts`. Despliegue al terminar (subir a `main`).
