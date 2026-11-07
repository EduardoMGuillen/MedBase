# Plan de la ronda 17

El pedido está en `docs/ronda17/PEDIDO_RONDA17.md` y sale de `docs/ronda17/Correcciones ronda 17.docx` y sus capturas.

## Ramas de trabajo

Cada rama sale de `main` y vuelve a unirse a `main`. Hoy `SCHEMA_VERSION` está en `88`, y solo la rama `config` lo sube.

| Rama | Puntos | Esquema | Archivos principales |
|---|---|---|---|
| `ronda17-ui` | UI2, UI1, UI3, IE2 | sin cambios | `DateTimeField.tsx`, `TopScrollbar.tsx`, CSS, `Staff.tsx`, `FluidBalance.tsx`, `FullRecord.tsx` |
| `ronda17-lab-notas` | LB9, NO4 | sin cambios | `DeptTray.tsx`, `InpatientFile.tsx` (NoteEditor), documento de la nota |
| `ronda17-perfiles` | PF1, AD1, PF2 | sin cambios | `permissions.ts`, `AppShell.tsx`, `Dashboard.tsx`, `WaitingRoom.tsx`, `Ambulatory.tsx`, página nueva de pacientes ambulatorios, `Observation.tsx`, `src/tours`, `server/app.ts` |
| `ronda17-config` | OB1, CF1 | v89 | `Settings.tsx`, `MyConfig.tsx`, `server/db.ts`, `App.tsx` (rutas de las secciones) |

## Tablas que llenan las ramas

- **PF2**: la tabla de perfiles con las diferencias entre clínica y consultorio. La llena `ronda17-perfiles`, abajo.
- **CF1**: la lista de ajustes antes y después. La llena `ronda17-config`, abajo.
