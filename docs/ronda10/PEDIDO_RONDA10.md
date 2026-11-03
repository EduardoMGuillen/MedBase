# Clinara (MedBase) — Ronda 10 de correcciones

> Adjunto a este prompt **dos archivos**:
> 1. **correciones_ronda_10.docx** (12 capturas): muestra el diseño actual de cada pantalla.
> 2. **Presentaciones_de_medicamentos.md**: la **fuente de datos** del vademécum (Listado Nacional de Medicamentos Esenciales de Honduras con la presentación habitual de cada producto). Es el mismo archivo de la ronda 9 (ME5). Úsalo tal cual; no completes ni corrijas datos con tu memoria.
>
> Ábrelos los dos antes de empezar.

---

## 0. Contexto

Soy Emil, médico general en Honduras, y me encargo de la parte clínica de **Clinara** (también llamada MedBase), una aplicación web de gestión clínica desplegada en https://medbase-lac.vercel.app. La desarrollo con un amigo programador que no es del área médica. Esta es la **ronda 10**.

**Qué es Clinara.** Sistema para clínicas pequeñas y medianas y consultorios de Honduras. Pocos médicos, una recepcionista, enfermería y a veces laboratorio. Las soluciones deben ser simples, con pocas pantallas y pocos clics, en español de Honduras.

**Qué se hizo antes (una línea por ronda relevante).**
- **Ronda 6**: menú "Ordenar exámenes" agrupado (MC4), catálogo con subgrupos (CF3) y perfiles (CF6); en Imagen y gabinete quedaron los subgrupos Rayos X, Ultrasonido, Tomografía, Resonancia, Cardiología, Endoscopia y Otros.
- **Ronda 7**: carga de unos 314 exámenes de laboratorio y 27 perfiles (CA1 a CA4). **Imagen y gabinete no se tocó**: por eso hoy tiene solo 19 estudios.
- **Ronda 8**: Laboratorio desplegable con búsqueda (EX1), **órdenes imprimibles de exámenes externos** (EX2), Rayos X sin informe obligatorio (EX3), umbrales críticos con fuente (UM1, UM2), Infusión (ME1), primera dosis diferente (ME2).
- **Ronda 9**: nota postquirúrgica (PQ1, PQ2), STAT también en consulta externa (ME3), **nebulización** (ME4), **carga del LNME al vademécum** (ME5), egreso en ventana (EG1), SOAP con signos vitales arriba (NE6), **componente propio de fecha y hora de 24 h** (GE3), periodo de gracia de 5 minutos (GE4).

**Esta ronda corrige y amplía** ME5 (el vademécum quedó incompleto: 509 en vez de 530, sin vía, sin orden), ME2/ME3 (el STAT solo para vía intravenosa y más discreto), EX1 (cómo se ve el resultado), EX2 (imprimir órdenes también desde la pestaña Exámenes), UM2 (quitar los umbrales archivados) y el catálogo de Imagen y gabinete de la ronda 6. **Revisa el estado real del código y de la base de datos antes de tocar cada cosa** para no duplicar funciones.

**Reglas generales (valen para todo):**

- **Dos modos**: **Clínica** (ej. "Clínica Santa Brígida") y **Consultorio** de médico independiente (ej. "Consultorio Dra. Ana López"). Todo lo de esta ronda aplica a los dos, salvo que diga otra cosa.
- **Roles**: recepción, enfermería, médico y administración; a futuro laboratorio e imágenes. Una persona puede tener varios roles.
- **Datos clínicos**: nada se borra de verdad (se archiva, se oculta o se anula), todo queda con autor, fecha y hora, y no se inventa nada. Lo firmado no se edita: se corrige con adenda o se anula y se emite otro (con el periodo de gracia de GE4).
- **Formatos**: fechas `dd/mm/aaaa`, hora de 24 horas (componente de GE3), Lempiras (L), identidad `0000-0000-00000`, teléfonos `0000-0000`, impresión tamaño carta.
- **Firma y sello**: una firma dibujada en pantalla no es la firma electrónica avanzada de la Ley sobre Firmas Electrónicas de Honduras. Toda orden o receta impresa lleva espacio para **firma y sello del médico en papel**; sin ellos no vale.
- **Privacidad**: el diagnóstico no sale en constancias, recetas ni mensajes de WhatsApp salvo que el médico lo decida (EX2 ya definió que las órdenes no llevan CIE-11).
- **Conectividad**: el internet y la luz fallan. Lo que se escriba en formularios no debe perderse (mismo mecanismo de borrador/autoguardado que ya tienen las notas).
- **Valores clínicos y constantes** van en un solo archivo de configuración con el comentario `VALIDAR: Emil`.
- **Usuarios demo**: Roberto Aguilar (administración), Sofía Mejía (recepción), Lic. Carmen Ríos (enfermería), Aux. Karla Mendoza (auxiliar de enfermería), Dra. Lucía Herrera (medicina interna), Dr. Andrés Paz (pediatría), Dra. Mariela Zúñiga (ginecología y obstetricia), Dra. Ana López (consultorio), Dr. Daniel Fúnez Castillo (medicina general). **Los perfiles demo nunca se borran.** Esta ronda **no pide datos demo nuevos**.

**Advertencia sobre las capturas.** El texto que aparece dentro de mis capturas (nombres de pacientes, diagnósticos, medicamentos, dosis, cantidades, exámenes, notas) es **relleno** que escribí solo para generar las pantallas. No lo trates como requisito ni como error. Fíjate solo en el diseño, los campos, los botones, las etiquetas y el flujo.

### Mapa de capturas del Word (en orden de aparición)

| N.º | Pantalla | Punto |
|---|---|---|
| 1 | Configuración de la clínica › Catálogo de exámenes › Imagen y gabinete (19): Rayos X (3: "Radiografía", "Radiografía de abdomen", "Radiografía de tórax"), Ultrasonido (7), Tomografía (1), Resonancia (1), Cardiología (3), Endoscopia (2), Otros (2). **Va antes del primer párrafo**, que se refiere a ella | CA5 |
| 2 | Configuración › Áreas de servicio: tarjeta "Umbrales críticos de laboratorio" con "Agregar grupo", la casilla "Ver archivados (16)" y "Guardar umbrales" | UM3 |
| 3 | Configuración › Vademécum: tabla Nombre genérico / Comercial / Presentación / Vía / Origen; al pie "Mostrando 60 de 509 del LNME. Escribe para buscar." | ME6, ME7, GE5 |
| 4 | Observación › Hoja de medicamentos › ventana de registro de una dosis (pestañas "Administrada / No aplicada / Omitida", "Hora real" con el calendario abierto) | EN4 |
| 5 | Hospitalizado › Exámenes › Laboratorio: un hemograma "Resultado listo" que, abierto, solo muestra un botón "Archivo" | EX4 |
| 6 | Consulta externa › "Medicamentos · van a la receta": campo "Medicamento" con el cursor puesto (además se ve la casilla "Primera dosis diferente (STAT)" con Vía **Oral**) | ME8, ME9 |
| 7 | El mismo formulario con Vía **Intravenosa** y la casilla "Primera dosis diferente (STAT)" en su recuadro gris | ME9 |
| 8 | El mismo formulario con Vía "Nebulización" ("Nebulizar con:", "Diluir en", "Diluyente") | Sección 2 (me gusta) |
| 9 | Ventana "Nota de evolución" › formulario de medicamento: al tocar "Medicamento" se despliega la lista del vademécum **sin haber escrito nada** | ME8 |
| 10 | Ventana "Ordenar exámenes" con una búsqueda escrita: la ventana es **baja** | GE6 |
| 11 | La misma ventana sin búsqueda y con Laboratorio desplegado: la ventana es **alta** | GE6 |
| 12 | Hospitalizado › Exámenes › Laboratorio con tres exámenes "Ordenado" (uno "Externo"), cada uno con "Muestra tomada", "Cargar resultado" y "Cancelar" | EX5 |

Las capturas 10 y 11 son la misma ventana a propósito: muestran que cambia de tamaño. Si alguna captura no corresponde a su punto, dímelo en el reporte y verifica tú el código.

---

## 1. Cómo quiero que trabajes

1. **Explora primero** el código de lo que toca esta ronda. No supongas el stack: léelo.
2. **Escribe `PLAN_RONDA10.md`** antes de programar: por cada punto (CA5, UM3, ME6…), los archivos, los cambios de base de datos, los componentes que vas a reutilizar o crear y las dependencias entre puntos. Pídeme confirmación **solo** si algo está bloqueado de verdad. Para todo lo demás usa los valores por defecto de la sección 6.
3. **Un commit por punto**, con el código en el mensaje: `[ronda10][ME9] STAT solo con vía intravenosa`.
4. **Migraciones y cargas seguras**: no borres columnas ni registros clínicos. Ocultar o archivar (las únicas excepciones autorizadas son UM3 y el catálogo de imagen de CA5, con sus condiciones). Todo cambio de datos se prueba primero sobre **una copia de la base**, es **idempotente** y sirve en las bases de **todas** las clínicas y consultorios, incluidas las **nuevas**. Si hace falta un paso manual en producción, dime exactamente cuál.
5. **Reutiliza componentes**: el formulario de medicamento (una sola lógica compartida por todos los formularios), la ventana "Ordenar exámenes", la plantilla de "Orden de laboratorio" / "Orden de imagen y gabinete" (EX2), la plantilla de la receta de consulta externa, el control "Órdenes impresas", el componente de fecha y hora de GE3, el buscador del vademécum. **No copies y pegues** formularios ni plantillas.
6. **Permisos por rol y auditoría** (quién, qué, cuándo) en toda acción nueva, incluidas cada impresión y cada descarga. Verifica permisos también por URL directa.
7. **Verifica cada punto en el navegador** con el rol correcto, en escritorio (1920, 1366 y 1280 px de ancho) y a ~390 px, y corre typecheck, lint, pruebas y `build` al final de cada punto.
8. Usa los textos exactos (botones, etiquetas) que pongo entre comillas. Cuando hablo de una etiqueta que ya existe en la app, usa **la que hoy tiene el código**.
9. **Datos externos**: no inventes valores, fuentes ni artículos de ley. Lo que no puedas respaldar, déjalo marcado y repórtalo.

