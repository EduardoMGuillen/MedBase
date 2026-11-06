# Reporte de la ronda 15

Pedido: `docs/ronda15/PEDIDO_RONDA15.md`. Plan: `PLAN_RONDA15.md`. Capturas del pedido: `docs/ronda15/capturas/` (las 7
corresponden a su punto). Evidencias de después: `docs/ronda15/despues/`. Catálogo v2: `data/listado_material_medico_quirurgico.md`.
Esquema: 82 → 83.

## 1. Estado por punto

| Punto | Estado | Archivos principales | Cómo probarlo |
|---|---|---|---|
| ME15 | Hecho | `server/app.ts` (todo a la receta, cantidad STAT, receta completa de una consulta vieja), `lib/format.ts` (`statQuantity`), `clinicalConfig.ts` (leyendas), `Prescriptions.tsx`, `Medications.tsx`, `InpatientFile.tsx` (`RxFromNote`), `PatientChart.tsx` | Como Dra. Herrera, termina una consulta con Acetaminofén e Ibuprofeno orales y Ceftriaxona «Aplicar en la clínica»: la receta trae los tres; la Ceftriaxona con «Cantidad: 1 vial.» y *Se aplica en la clínica.* Repite con «No hay en la clínica»: *Comprar y traer a la clínica para su aplicación.* Repite con «Ingreso a observación»: también los tres. En la tarjeta, «Receta» abre la ventana con los tres marcados |
| RU4 | Hecho | `SupplyCatalog.tsx`, `components/SupplySearch.tsx` (nuevo), `components/QtyStepper.tsx` (nuevo), `permissions.ts` (`supplies.add`), `server/routes/supplies.ts` | Como Lic. Ríos: «Catálogo y lista de turno»: 15 categorías cerradas con su conteo; abre y cierra «Suturas»; busca «seda 4» (se abre «Suturas» y resalta). «Agregar material» › Nylon · 7/0, aguja cortante; no ve «Editar» ni «Archivar». «Seda · 3/0, aguja cortante» dice «Ya existe en el catálogo» |
| RU5 | Hecho | `data/listado_material_medico_quirurgico.md` (v2), `scripts/ru1-build.ts`, `lib/supplies.ts`, `server/supplies.ts`, `server/db.ts` (v83) | Como Roberto Aguilar: «208 líneas · 15 categorías · 17 en la lista de turno». Al registrar a un paciente, «Algodón Rollo» sale en gris con «Se registra en Uso general del servicio»; con «Uso general del servicio», sí se suma |
| RU6 | Hecho | `AppShell.tsx`, `modules.css` | Como Lic. Ríos: «Registros › Uso de medicamentos y material» debajo del grupo «Pacientes»; contrae «Pacientes» y sigue ahí. Como Dra. Herrera no hay «Registros» |
| RU7 | Hecho | `MaterialForm.tsx`, `Inpatients.tsx` (`PatientPicker`), `server/routes/usage.ts` (`/suggest`), `lib/usage.ts` (`sortSuggestions`), `modules.css` | «Registrar material» a 1366 px: dos columnas, «Uso general del servicio» arriba; los del periodo en Consulta externa, Observación y Hospitalización. Escribe «turc»: aparece sin pulsar nada. Elige: «Para: … · Cambiar». «guante 7.5» › [+] dos veces. Sin destino, «Guardar» dice qué falta |
| RU8 | Hecho | `server/routes/supplySets.ts` (nuevo), `src/app/SupplySets.tsx` (nuevo), `MaterialForm.tsx`, `lib/supplies.ts` (`applySet`, `undoSet`), `server/supplies.ts` (sets iniciales) | Pestaña «Sets»: los 6 iniciales. En el formulario, «Usar set» › «Parto vaginal»: 17 materiales y el aviso con «Deshacer». «Guardar como set» › «Cesárea»: aparece en «Sets». En «Ver registros» sale «Set: Parto vaginal» |
| RU9 | Hecho | `Usage.tsx`, `lib/usage.ts` (`byPatient`, `byArea`, `materialTotalRows`), `server/routes/usage.ts` (orden del catálogo), `modules.css` | Pestaña «Material»: «Por paciente» con el uso general primero y luego los pacientes por área, una línea por paciente y una fila por material; «Ver registros (n)». «Total del periodo»: tabla por categoría con Cantidad y Pacientes. «Medicamentos» con los mismos bloques |

Commits: uno por punto (`[ronda15][RU6]`, `[ME15]`, `[RU5]`, `[RU4]`, `[RU7]`, `[RU8]`, `[RU9]`) y un ajuste de RU7 (el texto
«Fuera de la lista de turno» no se repite en cada fila de esa sección).

## 2. Lo que me pediste averiguar

