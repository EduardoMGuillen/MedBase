# Registro de la ronda 10

Bitácora de trabajo de la ronda 10: qué se hizo en cada punto, en qué commit y cómo se verificó. Se actualiza al cerrar cada
punto. El pedido completo está en `PEDIDO_RONDA10.md` (copia de `prompt_correcciones_clinara_ronda10.md`), el plan en
`PLAN_RONDA10.md` y el reporte final en `REPORTE_RONDA10.md`.

| Fecha | Punto | Estado | Commit | Resumen | Verificación |
|---|---|---|---|---|---|
| 03/11/2026 | — | Inicio | — | Pedido copiado a `docs/ronda10/`, capturas revisadas (12, en el mismo orden del mapa), plan escrito | Línea base de pruebas |
| 03/11/2026 | ME8 | Hecho | `[ronda10][ME8]` | Componente único `DrugSearch` (consulta externa, receta, egreso, notas, nebulización y sets de órdenes): no se abre al enfocar, sugiere desde 2 letras, 8 a la vista con desplazamiento, flechas/Enter/Esc. Fila de sugerencia sin cortes y sin la etiqueta «LNME» | Navegador a 1366 y 390 px (nota de evolución): nada al enfocar ni con «a»; «am» lista sin cortes; «acetaminofen» → Acetaminofén; Esc cierra solo la lista. tsc y lint sin errores |
| 03/11/2026 | ME9 | Hecho | `[ronda10][ME9]` | `loadingAllowed` exige vía en `LOADING_DOSE_ROUTES` (Intravenosa). Casilla de una línea sin recuadro; el ejemplo sale solo marcada. Si se cambia la vía, se oculta, no se guarda y sale «Se quitó la primera dosis diferente porque la vía ya no es intravenosa»; al volver a IV reaparece lo escrito. Órdenes antiguas sin cambios (solo es regla del formulario) | `server/ronda10.test.ts` (IV sí; Oral/IM/SC no; dosis única, infusión, PRN y nebulización no). Navegador: nota de evolución, Ceftriaxona c/12h IV → casilla; Oral/IM → oculta y aviso; vuelta a IV conserva «2 g» |