---

## 2. Lo que NO se debe romper

Lo que ya funciona, o que dije que me gusta, y no se toca:

- **La nebulización (ME4, captura 8)**: "está bien, no me parece muy bonito pero sí está bien". Funciona y no se rediseña en esta ronda. Solo cambian el buscador de sus componentes (ME8) y lo que diga ME9 (con nebulización el STAT ya no se ofrecía).
- **Generar e imprimir o descargar la orden de exámenes externos desde la nota de evolución (EX2)**: "me gusta". EX5 la **agrega** en otro lugar; no cambia la que ya existe.
- **El menú "Ordenar exámenes"** (buscador, pestañas Todos / Laboratorio / Imagen y gabinete, "Mis sets", "Perfiles", "Expandir todo / Contraer todo", grupos desplegables con conteo y "marcados", "Seleccionados (N)", "Guardar selección como set", "Cancelar", "Agregar (N)", la búsqueda sin tildes). GE6 solo fija su tamaño y CA5 agrega la elección de proyección o contraste.
- **El laboratorio**: los ~314 exámenes y 27 perfiles de la ronda 7, sus valores de referencia y fuentes (UM1). CA5 **solo toca Imagen y gabinete**.
- **La pestaña Exámenes** (EX1): buscador, orden, filtros Todos / Pendientes / Con resultado / Críticos, filas desplegables, "Subir resultado externo", el flujo Ordenado → Muestra tomada → Resultado, valores críticos en rojo, "Órdenes impresas". EX4 y EX5 agregan.
- **Rayos X sin informe obligatorio (EX3)**: debe seguir funcionando con los nombres nuevos de CA5.
- **La pantalla de umbrales críticos (UM2)**: "este apartado está bien". UM3 solo quita los archivados.
- **Escribir a mano un medicamento fuera del vademécum** sigue permitido, con su aviso "No está en el vademécum de la clínica". (Las ediciones que hoy tienen las clínicas **no** se protegen: son clínicas ficticias de demostración; ver ME6.)
- **El componente de fecha y hora de GE3** (`dd/mm/aaaa HH:mm`, botón "Ahora", calendario en español, sin AM/PM). EN4 arregla cómo se abre dentro de una ventana, no su formato.
- **Las órdenes, notas y recetas ya emitidas**: no cambian de texto ni de contenido por nada de esta ronda (incluidas las que usan "Radiografía de tórax" o un STAT con vía intramuscular).
- **Los estados de la hoja de medicamentos** (Administrado, Toca ahora, Atrasado, Programado, No aplicada, Omitido) y lo que registra cada pestaña de la ventana de administración.
- **GE4 (periodo de gracia)**: un documento ya impreso bloquea la corrección de los renglones que lo alimentan. Las impresiones nuevas de EX5 y ME10 entran en esa misma regla.

---

## 3. Correcciones, una por una

Cada punto indica a qué modo aplica: **[C]** Clínica, **[K]** Consultorio, **[CK]** ambos.

Códigos de esta ronda (continúan la numeración de rondas anteriores): **CA** catálogo de exámenes, **UM** umbrales, **ME** medicamentos y vademécum, **EN** enfermería, **EX** exámenes, **GE** general.

---

### Grupo CA — Catálogo de Imagen y gabinete

#### CA5 — Estudios de imagen completos: proyección, contraste, lado y región [CK]

**Cómo está hoy (captura 1):** Imagen y gabinete tiene 19 estudios. Rayos X tiene solo "Radiografía", "Radiografía de abdomen" y "Radiografía de tórax", **sin proyección**. Ultrasonido tiene 7 (abdominal, partes blandas, tiroides, "Ultrasonido Doppler" sin región, obstétrico, pélvico, renal). Tomografía y Resonancia tienen 1 cada una, sin región ni contraste. Cardiología 3, Endoscopia 2 y Otros 2.

**Por qué:** una orden de imagen incompleta no se puede cumplir. El técnico o el centro de imágenes necesita saber qué región, qué proyección, con o sin contraste y de qué lado. "Ni siquiera están completas."

**Qué quiero:** "al momento de agregar en una orden médica un rayos X, la orden tiene que ir completa: Rayos X AP de tal, o lateral, oblicua, PA"; "cuando en una orden médica pongan rx, salga si AP, PA, lateral, oblicuo; lo mismo con USG, TAC, resonancia". Lo mismo con el ultrasonido ("ultrasonido de tal", y ultrasonido Doppler de tal), la tomografía ("simple, o contrastada, o doble contraste, o triple contraste, de tal"), la resonancia ("con gadolinio o simple, de tal"), y que **busques otras pruebas de imagen y gabinete y las agregues**.

1. **Modelo: estudio por región + detalle obligatorio al ordenar.** Cada estudio del catálogo es **una región** (ej. "Rayos X de tórax", "Tomografía de abdomen y pelvis", "Ultrasonido Doppler venoso de miembros inferiores"). Cada estudio puede tener, según su tipo, uno o más **detalles** que se eligen **al ordenar**:
   - **Proyección** (Rayos X): selección **múltiple** de las proyecciones de esa región (Anexo A). Obligatoria.
   - **Contraste** (Tomografía y Resonancia): selección **única**. Obligatorio. Tomografía: "Simple", "Contrastada", "Simple y contrastada", "Doble contraste", "Triple contraste" (doble y triple **solo** en Abdomen, Pelvis y Abdomen y pelvis). Resonancia: "Simple", "Con gadolinio". Las angiotomografías, la urotomografía y la angiorresonancia no piden contraste (lo llevan por definición).
   - **Lado** (extremidades, mama, cadera, hombro, Doppler de miembros y los que marque el Anexo A): "Derecho", "Izquierdo" o "Bilateral". Obligatorio en esos estudios.
   - **Región a especificar** (ej. "Ultrasonido de partes blandas", "Ultrasonido musculoesquelético", "Tomografía de extremidad"): texto obligatorio. Usa el campo de detalle de la orden que ya existe (ronda 6, A7); no crees otro.
   - Los tipos de detalle y sus opciones van en el archivo de configuración con `VALIDAR: Emil`, y cada estudio guarda cuáles usa. En **Catálogo de exámenes › Editar**, Administración ve y puede cambiar las proyecciones y si el estudio pide lado o contraste.
2. **Al ordenar** (ventana "Ordenar exámenes", en todo lugar donde se ordena): al marcar un estudio con detalles, **debajo de su fila** aparecen botones pequeños (chips) para elegir proyección, contraste y lado, y el campo de región si aplica. Mientras falte un detalle obligatorio, la fila se marca con el texto "Falta elegir la proyección" (o "el contraste", "el lado", "la región") y **"Agregar (N)" no deja continuar**, con el mismo mensaje. En "Seleccionados (N)" el chip muestra el **nombre completo** ya armado. La ventana no cambia de tamaño al aparecer los chips (GE6).
3. **Texto de la orden** (se arma solo, igual en la tarjeta de la nota, la pestaña Exámenes, la orden impresa de EX2 y EX5, "Ver nota completa" y la bandeja):
   - `Rayos X de tórax PA y lateral`
   - `Rayos X de rodilla AP y lateral · Lado derecho` / `· Bilateral`
   - `Tomografía de cráneo simple`, `Tomografía de abdomen y pelvis con triple contraste`, `Tomografía de tórax contrastada`
   - `Resonancia magnética de columna lumbar con gadolinio`
   - `Ultrasonido Doppler venoso de miembros inferiores · Lado izquierdo`
   - `Ultrasonido de partes blandas · Región: cara anterior del muslo derecho` (lo que escriba el médico)
   - Las proyecciones se unen con comas y "y" (`AP, lateral y oblicua`).
4. **El catálogo nuevo** es el del **Anexo A** de este prompt (Rayos X, Estudios contrastados, Ultrasonido, Ultrasonido Doppler, Tomografía, Resonancia, Cardiología, Endoscopia, Otros). Es mi lista; la marqué `VALIDAR: Emil`.
5. **Qué pasa con lo que ya existe** (migración idempotente, probada en una copia). **Decisión mía (confirmada): no quiero que se archive nada; se borran.** Es catálogo, no expediente, así que aquí no aplica la regla de archivar:
   - Se **borran del catálogo** los 12 estudios actuales de Rayos X (3), Ultrasonido (7, incluido "Ultrasonido Doppler"), Tomografía (1) y Resonancia (1), y los reemplaza la lista del Anexo A. No deben quedar en "Ver archivados" ni en ninguna pantalla. Dime sus nombres exactos en el reporte y guarda antes una exportación de lo que borras.
   - Cardiología, Endoscopia y Otros: **se conservan** los que hay y se agregan los del Anexo A que falten, sin duplicar sinónimos (ej. "EKG" = "Electrocardiograma"). Única excepción: una "Mamografía" genérica se borra y la reemplazan las dos del Anexo A (nota final del anexo).
   - **Condición para borrar**: las **órdenes antiguas** que usaron esos estudios deben seguir mostrando su texto original ("Radiografía de tórax") en la nota, la pestaña Exámenes, las órdenes impresas y los resultados. Si hoy la orden solo guarda una referencia al estudio del catálogo y no su nombre, **primero** copia el nombre a la orden (migración) y **después** borra. Si algún registro clínico no se puede conservar sin el estudio, no lo borres: déjalo retirado e invisible y repórtamelo.
   - **"Mis sets" y perfiles** que tengan uno de esos estudios: se le quita al set (no se reemplaza solo, porque no puedo saber qué proyección querían). Lista en el reporte qué sets cambiaron y de quién son.
