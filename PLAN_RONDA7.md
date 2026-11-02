# Ronda 7: plan

Rama `correcciones-emil-8`. Un commit por punto: `[ronda7][NE1] …`.

## Antes de empezar: lo que no llegó

- **El Word `correcciones ronda 7.docx` no está en la máquina.** El único `.docx` disponible es
  `~/Downloads/Telegram Desktop/correcciones.docx`, que es de una ronda antigua. No se vieron las capturas y los anexos A y
  B no se validaron contra el Word: se usan tal como vienen en el texto del pedido.
- **El texto del pedido llega cortado** al final del Anexo B («Notas: "Perfil mayores de 35 años" lleva la nota "PSA
  total: solo en paci…»). El Anexo C no llegó. Su contenido se reconstruye con B6 y CA2. Ver CA2.
- No se tocó la base de producción. Todo se probó con PGlite local y con una copia de esa base.

## Stack (leído, no supuesto)

- React 19 + Vite en `src/`.
- Express en `server/`, servido en Vercel como `api/index.ts`.
- Postgres: Neon en producción y PGlite en local.
- Esquema y migraciones en `server/db.ts`: `ensureDb` corre el `SCHEMA` y las migraciones de datos cuando cambia
  `SCHEMA_VERSION` (la primera petición después de desplegar, con candado). Todas las clínicas y consultorios viven en la
  misma base (tabla `clinics`).

## NE1 — Ventana «Nota de evolución» sin desborde

- Archivos: `src/clinical.css`, `src/index.css` (Modal), `src/app/InpatientFile.tsx` (`NoteForm`).
- Causas de raíz:
  - `<fieldset>` (`.fs`) tiene por defecto `min-inline-size: min-content`, así que no se encoge por debajo de su contenido
    más ancho.
  - `.omit-row span:last-child { white-space: nowrap }`.
  - Los ítems de la cuadrícula `.note-editor__orders` no tienen `min-width: 0`.
  - `.modal` hace `overflow: auto` en los dos ejes, así que el desborde se volvía barra horizontal.
- Arreglo:
  - `min-width: 0` / `min-inline-size: 0` en `.fs` y en las columnas.
  - Las filas OMITIR/Cambiar se parten.
  - La ventana de la nota es una columna flexible: encabezado (título y «Alergias») y pie fijos, y solo el cuerpo se
    desplaza, en vertical.
- El mismo `NoteForm` sirve a la nota de ingreso, la evolución (Estándar y SOAP), las de observación y el consultorio. La
  tarjeta firmada y «Ver nota completa» (`NoteColumns`) se revisan.

## NE2 — Tamaños y rótulos

- Las áreas de texto crecen solas: componente `AutoTextarea` (4 líneas al inicio, máximo de unos 16 rem con desplazamiento
  interno). Se usa en Examen físico, Observaciones y SOAP. El micrófono se conserva.
- `VitalsFrequency`: el rótulo pasa a «Frecuencia de signos vitales».
- `ExamsBlock`: el botón pasa a «Ordenar exámenes».
- La nota firmada no cambia: lee el texto guardado.

## CA1 — Carga real de los exámenes

- **Por qué no estaba:** en la ronda 6 el texto llegó cortado y los anexos no llegaron. `server/data/labCatalog.ts` quedó
  con las listas vacías **a propósito**. La carga (`loadLabCatalog`) sí corría al desplegar, pero no tenía nada que cargar.
- Datos: `server/data/labCatalog.ts`:
  - `LAB_CATALOG`: 289 exámenes del Anexo A, en orden y con «Área › Sección».
  - `LAB_EQUIVALENCES`: las 21 equivalencias y los sinónimos de B5.
  - `LAB_PROFILES`: Anexo B y Anexo C.
- Subgrupo con dos niveles: **sin columna nueva**. El campo `exam_catalog.subgroup` guarda «Área › Sección» (por ejemplo,
  «Hormonas › Tiroides»). Las áreas sin sección guardan solo el área.
- `src/lib/exams.ts`:
  - `LAB_AREAS` (orden del Anexo A, con sus secciones);
  - `BASE_SUBGROUP` nuevo (B3);
  - orden dentro de cada sección según el Word;
  - `byArea()` para el árbol de tres niveles.
- Migración v56:
  - los 32 existentes pasan al subgrupo nuevo solo si conservan el que les puso la ronda 6 (no se pisa lo editado por la
    clínica);
  - carga idempotente por nombre normalizado y equivalencias.
- Script de comparación: `scripts/compare-lab-catalog.ts <texto.txt>` (una línea por examen; da faltantes y duplicados).

## CA2 — Paquetes a perfiles

- Se archivan (`active = FALSE`, `archived_by = 'sistema'`) estos 6:
  - Perfil lipídico;
  - Perfil hepático;
  - Perfil renal;
  - Amilasa y lipasa;
  - Electrolitos;
  - Tiempos de coagulación (TP, TPT, INR).
- **Química sanguínea se queda activa (B7/B8).**
- «Mis sets» (y los sets de órdenes que llevan exámenes): cada paquete se reemplaza por sus exámenes, sin duplicar, con
  una línea de bitácora por set (usuario `sistema`). Química sanguínea no se toca y se lista.
- `BASE_PROFILES` (los sets iniciales de los médicos nuevos) se actualiza igual.
- Una marca por clínica en `meta` evita que se repita si Administración restaura un paquete después.

## CA3 — Perfiles de la clínica

- 27 perfiles en `exam_profiles` (sin dueño): 24 del Anexo B y 3 del Anexo C. Columna nueva opcional
  `exam_profiles.note`, para la nota del PSA, que se muestra en «Perfiles (N)» y en Configuración.
- Carga idempotente por nombre normalizado.
- Los permisos no cambian: Administración, o la titular del consultorio, edita (`settings.manage`); el médico usa y copia.

## CA4 — Menú «Ordenar exámenes»

- `ExamPicker` y `ExamCatalogAdmin` usan `byArea()`: Laboratorio › área › sección, con el mismo `FoldHead` (nivel 3
  nuevo en CSS).
- Todo empieza cerrado; se abre al buscar o si tiene algo marcado.
- Se mide el tiempo de apertura y se revisa a 390 px.

## Pruebas

- `server/ronda7.test.ts`:
  - carga dos veces sin cambios;
  - conteos;
  - 0 duplicados normalizados;
  - 0 componentes sin enlazar;
  - paquetes archivados;
  - sets reemplazados con bitácora;
  - permisos 403;
  - órdenes antiguas intactas.
- Typecheck, lint, pruebas y build.
- Navegador a 1920, 1366, 1280 y 390 px.
