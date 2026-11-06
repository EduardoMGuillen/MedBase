# Plan de la ronda 15

Pedido: `docs/ronda15/PEDIDO_RONDA15.md` (copia de `Rev 15/prompt_correcciones_clinara_ronda15.md`). Capturas del Word en
`docs/ronda15/capturas/` (7, en el orden del documento; cada una corresponde a su punto). Esquema: 82 → 83.

**Catálogo v2.** El `Listado material medico quirurgico.md` que vino en `Rev 15` no es la versión 2 que describe el pedido:
trae los 117 materiales sueltos del listado original (sin categorías, sin «Origen», «Registro», «Lista de turno inicial» ni el
Anexo de sets). Emil decidió que lo arme yo: `data/listado_material_medico_quirurgico.md` v2 con las 73 líneas de la ronda 14
(mismo Material y Variante, «Origen» = «R14-n») más 135 nuevas = **208 líneas en 15 categorías**, 17 en la lista de turno, la
columna «Registro» y el Anexo con los 6 sets. Todo con `VALIDAR: Emil`.

## Lo que ya existía (revisado antes de tocar)

- **Dónde se excluían los «Aplicar en la clínica» de la receta**: un solo lugar, la firma de la consulta en `server/app.ts`
  (`rxItems = items.filter((it) => !it.applyInClinic || it.buyOutside)`). La tarjeta de la consulta externa
  (`PatientChart.tsx`) solo enlaza a esa receta; «Recetas emitidas» y WhatsApp leen la receta guardada (no filtran). En la
  estancia, la «Receta» de la tarjeta de la consulta de ingreso (`RxFromNote` en `InpatientFile.tsx`) marcaba solo los que
  no van a la hoja y los «No hay en la clínica».
- **ME14** quedó hecho (pantalla final al firmar con ingreso con «Ir a observación», «Receta» en la tarjeta de la nota).
- **El aviso verde** de la pantalla final (`Prescriptions.tsx`) ya agrega «la orden de los que se hacen en la clínica va
  aparte, al final, con su propio botón» cuando hay orden «En la clínica»; en la captura 1 no la había.
- **Catálogo**: `supply_items` con `md_key` (material|variante sin tildes), `edited_at`, `archived_at`, `list_set_at`;
  `server/supplies.ts` (`loadSupplyCatalog`, idempotente) lo llama la migración, la clínica nueva (`platform.ts`, `db.ts`) y
  la demo. El `.md` se lee con `npm run ru1:build` → `src/lib/supplyMd/generated.ts`.
- **Agregar material**: hasta esta ronda solo Administración (`supplies.manage`); Enfermería solo marcaba la lista de turno.
- **Turnos «Tarde (15:00–23:00)»**: los de enfermería (`DEPT_SHIFTS.nursing`, rol de turnos DP6), copiados a
  `supply_settings` como turnos por defecto en la ronda 14 (A10 de la ronda 14 decidió usarlos). No se cambian.
- **Por qué no salían los de consulta externa** (captura 4): `/api/usage/suggest` comparaba `consultations.date` como texto
  con la hora local del periodo, pero desde hace rondas la consulta guarda la hora en UTC (`…T23:14:00.000Z`): una consulta de
  las 17:14 quedaba «después» de las 23:00. Y la cita cuenta por su hora programada, no por cuándo se atendió.
- **Buscador de pacientes**: `PatientPicker` (`Inpatients.tsx`), busca mientras se escribe desde 2 letras (sin ignorar tildes).
- **Menú**: `AppShell.tsx`, `NAV` con `group`; los grupos son `NavGroup` desplegables.

## Por punto

| Punto | Archivos | Base de datos |
|---|---|---|
| RU6 | `AppShell.tsx` (grupo fijo «Registros», encabezado sin desplegar), `modules.css` | — |
| ME15 | `server/app.ts` (todo a la receta; cantidad STAT; receta completa de una consulta vieja), `Prescriptions.tsx` (leyenda), `clinicalConfig.ts` (leyendas `VALIDAR: Emil`), `lib/format.ts` (`statQuantity`), `Medications.tsx` (texto), `InpatientFile.tsx` (`RxFromNote` con todos marcados en la consulta), `PatientChart.tsx` («Receta» de una consulta vieja) | — |
| RU5 | `data/listado_material_medico_quirurgico.md` (v2), `scripts/ru1-build.ts`, `lib/supplies.ts` (lector con «Registro», «Origen» y el Anexo), `server/supplies.ts` (carga v2), `server/routes/supplies.ts`, `server/routes/usage.ts` | v83: `supply_items.scope` |
| RU4 | `SupplyCatalog.tsx` (pestañas, categorías desplegables, filas compactas, menú «⋯», «Agregar material»/«Agregar variante»), `components/SupplySearch.tsx` (nuevo), `permissions.ts` (`supplies.add`), `server/routes/supplies.ts` | — |
| RU7 | `MaterialForm.tsx` (dos columnas, «¿Para quién?», «Material», barra fija), `components/SupplySearch.tsx`, `components/QtyStepper.tsx` (nuevo), `PatientPicker` (tildes, resultado con ubicación), `server/routes/usage.ts` (`/suggest` con consulta externa real, ubicación y «Ya tiene registro») | — |
| RU8 | `server/routes/supplySets.ts` (nuevo), `server/supplies.ts` (sets iniciales), `src/app/SupplySets.tsx` (nuevo: pestaña y editor), `MaterialForm.tsx` («Usar set», «Guardar como set», «Deshacer»), `permissions.ts` (`sets.manage`) | v83: `supply_sets`; `material_uses.sets` |
| RU9 | `Usage.tsx` (vistas «Por paciente» / «Total del periodo», bloques compactos, «Ver registros»), `lib/usage.ts` (orden: uso general y áreas), `UsagePrint.tsx`, `usageExcel.ts` | — |

Dependencias: RU7 usa el «Registro» de RU5 para filtrar por destino; RU8 usa el buscador y el control de cantidad de RU7 y la
pestaña «Sets» de RU4; RU9 muestra el set de RU8. ME15 y RU6 son independientes.

Reglas: un commit por punto `[ronda15][XX]`; la v83 es `ADD COLUMN IF NOT EXISTS` / `CREATE TABLE IF NOT EXISTS`, nada se
borra; la carga v2 y la de los sets son idempotentes, no tocan lo editado, archivado ni lo que la clínica creó, y se prueban
sobre una copia v82; permisos en el servidor; pruebas en `server/ronda15.test.ts`; typecheck, lint, pruebas y build al cerrar
cada punto.
