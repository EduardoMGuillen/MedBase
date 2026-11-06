# Clinara (MedBase): ronda 15 de correcciones

> Adjunto a este prompt dos archivos:
> - **correcioens_ronda_15.docx** (7 capturas), que muestra cómo se ve hoy cada pantalla. Ábrelo antes de empezar.
> - **Listado_material_medico_quirurgico.md** (versión 2, 208 líneas y 6 sets), que **reemplaza** al de la ronda 14 y se carga en RU5 y RU8.

---

## 0. Contexto

Soy Emil, médico general en Honduras, y me encargo de la parte clínica de **Clinara** (también llamada MedBase), una aplicación web de gestión clínica desplegada en https://medbase-lac.vercel.app. La desarrollo con un amigo programador que no es del área médica. Esta es la **ronda 15**.

**Qué es Clinara.** Sistema para clínicas pequeñas y medianas y consultorios de Honduras. Pocos médicos, una recepcionista, enfermería y a veces laboratorio e imágenes. Soluciones simples, pocas pantallas, pocos clics, español de Honduras.

**Qué se hizo antes (lo que toca esta ronda).**
- **Ronda 10**: "No hay en la clínica (va a receta)" (**ME10**).
- **Ronda 11**: ventana "Generar receta" (**ME12**).
- **Ronda 13**: plantilla única de impresión (**IM1**) e "Incluir diagnóstico" en la receta (**IM2**).
- **Ronda 14**: "Aplicar en la clínica" sin ingreso a observación, con "Aplicar" para enfermería y solo dosis STAT (**ME13**); receta desde la nota y al firmar (**ME14**); orden de los exámenes "En la clínica" (**EX10**); catálogo de material médico quirúrgico con lista de turno (**RU1**), "Registro de uso de medicamentos y material" (**RU2**) e imprimir y exportar a Excel (**RU3**).

**Esta ronda** tiene dos partes:
1. **Receta**: los medicamentos "Aplicar en la clínica" también salen en la receta (ME15).
2. **Registro de uso de material**, que "es un solo desorden": pantalla del catálogo (RU4), catálogo ampliado y con unidades que tengan sentido (RU5), menú lateral (RU6), formulario "Registrar material" reorganizado (RU7), sets de material (RU8) y vista del registro compacta (RU9).

**Revisa el estado real del código y de la base de datos antes de tocar cada cosa** para no duplicar funciones. Las capturas muestran que RU1, RU2 y ME13 ya existen: esta ronda los corrige, no los rehace.

**Reglas generales (valen para todo):**

- **Dos modos**: **Clínica** (ej. "Clínica Santa Brígida") y **Consultorio** de médico independiente (ej. "Consultorio Dra. Ana López"). Cada punto dice a cuál aplica.
- **Roles**: recepción, enfermería, médico, administración, laboratorio e imágenes. Una persona puede tener varios roles.
- **Datos clínicos**: nada se borra de verdad (se archiva, se oculta o se anula), todo queda con autor, fecha y hora, y no se inventa nada. Lo firmado o emitido no se edita: se corrige con adenda o se anula y se emite otro (periodo de gracia de GE4).
- **Formatos**: fechas `dd/mm/aaaa`, hora de 24 horas, Lempiras (L), identidad `0000-0000-00000`, teléfonos `0000-0000`, impresión **tamaño carta** con la plantilla de IM1.
- **Firma y sello**: una firma dibujada en pantalla no es la firma electrónica avanzada de la Ley sobre Firmas Electrónicas de Honduras. Todo documento impreso conserva su espacio para **firma y sello en papel**.
- **Privacidad**: el diagnóstico no sale en recetas ni órdenes salvo que el médico lo decida (IM2).
- **Conectividad**: el internet y la luz fallan. Lo que se escriba no se pierde (borrador "Se guarda solo", también en "Registrar material" y en el editor de sets).
- **Constantes** (leyendas de la receta, catálogo, sets) en configuración o en un solo archivo, con el comentario `VALIDAR: Emil`.
- **Usuarios demo**: Roberto Aguilar (administración), Sofía Mejía (recepción), Lic. Carmen Ríos (enfermería), Aux. Karla Mendoza (enfermería), Dra. Lucía Herrera (medicina interna), Dr. Andrés Paz (pediatría), Dra. Mariela Zúñiga (ginecología y obstetricia), Dra. Ana López (consultorio), Dr. Daniel Fúnez Castillo (medicina general), Lic. Gabriela Ordóñez (microbióloga), Téc. Kevin Rivera (técnico de laboratorio), Dr. Mario Castellanos (radiólogo), Téc. Paola Andino (técnica en imágenes). **Los perfiles demo nunca se borran.** Esta ronda **no** pide datos demo nuevos.

**Advertencia sobre las capturas.** El texto que aparece dentro de mis capturas (nombres de pacientes, motivo, HEA, diagnóstico, medicamentos y sus dosis o vías, la dirección y el teléfono de la clínica, el logo, la firma, qué material registré) es **relleno** que escribí solo para generar las pantallas. No lo trates como requisito ni como error. Fíjate solo en el diseño, los campos, los botones, las etiquetas y el flujo.

### Mapa de capturas del Word (en orden de aparición)

| N.º | Pantalla | Punto |
|---|---|---|
| 1 | Pantalla al terminar una consulta externa (Dra. Lucía Herrera): la receta trae solo los 2 medicamentos orales; aviso verde de las órdenes de exámenes; "Incluir diagnóstico" | ME15 |
| 2 | Biblioteca de pacientes › Consultas: la misma consulta con 13 exámenes externos y 3 medicamentos; uno dice "Por aplicar en la clínica" y abajo está el botón "Aplicar" | ME15 |
| 3 | "Catálogo de material y lista de turno" como Lic. Carmen Ríos: tabla Material / Variante / Unidad / En la lista de turno con "Sí"/"No"; en el menú lateral, "Uso de medicamentos y material" dentro del grupo "Pacientes" | RU4, RU6 |
| 4 | Ventana "Registrar material": fecha, turno, buscador de paciente y los pacientes del periodo como botones redondos revueltos; "Uso general del servicio" debajo | RU7 |
| 5 | La misma ventana con "Uso general del servicio" marcado: la lista de turno larga, sin buscador de material arriba | RU7 |
| 6 | La misma ventana; detrás se ve "Total del periodo" y los bloques por paciente | RU7 |
| 7 | Pestaña "Material": "Total del periodo" en una cuadrícula de 4 columnas y bloques por paciente con "Ver (1)" y "Registros (1)"; unidades como "1 rollo" de gasa y de algodón | RU9, RU5 |

