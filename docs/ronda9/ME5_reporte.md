# ME5 — LNME Honduras 2023 en el vademécum: reporte

Fuente: `data/presentaciones_medicamentos_lnme.md` (LNME 2023, Acuerdo Ministerial 5230-2023, con la presentación habitual).
Origen guardado en cada medicamento: **«LNME Honduras 2023 (AM 5230-2023)»**.

## 1. Cómo se carga

| Paso | Archivo |
|---|---|
| Lector del `.md` y revisión del archivo | `src/lib/lnme/build.ts` |
| Emparejamiento y sinónimos | `src/lib/lnme/match.ts` |
| Vía del listado → vía del formulario | `src/lib/lnme/route.ts` |
| Script `npm run me5:build` (genera el archivo de datos y falla si el `.md` no pasa la revisión) | `scripts/me5-build.ts` |
| Datos generados (no se editan a mano) | `src/lib/lnme/generated.ts` |
| Carga idempotente por clínica | `server/lnmeLoader.ts` |
| Esquema v64 (columnas nuevas en `clinic_drugs`) | `server/db.ts` |
| Pruebas | `server/ronda9_me5.test.ts` |

Es el mismo esquema que usó UM1 (ronda 8) para los valores de referencia: el `.md` pasa por un script que escribe un
archivo TypeScript, y un cargador lo pasa a la base de cada clínica. Corre:

- en la migración (`ensureDb`), para **todas** las clínicas y consultorios que ya existen;
- al crear una clínica o un consultorio (`POST /api/platform/clinics`, en la misma transacción) y desde
  `ensureExamCatalog`, para que **toda cuenta nueva nazca con el listado**;
- al reiniciar la demo (`resetDemo`).

Las filas nuevas entran en lotes (un `INSERT` de varias filas, `ON CONFLICT DO NOTHING`). En una copia de la base local, la
migración completa (3 cuentas, 509 filas cada una) tardó unos 0.5 s, y la carga de una clínica, 45 ms. La segunda corrida
hace una sola consulta por clínica y no escribe nada, ni siquiera en la bitácora.

**Por qué en `clinic_drugs` y no en una tabla aparte:** el vademécum de la clínica ya vive en esa tabla. De ahí lo leen el
buscador de los dos formularios de medicamento, «Mi vademécum», Configuración › Vademécum, el permiso para editar y
desactivar (`drugs.manage`) y el aviso «No está en el vademécum de la clínica». Si el LNME va en la misma tabla, todo eso
lo incluye sin otra lista que combinar. Las columnas nuevas no cambian nada de lo que ya estaba (las filas anteriores
quedan con `origin = 'clinic'`).

Columnas nuevas (v64): `origin` ('lnme' / 'clinic'), `origin_label`, `lnme_no`, `lnme_match` ('created' / 'exact' /
'synonym'), `lnme_version`, `lnme_group`, `lnme_subgroup`, `lnme_name`, `form`, `lnme_routes`, `package`, `complementary`,
`restriction`, `lnme_note`, `certainty` ('confirmed' / 'unconfirmed' / 'none'), `presentation_full`, `alternatives` (JSON),
`aliases` (JSON). `created_by` deja de ser obligatorio, porque las filas que crea la carga no tienen autor.

## 2. Revisión del archivo (lo verifica el script)