6. **Búsqueda**: en "Ordenar exámenes" se encuentra por los nombres y por estos sinónimos, sin tildes ni mayúsculas: "rx", "radiografía", "placa" → Rayos X; "tac", "tc", "tomo" → Tomografía; "rm", "rmn", "resonancia" → Resonancia; "usg", "eco", "ecografía", "ultrasonido" → Ultrasonido; "doppler" → Ultrasonido Doppler; "ekg", "ecg" → Electrocardiograma. La lista de sinónimos va en configuración.
7. **EX3 sigue igual**: todo estudio del subgrupo "Rayos X" queda terminado al marcarse "Realizado". Revisa que la lista de prefijos de EX3 reconozca los nombres nuevos.
8. Los estudios nuevos nacen **activos**, sin precio (Servicios y precios no se toca) y con "En la clínica | Externo" como cualquier otro.

**Criterios de aceptación:**
- [ ] Como Roberto Aguilar, en Catálogo de exámenes › Imagen y gabinete ya no existen "Radiografía", "Radiografía de abdomen", "Radiografía de tórax", los 7 ultrasonidos anteriores ni la tomografía y la resonancia genéricas (tampoco en archivados), y aparecen los subgrupos y estudios del Anexo A.
- [ ] Escribo "rx", "usg", "tac" y "resonancia" en "Ordenar exámenes": salen los estudios por región y, al marcar uno, sus botones (proyección AP, PA, lateral, oblicua…; contraste; lado).
- [ ] Como Dra. Lucía Herrera, en una nota marco "Rayos X de tórax": aparecen los chips de proyección; sin elegir, "Agregar" no deja y dice "Falta elegir la proyección"; elijo PA y Lateral y el chip dice "Rayos X de tórax PA y lateral".
- [ ] Marco "Rayos X de rodilla": pide proyección y lado; queda "Rayos X de rodilla AP y lateral · Lado derecho".
- [ ] "Tomografía de abdomen y pelvis" ofrece las cinco opciones de contraste; "Tomografía de cráneo" no ofrece doble ni triple contraste.
- [ ] "Resonancia magnética de rodilla" pide "Simple" o "Con gadolinio" y lado.
- [ ] "Ultrasonido de partes blandas" no deja agregar sin escribir la región.
- [ ] Busco "tac abdomen", "rx torax", "usg tiroides" y "doppler" y salen los estudios correctos.
- [ ] La orden impresa de imagen (EX2) muestra el nombre completo armado.
- [ ] Una orden antigua con "Radiografía de tórax" sigue mostrando ese texto.
- [ ] Un Rayos X nuevo en "Realizado" queda terminado sin informe (EX3).
- [ ] Funciona en Consultorio (Dra. Ana López) y a 390 px.

---

### Grupo UM — Umbrales críticos

#### UM3 — Quitar los umbrales archivados [CK]

**Cómo está hoy (captura 2):** la tarjeta "Umbrales críticos de laboratorio" muestra "Agregar grupo", la casilla **"Ver archivados (16)"** y "Guardar umbrales". Entiendo que esta sección es para que la clínica modifique los umbrales si quiere (UM2), y está bien.

**Qué quiero:** "quiero que ahorita me quites los archivados que hay".

1. **Primero averigua qué son esos 16** (¿umbrales anteriores reemplazados por la carga de UM2? ¿grupos o analitos archivados por alguien? ¿datos de prueba?) y dímelo en el reporte con su lista.
2. **Quítalos**: es configuración, no expediente clínico, y lo pido yo. Bórralos de verdad **solo si nada depende de ellos** (resultados, alertas críticas ya emitidas, historial que algún resultado firmado cite). Si algo depende de uno, **no lo borres**: déjalo en la base marcado como retirado y que **no aparezca en ninguna pantalla**. Haz una copia de los 16 (exportación) antes, y regístralo en la bitácora.
3. **Nunca toques un umbral activo** ni un predeterminado de UM2 (los que vienen del `.md` de la ronda 8). Si alguno de los 16 es un predeterminado archivado por error, **no lo borres**: repórtamelo.
4. Con cero archivados, la casilla "Ver archivados" **no se muestra**. Si después alguien archiva otro umbral, la casilla vuelve a aparecer con su conteo (la función de archivar sigue existiendo).
5. Aplícalo en las bases de todas las clínicas y consultorios (idempotente).

**Error de interfaz detectado (captura 2):** la tarjeta **no muestra ningún grupo activo** (Hemograma, Química sanguínea, Electrolitos, "Fármacos (niveles séricos)" de UM2), solo "Agregar grupo" y los archivados. Verifica si los grupos activos existen y no se muestran, o si quedaron archivados por error; repórtalo antes de borrar nada.

**Criterios de aceptación:**
- [ ] El reporte lista los 16 archivados y dice cuáles se borraron y cuáles quedaron retirados (y por qué).
- [ ] Como Roberto Aguilar, la tarjeta ya no muestra "Ver archivados"; los umbrales activos y los de UM2 siguen ahí, con su fuente.
- [ ] Archivo un umbral de prueba: aparece "Ver archivados (1)".
- [ ] Un resultado crítico antiguo sigue mostrándose como crítico, igual que antes.
- [ ] Correr la limpieza dos veces no cambia nada la segunda vez.

---

### Grupo ME — Vademécum y medicamentos

#### ME6 — El vademécum debe tener las 530 filas del `.md`, con todas sus columnas [CK]

**Cómo está hoy (captura 3):** el pie de la tabla dice "Mostrando 60 de **509** del LNME". El archivo trae **530 filas numeradas** (las verifiqué de nuevo: 530 filas, 530 números distintos del 1 al 590, 6 columnas en todas, ninguna con la presentación vacía). Faltan 21. Además, la columna **Vía** sale "—" en medicamentos que en el `.md` sí tienen vía (ej. Ondansetrón, Ceftriaxona, Cefazolina, Enoxaparina, Insulina cristalina).

**Qué quiero:** "quiero que el .md se lea completo y se integre completo", y que la **vía de administración** del `.md` esté en el vademécum.