Si alguna captura no corresponde a su punto, dímelo en el reporte y verifica tú el código.

---

## 1. Cómo quiero que trabajes

1. **Explora primero** el código de lo que toca esta ronda. No supongas el stack: léelo. En especial:
   - cómo arma hoy la receta la pantalla final de la consulta (captura 1) y dónde se excluyen los medicamentos "Aplicar en la clínica"; si ME14 (pantalla final al firmar con ingreso y botón "Receta" en la tarjeta) quedó hecho;
   - la tabla del catálogo de material, cómo se cargó el `.md` de la ronda 14 y cómo se marca lo que la clínica editó o archivó;
   - el formulario "Registrar material", la vista de la pestaña "Material" y el componente de buscador que usan los demás buscadores de la app (pacientes, CIE-11), para reutilizarlo;
   - de dónde salen los turnos que se ven en la captura 4 ("Tarde (15:00–23:00)");
   - el componente del menú lateral y cómo se agrupan sus entradas.
2. **Escribe `PLAN_RONDA15.md`** antes de programar: por cada punto (ME15, RU4, RU5, RU6, RU7, RU8, RU9), los archivos, los cambios de base de datos, los componentes que vas a reutilizar o crear y las dependencias. Pídeme confirmación **solo** si algo está bloqueado de verdad; para lo demás usa los valores por defecto de la sección 6.
3. **Un commit por punto**, con el código en el mensaje: `[ronda15][RU7] Formulario Registrar material reorganizado`.
4. **Migraciones seguras**: no borres columnas ni registros. Ocultar o archivar. Todo cambio de datos se prueba primero sobre **una copia de la base**, es **idempotente** y sirve en las bases de **todas** las clínicas y consultorios, incluidas las **nuevas** (el catálogo v2 y los sets nacen en cada clínica nueva).
5. **Reutiliza componentes**: la pantalla final de la consulta, la ventana "Generar receta" (ME12, ME14), la plantilla de IM1, el buscador de pacientes de la app, el control de cantidad de RU2, el borrador "Se guarda solo", la bitácora, la impresión y el Excel de RU3. **No copies y pegues** formularios ni ventanas: el buscador de material es **un solo** componente para el formulario, el editor de sets y "Agregar material".
6. **Permisos por rol y auditoría** (quién, qué, cuándo) en toda acción nueva, aplicados **en el servidor**, no solo ocultando botones. Verifica permisos también por URL directa.
7. **Verifica cada punto en el navegador** con el rol correcto, en escritorio (1920, 1366 y 1280 px), con la ventana no maximizada (~1100 y ~1000 px) y a ~390 px. La receta se verifica además **imprimiendo a PDF** desde Chrome en tamaño Carta. Corre typecheck, lint, pruebas y `build` al final de cada punto.
8. Usa los textos exactos (botones, etiquetas) que pongo entre comillas. Cuando hablo de una etiqueta que ya existe en la app, usa **la que hoy tiene el código**.

---

## 2. Lo que NO se debe romper

- **ME13**: "Aplicar en la clínica" sin ingreso **no** mete al paciente a observación; el botón "Aplicar" con "Aplicado" / "No aplicado"; solo dosis STAT sin ingreso. ME15 cambia la receta, no esto.
- **La pantalla final de la consulta** (captura 1): "Anular", "Enviar por WhatsApp", "Solo la receta", "Imprimir receta y orden de exámenes", "Abrir solo las órdenes", "Incluir diagnóstico" apagado por defecto, las órdenes de exámenes en su propia hoja y la orden "En la clínica" aparte (EX10).
- **El formato de la receta** (IM1): membrete, cuadrícula del paciente, folio, "Rx", cada medicamento con presentación, dosis, vía, frecuencia, duración y cantidad, firma sin raya, una receta por médico.
- **Lo que ya funciona del registro de uso**: el borrador "Se guarda solo" del formulario, el modo suma, "Anular" con motivo (tachado y sin sumar), la edición en el periodo de gracia, la pestaña "Medicamentos" que se llena sola, "Imprimir" y "Exportar a Excel" con lo filtrado, el filtro "Por turno | Rango de fechas", la lista de turno corta y el periodo de registro (turno, día o semana).
- **Reglas del catálogo**: agujas, jeringas, catéteres y mariposas solo por calibre (G), nunca por longitud; Material + Variante distingue cada línea; nada se borra; lo que la clínica editó o archivó no se pisa.
- **El material no toca lo clínico**: no aparece en notas, indicaciones, hoja de medicamentos, recetas ni expediente; no es inventario ni se cobra.
- **Lo ya emitido** (recetas, registros de material, registros de aplicación) no cambia de contenido.

---

## 3. Correcciones, una por una

Cada punto indica a qué modo aplica: **[C]** Clínica, **[K]** Consultorio, **[CK]** ambos.

Códigos de esta ronda (continúan la numeración anterior): **ME** medicamentos, **RU** registro de uso de medicamentos y material.

---

### Grupo ME: medicamentos

#### ME15: Los medicamentos "Aplicar en la clínica" también salen en la receta [CK]

**Cambia el punto 5 de ME13 (ronda 14), que decía que el medicamento aplicado en la clínica no va a la receta, y los puntos 1 y 2 de ME14 en lo que toca a la nota de consulta.**

**Cómo está hoy (capturas 1 y 2):** en una consulta externa indiqué tres medicamentos: dos orales y uno "Aplicar en la clínica" (en la tarjeta dice "Por aplicar en la clínica"). Al terminar, la receta solo trae los dos orales.