- **Dónde se excluían de la receta los «Aplicar en la clínica» (ME15).** En un solo lugar: la firma de la consulta en
  `server/app.ts` (`rxItems = items.filter((it) => !it.applyInClinic || it.buyOutside)`). La tarjeta de la consulta externa
  (`PatientChart.tsx`) solo enlaza a esa receta, y «Recetas emitidas» y WhatsApp leen la receta ya guardada: no filtraban.
  En la estancia, la «Receta» de la tarjeta de la consulta de ingreso (`RxFromNote`) marcaba solo los que no van a la hoja y
  los «No hay en la clínica»; ahora, en una nota de consulta, vienen todos marcados (A3).
- **¿ME14 estaba hecho?** Sí: pantalla final al firmar con ingreso (con «Ir a observación») y «Receta» en la tarjeta de la nota.
- **¿Administración podía agregar materiales antes?** Sí (permiso `supplies.manage`). Enfermería no: solo marcaba la lista de
  turno. Ahora Enfermería agrega con el permiso nuevo `supplies.add`; editar y archivar siguen siendo de Administración.
- **De dónde salen los turnos «Tarde (15:00–23:00)».** Son los turnos de enfermería del rol de turnos (`DEPT_SHIFTS.nursing`,
  DP6), copiados como turnos por defecto del registro de material en la ronda 14 (A10 de esa ronda decía usarlos si ya
  existían). No se cambiaron; Administración los edita en «Periodo de registro».
- **Por qué no salían los pacientes de consulta externa (captura 4).** `/api/usage/suggest` comparaba `consultations.date`
  como texto con la hora local del periodo, pero la consulta guarda la hora en UTC («…T23:14:00.000Z»): una consulta de las
  17:14 quedaba «después» de las 23:00 y no entraba al turno de la tarde. Ahora cada hora se lee con su zona, y una cita cuenta
  por su hora o por la de llegada. Hay una prueba con una consulta de las 17:14.
- **¿Sigue saliendo «+504» en el teléfono de los documentos?** Sí: la receta dice «Tel. +504 2232-7710» (captura
  `me15-receta-con-leyenda-1366.png`). Queda pendiente de IM1; no lo toqué (ver 8).

## 3. Base de datos (v83)

- `supply_items.scope` (`patient` | `general` | `both`): el «Registro» de cada línea. Lo que la clínica creó queda en `both` (A6).
- `supply_sets` (nueva): nombre, descripción, `items` (JSON: línea del catálogo y cantidad), `origin` (`catalog` | `clinic`),
  `md_key` (para reconocer los sets iniciales), quién creó y cambió, `edited_at` (lo editado no lo vuelve a tocar ninguna carga),
  `archived_at` / `archived_by`. Nada se borra.
- `material_uses.sets` (JSON): los sets que se usaron en el registro, con su nombre en ese momento.
- Todo con `ADD COLUMN IF NOT EXISTS` / `CREATE TABLE IF NOT EXISTS`; corre sola al desplegar, en todas las clínicas y
  consultorios, y en las nuevas (`platform.ts`, `db.ts`).

## 4. Carga del catálogo v2 y de los sets

Probada sobre una copia de la base v82 (las 3 clínicas de la demo: Santa Brígida, San Lucas y el Consultorio Dra. Ana López):

- Antes: 219 líneas (73 por clínica). Después: 624 (208 por clínica, 15 categorías, 17 en la lista de turno, 18 de «Uso general»)
  y 6 sets por clínica. Consultas (381), recetas (16) y registros de material sin cambios.
- Por clínica: **135 líneas agregadas**, las **73 de la ronda 14 puestas al día** en Categoría y Registro (en la copia ninguna
  estaba editada ni archivada), **6 sets creados**.
- Corrida dos veces: la segunda no cambia nada.
- Lo editado, archivado o creado por la clínica no se toca: lo cubre una prueba (`ronda15_ru.test.ts`, «una clínica de la
  ronda 14»): una línea editada conserva su texto y su categoría; la archivada sigue archivada; la propia queda en «Ambos».
- **Filas del `.md` que no se pudieron leer: ninguna.** Ojo: el `.md` que vino en `Rev 15` no era la versión 2 (traía los 117
  materiales del listado original, sin categorías, «Registro» ni Anexo). Lo armé yo como dice el plan: las 73 de la ronda 14
  con el mismo Material y Variante («Origen» = «R14-n») más 135 nuevas, la columna «Registro», la lista de turno inicial y el
  Anexo con los 6 sets. **Todo el `.md` es para que lo valides.**

## 5. Valores por defecto usados

Usé todos los de la sección 6 sin cambios (A1 a A16). Detalles:

- A2: si no hay «Cantidad a comprar» y la dosis no se puede pasar a unidades de la presentación (ej. «50 mg» con «Ampolla
  50 mg/ml», sin volumen), la línea sale sin cantidad.