- **530 filas numeradas, 530 números únicos, las 530 con 6 columnas.** 33 grupos. Si cambia, `npm run me5:build` falla.
- Los números no van del 1 al 530 (llegan hasta #590). Faltan los 60 renglones que, según el encabezado, son duplicados
  del PDF.
- **Presentación vacía:** ninguna.
- **Nombre cortado:** ninguno.
- **Duplicado exacto:** **#133 es igual a #132** (Rifampicina, Cápsula/tableta 300 mg). El propio archivo lo anota en el
  nombre del #132: «(mismo producto que #133; el LNME lo lista aparte para otro nivel de atención)». Se cargan los dos,
  porque tienen número propio en el listado. Esa anotación pasa a la nota y no queda en el nombre.
- **Sin vía** («—»): #390 Glutaraldehído 2 % y #430 Condón masculino. Se cargan sin vía.
- La tabla de vacunas (19.3) llama «Vacuna» a la columna «Medicamento». Se lee igual.
- **Lista complementaria: 67.** Son 59 por la anotación de la fila (`*(Lista complementaria)*`, `*(Lista compl.)*`,
  `*(Lista compl., solo TB-MDR)*`) y 8 más porque su subgrupo dice `*(todas Lista complementaria)*` (6.2.12.2 Tuberculosis,
  segunda línea). El pedido decía «unos 59».
- **⚠️ por confirmar con farmacia: 10:** #9, #14, #40, #82, #245, #246, #378, #379, #446 y #485. En #82 y #245, donde el
  texto trae ✔️ y ⚠️ a la vez, manda ⚠️. **✔️ confirmadas: 19.** El resto no trae marca.
- **Restricción de uso, guardada tal cual:**
  - #35 Dexametasona: «uso exclusivo oncología».
  - #120 Levofloxacina: «solo TB-MDR».
  - Las 62 filas del grupo 7 (Antineoplásicos e inmunosupresores): «Todos de uso en 2.º nivel – INST salvo indicación.».
    Esa nota está debajo del título del grupo y vale para todo el grupo. **VALIDAR: Emil** si debe mostrarse en cada fila.
- **Notas que no son nombre ni restricción:** #132 (ver arriba) y #467 Fiebre amarilla: «el LNME dice "antimalárica" por
  error».
- Las líneas «Ver también» no se cargan.
- **«(también …)»:** se divide en 52 filas, cuando el texto termina en «(también X)». Se precarga la parte principal y se
  sugiere «También: X». Si dice «X y Y», cada una es una alternativa. No se dividen, y queda el texto completo:
  - «(en el mercado también …)» en #14, #80, #98, #123, #134, #319, #331, #338, #353, #438 y #572. El pedido pide el patrón
    «(también …)», y este dice otra cosa (lo que hay en el mercado).
  - #470: «…; también ampolla 100 mg/2 ml», que va sin paréntesis.

## 3. Vademécum de cada cuenta, antes y después (base local nueva)

En la demo, ninguna cuenta tenía medicamentos propios en `clinic_drugs`. Lo mismo resultó en la copia de la base local
(Clínica Santa Brígida, el consultorio de la Dra. Ana López y `c-sl`): las tres tenían 0.

| | Catálogo base (en el código) | De la clínica (`clinic_drugs`) | Total |
|---|---|---|---|
| **Antes** (cada cuenta) | 35 | 0 | **35** |
| **Después** (cada cuenta) | 35 (22 con la etiqueta LNME) | 509 creados del LNME | **544** (543 en la búsqueda) |

- 530 filas = 509 creadas + 21 filas que ya eran medicamentos del catálogo base (22 medicamentos: el #26 lo es dos veces).
- La búsqueda ofrece 543: el «Paracetamol Tableta 500 mg» del catálogo base es el mismo medicamento que el «Acetaminofén
  Tableta 500 mg» (#26). Se ofrece una sola vez, como Acetaminofén, y se encuentra también buscando «Paracetamol». No se
  borra: sigue ahí para lo ya escrito y para el aviso «No está en el vademécum».
- Con una clínica que ya tiene medicamentos propios, cada medicamento que empareja deja de crearse: la clínica conserva su
  fila y esa fila gana la etiqueta. Lo prueba `server/ronda9_me5.test.ts`.

## 4. Emparejados, creados y en duda

### Catálogo base de Clinara: emparejados (22, conservan sus datos y ganan número, etiqueta y alias)

| Catálogo base | LNME | Cómo |
|---|---|---|
| Acetaminofén · Tableta 500 mg | #26 Acetaminofén · Tableta 500 mg | exacto |
| Paracetamol · Tableta 500 mg | #26 (se ofrece como el anterior) | sinónimo |
| Amoxicilina · Cápsula 500 mg | #78 | exacto |
| Azitromicina · Tableta 500 mg | #105 | exacto |
| Cefalexina · Cápsula 500 mg | #90 | exacto |
| Loratadina · Tableta 10 mg | #49 | exacto |
| Omeprazol · Cápsula 20 mg | #398 | exacto |
| Metformina · Tableta 850 mg | #435 | exacto |
| Ácido fólico · Tableta 5 mg | #297 | exacto |
| Metoclopramida · Ampolla 10 mg/2 ml | #401 | exacto |
| Ceftriaxona · Vial 1 g | #96 Vial 1 g (diluyente IV 10 ml o IM 3.5 ml con lidocaína) | exacto (sin el paréntesis) |
| Cefazolina · Vial 1 g | #91 | exacto |
| Omeprazol IV · Vial 40 mg | #399 Vial 40 mg (+ diluyente 10 ml) | exacto (sin el paréntesis) |
| Amoxicilina / Ácido clavulánico · Tableta 875/125 mg | #88 Amoxicilina + ác. clavulánico | sinónimo («ác.», «/» = «+») |
| Ciprofloxacino · Tableta 500 mg | #117 Ciprofloxacina | sinónimo |
| Solución salina 0,9 % · Bolsa 1000 ml | #549 Cloruro de sodio 0.9 % · Bolsa 1,000 ml | sinónimo |
| Lactato de Ringer · Bolsa 1000 ml | #539 Hartmann (Ringer lactato) · Bolsa 1,000 ml | sinónimo |
| Acetaminofén · Frasco 1 g/100 ml | #27 Acetaminofén IV · Frasco/vial 1 g/100 ml | par seguro escrito a mano |
| Insulina cristalina · Vial 100 UI/ml | #433 Insulina cristalina (regular) · Vial 10 ml (100 UI/ml) | par seguro escrito a mano |
| Salbutamol · Inhalador 100 mcg/dosis | #524 Salbutamol inhalador · Inhalador 200 dosis (100 µg/dosis) | par seguro escrito a mano |
| Enoxaparina · Jeringa 40 mg/0,4 ml | #302 Enoxaparina · Jeringa precargada 40 mg/0.4 ml | par seguro escrito a mano |
| Nitrofurantoína · Cápsula 100 mg | #125 Nitrofurantoína · Cápsula/tableta 100 mg | par seguro escrito a mano |

Los pares escritos a mano están en `MANUAL_BASE` (`scripts/me5-build.ts`). En cada uno es el mismo principio activo, la
misma concentración y el mismo envase, escrito de otra forma.

### En duda: no se unieron (se crean aparte y el médico ve los dos)

| Catálogo base | LNME | Por qué hay duda |
|---|---|---|
| Amlodipino · Tableta 5 mg | #338 Amlodipino · Tableta 10 mg (en el mercado también 5 mg) | La presentación del listado es la de 10 mg. |
| Ondansetrón · Ampolla 8 mg/4 ml | #403 Ondansetrón · Ampolla 4 mg/2 ml y 8 mg/4 ml | El listado junta dos presentaciones en una fila. |

Mismo principio activo con otra presentación, sin concentración en común. No se unen porque no son el mismo producto:
Ibuprofeno 400 mg (LNME 600 mg), Diclofenaco tableta 50 mg (LNME ampolla 75 mg/3 ml), Sulfato ferroso 200 mg (LNME
300 mg), Atorvastatina 20 mg (LNME 10 y 40 mg) y Tramadol ampolla 50 mg/ml (LNME ampolla 100 mg/2 ml).

### Lo que la clínica ya tenía

Se empareja al cargar, por cada clínica: primero el mismo nombre y presentación, después con sinónimo. Lo emparejado
conserva todos sus datos (nombre, comercial, presentación, vía, dosis, autor, activo) y solo gana el número, la etiqueta y
el alias del LNME. Lo dudoso no se une y queda en el reporte de la carga (`loadLnme(...).doubts`). En las bases locales no
había nada que emparejar. La prueba usa una clínica con «Aciclovir Tableta 400 mg (Zovirax)» y «Paracetamol Frasco 120 ml
(120 mg/5 ml)», que ganan la etiqueta y conservan sus datos, y con «Ondansetrón Ampolla 4 mg/2 ml», que queda en duda.

## 5. Sinónimos usados

El primero de cada grupo es el nombre con que se compara. Los demás quedan como alias de búsqueda (`src/lib/lnme/match.ts`).

Acetaminofén = Paracetamol · Adrenalina = Epinefrina · Noradrenalina = Norepinefrina · Ciprofloxacina = Ciprofloxacino ·
Levofloxacina = Levofloxacino · Moxifloxacina = Moxifloxacino · Salbutamol = Albuterol · Amlodipino = Amlodipina ·
Ácido acetilsalicílico = Aspirina · Metamizol = Dipirona · Meperidina = Petidina · Succinilcolina = Suxametonio ·
Fitomenadiona = Vitamina K1 · Hioscina butilbromuro = Butilbromuro de hioscina = Butilhioscina ·
TMP/SMX = Trimetoprim + sulfametoxazol = Cotrimoxazol · Hartmann = Ringer lactato = Lactato de Ringer ·
Cloruro de sodio = Solución salina.

Al comparar se ignoran también las tildes y las mayúsculas, y se tratan como iguales «ác.» y «ácido», «/» y «+», «0,4» y
«0.4», «1,000» y «1000», «mcg» y «µg», y «0.9 %» y «0.9%».

## 6. Lo que ve el médico y lo que hace Administración

- **Búsqueda** (consulta externa y notas, un solo código: `searchDrugs` en `src/lib/drugProvider.ts`): busca por nombre
  genérico, comercial y alias, primero lo que empieza con lo escrito. La fila de la sugerencia es un componente compartido
  (`src/components/DrugSuggestion.tsx`). Muestra nombre, comercial y el alias con que se encontró, la presentación y las
  etiquetas pequeñas «LNME», «Lista complementaria» y ⚠️ «Por confirmar» (con el texto «Presentación por confirmar con
  farmacia»). Debajo va la restricción de uso, como ayuda: no bloquea.
- **Al elegir:** la presentación principal llena «Presentación y concentración» (consulta externa) o la presentación de la
  orden (notas). Siempre se puede editar. Debajo aparece «También: …» si hay alternativas, junto con el aviso ⚠️ y la
  restricción.
- **Vía:** los dos formularios ya precargaban la vía, así que se mapea solo para los medicamentos que crea la carga. IV →
  Intravenosa, IM → Intramuscular, SC → Subcutánea, Oral, Sublingual, Tópica, Oftálmica, Ótica, Nasal, Rectal y Vaginal.
  «Inhalación oral» va a «Inhalada» si es inhalador o aerosol, y a «Nebulización» si es solución para nebulizar (#525 y
  #529). Con varias vías («IV, IM») o sin equivalente, se deja la que estaba. Los del catálogo base o de la clínica siguen
  con la regla de siempre.
- **«Nebulización»:** en este worktree todavía no está en `ROUTES` (`src/lib/format.ts`; la agrega ME4). Mientras no
  esté, #525 y #529 no precargan la vía, para que el selector no quede con un valor que no muestra. En cuanto ME4 la
  agregue, se precarga sola. Los dos se encuentran en la búsqueda (prueba incluida), así que la lista de componentes de ME4
  puede ofrecerlos con `searchDrugs`.
- **El listado no limita:** se puede seguir escribiendo cualquier medicamento, con el mismo aviso.
- **Administración** (en el consultorio, la médica titular, que tiene `drugs.manage`) va a Configuración › Vademécum, la
  pantalla que ya existía:
  - Ve la cuenta «N del catálogo base, N del LNME Honduras 2023 y N agregados por la clínica».
  - Cada fila muestra en «Origen» si viene del LNME, si la editó la clínica o quién la agregó, con «LNME #N».
  - La búsqueda encuentra también por alias y por «#N».
  - Sin escribir nada se muestran 60 del LNME; al escribir se buscan en todos.
  - «Editar» abre el formulario de siempre, con los datos del listado arriba (número, grupo, presentación completa, forma,
    vía, envase, ⚠️ y restricción). Ahí se cambia la presentación, y «Archivar» lo oculta.
  - Nada se borra. Un medicamento editado o archivado queda con origen «Editado por la clínica» y ninguna carga lo vuelve
    a pisar ni a reactivar.
  - Un médico que no es administrador recibe 403 al intentarlo, también por URL (prueba incluida).
  - Cada cambio queda en la bitácora («Archivó en el vademécum de la clínica: … (LNME #N)»), y la carga también («Cargó el
    LNME Honduras 2023 (AM 5230-2023) al vademécum: N creado(s)…», como usuario «sistema»).

## 7. Qué queda garantizado en producción

**No hace falta ningún paso manual.** Al desplegar, el primer pedido ve que `SCHEMA_VERSION` cambió y corre `ensureDb`:

- en la misma transacción y con el candado de siempre, agrega las columnas y carga el listado en todas las clínicas y
  consultorios;
- las cuentas que se creen después lo reciben al crearse;
- correrla otra vez no cambia nada.

Neon es remoto, así que las inserciones van en lotes (unas 7 sentencias por clínica) para no acercarse al límite de 60 s
de Vercel.

**Riesgo al integrar:** `SCHEMA_VERSION` quedó en **'64'** (main tenía '63'). La base local del checkout principal
(`data/pglite`) ya está en **'65'**: otro desarrollador de la ronda 9 usó ese número. Al unir las ramas, el número final
debe ser uno solo y mayor que todos los usados, y el bloque `-- v64 (ronda 9, ME5)` del esquema debe quedar con ese
número. Como la migración compara por igualdad, cualquier cambio de número vuelve a correr `ensureDb`, que es idempotente.

## 8. Lo que no se hizo o queda por validar

- No se verificó en el navegador ni a 1920, 1366, 1280 y 390 px. Sí pasaron typecheck (`npx tsc -b`), lint (sin errores),
  `server/ronda9_me5.test.ts` (8 de 8) y `npx vite build`. La suite completa da 255 de 257. Las 2 que fallan («la demo trae
  casos completos» y «DM1 ronda 5: los mínimos») fallan igual en main sin estos cambios: son un `fetch failed` por tiempo
  bajo carga y pasan si se corren solas. Una prueba existente sí se ajustó: la de la base v5 (`server/api.test.ts`) ahora
  vacía también `clinic_drugs` antes de borrar las clínicas, porque una base v5 no tiene filas del LNME.
- La parte de ME4, elegir #525 y #529 como componentes de una nebulización, depende de la lista de componentes que hace
  ME4. ME5 solo garantiza que la búsqueda los encuentra.
- Los 22 del catálogo base de Clinara ganan la etiqueta, pero no se pueden archivar: el catálogo base está en el código y
  ya no se podía archivar antes (sí se pueden archivar los otros 509 del listado).
- **VALIDAR: Emil:**
  - la restricción del grupo 7 en cada fila;
  - si «(en el mercado también …)» debe dividirse como «(también …)»;
  - los 5 pares escritos a mano;
  - las 2 dudas (Amlodipino 5 mg y Ondansetrón 8 mg/4 ml).
- Siguen pendientes lo que el pedido dejó para Emil (si esta edición es la vigente, los términos de uso del documento y si
  el listado obliga a las clínicas privadas) y las 10 ⚠️, que quedan marcadas hasta que la farmacia las confirme.