**Por qué:** "ya te había dicho que la tiene que generar": los medicamentos, "de igual forma se haga en la clínica o fuera", tienen que salir en la receta, y también la solicitud de exámenes. En muchas clínicas el paciente compra el medicamento en la farmacia y lo trae para que se lo apliquen, y la receta es la constancia de lo indicado.

**Qué quiero:**

1. **Al terminar una consulta externa** (con o sin "Ingreso a observación" / "Ingreso a hospitalización"), la receta de la pantalla final incluye **todos** los medicamentos de la consulta, también los "Aplicar en la clínica".
2. **Cómo sale en la receta** un medicamento "Aplicar en la clínica": la misma línea que los demás (nombre, presentación, dosis, vía, frecuencia, cantidad) y, debajo, una leyenda corta en cursiva:
   - **"Se aplica en la clínica."**
   - Si además tiene marcado "No hay en la clínica (va a receta)" (ME10): **"Comprar y traer a la clínica para su aplicación."**
   - Los dos textos en configuración, `VALIDAR: Emil` (A1).
3. **Cantidad**: se calcula como hoy para los demás. Para una dosis STAT, las unidades de la presentación que hacen esa dosis (ej. 1 g con vial de 1 g = 1 vial). Si hay "Cantidad a comprar" escrita, manda esa. Si no se puede calcular (frecuencia repetida sin duración, con ingreso), la línea sale sin cantidad (A2).
4. **Órdenes de exámenes**: siguen saliendo siempre, con o sin ingreso: la de los externos y, aparte, la de los "En la clínica" (EX10). Revisa el aviso verde de la captura 1: dice que las órdenes "se imprimen con el mismo botón"; cuando haya orden "En la clínica", el aviso debe decir que esa se imprime con su propio botón (EX10).
5. **Botón "Receta" de la tarjeta de una nota de consulta** (ME14): en la ventana "Generar receta" vienen marcados **todos** los medicamentos de la consulta. En las notas de evolución, procedimiento y postquirúrgica de una estancia, sigue como ME14 (marcados los "No hay en la clínica"; el médico marca los demás si quiere) (A3).
6. **Texto de ayuda de ME13** en el formulario de medicamento: cambia "Si debe seguir en casa, agrégalo también a la receta." por **"Sin ingreso se aplica una sola dosis en la clínica. También sale en la receta."**
7. Las recetas ya emitidas no cambian. Si el médico quiere la receta completa de una consulta vieja, la genera con el botón "Receta" de la tarjeta.
8. **Averigua** dónde se excluían los "Aplicar en la clínica" y si quedan otros lugares que lo hagan (la tarjeta, "Recetas emitidas", WhatsApp); dímelo en el reporte.

**Criterios de aceptación:**
- [ ] Como Dra. Lucía Herrera termino una consulta con Acetaminofén y Ibuprofeno orales y Ceftriaxona "Aplicar en la clínica", sin ingreso: la receta trae los tres; la Ceftriaxona con "Se aplica en la clínica." y su cantidad.
- [ ] Con "No hay en la clínica (va a receta)" marcado, la leyenda dice "Comprar y traer a la clínica para su aplicación."
- [ ] Con "Ingreso a observación" marcado, la pantalla final también trae los tres en la receta y las órdenes.
- [ ] La orden de los exámenes externos y la de los "En la clínica" salen como en EX10.
- [ ] En la tarjeta de la consulta, "Receta" abre "Generar receta" con los tres marcados.
- [ ] El paciente sin ingreso sigue sin aparecer en Observación y el botón "Aplicar" sigue funcionando.
- [ ] Impresa a PDF en Carta, la receta se ve bien con la leyenda; funciona en Consultorio (Dra. Ana López) y a 390 px.

---

### Grupo RU: registro de uso de medicamentos y material

**Por qué (todo el grupo):** lo de la ronda 14 funciona, pero "es un solo desorden": el catálogo no se puede contraer ni ampliar, las unidades no tienen sentido por paciente (un rollo de gasa), el formulario es una ventana larga con los pacientes revueltos y sin buscador de material, y la vista del periodo "no se entiende nada". Quiero algo **más compacto, más organizado por paciente y con mejor navegación**.

#### RU4: Pantalla del catálogo: categorías desplegables, "Agregar material" y filas compactas [CK]

**Amplía RU1 (ronda 14).**

**Cómo está hoy (captura 3):** "Catálogo de material y lista de turno" es una tabla larga: cada fila mide ~73 px, las columnas están muy separadas, cada casilla lleva al lado "Sí" o "No" (repite lo que ya dice la casilla) y las categorías son solo un título gris que no se puede cerrar. Como Lic. Carmen Ríos **no hay forma de agregar** un material al catálogo.

**Qué quiero:** "estos menús en la elección del catálogo tienen que ser desplegables", poder añadir otros materiales, y mejorar "cómo se mira lo de cantidades, unidad y así".

1. **Categorías desplegables**: cada categoría es una fila de encabezado con flecha, nombre y conteo ("Suturas · 26 · 1 en la lista de turno"). Al tocarla se abre o se cierra.
   - Al entrar, todas cerradas, salvo con el filtro "Solo mi lista de turno" (se abren las que tienen líneas marcadas).
   - Al escribir en el buscador, se abren solas las categorías con resultados y se resalta lo que coincide.
   - Botones **"Abrir todo"** y **"Cerrar todo"**. El estado se recuerda por usuario en el navegador.
   - Sin la paginación de GE5 en esta pantalla: las categorías cerradas ya la hacen corta (A5).