1. **Diagnostica por qué faltan 21.** Compara la columna "#" del archivo con los números guardados en la base y lista las filas que faltan. Pistas que encontré al revisar el archivo (compruébalas): **174 filas están directamente bajo un título `##` sin subtítulo `###`** (grupos 3, 4, 5, 8, 10, 12, 13, 14, 15, 16, 18, 20 a 26 y 28 a 33); el archivo tiene un `###` en la línea 2 que **no es un grupo** ("Con presentación comercial habitual…"); el subtítulo 6.2.12.2 trae la anotación `*(todas Lista complementaria)*`; hay 21 filas con ✔️ y 10 con ⚠️; y hay filas con el mismo nombre y distinta presentación (472 nombres distintos para 530 filas), así que **no se puede desduplicar por nombre**. Dime la causa real.
2. **Carga las 530** (corrige el script de ME5; no cargues a mano). La clave de cada fila es su **número del LNME**. **El `.md` manda**: las clínicas y consultorios que hay hoy son **ficticios** (demostración), así que sus ediciones **no importan**. Si un medicamento existente empareja con una fila (mismo nombre y presentación, sin tildes ni mayúsculas, o sinónimo como acetaminofén/paracetamol), se **reemplazan sus datos** por los del archivo (nombre, presentación, forma, vía, envase, grupo y demás) y el nombre viejo queda como alias de búsqueda, sin duplicar. Esto **reemplaza** la regla de ME5 (ronda 9) de conservar los datos de la clínica. En caso de duda, no unas y repórtalo.
3. **Todas las columnas** quedan guardadas y visibles en el detalle del medicamento (al abrirlo o en "Editar"): Nombre, Presentación habitual, Forma farmacéutica, Vía, Envase primario, Grupo y subgrupo terapéutico, "N.º en el listado nacional", Lista complementaria, Restricción de uso y Certeza de la presentación (✔️ confirmada / ⚠️ por confirmar con farmacia / sin marca). Ningún símbolo ni anotación de formato queda dentro del nombre o la presentación.
4. **Vía**: se guarda la del `.md` y se muestra con palabras completas según la leyenda del propio archivo: IV → Intravenosa, IM → Intramuscular, SC → Subcutánea, IT → Intratecal, SL → Sublingual. Las demás tal cual (Oral, Tópica, Oftálmica, Inhalación oral, Rectal, Nasal…). Varias vías: separadas por coma ("Intravenosa, intramuscular"). Las 2 filas con vía "—" (#390 glutaraldehído y #430 condón masculino) quedan sin vía.
5. **Los medicamentos del catálogo base anterior que no están en el `.md`** (ej. Ambroxol, Metamizol, Ketorolaco): se conservan como están, con origen "Catálogo base Clinara". Los que **sí** emparejan (ej. Ondansetrón, Tramadol) toman los datos del `.md` según el punto 2, incluida la vía. Lista en el reporte cuáles quedaron fuera del `.md`.
6. Una clínica o consultorio **nuevo** nace con las 530.
7. **Reglas a futuro** (para cuando haya clínicas reales): deja la marca interna de ME5 para que una carga **futura** no pise lo que una clínica real edite **desde ahora**. En esta carga no se respeta ninguna edición previa.

**Criterios de aceptación:**
- [ ] El reporte trae la causa de los 21 faltantes y la lista de esos números.
- [ ] El vademécum tiene las 530 filas del archivo (más los del catálogo base anterior que no están en el `.md`); un script de comparación por número da **0 faltantes**, en todas las bases.
- [ ] Ondansetrón, Ceftriaxona, Cefazolina, Enoxaparina e Insulina cristalina muestran su vía.
- [ ] Busco "Aciclovir" y salen sus tres presentaciones del archivo.
- [ ] Al abrir un medicamento veo forma farmacéutica, envase, grupo, "N.º en el listado nacional", lista complementaria y certeza.
- [ ] Un medicamento que la clínica demo había editado y que está en el `.md` queda con los datos del `.md`, sin duplicarse.
- [ ] La carga corre dos veces sin cambiar nada la segunda vez; probada sobre una copia.

#### ME7 — Pantalla del vademécum: páginas, orden, vía y origen [CK]

**Cómo está hoy (captura 3):** se muestran solo 60 medicamentos ("Mostrando 60 de 509 del LNME. Escribe para buscar."), **en desorden**, sin forma de ver los demás si no se busca. La columna **Origen** dice "Catálogo base" o "Catálogo base · LNME #27".

**Qué quiero:** "ver todos", "con pestaña 1 2 3 4 así como las páginas normales", "que se pueda ordenar por orden alfabético, por vía de administración, por origen", y "origen que diga Catálogo base Clinara, no esas letras"; "quiero que todos los medicamentos que estén digan Catálogo base de Clinara".

1. **Páginas**: usa el componente de paginación de GE5. 25 por página (A9). Pie: "Mostrando 1–25 de 545" (el total real de la lista, no solo "del LNME").
2. **Orden**: los encabezados **Nombre genérico** y **Vía** se pueden pulsar para ordenar (ascendente / descendente, con una flecha que indica el orden actual). Por defecto, **alfabético por nombre genérico**, sin tildes ni mayúsculas que alteren el orden. Ordenar por vía usa la primera vía; los que no tienen vía van al final. El orden se aplica a **toda** la lista, no solo a la página visible.
3. **Columna Vía**: la de ME6.
4. **Columna Origen**: "quiero que todos los medicamentos, todos, digan que son del catálogo base de Clinara". Sin números ni siglas:
   - **Todos los medicamentos del vademécum dicen "Catálogo base Clinara"**, sin excepción: lo que trae la app (el catálogo base anterior y las 530 filas del `.md`), lo que la clínica o el consultorio **agregó a mano** y lo que **editó**. Decisión confirmada por Emil. Nunca "LNME", "LNME #27", "Catálogo base" a secas, "Agregado por la clínica" ni "Editado por la clínica" en pantalla.
   - Internamente la bitácora sigue registrando quién agrega o edita un medicamento y cuándo (ME6 punto 7). Solo cambia lo que se muestra.
   - **La palabra "LNME" desaparece de toda pantalla** (columna Origen, etiqueta azul del buscador de medicamentos, pie de la tabla). El N.º del LNME y la fuente se guardan en la base y salen solo en el detalle del medicamento como "N.º en el listado nacional" (ME6). **Esto reemplaza** la etiqueta "LNME" que pidió ME5 en la ronda 9. Las etiquetas "Lista complementaria" y "Presentación por confirmar con farmacia" se conservan.
5. **Buscador** arriba de la tabla (si ya existe, se conserva): filtra por nombre, comercial y alias; al buscar, vuelve a la página 1 y las páginas se recalculan.
6. **Filtro** por **Vía** (selector con "Todas" por defecto) junto al buscador, además de ordenar (confirmado). Se combina con la búsqueda y el orden. Como todos los medicamentos dicen el mismo origen, **no hace falta filtro ni orden por Origen**; la columna se queda, pero solo informa.
7. Las acciones de Administración de ME5 (Editar, Archivar, Agregar) se conservan en cada fila. Los archivados no salen en la lista (como hoy).
8. A ~390 px la tabla pasa a tarjetas (nombre, presentación, vía, origen), con la paginación debajo.

**Errores de interfaz detectados (captura 3):**
- "Omeprazol IV" lleva la vía dentro del nombre genérico; si el `.md` lo trae con otro nombre, queda el del `.md` (ME6); si no, repórtalo.
- El pie decía "del LNME" aunque la lista mezcla medicamentos de otros orígenes.

**Criterios de aceptación:**
- [ ] Como Roberto Aguilar abro Vademécum: la lista está en orden alfabético, con páginas 1, 2, 3… y "Siguiente"; puedo llegar a la última página.
- [ ] Pulso "Vía": se ordena por vía en toda la lista; pulso otra vez y se invierte.
- [ ] Agrego un medicamento a mano y edito otro: los dos dicen "Catálogo base Clinara" en Origen; la bitácora registra quién y cuándo.
- [ ] **Todas** las filas dicen "Catálogo base Clinara" en Origen; ninguna dice "LNME".
- [ ] Filtro Vía = Intravenosa: solo salen esos, con páginas recalculadas.
- [ ] En el buscador de medicamentos de una nota ya no aparece la etiqueta "LNME".
- [ ] Busco "cef" y la paginación se recalcula desde la página 1.
- [ ] A 390 px se usa con el dedo, sin desborde.

#### ME8 — El buscador de medicamentos solo muestra sugerencias cuando escribo [CK]

**Cómo está hoy (capturas 6 y 9):** al tocar o hacer clic en el campo "Medicamento", se despliega una lista del vademécum **sin haber escrito nada** ("se despliegan los medicamentos de puro gusto").

**Qué quiero:** "no quiero que me despliegue nada; quiero que si empiezo a escribir me vaya poniendo los que podrían ser".

- Al enfocar el campo, **no se abre nada**.
- Las sugerencias aparecen **a partir de 2 letras** (valor en configuración) y se actualizan mientras escribo. Coinciden por nombre genérico, comercial y alias, sin tildes ni mayúsculas; primero los que **empiezan** con lo escrito, luego los que lo contienen. Hasta 8 visibles, con desplazamiento si hay más.
- Si borro hasta menos de 2 letras, la lista se cierra. Esc o clic afuera la cierra. Flechas y Enter para elegir con teclado.
- Sin coincidencias: no muestra lista vacía; el aviso "No está en el vademécum de la clínica" sigue funcionando como hoy al escribirlo a mano.
- **En todos los buscadores de medicamento**: consulta externa, ventana de nota (evolución, postquirúrgica, egreso, receta de salida), componentes de la nebulización (ME4), Consultorio. Es un solo componente.
- **Errores de interfaz detectados (captura 9)**: en la lista desplegada, la etiqueta "LNME" de "Amoxicilina / Ácido clavulánico" se baja a otra línea y queda cortada, y la presentación "Tableta 875/125 mg" se corta. La etiqueta "LNME" se quita (ME7). Las filas de sugerencia deben acomodar nombre, etiquetas y presentación **sin cortarse** (el nombre puede ocupar dos líneas). La lista no debe tapar el campo que estoy escribiendo.

**Criterios de aceptación:**
- [ ] Toco "Medicamento" en consulta externa y en la nota de evolución: no se abre nada.
- [ ] Escribo "a": no se abre nada. Escribo "am": salen Amoxicilina, Amoxicilina / Ácido clavulánico, Ambroxol… sin cortes.
- [ ] Escribo "acetaminofen" sin tilde y sale Acetaminofén.
- [ ] Lo mismo en un componente de nebulización.
- [ ] Escribo un medicamento que no existe: sale el aviso de siempre.
- [ ] A 390 px la lista cabe en pantalla.

#### ME9 — "Primera dosis diferente (STAT)" solo con vía intravenosa, y más discreta [CK]

**Cómo está hoy (capturas 6 y 7):** la casilla "Primera dosis diferente (STAT)" aparece en un **recuadro gris grande** con dos líneas de texto, con **cualquier vía** (en la captura 6 aparece con vía Oral).

**Qué quiero:** "que lo que dice STAT solo me aparezca con los medicamentos con aplicación IV, y que sea menos cantoso; es demasiado grande y no pega así".

1. **Solo con Vía "Intravenosa"** (además de las condiciones que ya tiene: frecuencia repetitiva; no con Dosis única, Infusión, PRN ni Nebulización). **Esto reemplaza** lo que dijeron ME2 (ronda 8) y ME3 (ronda 9), que lo permitían con cualquier vía (el ejemplo era intramuscular).
2. Si marco la casilla y después cambio la vía a otra, el bloque se oculta y, al agregar, **no se guarda** la dosis inicial; aparece un aviso pequeño "Se quitó la primera dosis diferente porque la vía ya no es intravenosa". Si vuelvo a Intravenosa antes de agregar, lo que había escrito reaparece.
3. **Menos llamativo**: una casilla en **una sola línea**, sin recuadro gris, con el mismo tamaño de letra que las demás etiquetas del formulario ("Primera dosis diferente (STAT)"). El ejemplo ("Una sola orden: por ejemplo, 2 g STAT y luego 1 g cada 12 horas.") sale como texto de ayuda pequeño **solo cuando la casilla está marcada**, o en un icono "?" al lado. Los campos que aparecen al marcarla (dosis inicial y lo que hoy tenga) no cambian.
4. En **todos** los formularios de medicamento (es un solo componente).
5. **Órdenes y recetas existentes con STAT por otra vía**: no cambian; se siguen mostrando y administrando igual. Al usar "Cambiar" en una de ellas, el formulario aplica la regla nueva.

**Criterios de aceptación:**
- [ ] Con Vía Oral, Intramuscular o Subcutánea no aparece la casilla; con Intravenosa y "Cada 6 horas", sí.
- [ ] La casilla ocupa una sola línea, sin recuadro, y el ejemplo solo aparece al marcarla.
- [ ] Marco la casilla, escribo la dosis inicial, cambio a Oral: el bloque se oculta y al agregar no se guarda, con el aviso.
- [ ] Una orden antigua "Ceftriaxona IM · 2 g STAT y luego 1 g c/12h" se sigue viendo y administrando igual.
- [ ] Probado en consulta externa, nota de evolución y Consultorio, a 390 px.

#### ME10 — Medicamentos que la clínica no tiene: van a receta, y enfermería la imprime [CK]

**Cómo está hoy:** en observación y hospitalización, los medicamentos indicados en la nota pasan a la hoja de medicamentos, pero si la clínica **no tiene** ese medicamento no hay forma de generar la receta para que la familia lo compre afuera. Con los exámenes externos sí existe la orden (EX2).

**Qué quiero:** "que funcione algo así con los medicamentos: dependiendo del medicamento, si se tiene o no, se genere receta"; "que las órdenes las pueda descargar enfermería también, e imprimir la orden y la receta, pero siempre requiriendo el sello médico ya en físico".

1. **Marca por medicamento.** En el formulario de medicamento de la ventana de nota (evolución, ingreso, postquirúrgica) y en consulta externa cuando "Aplicar en la clínica" está marcada, una casilla en una línea: **"No hay en la clínica (va a receta)"**, apagada por defecto.
   - Al marcarla aparece el campo **"Cantidad a comprar"** (texto libre, opcional; ej. "10 viales"), reutilizando el campo "Cantidad total (opcional)" que ya existe en consulta externa.
   - La orden **sigue** en la hoja de medicamentos como cualquier otra (enfermería la aplica cuando la familia la trae). En la hoja y en "Medicamentos activos" lleva una etiqueta pequeña **"Receta"**.
   - Funciona igual con STAT (ME9), infusión, PRN y nebulización (cada componente de la nebulización va a la receta).
   - En consulta externa **sin** "Aplicar en la clínica" no aparece (ya todo va a la receta).
2. **El documento "Receta"**: usa la **misma plantilla de la receta de consulta externa** (membrete, datos del paciente, fecha y hora, número, cada medicamento con presentación, dosis, vía, frecuencia, duración y "Cantidad a comprar"), el **médico que indicó** con especialidad y **número de colegiado**, **espacio para firma y sello**, y una leyenda **"Válida solo con firma y sello del médico"** (texto en configuración, `VALIDAR: Emil`). Sin diagnósticos (privacidad). Si los medicamentos los indicaron dos médicos distintos, **una receta por médico**.
3. **Dónde se genera**:
   - Al firmar una nota que tenga medicamentos marcados, el cuadro que hoy ofrece las órdenes de EX2 ofrece también **"Receta: Imprimir / Descargar PDF"**.
   - Desde la tarjeta de la nota firmada y "Ver nota completa".
   - Desde la pestaña **Medicamentos / Hoja de medicamentos**: un botón **"Imprimir receta"** que abre una ventana con los medicamentos **activos** marcados "Receta", todos seleccionados (se pueden desmarcar), con "Imprimir" y "Descargar PDF".
4. **Enfermería puede imprimir y descargar** la receta (y las órdenes de EX5) pero **no** puede marcar ni desmarcar "No hay en la clínica": eso lo decide el médico. El documento sale con los datos del médico que indicó, nunca de quien imprime. Cada impresión o descarga queda registrada (quién, cuándo) en el mismo registro que "Órdenes impresas" y cuenta para el bloqueo de GE4.
5. **Medicamentos controlados**: no agregues ninguna lógica especial en esta ronda (ver sección 8, punto 6).

**Criterios de aceptación:**
- [ ] Como Dra. Lucía Herrera, en una nota de evolución agrego Ceftriaxona IV c/12h con "No hay en la clínica (va a receta)" y "Cantidad a comprar: 10 viales"; firmo: se me ofrece la receta junto a las órdenes de exámenes.
- [ ] La receta lleva membrete, paciente, el medicamento completo, mi colegiado, espacio para firma y sello y la leyenda; no lleva diagnósticos; cabe en carta.
- [ ] La orden aparece en la hoja de medicamentos con la etiqueta "Receta" y se puede administrar.
- [ ] Como Lic. Carmen Ríos, en la hoja de medicamentos pulso "Imprimir receta", imprimo y descargo; queda registrado; no puedo cambiar la marca.
- [ ] Con medicamentos de dos médicos salen dos recetas.
- [ ] Sin medicamentos marcados no se ofrece receta.
- [ ] Funciona en Consultorio (Dra. Ana López) y a 390 px.

---

### Grupo EN — Enfermería

#### EN4 — La ventana de registro de una dosis está mal hecha: arreglarla [CK]

**Cómo está hoy (captura 4):** la ventana que se abre al tocar una dosis en la hoja de medicamentos (título con el medicamento, "Dosis de las HH:mm", pestañas **"Administrada / No aplicada / Omitida"**, "Hora real", "Registrar administración"):
- es **baja** y tiene su propia barra de desplazamiento, así que casi todo queda escondido;
- las pestañas son **pequeñas** y parecen texto, no botones;
- al abrir el calendario de "Hora real", **el calendario queda cortado** por el borde de la ventana (se ven hasta el día 15) y tapa el contenido y el botón;
- el texto de ayuda queda detrás del calendario.

**Qué quiero:** "está rarísimo, el UI está mal hecho; si lo vas a hacer en pestañas, haz las pestañas más grandes y que los UI sí sirvan".

1. **Tamaño**: ancho fijo cómodo en escritorio (unos 560 px) y alto según el contenido hasta un máximo de 90 % de la pantalla; **sin** barra de desplazamiento interna si el contenido cabe. Encabezado (título y ✕) y pie (**"Cancelar"** y el botón principal) **fijos**; solo el cuerpo se desplaza si hace falta. A ~390 px ocupa toda la pantalla.
2. **Pestañas**: un control segmentado que ocupa **todo el ancho**, con las tres opciones del mismo tamaño, **mínimo 44 px de alto**, letra del tamaño del resto del formulario, la opción elegida claramente marcada (fondo de color y texto en negrita) y las demás con aspecto de botón. Cambiar de pestaña no cambia el tamaño de la ventana de golpe.
3. **El botón principal** cambia su texto según la pestaña (si hoy ya lo hace, se conserva): "Registrar administración", "Registrar no aplicada", "Registrar omisión".
4. **Calendario y hora**: el selector de GE3 se abre **por encima de todo** (fuera del recorte de la ventana), se coloca hacia arriba si abajo no hay espacio y nunca queda cortado. **Este arreglo va en el componente de GE3**, para todas las ventanas que lo usan (procedimiento, postquirúrgica, medicamento, signos vitales…).
5. Lo que guarda cada pestaña, sus validaciones y los estados de la hoja **no cambian**. Aplica también a la misma ventana para PRN, infusión (inicio y suspensión), dosis inicial de STAT y nebulización.

**Error de interfaz detectado (captura 4):** la tarjeta del primer medicamento dice **"Día 2 de 1"**. No puede ser el día 2 de un tratamiento de 1 día: o la orden debió terminar, o el conteo está mal. Revisa la causa y repórtala; corrígela si es un error de cálculo del texto.

**Criterios de aceptación:**
- [ ] Como Lic. Carmen Ríos abro una dosis atrasada: la ventana muestra todo sin desplazamiento interno a 1366 px.
- [ ] Las tres pestañas miden al menos 44 px de alto y se distingue cuál está elegida.
- [ ] Abro el calendario de "Hora real": se ve el mes completo, sin cortes, y no tapa el botón de registrar al cerrarlo.
- [ ] El calendario tampoco se corta en la ventana de la nota de procedimiento ni en la de medicamento.
- [ ] Registro "Administrada", "No aplicada" y "Omitida" y la hoja queda como antes.
- [ ] A 390 px ocupa la pantalla y se usa con el dedo.

---

### Grupo EX — Exámenes

#### EX4 — Ver el resultado en pantalla y también el archivo [CK]

**Cómo está hoy (captura 5):** un hemograma con "Resultado listo", al abrirlo, solo muestra un botón ancho **"Archivo"**. Antes se veía el resultado en la misma fila (EX1: tabla de resultados con rangos y Alto/Bajo/crítico).

**Qué quiero:** "antes estaba bien, pero quiero la opción de poder verlo así, y en archivo". Interpreto (A13): que se pueda ver **como antes, en pantalla**, y **además** abrir el archivo.

1. **Averigua qué cambió** (qué ronda o commit dejó solo el botón "Archivo") y dímelo.
2. Al abrir un examen con resultado:
   - **"Resultado"**: la vista de antes, en la misma fila (tabla de valores con unidad, rango de referencia, etiquetas Alto/Bajo/Crítico y su fuente; o el texto del informe en imagen y gabinete), cuando el resultado tiene valores o texto cargados.
   - **"Ver archivo"**: si hay un archivo adjunto (PDF o imagen), abre una ventana con la **vista previa dentro de la app**, con "Descargar" e "Imprimir". Si hay varios archivos, se listan con su nombre.
   - Si el resultado **solo** tiene archivo, se muestra la vista previa (miniatura o primera página) y "Ver archivo". Si **solo** tiene valores, no hay botón de archivo.
3. **Cargar resultado** debe permitir **valores, archivo o ambos** en la misma carga. Si hoy obliga a elegir uno, cámbialo sin perder lo que ya funciona. Los valores son los que activan los umbrales críticos (UM2): un resultado cargado solo como archivo no se evalúa como crítico (como hoy).
4. Aplica a Laboratorio e Imagen y gabinete, en observación, hospitalización, expediente y Consultorio.

**Error de interfaz detectado (captura 5):** el botón "Archivo" ocupa todo el ancho y no dice qué archivo es. Que muestre el nombre del archivo y un icono de tipo (PDF/imagen).

**Criterios de aceptación:**
- [ ] El reporte explica qué cambió.
- [ ] Cargo un hemograma con valores y un PDF: al abrirlo veo la tabla como antes y "Ver archivo" abre el PDF dentro de la app.
- [ ] Un resultado solo con archivo muestra la vista previa; uno solo con valores, la tabla.
- [ ] Un valor crítico se sigue marcando en rojo.
- [ ] Probado como Lic. Carmen Ríos y Dra. Lucía Herrera, y a 390 px.

#### EX5 — Imprimir o descargar órdenes de exámenes pendientes desde la pestaña Exámenes [CK]

**Cómo está hoy (captura 12):** la orden imprimible de EX2 se ofrece al firmar la nota y desde la tarjeta de la nota; en la pestaña Exámenes solo está "Órdenes impresas" (reimprimir lo ya impreso). Los exámenes pendientes ("Ordenado") tienen "Muestra tomada", "Cargar resultado" y "Cancelar", pero no "imprimir orden".

**Qué quiero:** "en exámenes, si aún está pendiente, en el apartado de exámenes pueda generar las órdenes también, o sea imprimirlas o descargarlas", y que **enfermería** también pueda, "siempre requiriendo el sello médico ya en físico".

1. En el encabezado de **Laboratorio** y de **Imagen y gabinete** (junto a "Subir resultado externo"), un botón **"Imprimir orden"** cuando hay exámenes pendientes de esa sección.
2. Abre una ventana con los exámenes **pendientes** de esa sección (los que aún no tienen resultado ni están cancelados), con casillas: los **"Externo"** marcados por defecto y los "En la clínica" sin marcar (se pueden marcar). Botones "Imprimir" y "Descargar PDF".
3. El documento es **la misma "Orden de laboratorio" / "Orden de imagen y gabinete" de EX2** (misma plantilla, mismo contenido, sin CIE-11, sin la palabra "Externo"), más la leyenda **"Válida solo con firma y sello del médico"** (la misma de ME10, que también se agrega a las órdenes de EX2). Con los nombres completos de CA5.
4. Si los exámenes elegidos los pidieron **médicos distintos**, sale **una orden por médico**, cada una con su nombre, especialidad, colegiado y espacio para firma y sello. Nunca con los datos de quien imprime.
5. Cada impresión o descarga queda en **"Órdenes impresas"** (quién, cuándo) y cuenta para GE4.
6. Pueden usarlo **Médico y Enfermería** (en Consultorio, la médica).

**Errores de interfaz detectados (captura 12):**
- Los tres botones de cada examen pendiente van **apilados en vertical**, y cada fila queda muy alta. Repórtalo; si lo acomodas en una fila horizontal sin quitar ningún botón, mejor.
- El examen "Externo" muestra "Muestra tomada". Revisa si para un externo tiene sentido (la muestra la toma el laboratorio de afuera) y **solo repórtalo**.

**Criterios de aceptación:**
- [ ] Como Lic. Carmen Ríos, en un paciente con tres exámenes pendientes (uno externo), pulso "Imprimir orden" en Laboratorio: sale el externo marcado y los otros sin marcar; imprimo y descargo.
- [ ] La orden es igual a la de EX2, con la leyenda de firma y sello, y el médico que pidió.
- [ ] Con exámenes de dos médicos salen dos órdenes.
- [ ] La impresión aparece en "Órdenes impresas" con mi nombre.
- [ ] Sin pendientes, el botón no aparece.
- [ ] Sofía Mejía (Recepción) no lo ve (también por URL directa).

---

### Grupo GE — General

#### GE5 — Paginación numerada en todas las listas largas [CK]

**Cómo está hoy (captura 3):** el vademécum corta la lista en 60 y pide escribir para ver el resto. "Quiero que se arregle eso en general."

**Qué quiero:** un **solo componente de paginación** como el de las páginas normales, usado en toda lista larga de la app.

- Controles: "‹ Anterior", números de página (1 2 3 … 21, con puntos suspensivos si son muchas), "Siguiente ›", y el texto "Mostrando 1–25 de 530". Botones de al menos 44 px a ~390 px.
- 25 filas por página por defecto (en configuración). Buscar, filtrar u ordenar vuelve a la página 1. La página actual queda en la dirección (URL), así que "Atrás" del navegador vuelve a la misma página.
- La paginación, el orden y la búsqueda se hacen **sobre la lista completa** (en el servidor si la lista es grande), no solo sobre lo que se cargó.
- **Dónde**: haz el inventario de las listas que hoy cortan, limitan ("Mostrando X de Y", "Ver más") o crecen sin fin, y aplícalo. Como mínimo: Vademécum (ME7), Biblioteca de pacientes, Recetas, Caja/cobros, Bitácora, Reportes en forma de tabla y Personal. **No** se aplica a listas agrupadas en desplegables (Catálogo de exámenes, "Ordenar exámenes"), a las listas de trabajo del día (Consulta externa, Sala de espera, hoja de medicamentos) ni a las notas de un paciente. Lista en el reporte dónde la pusiste y dónde no, y por qué.

**Criterios de aceptación:**
- [ ] El vademécum y la Biblioteca de pacientes muestran páginas numeradas y el texto "Mostrando…".
- [ ] Voy a la página 3, abro un elemento y vuelvo con "Atrás": sigo en la página 3.
- [ ] Busco algo y vuelve a la página 1.
- [ ] El reporte lista dónde se aplicó.

#### GE6 — La ventana "Ordenar exámenes" no cambia de tamaño [CK]

**Cómo está hoy (capturas 10 y 11):** la ventana "Ordenar exámenes" cambia de alto según el contenido: con una búsqueda es baja (captura 10); sin búsqueda y con un grupo abierto es alta (captura 11). Cada vez que escribo, despliego un grupo o marco algo, **la ventana crece o se encoge**. "Eso marea."

**Qué quiero:** "que sea de un tamaño adecuado y que no se modifique así nada más".

- **Tamaño fijo**: el mismo ancho y el mismo alto siempre (por ejemplo, alto = 85 % de la pantalla con un máximo razonable; ancho actual). No depende de lo que haya adentro.
- **Partes fijas**: arriba, el buscador, las pestañas, "Mis sets", "Perfiles", "Expandir todo / Contraer todo"; abajo, "Seleccionados (N)" (con altura máxima y su propio desplazamiento si son muchos), "Guardar selección como set", "Cancelar" y "Agregar (N)". **Solo la lista del medio se desplaza.**
- Con cero resultados, el espacio de la lista queda con el texto "Ningún examen coincide" y la ventana mide lo mismo.
- Los chips de proyección y contraste de CA5 aparecen dentro de la lista, sin cambiar el tamaño.
- A ~390 px ocupa toda la pantalla (como ya se definió en MC4).
- **Misma regla** para las demás ventanas que tienen buscador o listas desplegables y hoy cambian de tamaño (por ejemplo la lista de "Mis sets" o "Perfiles", el buscador de diagnósticos si va en ventana). Lista en el reporte cuáles revisaste.

**Criterios de aceptación:**
- [ ] Abro "Ordenar exámenes", escribo "proteina c", borro, despliego Laboratorio y marco dos exámenes: la ventana **no cambia** ni de alto ni de ancho en ningún momento (compruébalo midiendo su caja).
- [ ] El buscador y los botones del pie no se mueven; solo la lista se desplaza.
- [ ] Con una búsqueda sin resultados la ventana mide lo mismo.
- [ ] A 1366 y 1280 px no se sale de la pantalla; a 390 px ocupa la pantalla.

---

## 4. Permisos de lo nuevo

✔ puede, ○ solo ve, — no tiene acceso. En Consultorio, la médica titular tiene los permisos de Médico y de Administración del consultorio.

| Función | Recepción | Enfermería | Médico | Administración |
|---|---|---|---|---|
| Ordenar estudios de imagen con proyección, contraste, lado y región (CA5) | — | — | ✔ | — |
| Editar las proyecciones y detalles de un estudio en el catálogo (CA5) | — | — | ✔ en Consultorio | ✔ |
| Limpieza de umbrales archivados (UM3; queda en bitácora) | — | — | — | solo el equipo técnico |
| Ver el vademécum con páginas, orden y filtros (ME7) | — | — | ✔ | ✔ |
| Editar, archivar o agregar medicamentos del vademécum (ME7, como en ME5) | — | — | ✔ en Consultorio | ✔ |
| Carga completa del `.md` (ME6; queda en bitácora) | — | — | — | solo el equipo técnico |
| Marcar "No hay en la clínica (va a receta)" (ME10) | — | — | ✔ | — |
| Imprimir o descargar la receta de medicamentos marcados (ME10) | — | ✔ | ✔ | ○ (ve el registro) |
| Ventana de registro de dosis (EN4) | — | ✔ | ✔ en Consultorio | — |
| Ver resultado en pantalla y "Ver archivo" (EX4) | según acceso actual | ✔ | ✔ | según acceso actual |
| "Imprimir orden" de exámenes pendientes (EX5) | — | ✔ | ✔ | ○ (ve el registro) |
| Paginación (GE5) y ventana de tamaño fijo (GE6) | donde ya tenga acceso | ✔ | ✔ | ✔ |

---

## 5. Orden de implementación sugerido

De lo rápido y aislado a lo grande. Lo que depende de otro punto va después.

1. **Rápidos y aislados**: ME8 (buscador), ME9 (STAT solo IV), UM3 (diagnóstico y limpieza de archivados).
2. **Componentes generales**: GE5 (paginación) → GE6 (ventana fija) → EN4 (ventana de dosis y el calendario de GE3 sin recorte).
3. **Vademécum**: ME6 (carga completa; diagnóstico de los 21) → ME7 (pantalla; usa GE5).
4. **Exámenes**: EX4 (resultado y archivo) → EX5 (imprimir orden desde Exámenes; agrega la leyenda a la plantilla de EX2).
5. **Receta de lo que no hay**: ME10 (usa la leyenda y el registro de impresiones de EX5).
6. **Catálogo de imagen**: CA5 al final (toca el catálogo, el menú "Ordenar exámenes" de GE6, las órdenes impresas de EX2/EX5 y EX3).

No hay datos demo en esta ronda.

---

## 6. Ambigüedades y valores por defecto

Decisiones que tomé porque no las especifiqué. Las marcadas **Confirmado** ya las decidió Emil; las demás, úsalas y lístalas en el reporte para que las confirme.

| Cód. | Tema | Valor por defecto |
|---|---|---|
| A1 | CA5 radiografías incompletas | **Confirmado por Emil.** "Radiografía", "Radiografía de abdomen" y "Radiografía de tórax" se **borran** (no se archivan) y las reemplazan los estudios por región del Anexo A, con proyección obligatoria. |
| A2 | CA5 lo que ya existe en imagen | **Confirmado por Emil: "no quiero que se archive nada, borra esos".** Se borran los 12 de Rayos X, Ultrasonido, Tomografía y Resonancia y la "Mamografía" genérica, y queda la lista del Anexo A. Condición: las órdenes antiguas conservan su texto (CA5 punto 5). Cardiología, Endoscopia y Otros se conservan y se completan. |
| A3 | CA5 cómo se arma la orden completa | **Confirmado por Emil.** Estudio = región; al marcarlo salen botones de proyección (AP, PA, lateral, oblicua…), contraste, lado y región. Lo mismo con Rayos X, ultrasonido, tomografía y resonancia. |
| A4 | CA5 lado | **Confirmado por Emil.** "Derecho / Izquierdo / Bilateral" **obligatorio** en extremidades, hombro, cadera, mama y Doppler de miembros. |
| A5 | CA5 contrastes de tomografía | **Confirmado por Emil.** "Simple", "Contrastada", "Simple y contrastada", "Doble contraste", "Triple contraste"; doble y triple **solo** en abdomen, pelvis y abdomen y pelvis. Doble = oral + intravenoso; triple = oral + intravenoso + rectal (uso habitual en la región). `VALIDAR: Emil`. |
| A6 | CA5 resonancia | "Simple" o "Con gadolinio". `VALIDAR: Emil`. |
| A7 | CA5 estudios agregados | Los del Anexo A (estudios contrastados, Doppler, cardiología, endoscopia, otros). Es mi lista; revísala. |
| A8 | UM3 borrado | Se borran de verdad solo los archivados de los que nada depende; si algo depende, se retiran sin mostrarse. Antes, una exportación. Los predeterminados de UM2 nunca se borran. |
| A9 | GE5 tamaño de página | 25 por página; en configuración. |
| A10 | ME7 ordenar y filtrar | **Confirmado por Emil.** Encabezados que ordenan (nombre y vía) **y** filtro por vía. Ordenar o filtrar por origen ya no hace falta, porque todos dicen lo mismo (A11). |
| A11 | ME7 Origen | **Confirmado por Emil: todos los medicamentos, sin excepción, dicen "Catálogo base Clinara"**, también los agregados o editados por la clínica. "LNME" desaparece de todas las pantallas, incluida la etiqueta del buscador. Internamente la bitácora registra quién agregó o editó. El N.º del listado queda en el detalle. |
| A20 | ME6 ediciones de las clínicas actuales | **Confirmado por Emil: las clínicas actuales son ficticias y sus ediciones no importan.** El `.md` reemplaza los datos de los medicamentos que emparejan; la protección de ediciones queda solo para cargas futuras con clínicas reales. |
| A12 | ME8 cuándo sugiere | Desde 2 letras; hasta 8 sugerencias visibles. |
| A13 | EX4 "poder verlo así, y en archivo" | **Confirmado por Emil.** Ver el resultado en pantalla como antes **y** abrir el archivo dentro de la app; la carga acepta valores, archivo o ambos. |
| A14 | EX5 qué entra en la orden | Los pendientes de la sección; externos marcados por defecto, los de la clínica sin marcar; una orden por médico que pidió. |
| A15 | ME10 "dependiendo del medicamento si se tiene o no" | **Confirmado por Emil.** Lo decide el **médico** con una casilla por orden ("No hay en la clínica (va a receta)"); no hay inventario. Enfermería imprime pero no marca. Campo "Cantidad a comprar" opcional. |
| A16 | ME10 y EX5 leyenda | "Válida solo con firma y sello del médico", en recetas y órdenes (también en las de EX2). `VALIDAR: Emil`. |
| A17 | ME9 vía | Solo "Intravenosa". Las órdenes viejas con STAT por otra vía no cambian. |
| A18 | GE6 alcance | "Ordenar exámenes" obligatoria; la misma regla en las otras ventanas con buscador o desplegables que cambien de tamaño. |
| A19 | EN4 ventana | Ancho ~560 px, alto según contenido hasta 90 %, pestañas a todo el ancho de 44 px, pie fijo; el calendario de GE3 se abre por encima de todo, en toda la app. |

---

## 7. Revisión final antes de entregar

**Marca cada casilla antes de decir que terminaste:**

- [ ] Todos los puntos cumplen **todos** sus criterios de aceptación (sección 3).
- [ ] Todo lo de la sección 2 sigue intacto (nebulización, órdenes de EX2 desde la nota, menú "Ordenar exámenes", laboratorio y perfiles, pestaña Exámenes, EX3, pantalla de umbrales, componente de GE3, órdenes y recetas ya emitidas, GE4).
- [ ] Probado a **~390 px**: sin desborde horizontal y con botones de al menos 44 px (vademécum en tarjetas, paginación, ventana de dosis, "Ordenar exámenes" con chips de CA5, "Imprimir orden", "Imprimir receta").
- [ ] Probado en escritorio a **1920, 1366 y 1280 px**.
- [ ] **Permisos** de la sección 4 comprobados también **por URL directa**.
- [ ] **Cargas y migraciones probadas sobre una copia de la base** (CA5, UM3, ME6), idempotentes y en todas las bases, incluidas una clínica y un consultorio **nuevos**.
- [ ] El script de comparación del vademécum da 0 faltantes contra las 530 filas del `.md`.
- [ ] Toda impresión y descarga nueva (EX5, ME10) queda registrada y bloquea la corrección en GE4.
- [ ] Sin errores de `build`, typecheck, lint, pruebas ni de consola.
- [ ] Textos en español correcto, fechas `dd/mm/aaaa` y hora de 24 horas.
- [ ] Las constantes nuevas están en el archivo de configuración con `VALIDAR: Emil` (detalles de imagen, contrastes, sinónimos de búsqueda, filas por página, letras mínimas del buscador, leyenda de firma y sello).

**Flujo de punta a punta con usuarios demo** (haz el recorrido completo y reporta el resultado):

1. **Roberto Aguilar (Administración)**: Áreas de servicio: ya no hay "Ver archivados" en umbrales y los activos siguen. Vademécum: orden alfabético, páginas, ordenar y filtrar por vía, todos con origen "Catálogo base Clinara" (incluido uno que agregue a mano), detalle de un medicamento con todas sus columnas. Catálogo de exámenes: Imagen y gabinete con el Anexo A y sin los estudios anteriores (ni en archivados); edita las proyecciones de "Rayos X de tórax".
2. **Dra. Lucía Herrera (médico, hospitalizado)**: nueva nota de evolución: el buscador de medicamento no se abre al tocarlo y sugiere al escribir "cef"; agrega Ceftriaxona **IV** c/12h con "Primera dosis diferente (STAT)" (casilla discreta) y "No hay en la clínica (va a receta)" con "Cantidad a comprar"; comprueba que con vía Oral no aparece el STAT; ordena "Rayos X de tórax PA y lateral", "Tomografía de abdomen y pelvis con triple contraste" **Externo** y un hemograma; la ventana de exámenes no cambia de tamaño; firma; imprime la receta y las órdenes.
3. **Lic. Carmen Ríos (enfermería)**: hoja de medicamentos: abre la dosis inicial de Ceftriaxona (ventana nueva, pestañas grandes, calendario sin recorte) y la registra; "Imprimir receta" y descarga; en Exámenes, "Imprimir orden" de los pendientes (externo marcado); carga el resultado del hemograma con valores y PDF.
4. **Dra. Lucía Herrera**: abre el hemograma: tabla en pantalla y "Ver archivo".
5. **Dr. Daniel Fúnez (consulta externa)**: receta con un medicamento IV con STAT y otro Oral sin la opción; el buscador solo sugiere al escribir.
6. **Dra. Ana López (Consultorio)**: lo mismo de los pasos 2 a 4 en observación, y el vademécum con páginas.
7. **Sofía Mejía (recepción)**: no ve "Imprimir orden" ni "Imprimir receta" (también por URL directa); la Biblioteca de pacientes tiene páginas.

---

## 8. Reporte final que espero

1. **Tabla por punto** (CA5, UM3, ME6, ME7, ME8, ME9, ME10, EN4, EX4, EX5, GE5, GE6): estado (**Hecho / Parcial / No hecho**), archivos cambiados y **cómo lo pruebo yo en 2 o 3 pasos**.
2. **Lo que te pedí averiguar**: qué eran los 16 umbrales archivados y por qué la tarjeta no mostraba grupos activos (UM3); por qué el vademécum quedó con 509 y la lista de números faltantes (ME6); qué cambió en la vista de resultados (EX4); de dónde sale "Día 2 de 1" (EN4); dónde aplicaste la paginación y dónde no (GE5); qué otras ventanas cambiaban de tamaño (GE6).
3. **CA5**: estudios borrados (nombres exactos, y si alguno quedó retirado en vez de borrado, por qué), creados, cómo conservaste el nombre en las órdenes antiguas, sets y perfiles afectados, y cómo quedaron los prefijos de EX3.
4. **Cambios en la base de datos**: tablas y columnas nuevas (detalles de imagen por estudio, campos del vademécum, marca "va a receta", cantidad a comprar), migraciones, qué se borró en UM3 y qué se retiró.
5. **Valores por defecto usados** (sección 6) y cuáles cambiaste.
6. **Lo que debo validar yo o un abogado**:
   - El catálogo de imagen del Anexo A, las proyecciones por región y el significado de doble y triple contraste.
   - La leyenda "Válida solo con firma y sello del médico".
   - **Medicamentos controlados**: la Ley sobre Uso Indebido y Tráfico Ilícito de Drogas y Sustancias Psicotrópicas de Honduras (art. 12) dice que los medicamentos con estupefacientes o sustancias controladas solo se venden con receta médica en farmacias autorizadas, y remite los detalles al Reglamento de Control de Estupefacientes, que **no pude revisar**. No sé si la receta de ME10 sirve para un controlado (por ejemplo morfina o midazolam) o si hace falta un recetario especial. No se agrega lógica; queda para validar.
7. **Hallazgos fuera de la lista** (errores de interfaz, otras listas o ventanas con el mismo problema, "Muestra tomada" en externos): repórtalos, **no los implementes** sin preguntarme.
8. **Verificaciones que no pudiste hacer** y por qué.

---

## Anexo A — Catálogo de Imagen y gabinete (CA5) · `VALIDAR: Emil`

Nombres tal como deben verse. **[P]** pide proyección (las opciones van entre paréntesis), **[C]** pide contraste, **[L]** pide lado, **[R]** pide escribir la región. Sin marca: no pide detalle.

**Rayos X** (todas [P])
- Rayos X de tórax (PA, AP, Lateral, Lordótica apical, Decúbito lateral)
- Rayos X de parrilla costal [L] (AP, Oblicua)
- Rayos X de abdomen (De pie, Acostado (decúbito), Decúbito lateral izquierdo)
- Serie de abdomen agudo — sin [P] (tórax de pie + abdomen de pie + abdomen acostado)
- Rayos X de cráneo (PA, Lateral, Towne)
- Rayos X de senos paranasales (Caldwell, Waters, Lateral)
- Rayos X de huesos propios de la nariz (Lateral, Waters)
- Rayos X de columna cervical (AP, Lateral, Oblicuas, Transoral (odontoides), Dinámicas en flexión y extensión)
- Rayos X de columna dorsal (AP, Lateral)
- Rayos X de columna lumbosacra (AP, Lateral, Oblicuas, Dinámicas en flexión y extensión)
- Rayos X de sacro y cóccix (AP, Lateral)
- Rayos X de pelvis (AP, Entrada (inlet), Salida (outlet))
- Rayos X de cadera [L] (AP, Lateral (rana))
- Rayos X de hombro [L] (AP, AP en rotación interna, AP en rotación externa, Axial, Escapular en Y)
- Rayos X de clavícula [L] (AP, AP cefálica)
- Rayos X de húmero [L] (AP, Lateral)
- Rayos X de codo [L] (AP, Lateral, Oblicuas)
- Rayos X de antebrazo [L] (AP, Lateral)
- Rayos X de muñeca [L] (PA, Lateral, Oblicua)
- Rayos X de mano [L] (PA, Oblicua, Lateral)
- Rayos X de dedos de la mano [L] [R] (PA, Oblicua, Lateral)
- Rayos X de fémur [L] (AP, Lateral)
- Rayos X de rodilla [L] (AP, Lateral, Axial de rótula, Túnel, De pie con carga)
- Rayos X de pierna (tibia y peroné) [L] (AP, Lateral)
- Rayos X de tobillo [L] (AP, Lateral, Mortaja)
- Rayos X de pie [L] (AP, Oblicua, Lateral, Con carga)
- Rayos X de calcáneo [L] (Axial, Lateral)
- Rayos X de edad ósea (mano izquierda) — sin [P]

**Estudios contrastados (fluoroscopía)**
- Esofagograma
- Serie esófago-gastroduodenal (SEGD)
- Tránsito intestinal
- Colon por enema
- Urografía excretora
- Uretrocistografía miccional
- Histerosalpingografía
- Fistulografía [R]

**Ultrasonido**
- Ultrasonido abdominal completo
- Ultrasonido de hígado y vías biliares
- Ultrasonido renal y de vías urinarias
- Ultrasonido pélvico (transabdominal)
- Ultrasonido transvaginal
- Ultrasonido obstétrico
- Ultrasonido obstétrico transvaginal
- Perfil biofísico fetal
- Ultrasonido de tiroides
- Ultrasonido de cuello
- Ultrasonido de mama [L]
- Ultrasonido testicular (escrotal)
- Ultrasonido de próstata (transabdominal)
- Ultrasonido de pared abdominal o región inguinal (hernias) [L]
- Ultrasonido de partes blandas [R]
- Ultrasonido musculoesquelético [L] [R]
- Ultrasonido de cadera pediátrica [L]
- Ultrasonido transfontanelar
- Ultrasonido de apéndice cecal
- Ultrasonido de tórax (derrame pleural)
- Ultrasonido FAST (trauma)

**Ultrasonido Doppler**
- Ultrasonido Doppler venoso de miembros inferiores [L]
- Ultrasonido Doppler arterial de miembros inferiores [L]
- Ultrasonido Doppler venoso de miembros superiores [L]
- Ultrasonido Doppler arterial de miembros superiores [L]
- Ultrasonido Doppler carotídeo y vertebral
- Ultrasonido Doppler de arterias renales
- Ultrasonido Doppler hepático (sistema porta)
- Ultrasonido Doppler obstétrico (feto-placentario)
- Ultrasonido Doppler testicular

**Tomografía** (todas [C] salvo donde se indica)
- Tomografía de cráneo
- Tomografía de senos paranasales
- Tomografía de órbitas
- Tomografía de oídos (peñascos)
- Tomografía de cuello
- Tomografía de tórax
- Tomografía de tórax de alta resolución — sin [C] (simple)
- Tomografía de abdomen (permite doble y triple contraste)
- Tomografía de pelvis (permite doble y triple contraste)
- Tomografía de abdomen y pelvis (permite doble y triple contraste)
- Tomografía de columna cervical
- Tomografía de columna dorsal
- Tomografía de columna lumbar
- Tomografía de extremidad [L] [R]
- Urotomografía — sin [C]
- Angiotomografía cerebral — sin [C]
- Angiotomografía de tórax (tromboembolia pulmonar) — sin [C]
- Angiotomografía de aorta — sin [C]
- Angiotomografía de miembros inferiores — sin [C]

**Resonancia** (todas [C]: Simple / Con gadolinio, salvo donde se indica)
- Resonancia magnética de cerebro
- Resonancia magnética de hipófisis (silla turca)
- Resonancia magnética de órbitas
- Resonancia magnética de oídos (conductos auditivos internos)
- Resonancia magnética de cuello
- Resonancia magnética de columna cervical
- Resonancia magnética de columna dorsal
- Resonancia magnética de columna lumbosacra
- Resonancia magnética de hombro [L]
- Resonancia magnética de codo [L]
- Resonancia magnética de muñeca [L]
- Resonancia magnética de cadera [L]
- Resonancia magnética de rodilla [L]
- Resonancia magnética de tobillo [L]
- Resonancia magnética de abdomen
- Resonancia magnética de pelvis
- Resonancia magnética de mama
- Resonancia magnética multiparamétrica de próstata
- Colangiorresonancia — sin [C]
- Angiorresonancia cerebral — sin [C]

**Cardiología** (conserva los 3 que existen y agrega los que falten)
- Electrocardiograma (EKG) de 12 derivaciones
- Ecocardiograma transtorácico
- Ecocardiograma transesofágico
- Holter de 24 horas
- Monitoreo ambulatorio de presión arterial (MAPA) de 24 horas
- Prueba de esfuerzo (ergometría)

**Endoscopia** (conserva los 2 que existen y agrega los que falten)
- Endoscopia digestiva alta
- Colonoscopia
- Rectosigmoidoscopia
- Colangiopancreatografía retrógrada endoscópica (CPRE)
- Broncoscopia
- Laringoscopia
- Cistoscopia

**Otros** (conserva "Espirometría", que ya existe; para "Mamografía" ver la nota al final; agrega los que falten)
- Mamografía de tamizaje (bilateral)
- Mamografía diagnóstica [L]
- Densitometría ósea
- Espirometría (con y sin broncodilatador)
- Electroencefalograma (EEG)
- Electromiografía y velocidades de conducción [R]
- Audiometría
- Timpanometría
- Polisomnografía
- Radiografía panorámica dental (ortopantomografía)

Si la "Mamografía" que existe hoy es genérica, trátala como las radiografías genéricas: bórrala (con las condiciones de CA5 punto 5) y deja las dos de esta lista.