- A5: el catálogo no tiene la paginación de GE5. La vista del registro («Por paciente») sí la conserva.
- A12: «Deshacer» resta lo que sumó el set (si después cambiaste una cantidad, se respeta lo que pusiste por encima).
- RU8: «Guardar como set» solo aparece al registrar (no al corregir un registro) y pide solo el nombre; la descripción se
  agrega desde «Editar» en la pestaña «Sets».
- RU8: con el destino ya elegido, «Usar set» no agrega lo que no corresponde a ese destino y lo dice en el aviso. Si todavía no
  hay destino, agrega todo y, al elegirlo, quita lo que no corresponde (con aviso), como ya hacía el formulario.

## 6. Lo que debes validar tú

- **Leyendas de la receta** (`src/lib/clinicalConfig.ts`, `RX_LEGEND_IN_CLINIC` y `RX_LEGEND_BUY_AND_BRING`, `VALIDAR: Emil`).
- **El catálogo v2** (`data/listado_material_medico_quirurgico.md`): sobre todo la columna «Registro» (qué va por paciente y qué
  es de uso general) y la lista de turno inicial.
- **Las cantidades de los 6 sets** (Anexo del mismo `.md`).

## 7. Capturas (`docs/ronda15/despues/`)

- Receta con la leyenda: `me15-receta-con-leyenda-1366.png`, `me15-receta-con-leyenda.pdf` (Carta), `me15-receta-comprar-y-traer-1366.png`, `me15-receta-390.png`.
- Catálogo: `ru4-catalogo-cerrado-1366.png`, `ru4-suturas-abierta-1366.png`, `ru4-busqueda-seda-4-1366.png`, `ru4-catalogo-390.png`.
- Menú: `ru6-menu-registros-1366.png`.
- Formulario: `ru7-formulario-dos-columnas-1366.png`, `ru7-buscar-paciente-turc-1366.png`, `ru7-algodon-no-se-suma-a-paciente-1366.png`,
  `ru7-resumen-seleccionados-1366.png`, `ru7-formulario-1100.png`, `ru7-formulario-1000.png`, `ru7-formulario-390.png`, `ru7-consultorio-390.png`.
- Sets: `ru8-pestana-sets-1366.png`, `ru8-editor-de-set-1366.png`, `ru8-usar-set-aplicado-1366.png`.
- Vista: `ru9-por-paciente-1366.png`, `ru9-ver-registros-con-set-1366.png`, `ru9-total-del-periodo-1366.png`,
  `ru9-medicamentos-por-paciente-1366.png`, `ru9-por-paciente-390.png`, `ru9-recepcion-solo-ve-1366.png`.

## 8. Hallazgos fuera de la lista (no los implementé)

- **«+504» en el teléfono** de la receta y demás documentos (pendiente de IM1, rondas 13 y 14).
- **Pruebas en este equipo:** con todos los archivos en paralelo, Node se queda sin memoria («Fatal process out of memory») y
  varios archivos se caen sin llegar a correr. Con `--test-concurrency=2` corren todas. Convendría ponerlo en `npm test`.
- Al usar un set, sus líneas que no están en la lista de turno salen en «Fuera de la lista de turno», cada una con su casilla
  «Agregar a la lista de turno». Con sets grandes la columna queda larga; se podría agrupar por categoría como la lista de turno.

## 9. Verificaciones

- **Pruebas:** 406; pasan 404. La que falla es la de siempre en este equipo: `ronda9` GE3 («sin corrimientos»,
  `spawnSync npx ENOENT`), igual que en la ronda 14. Las de RU (rondas 14 y 15): 43 de 43. Typecheck, lint (sin errores) y
  `build`: bien.
- **Navegador** (Chromium, sobre una copia de la base): ME15 con Dra. Herrera (receta con las dos leyendas y PDF Carta); RU6 con
  Lic. Ríos y Dra. Herrera; catálogo, sets, formulario (con un paciente de consulta externa, «Usar set», y el uso general con
  alcohol y esparadrapo) y las dos vistas con Lic. Ríos; Recepción solo ve (sin «Registrar material»; crear un set por URL
  directa: 403); Consultorio a 390 px. Anchos 1920, 1366, 1280 y 1100 (dos columnas), 1000 y 390 (una columna): sin desborde
  horizontal. Sin errores de consola. Filas del catálogo de 41 px.
- **No hice:**
  - Cortar el internet de verdad con el formulario y el editor de sets abiertos. Los dos usan el mismo borrador «Se guarda solo»
    de las otras pantallas (`useDraftSync`, sin cambios), que guarda primero en el navegador.
  - Imprimir la receta desde el diálogo de Chrome: el PDF Carta salió de Chromium sin ventana (`page.pdf`).
  - El recorrido completo de Consultorio en el navegador: lo cubren las pruebas de la API (catálogo, sets) y la captura a 390 px.