2. **Agrupado por material dentro de cada categoría**: el nombre del material sale una vez y debajo sus variantes, una por fila (ej. "Aguja hipodérmica" y debajo 18 G, 21 G, 22 G…).
3. **Filas compactas** (~40 px), con estas columnas: **Material**, **Variante**, **Unidad** (etiqueta pequeña: unidad, par, sobre…), **Registro** (etiqueta pequeña: "Por paciente", "Uso general", "Ambos"; ver RU5), **Lista de turno** (solo la casilla, centrada, **sin** el texto "Sí"/"No") y un menú "⋯" con "Editar", "Agregar variante" y "Archivar" según permisos.
4. **"Agregar material"** (botón arriba a la derecha), para **Administración y Enfermería** (A4):
   - Campos: **Categoría** (lista con las existentes y "Nueva categoría…"), **Material** (se escribe; sugiere los materiales que ya existen, para agregar una variante nueva a uno conocido), **Variante**, **Unidad** (lista: unidad, par, sobre, hoja, rollo, frasco), **Registro** ("Por paciente", "Uso general", "Ambos"; por defecto "Ambos") y "En la lista de turno".
   - "Agregar variante" del menú "⋯" abre el mismo formulario con la categoría y el material ya puestos.
   - Si Material + Variante ya existe: "Ya existe en el catálogo" y no deja guardar; si está archivado, ofrece "Restaurar".
   - Si el material es una aguja, jeringa, catéter o mariposa, texto de ayuda: "Escribe solo el calibre (G), no la longitud."
   - **Editar** y **Archivar** siguen siendo solo de Administración (A4). Enfermería solo agrega y marca la lista de turno.
5. **Encabezado**: buscador, "Solo mi lista de turno (n)" y el contador real ("208 líneas · 15 categorías · 17 en la lista de turno"). Los números deben coincidir con lo que hay.
6. **Pestañas** de la página: **"Materiales"**, **"Sets"** (RU8) y **"Periodo de registro"** (lo de RU1 punto 7, que ya existe).
7. A ~390 px: cada línea como tarjeta corta (material y variante arriba; unidad, registro y casilla abajo).

**Criterios de aceptación:**
- [ ] Como Lic. Carmen Ríos entro al catálogo: veo las 15 categorías cerradas con su conteo; abro "Suturas" y la cierro.
- [ ] Busco "seda 4": se abre "Suturas" y salen las variantes que coinciden.
- [ ] Las filas no tienen "Sí"/"No" y en una pantalla de 1366 px caben al menos 15 filas.
- [ ] Como Lic. Carmen Ríos agrego "Nylon · 7/0, aguja cortante" (sobre, Por paciente) y lo marco en la lista de turno: aparece en el catálogo y en el formulario; no veo "Editar" ni "Archivar" (tampoco por URL directa).
- [ ] Intento agregar "Seda · 3/0, aguja cortante": dice "Ya existe en el catálogo".
- [ ] Como Roberto Aguilar edito y archivo una línea; queda en la bitácora.
- [ ] Funciona en Consultorio (Dra. Ana López) y a 390 px.

#### RU5: Catálogo ampliado y con unidades que tengan sentido [CK]

**Reemplaza el `.md` de la ronda 14 (RU1 punto 3).**

**Cómo está hoy (capturas 3 y 7):** al registrar a un paciente salen cosas como "Gasa hospitalaria Rollo 36" × 100 yd · 1 rollo" o "Algodón Rollo · 1 rollo". Además faltan muchas cosas de uso común (tubos para muestras, sondas, material de quirófano) y hay líneas en la categoría equivocada ("Baja lengua" en "Curación y vendajes").

**Por qué:** "en un paciente no se gasta un rollo de gasa"; "el listado que yo te pasé es porque era lo que tenía a mano". Quiero el material médico quirúrgico "que se gastaría de forma común en una clínica u hospital mediano".

**Qué quiero:**

1. **Carga el archivo adjunto** `Listado_material_medico_quirurgico.md` (versión 2): **208 líneas en 15 categorías**, con un script que lea el archivo (no a mano). Deja el `.md` en el repositorio en lugar del anterior. No cargues las secciones "Anexo" (son los sets de RU8) ni "Cambios respecto a la versión de la ronda 14" como líneas.
2. **Campo nuevo "Registro"** en cada línea: **"Paciente"**, **"General"** o **"Ambos"** (en pantalla: "Por paciente", "Uso general", "Ambos").
   - Al registrar a **un paciente**, el formulario solo ofrece líneas "Paciente" y "Ambos".
   - Con **"Uso general del servicio"**, solo "General" y "Ambos".
   - Si se busca una línea que no corresponde, sale en gris con el texto "Se registra en Uso general del servicio" (o "Se registra por paciente") y no se puede sumar.
   - Las líneas que la clínica ya creó quedan en "Ambos" (A6).
3. **Cómo se aplica a las clínicas que ya existen** (idempotente, en todas las bases):
   - Las 73 líneas de la ronda 14 están en el `.md` con el **mismo Material y Variante** (columna "Origen" = "R14-n"). Si la clínica **no** las editó, se actualizan su **Categoría** y su **Registro**. Nunca se cambia Material ni Variante. Lo editado o archivado por la clínica no se toca (A7).
   - Las 135 líneas "Nueva" se agregan. Las que traen "Sí" en "Lista de turno inicial" se agregan también a la lista de turno de cada clínica.
   - Las categorías que quedan vacías se ocultan.
   - Los **registros ya hechos** no cambian (un registro viejo de "Gasa hospitalaria · 1 rollo" a un paciente se sigue viendo igual).
4. **Clínicas y consultorios nuevos** nacen con las 208 líneas y las 17 de la lista de turno.

**Criterios de aceptación:**
- [ ] Como Roberto Aguilar veo 208 líneas en 15 categorías; correr la carga dos veces no cambia nada.
- [ ] Registrando a un paciente, "Gasa hospitalaria (rollo)", "Algodón (rollo)", "Esparadrapo" y "Alcohol al 70 %" no se pueden sumar; con "Uso general del servicio", sí.
- [ ] "Gasa estéril · 10 × 10 cm" está en la lista de turno y se registra por unidad a un paciente.
- [ ] Una línea que la clínica había editado en la ronda 14 conserva su texto y su categoría.
- [ ] "Baja lengua (depresor)" está en "Exploración y monitoreo".
- [ ] Un registro viejo de un rollo a un paciente se sigue viendo igual.
- [ ] Una clínica nueva nace con las 208 líneas.

#### RU6: "Uso de medicamentos y material" sale del grupo "Pacientes" del menú [CK]

