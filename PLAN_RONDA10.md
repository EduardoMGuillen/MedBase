# Plan de la ronda 10

Pedido: `docs/ronda10/PEDIDO_RONDA10.md`. Un commit por punto (`[ronda10][CÓDIGO] …`). Registro de avance:
`docs/ronda10/REGISTRO_RONDA10.md`. Constantes nuevas en `src/lib/clinicalConfig.ts` con `VALIDAR: Emil`. Migraciones
idempotentes en `server/db.ts` (SCHEMA_VERSION 69 → 7x), que corren solas en cada clínica y consultorio (incluidos los nuevos,
desde `ensureExamCatalog`).

Orden (el de la sección 5 del pedido): ME8 → ME9 → UM3 → GE5 → GE6 → EN4 → ME6 → ME7 → EX4 → EX5 → ME10 → CA5.

| Punto | Archivos principales | Base de datos | Reutiliza / crea |
|---|---|---|---|
| ME8 | `src/components/DrugSearch.tsx` (nuevo), `Medications.tsx` (`MedicationForm`), `InpatientFile.tsx` (`MedForm`), `MedExtras.tsx` (componentes de la nebulización), `DrugSuggestion.tsx` | — | Un solo campo con sugerencias para los tres lugares: sin lista al enfocar, desde `DRUG_SEARCH_MIN_CHARS` letras, flechas y Enter, Esc y clic afuera. Sin la etiqueta «LNME» |
| ME9 | `src/lib/medExtras.ts` (`loadingAllowed`), `MedExtras.tsx` (`LoadingDoseFields`), los dos formularios | — | La regla «solo Intravenosa» en `loadingAllowed`; casilla de una línea; aviso al cambiar la vía |
| UM3 | `server/db.ts` (migración), `CriticalThresholds.tsx`, `scripts/um3-diagnose.ts` | Tabla `config_backups` (exportación de lo que se borra) | La función de archivar sigue igual; «Ver archivados» solo con archivados |
| GE5 | `src/components/Pagination.tsx` (nuevo), `src/lib/usePageParam.ts`, Vademécum, Biblioteca de pacientes, Recetas, Caja, Bitácora, Reportes, Personal | — | Un componente; la página en la URL (`?pagina=`) |
| GE6 | `src/components/ui.tsx` (`Modal` con tamaño fijo opcional), CSS de `.exam-picker-modal` | — | La misma ventana «Ordenar exámenes» |
| EN4 | `DoseModal` (InpatientFile.tsx), `DateTimeField.tsx` (calendario en portal), CSS del `Modal` | — | El control segmentado de la app, en grande |
| ME6 | `src/lib/lnme/*`, `server/lnmeLoader.ts`, `src/lib/drugProvider.ts`, `scripts/me6-compare.ts` (nuevo) | Carga forzada única (marca `me6`), columna `edited_at` para cargas futuras | La misma tabla `clinic_drugs` y el mismo script de ME5 |
| ME7 | `Settings.tsx` (Vademécum), `DrugForm.tsx` (detalle), `drugs.ts` | — | Paginación de GE5, el buscador de siempre |
| EX4 | `ExamsTab.tsx` (`ResultView`, `ResultModal`), `src/components/FilePreview.tsx` (nuevo) | — | `openFile` / archivos del expediente |
| EX5 | `ExamsTab.tsx`, `ExamOrder.tsx` (plantilla de EX2 para una selección), `server/routes/exams.ts`, `correctionLocks.ts` | Tabla `print_jobs` (qué se imprimió, de qué médico, quién) | La misma plantilla de EX2 y `print_log` |
| ME10 | Formularios de medicamento, hoja de medicamentos, `src/app/HospRx.tsx` (nuevo, plantilla de la receta), `server/routes/inpatient.ts` | `hosp_meds.buy_outside`, `hosp_meds.buy_quantity`; `print_jobs` | La plantilla de la receta de consulta externa, `print_jobs` de EX5, la leyenda |
| CA5 | `src/lib/imagingCatalog.ts` (Anexo A), `exams.ts` (`examLine`, sinónimos), `Exams.tsx` (chips), `ExamCatalogAdmin.tsx`, `server/db.ts` (carga) | `exam_catalog.details`; `exam_orders.projections`, `contrast`, `detailed`; exportación de lo borrado | La ventana «Ordenar exámenes», el campo de región que ya existe, la orden de EX2/EX5 |

Dependencias: ME7 usa GE5; EX5 agrega la leyenda a la plantilla de EX2 y crea `print_jobs`, que usa ME10; CA5 va al final
porque toca la ventana de GE6, las órdenes de EX2/EX5 y EX3.

Hallazgos de la exploración (antes de programar):
- **UM3:** una demo nueva tiene exactamente 16 grupos de umbrales. «Ver archivados (16)» sin ningún grupo a la vista
  quiere decir que en esa base **los 16 grupos están archivados**, incluidos los predeterminados de UM2. El servidor
  archiva todo grupo que no venga en la petición de «Guardar umbrales» (`PUT /api/settings/critical-groups`), así que una
  petición con la lista vacía o incompleta los archiva todos de una vez. No pude leer la base de producción para
  confirmarlo (permiso denegado); queda el script `scripts/um3-diagnose.ts` para hacerlo.
- **ME6:** los 21 que faltan son las filas del `.md` que la carga de ME5 emparejó con medicamentos del catálogo base (que
  vive en el código) y por eso no creó en la base. Se veían como «Catálogo base», unos con «· LNME #N» y otros sin él, y sin
  la vía del `.md`.
- **EN4:** el calendario de GE3 es un panel `position: absolute` dentro de una ventana con `overflow: auto`: la ventana lo
  recorta.
