# Plan de la ronda 16

Pedido: `docs/ronda16/PEDIDO_RONDA16.md` (escrito a partir de `docs/ronda16/Correcciones ronda 16.docx` y del PNG de la hoja de anestesia).

## Ramas de trabajo

Cada rama sale de `main` y luego se une a `main`. Cada una usa su propio número de `SCHEMA_VERSION` (hoy es `84`). Al unir, queda el más alto y se conservan todas las migraciones.

| Rama | Puntos | Esquema | Archivos principales |
|---|---|---|---|
| `ronda16-ui` | RX1, MC1, IM4, AG1, LB8, EX12 | sin cambios | `DeptTray.tsx`, `server/routes/dept.ts`, `ExamPanels.tsx`, `index.css`/`clinical.css`, `ExamOrder.tsx`, `Agenda.tsx`, `ExamsTab.tsx`, `src/lib/exams.ts` |
| `ronda16-roles` | RU10, RE2, RE1, EN1 | v85 | `permissions.ts`, `routes/usage.ts`, `WaitingRoom.tsx`, `Dashboard.tsx`, `Ambulatory.tsx`, `clinicalConfig.ts`, `routes/roster.ts`, `Roster.tsx`, Personal y roles |
| `ronda16-pq` | PQ4, PQ5 | v86 | `routes/anesthesia.ts`, `lib/anesthesia.ts`, `AnesthesiaForm.tsx`, `AnesthesiaDoc.tsx`, `AnesthesiaSheet.tsx`, ruta y componentes nuevos del recuento, `InpatientFile.tsx` (tarjetas y Anexos) |
| `ronda16-notas` | ME17, ME16, NO1, NO3, NO2 | v87 | `Medications.tsx`, `InpatientFile.tsx` (NoteEditor, MedForm), `Consultation.tsx`, `server/medOrders.ts`, `server/app.ts`, `format.ts` |
| `ronda16-ingreso` (después de `notas`) | HO2, IE1 | v88 | `Inpatients.tsx`, `routes/inpatient.ts`, `alerts.ts`, `Dashboard.tsx`, `VitalsSheet.tsx`, `FullRecord.tsx`, una tabla nueva para los líquidos |

## Dependencias

- ME16 usa la vía de ME17.
- NO1 depende de ME16.
- NO2 es el editor común que usan HO2 (nota de ingreso automática) e IE1 (botón «Ingestas y excretas»).
- EX12 y LB8 comparten la agrupación por categoría (`orderGroups` / `subgroupOf`).
- PQ5 sigue el patrón de documento de PQ4.

## Tabla de paridad (NO2 y ME16)

La completa la rama `ronda16-notas` y se copia en el reporte.