**Cómo está hoy (capturas 3 a 7):** la entrada "Uso de medicamentos y material" está **dentro** del grupo desplegable "Pacientes" de la barra lateral, junto a Consulta externa, Observación y Hospitalizados.

**Por qué:** es un registro administrativo de enfermería, no una lista de pacientes.

**Qué quiero:**

1. Sacar la entrada del grupo "Pacientes". Va como entrada propia **debajo** de ese grupo, bajo un encabezado pequeño **"Registros"**, con el mismo estilo que el encabezado "Pacientes" (A8).
2. La ruta no cambia; los enlaces y el botón "Catálogo y lista de turno" siguen funcionando.
3. Solo la ven quienes hoy tienen acceso (Enfermería, Recepción, Administración; en Consultorio, la titular). Si un rol no tiene ninguna entrada de "Registros", el encabezado no aparece.
4. Al contraer el grupo "Pacientes", la entrada sigue visible.

**Criterios de aceptación:**
- [ ] Como Lic. Carmen Ríos veo "Registros › Uso de medicamentos y material" fuera del grupo "Pacientes"; al contraer "Pacientes", sigue ahí.
- [ ] Como Dra. Lucía Herrera no veo el encabezado "Registros".
- [ ] Funciona en Consultorio y en el menú de 390 px.

#### RU7: Formulario "Registrar material" reorganizado [CK]

**Amplía RU2 (ronda 14).**

**Cómo está hoy (capturas 4, 5 y 6):** una ventana angosta y muy larga. Arriba, fecha y turno; luego el buscador de paciente y, debajo, todos los pacientes del periodo como botones redondos revueltos (observación y hospitalización mezclados, y ninguno de consulta externa); luego "Uso general del servicio"; luego la lista de turno entera con los controles de cantidad; "Agregar otro material" queda hasta el final. No hay forma de buscar un material sin bajar toda la lista.

**Qué quiero:** "es un solo desorden los pacientes, organízalos: los de consulta externa, observación y hospitalización"; "pon un buscador aquí, que al momento que se escriba detecte, como los demás"; "organizar esto de forma general, que permita búsqueda de pacientes, de material, y en general una mejor navegación"; "el uso general arriba de los pacientes".

1. **Ventana más ancha** (hasta ~1100 px) en **dos columnas** desde ~1100 px de ancho: a la izquierda **"¿Para quién?"**, a la derecha **"Material"**. Más angosta, una columna debajo de la otra. Abajo, una **barra fija** con el resumen y "Cancelar" / "Guardar".
2. **Arriba de todo**: fecha y turno como hoy. El icono de calendario va **dentro** del campo de fecha (hoy queda afuera).
3. **"¿Para quién?"** (columna izquierda), en este orden:
   - **"Uso general del servicio"** primero, como una opción grande de toda la fila con su texto de ayuda ("Lo que no se gasta en un paciente: alcohol, rollos, gorros…").
   - Debajo, **"o un paciente"**: buscador **"Buscar paciente: nombre, expediente o identidad"** que busca **mientras se escribe** (desde 2 letras, sin importar tildes ni mayúsculas), con el mismo componente y comportamiento de los demás buscadores de pacientes de la app. Busca entre **todos** los pacientes activos de la clínica, no solo los del periodo (A10). Cada resultado: nombre, expediente, identidad y ubicación actual.
   - Con el buscador vacío: **"Atendidos o internados en este periodo"**, agrupados en **"Consulta externa (n)"**, **"Observación (n)"** y **"Hospitalización (n)"**, en ese orden (A9). Cada grupo se puede cerrar. Cada paciente es una **fila** (no un botón redondo): nombre, expediente y cama o cuarto. Orden dentro del grupo: consulta externa por hora de atención (el más reciente arriba), observación por cama, hospitalización por cuarto. Si el paciente ya tiene material registrado en este periodo, una etiqueta pequeña "Ya tiene registro (n)".
   - **Revisa por qué en la captura 4 no sale ningún paciente de consulta externa**: los atendidos en consulta externa en el periodo deben salir.
   - Al elegir, la lista se cierra y queda una sola línea: "Para: [nombre] · [expediente] · [ubicación]" con **"Cambiar"**.
4. **"Material"** (columna derecha), en este orden:
   - **Buscador "Buscar material (ej. seda 4, guante 7.5)"** arriba, que filtra **mientras se escribe**, sin importar tildes, por partes del texto ("seda 4" encuentra "Seda · 4/0…"). Busca en la lista de turno **y** en todo el catálogo. Cada resultado trae su control de cantidad ahí mismo. Lo que no está en la lista de turno dice "Fuera de la lista de turno" con la casilla "Agregar a la lista de turno" (RU1). Esto **reemplaza** al "Agregar otro material" del final.
   - **"Usar set"** (RU8), junto al buscador.
   - **"Lista de turno"**, agrupada por categoría, con categorías desplegables (abiertas al entrar, porque la lista es corta). Solo muestra lo que corresponde al destino elegido (RU5 punto 2).
5. **Fila de material** (~44 px): nombre y variante y, pegada al nombre, la unidad en gris pequeño ("par", "sobre"); a la derecha, el control **[−] [cantidad] [+]**, botones de al menos 44 px. El campo vacío muestra **"0"** en gris (hoy muestra "—", que se confunde con el botón "−"). La fila con cantidad se resalta. La unidad no se repite en una columna aparte.
6. **Resumen en la barra fija**: "Seleccionados: 5 materiales" con una flecha que abre la lista de lo elegido (material, variante, cantidad y unidad, con su control para corregir o quitar). "Guardar" se activa solo con un destino elegido y al menos una cantidad. Si falta el destino: "Elige un paciente o Uso general del servicio".
7. **Guardar como set** (RU8) en la barra fija.
8. El borrador "Se guarda solo" sigue igual. **Error de interfaz (capturas 4 a 6):** la etiqueta "Borrador · Se guarda solo" está pegada al borde izquierdo de la ventana, sin margen; alinéala con el título.
9. **Turnos**: en la captura 4 se ve "Tarde (15:00–23:00)". La ronda 14 (A10) proponía Mañana 07:00–13:00, Tarde 13:00–19:00 y Noche 19:00–07:00, salvo que ya existieran turnos de enfermería. Dime en el reporte de dónde salen los que se usan; no los cambies.
10. A ~390 px: una sola columna, "¿Para quién?" arriba y "Material" abajo, con la barra fija.

**Criterios de aceptación:**
- [ ] Como Lic. Carmen Ríos abro "Registrar material" a 1366 px: veo las dos columnas; "Uso general del servicio" está arriba de los pacientes.
- [ ] Los pacientes del periodo salen en filas agrupadas en Consulta externa, Observación y Hospitalización, en ese orden, con cama o cuarto; un paciente atendido hoy en consulta externa aparece.
- [ ] Escribo "turc" en el buscador de paciente y aparece Denis Arnaldo Turcios Irías sin pulsar nada; también encuentro a un paciente que no está en el periodo.
- [ ] Elijo un paciente: la lista se cierra y queda "Para: …" con "Cambiar".
- [ ] Escribo "seda 4" en el buscador de material: salen las variantes de seda 4/0 con su control; sumo una que está fuera de la lista de turno.
- [ ] El campo de cantidad vacío muestra "0"; el resumen dice cuántos materiales llevo.
- [ ] Sin destino, "Guardar" no deja guardar y dice qué falta.
- [ ] Corto el internet, escribo cantidades, lo vuelvo a poner: el borrador sigue.
- [ ] Funciona en Consultorio y a 390 px sin desborde.

#### RU8: Sets de material [CK]

**Nuevo.**

**Por qué:** "es bastante común: los partos, todos gastan lo mismo, y también se les puede añadir más; haz la forma de guardar y personalizar sets".

**Qué quiero:**

1. **Qué es un set**: un nombre (único en la clínica), una descripción opcional y una lista de líneas del catálogo con su cantidad (entero, mínimo 1). Se puede archivar y restaurar; nada se borra.
2. **Dónde se administran**: Configuración › Material médico quirúrgico › pestaña **"Sets"** (RU4). Lista con nombre, número de materiales y quién lo cambió por última vez; botones **"Nuevo set"**, "Editar", "Duplicar" y "Archivar" ("Ver archivados" con "Restaurar"). El editor usa **el mismo buscador de material** de RU7, con su control de cantidad, y el borrador "Se guarda solo".
3. **Usarlo al registrar** (RU7): **"Usar set"** abre una lista de los sets activos (nombre y número de materiales). Al elegir uno:
   - se suman sus cantidades al formulario (si una línea ya tenía cantidad, se suma; A12);
   - las líneas salen en el resumen aunque no estén en la lista de turno;
   - aviso pequeño: "Se agregó el set «Parto vaginal» (17 materiales). Puedes cambiar las cantidades o agregar más." con **"Deshacer"**;
   - se pueden usar varios sets en el mismo registro (ej. "Parto vaginal" y "Canalización de vía periférica");
   - las líneas que no corresponden al destino (RU5 punto 2) o que están archivadas no se agregan y el aviso lo dice ("2 materiales no se agregaron: …").
4. **"Guardar como set"** (barra fija de RU7): guarda lo que está seleccionado como un set nuevo; pide el nombre. Para cambiar un set existente se usa "Editar" en la pestaña "Sets".
5. **El registro guarda qué sets se usaron** (nombre en ese momento). En "Ver registros" (RU9) sale "Set: Parto vaginal". Cambiar o archivar un set después no cambia los registros hechos.
6. **Sets iniciales**: los 6 del Anexo del `.md` (Parto vaginal, Canalización de vía periférica, Sutura de herida simple, Curación de herida, Sondaje vesical, Toma de muestra venosa), en todas las clínicas y consultorios, también los nuevos. Idempotente; lo que la clínica edite o archive no se pisa (A14).
7. **Quién**: crear, editar, duplicar y archivar sets: **Enfermería y Administración** (A13). Usar sets: quien registra material. En Consultorio, la titular.
8. Cada cambio de un set queda en la bitácora.

**Criterios de aceptación:**
- [ ] Como Lic. Carmen Ríos veo los 6 sets iniciales en la pestaña "Sets".
- [ ] Registro a una paciente: "Usar set" › "Parto vaginal": se llenan las 17 cantidades; cambio gasas de 10 a 15 y agrego "Seda · 2/0, aguja cortante"; guardo. En la vista sale todo, con "Set: Parto vaginal" en el registro.
- [ ] "Deshacer" quita lo que agregó el set y deja lo que yo había puesto antes.
- [ ] Uso dos sets que comparten guantes: los guantes se suman.
- [ ] Desde el formulario, "Guardar como set" con el nombre "Cesárea": aparece en la pestaña "Sets".
- [ ] Edito "Parto vaginal" y le quito un material: los registros anteriores no cambian.
- [ ] Como Sofía Mejía no puedo crear ni editar sets (también por URL directa).
- [ ] Funciona en Consultorio y a 390 px.

#### RU9: Vista del registro: compacta y ordenada por paciente [CK]

**Amplía RU2 y RU3 (ronda 14).**

**Cómo está hoy (captura 7):** en la pestaña "Material", el "Total del periodo" es una cuadrícula de cuatro columnas donde las cantidades quedan lejos de su material y cuesta leerla. Debajo, cada paciente es un bloque grande con una tabla "Material | Cantidad", un botón "Ver (1)" en cada fila y otro "Registros (1)" al pie que hacen casi lo mismo. Se ocupa mucho espacio para poca información.

**Qué quiero:** "no se entiende nada lo del total del periodo, y por pacientes peor; hazlo mejor, más compacto y más organizado por pacientes".

1. **Dos vistas** con un selector arriba de la lista: **"Por paciente"** (por defecto) y **"Total del periodo"**. No se muestran las dos a la vez. El buscador y los filtros sirven para las dos.
2. **"Por paciente"**:
   - Orden: primero **"Uso general del servicio"** (A11); luego los grupos **"Consulta externa"**, **"Observación"** y **"Hospitalización"**, cada uno con su título y conteo de pacientes.
   - Cada paciente es un bloque compacto: **una línea de encabezado** con nombre (negrita), expediente, ubicación ("Observación · Cama 3", "Hospitalización · Cuarto 102") y "5 materiales · 2 registros", y una flecha para abrir o cerrar.
   - Abierto: una fila por material (~32 px), con "Material variante" a la izquierda y la cantidad con su unidad alineada a la derecha ("4 pares"). Sin encabezado de tabla.
   - Un solo enlace por bloque: **"Ver registros (2)"**, que abre la lista de los registros que forman ese bloque (hora, quién, set usado, qué materiales y cuántos) con "Editar" (en el periodo de gracia) y "Anular". Se quitan el "Ver (1)" de cada fila y el "Registros (1)" duplicado.
   - "Abrir todo" / "Cerrar todo". Los bloques vienen abiertos al entrar (A16).
3. **"Total del periodo"**: una tabla de **una sola columna de datos**, agrupada por categoría (fila de título por categoría), con las columnas **Material**, **Variante**, **Cantidad** (número alineado a la derecha con su unidad) y **Pacientes** (cuántos pacientes, y "+ uso general" si aplica). En el orden del catálogo. Arriba, una línea: "11 materiales · 9 pacientes y uso general".
4. **Pestaña "Medicamentos"**: el mismo componente de bloque por paciente y el mismo orden por grupos (sin "Uso general"); su selector es "Por paciente" / "Resumen" (A15).
5. **Imprimir y Excel (RU3)** siguen el nuevo orden: "Uso general del servicio" primero y luego los grupos por área. Sin otros cambios.
6. A ~390 px: bloques a todo el ancho, con la cantidad a la derecha de cada material.

**Criterios de aceptación:**
- [ ] Como Lic. Carmen Ríos, con 3 pacientes y uso general registrados, veo primero "Uso general del servicio" y luego a los pacientes agrupados por área.
- [ ] Cada paciente ocupa una línea de encabezado y una fila por material, sin "Ver (1)" por fila.
- [ ] "Ver registros" muestra los registros del bloque con quién, cuándo y el set; desde ahí anulo uno y deja de sumar.
- [ ] En "Total del periodo" leo cada material con su cantidad en la misma fila, agrupado por categoría, y el número de pacientes.
- [ ] La pestaña "Medicamentos" usa los mismos bloques y el mismo orden.
- [ ] El impreso y el Excel salen en el mismo orden.
- [ ] Funciona en Consultorio y a 390 px.

---

## 4. Permisos de lo nuevo

✔ puede, ○ solo ve, — no tiene acceso. "Igual que hoy" = no cambia. En Consultorio, la médica titular tiene los permisos de Médico, Enfermería y Administración. Lab e Img no tienen acceso a nada de esta ronda.

| Función | Recepción | Enfermería | Médico | Administración |
|---|---|---|---|---|
| Receta con los medicamentos "Aplicar en la clínica" (ME15) | — | igual que ME14 (reimprime) | ✔ | — |
| Abrir y cerrar categorías del catálogo (RU4) | — | ✔ | — | ✔ |
| "Agregar material" y "Agregar variante" (RU4) | — | ✔ | — | ✔ |
| Editar y archivar materiales (RU4) | — | — | — | ✔ |
| Marcar la lista de turno (RU1, igual que hoy) | — | ✔ | — | ✔ |
| Carga del catálogo v2 (RU5) | migración, sin pantalla | | | |
| Ver la entrada "Registros › Uso de medicamentos y material" (RU6) | ✔ | ✔ | — | ✔ |
| Registrar material con el formulario nuevo (RU7) | — | ✔ | — | — |
| Crear, editar, duplicar y archivar sets (RU8) | — | ✔ | — | ✔ |
| Usar un set al registrar y "Guardar como set" (RU8) | — | ✔ | — | — |
| Ver las dos vistas del registro (RU9) | ○ | ✔ | — | ○ |
| Anular un registro (igual que hoy) | — | ✔ (el propio) | — | ✔ |

---

## 5. Orden de implementación sugerido

1. **Rápido y aislado**: RU6 (menú) → ME15 (receta).
2. **Datos del catálogo**: RU5 (campo "Registro" y carga del `.md` v2).
3. **Pantalla del catálogo**: RU4 (desplegables, agregar, filas compactas, pestañas).
4. **Formulario**: RU7 (depende de RU5 para filtrar por destino).
5. **Sets**: RU8 (usa el buscador de RU7 y la pestaña de RU4).
6. **Vista**: RU9 (muestra el set de RU8) y el nuevo orden en la impresión y el Excel.

No hay datos demo en esta ronda.

---

## 6. Ambigüedades y valores por defecto

Decisiones que tomé porque no las especifiqué. Úsalas y lístalas en el reporte para que las confirme.

| Cód. | Tema | Valor por defecto |
|---|---|---|
| A1 | ME15 leyendas en la receta | "Se aplica en la clínica." y, con "No hay en la clínica", "Comprar y traer a la clínica para su aplicación." `VALIDAR: Emil`. |
| A2 | ME15 cantidad | Como hoy; en STAT, las unidades de una dosis; si hay "Cantidad a comprar", manda esa; si no se puede calcular, sin cantidad. |
| A3 | ME15 alcance | Toda nota de consulta externa (con o sin ingreso). Las notas de evolución, procedimiento y postquirúrgica siguen como ME14. |
| A4 | RU4 quién agrega | Administración y Enfermería agregan materiales y variantes; editar y archivar, solo Administración. |
| A5 | RU4 paginación | Sin paginación en el catálogo; categorías cerradas al entrar. |
| A6 | RU5 "Registro" de las líneas que creó la clínica | "Ambos". |
| A7 | RU5 líneas de la ronda 14 | Si la clínica no las editó, se actualizan Categoría y Registro; Material y Variante nunca cambian. |
| A8 | RU6 lugar en el menú | Entrada propia debajo del grupo "Pacientes", bajo el encabezado "Registros". |
| A9 | RU7 grupos de pacientes | Consulta externa, Observación y Hospitalización, en ese orden. En el Word escribí "consulta externa, observación y consulta": lo interpreté como hospitalización. |
| A10 | RU7 alcance del buscador de paciente | Todos los pacientes activos de la clínica; la lista del periodo solo aparece con el buscador vacío. |
| A11 | RU7 y RU9 "Uso general arriba" | Arriba de los pacientes en el formulario, en la vista "Por paciente", en el impreso y en el Excel. |
| A12 | RU8 aplicar un set | Suma a lo que ya había; varios sets se suman entre sí. |
| A13 | RU8 quién administra sets | Enfermería y Administración. |
| A14 | RU8 sets iniciales | Los 6 del Anexo del `.md`, con cantidades por validar. `VALIDAR: Emil`. |
| A15 | RU9 pestaña "Medicamentos" | Mismo componente de bloque y mismo orden por grupos que "Material". |
| A16 | RU9 estado inicial | Vista "Por paciente" con los bloques abiertos. |

---

## 7. Revisión final antes de entregar

**Marca cada casilla antes de decir que terminaste:**

- [ ] Todos los puntos cumplen **todos** sus criterios de aceptación (sección 3).
- [ ] Todo lo de la sección 2 sigue intacto (ME13 sin ingreso, la pantalla final, el formato de la receta, lo que ya funcionaba del registro de uso, las reglas del catálogo, el material fuera de lo clínico, lo ya emitido).
- [ ] Probado a **~390 px**: sin desborde horizontal y con botones de al menos 44 px (control de cantidad, "Usar set", categorías, menú).
- [ ] Probado en escritorio a **1920, 1366 y 1280 px** y con la ventana no maximizada (~1100 y ~1000 px), incluido el cambio de dos columnas a una del formulario.
- [ ] La receta con la leyenda **impresa a PDF** en Carta desde Chrome.
- [ ] **Permisos** de la sección 4 comprobados también **por URL directa**.
- [ ] **La carga del catálogo v2 y de los sets** probada sobre una copia de la base, idempotente, en todas las bases, en una clínica que había editado líneas y en una clínica y un consultorio **nuevos**.
- [ ] El borrador de "Registrar material" y el del editor de sets sobreviven a cortar el internet un momento.
- [ ] Sin errores de `build`, typecheck, lint, pruebas ni de consola.
- [ ] Textos en español correcto, fechas `dd/mm/aaaa` y hora de 24 horas.
- [ ] Constantes nuevas con `VALIDAR: Emil` (leyendas de la receta, catálogo v2, sets iniciales).

**Flujo de punta a punta con usuarios demo** (haz el recorrido completo y reporta el resultado):

1. **Dra. Lucía Herrera (consulta externa, Clínica Santa Brígida)**: termina una consulta con dos medicamentos orales, Ceftriaxona "Aplicar en la clínica" y dos exámenes (uno externo y otro en la clínica), sin ingreso: la receta trae los tres medicamentos con la leyenda; salen las dos órdenes; el paciente no entra a observación. Repite con "Ingreso a observación": la receta también trae los tres. En la tarjeta, "Receta" abre la ventana con los tres marcados.
2. **Lic. Carmen Ríos (enfermería)**: aplica la Ceftriaxona con "Aplicar". En el menú, abre "Registros › Uso de medicamentos y material". Entra al catálogo: abre y cierra categorías, busca "seda 4", agrega "Nylon · 7/0, aguja cortante". Abre "Registrar material": elige al paciente de la consulta con el buscador (sin pulsar nada más), busca "guante 7.5" y suma 2; ve que "Algodón (rollo)" no se puede sumar a un paciente; guarda. Registra a una paciente de parto con "Usar set" › "Parto vaginal", cambia cantidades y agrega una sutura; guarda. Registra "Uso general del servicio" con alcohol y esparadrapo. Crea el set "Cesárea" con "Guardar como set". En la vista "Por paciente" ve primero el uso general y luego los pacientes por área, compactos; abre "Ver registros" y ve "Set: Parto vaginal"; cambia a "Total del periodo" y lo entiende. Imprime y exporta a Excel en el nuevo orden.
3. **Roberto Aguilar (administración)**: ve 208 líneas en 15 categorías; edita y archiva una línea; edita el set "Parto vaginal"; anula un registro.
4. **Sofía Mejía (recepción)**: ve el registro en las dos vistas; no puede registrar material, agregar al catálogo ni crear sets (también por URL directa).
5. **Dra. Ana López (Consultorio)**: ME15, el catálogo, el formulario, los sets y la vista funcionan.

---

## 8. Reporte final que espero

1. **Tabla por punto** (ME15, RU4, RU5, RU6, RU7, RU8, RU9): estado (**Hecho / Parcial / No hecho**), archivos cambiados y **cómo lo pruebo yo en 2 o 3 pasos**.
2. **Lo que te pedí averiguar**: dónde se excluían de la receta los "Aplicar en la clínica" y si quedaba otro lugar (ME15); si ME14 estaba hecho; si Administración podía agregar materiales antes de esta ronda (RU4); de dónde salen los turnos "Tarde (15:00–23:00)" (RU7); por qué no salían los pacientes de consulta externa en el formulario (RU7); y si sigue saliendo "+504" en el teléfono de los documentos (se ve en la captura 1; pendiente de IM1, rondas 13 y 14).
3. **Cambios en la base de datos**: campo "Registro" del catálogo, sets y sus líneas, sets usados en cada registro, y migraciones.
4. **Carga del catálogo v2 y de los sets**: cuántas líneas se agregaron, cuántas de la ronda 14 se actualizaron, cuántas se dejaron sin tocar por estar editadas o archivadas, y cualquier fila del `.md` que no se pudo leer.
5. **Valores por defecto usados** (sección 6) y cuáles cambiaste.
6. **Lo que debo validar yo**: leyendas de la receta, el catálogo v2 (sobre todo la columna "Registro") y las cantidades de los sets.
7. **Capturas** de la receta con la leyenda, el catálogo con categorías cerradas, el formulario en dos columnas, "Usar set" aplicado y las dos vistas del registro.
8. **Hallazgos fuera de la lista**: repórtalos, **no los implementes** sin preguntarme.
9. **Verificaciones que no pudiste hacer** y por qué.
