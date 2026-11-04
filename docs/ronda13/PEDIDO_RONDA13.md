# Clinara (MedBase): ronda 13 de correcciones

> Adjunto a este prompt mi Word **correcioens_ronda_13.docx** (7 capturas), que muestra cómo se ve hoy cada pantalla. Ábrelo antes de empezar.

---

## 0. Contexto

Soy Emil, médico general en Honduras, y me encargo de la parte clínica de **Clinara** (también llamada MedBase), una aplicación web de gestión clínica desplegada en https://medbase-lac.vercel.app. La desarrollo con un amigo programador que no es del área médica. Esta es la **ronda 13**.

**Qué es Clinara.** Sistema para clínicas pequeñas y medianas y consultorios de Honduras. Pocos médicos, una recepcionista, enfermería y a veces laboratorio e imágenes. Las soluciones deben ser simples, con pocas pantallas y pocos clics, en español de Honduras.

**Qué se hizo antes (lo que toca esta ronda).**
- **Ronda 8**: órdenes imprimibles de exámenes externos con su plantilla (**EX2**).
- **Ronda 10**: receta desde la nota (**ME10**), "Imprimir orden" desde la pestaña Exámenes (**EX5**), leyenda "Válida solo con firma y sello del médico".
- **Ronda 11**: "Generar receta" (**ME12**), "Ver PDF" e "Imprimir" resultados (**EX6**).
- **Ronda 12**: antecedentes en cuatro apartados (**AP1**) y su despliegue en tarjetas (**AP2**), órdenes al terminar la consulta (**CX3**), expediente a la vista en consulta externa (**CX4**) y notas escritas dentro del expediente en observación y hospitalización (**NE7**).

**Esta ronda** tiene cuatro partes, todas de ajuste fino sobre lo de la ronda 12:
1. **Antecedentes**: quitar la fila repetida "Enfermedades crónicas", quitar de verdad "Transfusionales" y emparejar el tamaño de los campos (AP3, AP4).
2. **Formato único de impresión** para todos los documentos: encabezado de la clínica o consultorio (sin el médico), datos del paciente ordenados, firma sin raya, tamaño carta (IM1); receta con casilla para incluir el diagnóstico (IM2); orden de laboratorio agrupada como el catálogo (IM3).
3. **Consulta externa**: el expediente desplegado se puede contraer en cualquier momento (CX5).
4. **Observación y hospitalización**: en cada pestaña, el contenido arriba y la nota abajo; los dos avisos azules más juntos (NE8).

**Revisa el estado real del código y de la base de datos antes de tocar cada cosa** para no duplicar funciones.

**Reglas generales (valen para todo):**

- **Dos modos**: **Clínica** (ej. "Clínica Santa Brígida") y **Consultorio** de médico independiente (ej. "Consultorio Dra. Ana López"). Cada punto dice a cuál aplica.
- **Roles**: recepción, enfermería, médico, administración, laboratorio (Microbiólogo, Técnico de laboratorio) e imágenes (Médico radiólogo, Técnico en imágenes). Una persona puede tener varios roles.
- **Datos clínicos**: nada se borra de verdad (se archiva, se oculta o se anula), todo queda con autor, fecha y hora, y no se inventa nada. Lo firmado no se edita: se corrige con adenda o se anula y se emite otro (con el periodo de gracia de GE4).
- **Formatos**: fechas `dd/mm/aaaa`, hora de 24 horas, Lempiras (L), identidad `0000-0000-00000`, teléfonos `0000-0000`, impresión **tamaño carta**.
- **Firma y sello**: una firma dibujada en pantalla no es la firma electrónica avanzada de la Ley sobre Firmas Electrónicas de Honduras. Todo documento impreso conserva su **espacio para firma y sello en papel** (ahora sin raya, ver IM1).
- **Privacidad**: el diagnóstico no sale en constancias, recetas, órdenes, resultados impresos ni mensajes de WhatsApp **salvo que el médico lo decida**. Esta ronda le da al médico esa decisión en la receta (IM2).
- **Conectividad**: el internet y la luz fallan. Lo que se escriba no debe perderse: contraer el expediente o cambiar de pestaña **nunca** borra ni recarga la nota que se está escribiendo (borrador "Se guarda solo").
- **Constantes** (tamaño de papel, márgenes, textos de leyendas) en un solo archivo de configuración con el comentario `VALIDAR: Emil`.
- **Usuarios demo**: Roberto Aguilar (administración), Sofía Mejía (recepción), Lic. Carmen Ríos (enfermería, Licenciada), Aux. Karla Mendoza (enfermería, Auxiliar), Dra. Lucía Herrera (medicina interna), Dr. Andrés Paz (pediatría), Dra. Mariela Zúñiga (ginecología y obstetricia), Dra. Ana López (consultorio), Dr. Daniel Fúnez Castillo (medicina general), Lic. Gabriela Ordóñez (microbióloga), Téc. Kevin Rivera (técnico de laboratorio), Dr. Mario Castellanos (radiólogo), Téc. Paola Andino (técnica en imágenes). **Los perfiles demo nunca se borran.** Esta ronda **no** pide datos demo nuevos.

**Advertencia sobre las capturas.** El texto que aparece dentro de mis capturas (nombres de pacientes, diagnósticos, antecedentes, medicamentos, dosis, exámenes, dirección y teléfono de la clínica, el logo) es **relleno** que escribí solo para generar las pantallas. No lo trates como requisito ni como error. Fíjate solo en el diseño, los campos, los botones, las etiquetas y el flujo. Los círculos rojos de la captura 5 los dibujé yo para señalar.

### Mapa de capturas del Word (en orden de aparición)

| N.º | Pantalla | Punto |
|---|---|---|
| 1 | Consulta externa (Dra. Lucía Herrera): tarjeta "Antecedentes patológicos" con las filas "Enfermedades crónicas" y "Enfermedades" (mismo contenido) y el apartado "Hospitalarios, traumáticos y quirúrgicos" | AP3 |
| 2 | Ventana "Antecedentes": sigue el campo "Transfusionales"; "Hospitalarios" y "Traumáticos" a media anchura y "Quirúrgicos" a todo el ancho; "Toxicomanías" e "Inmunizaciones" desalineados | AP4 |
| 3 | Vista previa de una **receta** de consulta externa: encabezado con logo, clínica, médico, especialidad, colegiación, dirección y teléfono; folio y fecha a la derecha; datos del paciente; "Rx"; firma con una raya encima | IM1, IM2 |
| 4 | Vista previa de una **orden de laboratorio**: lista numerada de 14 exámenes sin agrupar y muy espaciada | IM1, IM3 |
| 5 | Consulta externa: sección "Expediente completo de …" **contraída**, con la flecha para desplegar (los círculos rojos son míos) | CX5 |
| 6 | La misma sección **desplegada** y desplazada hacia abajo: se ve una consulta anterior con "Agregar adenda", "Nota", "Receta" y "Generar constancia"; el encabezado de la sección ya no se ve | CX5 |
| 7 | Hospitalización › pestaña "Exámenes (4)" con una nota de evolución abierta: arriba "3 pendientes", luego dos avisos azules separados por un hueco grande, y la nota de evolución **encima** del contenido de la pestaña | NE8 |

Si alguna captura no corresponde a su punto, dímelo en el reporte y verifica tú el código.

---

## 1. Cómo quiero que trabajes

1. **Explora primero** el código de lo que toca esta ronda. No supongas el stack: léelo. En especial: cómo se generan hoy los documentos impresos (¿una plantilla compartida o una por documento?, ¿HTML con estilos de impresión, una librería de PDF, otra cosa?), dónde se arma la ventana "Antecedentes" y sus tarjetas, el componente "Expediente a la vista" de CX4/NE7 y cómo decide el orden entre el contenido de la pestaña y la nota.
2. **Escribe `PLAN_RONDA13.md`** antes de programar: por cada punto (AP3, AP4, IM1, IM2, IM3, CX5, NE8), los archivos, los cambios de base de datos, los componentes que vas a reutilizar o crear y las dependencias entre puntos. Incluye la **lista de todos los documentos imprimibles** que existen hoy en la app (IM1). Pídeme confirmación **solo** si algo está bloqueado de verdad; para todo lo demás usa los valores por defecto de la sección 6.
3. **Un commit por punto**, con el código en el mensaje: `[ronda13][IM1] Plantilla única de impresión`.
4. **Migraciones seguras**: no borres columnas ni registros. Ocultar o archivar. Todo cambio de datos se prueba primero sobre **una copia de la base**, es **idempotente** y sirve en las bases de **todas** las clínicas y consultorios, incluidas las **nuevas**.
5. **Reutiliza componentes**: la plantilla de documento clínico de EX2, la vista previa con "Imprimir" y "Descargar PDF", el registro de impresiones ("Órdenes impresas"), la ventana y las tarjetas de antecedentes de AP1/AP2, el componente "Expediente a la vista" de CX4/NE7, el borrador "Se guarda solo". **No copies y pegues** plantillas ni formularios: IM1 debe terminar con **una sola** plantilla de impresión.
6. **Permisos por rol y auditoría** (quién, qué, cuándo) en toda acción nueva, aplicados **en el servidor**, no solo ocultando botones. Verifica permisos también por URL directa.
7. **Verifica cada punto en el navegador** con el rol correcto, en escritorio (1920, 1366 y 1280 px), con la ventana no maximizada (~1100 y ~1000 px) y a ~390 px. Los documentos se verifican además **imprimiendo a PDF** desde el navegador (Chrome) en tamaño Carta con márgenes predeterminados. Corre typecheck, lint, pruebas y `build` al final de cada punto.
8. Usa los textos exactos (botones, etiquetas) que pongo entre comillas. Cuando hablo de una etiqueta que ya existe en la app, usa **la que hoy tiene el código**.

---

## 2. Lo que NO se debe romper

- **Antecedentes**: "en los antecedentes están mejor". Los cuatro apartados de AP1, sus tarjetas de AP2 con "Editar", la regla de campos vacíos, la línea "Última consulta, …", Toxicomanías, Inmunizaciones, Medicamentos actuales y Heredofamiliares se quedan. AP3 y AP4 solo quitan y emparejan.
- **Receta**: "se genera bien". El bloque "Rx" con cada medicamento numerado (nombre en negrita, presentación, y debajo dosis, vía, frecuencia, duración y cantidad) no cambia de contenido.
- **Folio, número, fecha y hora** arriba a la derecha de los documentos: "está bien" (solo cambia el formato de fecha, ver IM1).
- **Abajo, la firma con el nombre del médico y su número de colegiación**: "está bien". Solo se quita la raya de encima y se agrega la especialidad (IM1).
- **Ver el expediente mientras escribo la nota** (CX4 y NE7): "me gustó cómo está". CX5 y NE8 solo ajustan; no se vuelve a la ventana encima.
- **Los dos avisos azules** de la nota abierta en hospitalización ("Nota de evolución abierta…" e "Ir a la nota"; "Sigues escribiendo la nota de evolución…" y "Ver las notas"): "están bien". Solo se juntan (NE8).
- **Reglas de las órdenes y recetas** de rondas anteriores: una orden o receta **por médico** (EX5, ME10), siempre con los datos del médico que indicó y nunca de quien imprime, la indicación clínica y "Urgente" por estudio (EX2), sin la palabra "Externo", la leyenda "Válida solo con firma y sello del médico" y las demás leyendas que hoy existan, el registro de impresiones y el bloqueo de GE4.
- **Resultados impresos (EX6)**: "Procesado por", "Microbiólogo responsable", "Realizado por" e "Informe", cada uno con su espacio para firma y sello. IM1 solo les cambia el formato.
- **El borrador "Se guarda solo"** de la nota y la regla de una sola nota en borrador por paciente y usuario (NE7).
- **Las órdenes, notas, recetas y resultados ya emitidos** no cambian de contenido (ver A8 sobre la reimpresión).

---

## 3. Correcciones, una por una

Cada punto indica a qué modo aplica: **[C]** Clínica, **[K]** Consultorio, **[CK]** ambos.

Códigos de esta ronda (continúan la numeración anterior; **IM** es nuevo): **AP** antecedentes, **IM** impresión de documentos, **CX** consulta externa, **NE** notas en observación y hospitalización.

---

### Grupo AP: antecedentes

#### AP3: En la tarjeta de antecedentes, solo "Enfermedades" [CK]

**Esto reemplaza la parte de AP2 (ronda 12) y su valor A5 que pedía mostrar "Enfermedades crónicas" en la tarjeta.**

**Cómo está hoy (captura 1):** en la tarjeta "Antecedentes patológicos", bajo "Personales patológicos", salen dos filas: **"Enfermedades crónicas"** y **"Enfermedades"**, con el mismo contenido. "Las enfermedades ya son enfermedades crónicas."

**Qué quiero:** "solo deja enfermedades".

1. La fila **"Enfermedades crónicas"** desaparece de la tarjeta de antecedentes, en **todos** los lugares donde se muestra el componente de antecedentes (consulta externa, "Expediente completo", Biblioteca de pacientes, observación, hospitalización y Consultorio).
2. Queda solo **"Enfermedades"**, con el texto que escribió el médico.
3. **No se tocan los datos**: las etiquetas de enfermedades crónicas siguen existiendo y siguen alimentando "Crónicos y seguimientos" y las etiquetas del encabezado del paciente (en la captura 1, junto a "Alergias"). Solo dejan de repetirse en la tarjeta.
4. Si "Enfermedades" está vacío pero el paciente tiene etiquetas de crónico, la tarjeta **no** inventa texto: muestra lo de siempre ("Sin antecedentes registrados." si todo el apartado está vacío). Las etiquetas ya se ven en el encabezado (A1).

**Criterios de aceptación:**
- [ ] Como Dra. Lucía Herrera, en la consulta de un paciente con hipertensión como etiqueta de crónico y escrita en Enfermedades, la tarjeta muestra una sola fila "Enfermedades".
- [ ] El paciente sigue apareciendo en "Crónicos y seguimientos" y con su etiqueta en el encabezado.
- [ ] Lo mismo en "Expediente completo", Biblioteca de pacientes, hospitalización y Consultorio (Dra. Ana López).
- [ ] A 390 px se ve sin desborde.

#### AP4: Ventana "Antecedentes": sin "Transfusionales" y con los tres campos del mismo tamaño [CK]

**Cómo está hoy (captura 2):**
- En "Personales patológicos" **sigue el campo "Transfusionales"**. "Te dije que quitaras los antecedentes transfusionales" (AP1 de la ronda 12, A2 confirmado).
- En "Hospitalarios, traumáticos y quirúrgicos", **Hospitalarios** y **Traumáticos** van lado a lado a media anchura y **Quirúrgicos** abajo a todo el ancho: "los quirúrgicos están más grandes".

**Qué quiero:** quitar Transfusionales y "haz que los 3 se miren como el quirúrgico".

1. **Transfusionales**: se quita de la ventana. **Averigua por qué sigue** (¿no se aplicó AP1 en este componente? ¿hay dos ventanas de antecedentes?) y dímelo en el reporte. Aplica la regla de AP1: lo ya escrito **no se borra**; si un paciente tiene texto ahí, se ve en solo lectura al final del apartado patológico de la tarjeta como "Transfusionales (campo retirado)". Revisa que **Actividad física y alimentación** cumpla la misma regla.
2. **Hospitalarios, Traumáticos y Quirúrgicos**: los tres **a todo el ancho**, uno debajo del otro, con la misma altura inicial, en este orden: Hospitalarios, Traumáticos, Quirúrgicos (el orden de hoy).
3. Todos los cuadros **crecen solos** con el texto, sin barra interna (AP1, punto 5).
4. **Error de interfaz detectado (captura 2):** en "Personales no patológicos", el cuadro de **Inmunizaciones** empieza más abajo que el de **Toxicomanías** y tiene otra altura. Que los dos queden alineados arriba y con la misma altura inicial. Revisa lo mismo en "Enfermedades" y "Medicamentos actuales".
5. Es el mismo componente en todos los lugares (AP1, punto 6).

**Criterios de aceptación:**
- [ ] Como Dra. Lucía Herrera abro "Antecedentes": no existe "Transfusionales".
- [ ] Un paciente con texto viejo en Transfusionales lo ve en la tarjeta como "Transfusionales (campo retirado)", en solo lectura; uno sin texto no ve el rótulo.
- [ ] Hospitalarios, Traumáticos y Quirúrgicos miden lo mismo y van a todo el ancho.
- [ ] Toxicomanías e Inmunizaciones empiezan a la misma altura.
- [ ] Funciona en Consultorio y a 390 px (ahí todo va a una columna).

---

### Grupo IM: impresión de documentos

**Por qué (todo el grupo):** "quiero que estandaricemos los encabezados y los formatos de impresión". Hoy cada documento arma su encabezado y sus datos a su manera, y los datos del paciente "parece que donde caben los ponen".

#### IM1: Una sola plantilla de impresión para todos los documentos [CK]

**Aplica a todos los documentos imprimibles** (confirmado por mí): receta (consulta externa y "Generar receta" de ME12), orden de laboratorio, orden de imagen y gabinete, resultados (EX6), constancias, referencia, epicrisis o egreso, autorizaciones y consentimientos, y cualquier otro que encuentres. Haz el inventario en el plan y lístalos en el reporte.

**Cómo está hoy (capturas 3 y 4):** arriba, el logo, el nombre de la clínica, **el nombre del médico**, "Medicina interna, colegiación CMH-…", la dirección y el teléfono; a la derecha "Folio", el número y la fecha (en la receta "4 nov 2026, 15:05" y en la orden "04/11/2026 15:05"); una raya negra gruesa; los datos del paciente repartidos de forma distinta en cada documento (la receta dice "Nombre completo" y no trae sexo; la orden dice "Paciente" y trae sexo); y abajo la firma con **una raya encima**, el nombre y el colegiado.

**Qué quiero:**

1. **Tamaño Carta** (8.5 × 11 pulgadas) para todos. Es el tamaño de uso común en Centroamérica y ya era la regla del proyecto; A4 no. Márgenes de 2 cm. El tamaño y los márgenes van en configuración (`VALIDAR: Emil`) para poder cambiarlos después sin tocar cada documento. La vista previa en pantalla tiene la misma proporción que la hoja.

2. **Encabezado** (igual en todos):
   - Izquierda: **logo** (si la clínica o consultorio lo configuró) y **el nombre de la clínica**; en modo Consultorio, **el nombre del consultorio**. Debajo, **dirección** y **teléfono** de la clínica o consultorio.
   - **No** van el nombre del médico, su especialidad ni su colegiación ("que no diga el nombre del médico arriba ni la colegiación").
   - Derecha, como hoy: "Folio", el número y la **fecha y hora** en formato `dd/mm/aaaa HH:mm` (ej. `04/11/2026 15:05`) en todos los documentos.
   - Debajo del encabezado se queda la raya gruesa que separa el encabezado del resto.

3. **Datos del paciente** en una cuadrícula fija, igual en todos los documentos, con rótulo pequeño gris arriba y valor abajo, y columnas alineadas entre filas:

   | Fila | Columna 1 (ancha) | Columna 2 | Columna 3 |
   |---|---|---|---|
   | 1 | **Paciente** (nombre completo) | **Expediente** | **Identidad** |
   | 2 | **Edad** | **Sexo** | (vacía o el dato propio del documento, ver abajo) |

   - Rótulos idénticos en todos: "Paciente", "Expediente", "Identidad", "Edad", "Sexo" (la receta deja de decir "Nombre completo").
   - Edad en años ("41 años"); en meses si es menor de 2 años; con "aprox." si la fecha de nacimiento es aproximada (DP9). Identidad `0000-0000-00000`; si el paciente no tiene, "No tiene".
   - **Datos propios de cada documento** van en filas a todo el ancho **debajo** de la cuadrícula, en el mismo estilo: en la receta, **Alergias** (como hoy; "Ninguna conocida" si no hay) y, si el médico lo marca, **Diagnóstico** (IM2); en la orden de imagen, lo que hoy traiga; en la constancia y la referencia, lo que hoy traigan. Ninguno cambia de contenido; solo de lugar y estilo.
   - Una raya fina gris separa los datos del paciente del cuerpo del documento (como hoy).
   - Nada se acomoda "donde quepa": si un nombre es largo, baja de renglón dentro de su columna.

4. **Firma** (abajo a la derecha, como hoy):
   - **Sin la raya negra de encima** ("quita esa raya negra arriba de eso, no me gusta"), en todos los documentos, también en los responsables de los resultados (EX6).
   - Si hay firma dibujada, se muestra; debajo: **nombre** con su prefijo (Dr./Dra., Lic., Téc.), **especialidad** o cargo y **número de colegiación** (ej. "Dra. Lucía Herrera · Medicina interna · CMH-08812", en tres renglones centrados).
   - Si no hay firma dibujada, queda el **espacio en blanco** del mismo tamaño para firmar y sellar en papel (al menos 3.5 cm de alto, para que quepa un sello), sin raya.
   - En los documentos con dos responsables (EX6), los dos bloques uno al lado del otro con la misma regla.

5. **Pie**: las leyendas que hoy existan ("Válida solo con firma y sello del médico", "Receta válida por 30 días a partir de su emisión", "Emitida con Clinara") se quedan, con el mismo estilo en todos. Si el documento ocupa más de una hoja: "Página 1 de 2" en el pie y, desde la segunda hoja, un encabezado corto (nombre de la clínica o consultorio, folio y nombre del paciente). La firma nunca queda sola en una hoja: si no cabe, baja con al menos el último renglón del cuerpo.

6. **Una sola plantilla** (un componente de documento con encabezado, cuadrícula del paciente, cuerpo, firma y pie) que usan todos los documentos. Cada documento solo pone su título y su cuerpo.

7. **Error de interfaz para revisar (captura 3):** el teléfono sale "+504 2232-7710". Si el "+504" lo agrega el código, quítalo (formato `0000-0000`); si viene así escrito en la configuración, déjalo y dímelo.

**Criterios de aceptación:**
- [ ] Como Dra. Lucía Herrera imprimo a PDF una receta, una orden de laboratorio, una orden de imagen y gabinete, una constancia y un resultado: los cinco salen en **Carta**, con el mismo encabezado (logo, "Clínica Santa Brígida", dirección y teléfono) y **sin** mi nombre ni colegiado arriba.
- [ ] En los cinco, la cuadrícula del paciente tiene los mismos rótulos en el mismo lugar.
- [ ] La fecha dice `dd/mm/aaaa HH:mm` en todos.
- [ ] Abajo: firma sin raya, "Dra. Lucía Herrera", "Medicina interna" y "CMH-08812".
- [ ] Un médico sin firma dibujada deja el espacio en blanco, sin raya, con espacio para el sello.
- [ ] Como Dra. Ana López (Consultorio) el encabezado dice el nombre del consultorio.
- [ ] Una orden con 30 exámenes ocupa dos hojas con "Página 1 de 2" y el encabezado corto en la segunda.
- [ ] La lista del inventario de documentos está en el reporte y todos usan la plantilla.

#### IM2: Receta: casilla "Incluir diagnóstico" y arreglos [CK]

**Cómo está hoy (captura 3):** la receta de consulta externa imprime siempre "Diagnóstico". La regla del proyecto es que las recetas salen sin diagnóstico salvo que el médico lo decida.

**Qué quiero** (decidido por mí): que el médico decida en cada receta.

1. En la vista previa de **toda receta** (consulta externa, "Generar receta" de ME12 y la receta que se ofrece al firmar una nota en ME10), una casilla **"Incluir diagnóstico"**, **apagada por defecto**.
2. Marcada: la receta muestra la fila **"Diagnóstico"** debajo de Alergias (IM1, punto 3), con los diagnósticos de esa consulta o nota tal como están en ella, separados por "; ". Apagada: no sale la fila.
3. Lo que se elige **se guarda con la receta**: al reimprimirla sale igual. El registro de impresiones guarda si llevaba diagnóstico.
4. Solo el **médico** (en Consultorio, la médica) ve y usa la casilla. Enfermería, cuando reimprime una receta emitida o imprime la de "No hay en la clínica" (ME10), no la ve: la receta sale como la dejó el médico, o sin diagnóstico si el médico no la ha emitido.
5. **Solo en la receta.** Las órdenes de laboratorio e imagen, los resultados, las constancias y los mensajes siguen **sin** diagnóstico, como hoy.
6. **Error de interfaz detectado (captura 3):** "2 **cápsula** vía oral". La cantidad por toma no concuerda con la forma en plural. Corrige la pluralización de las formas (tableta/tabletas, cápsula/cápsulas, sobre/sobres, ampolla/ampollas, vial/viales, gota/gotas, supositorio/supositorios, puff/puffs; unidades como mg, g, mL no cambian) en la receta, la nota y la hoja de medicamentos, con una sola función.

**Criterios de aceptación:**
- [ ] Como Dr. Daniel Fúnez termino una consulta y abro la receta: "Incluir diagnóstico" viene apagada y la receta no trae diagnóstico.
- [ ] La marco: aparece "Diagnóstico" con los de la consulta; imprimo; al reimprimir desde la tarjeta de la consulta sale igual.
- [ ] En "Generar receta" de un hospitalizado (Dra. Lucía Herrera) también está la casilla.
- [ ] Como Lic. Carmen Ríos reimprimo una receta: no veo la casilla (tampoco por URL directa) y sale como la dejó el médico.
- [ ] Una dosis de 2 cápsulas dice "2 cápsulas"; una de 1 tableta dice "1 tableta".
- [ ] Las órdenes de laboratorio no tienen la casilla.

#### IM3: Orden de laboratorio agrupada como el catálogo [CK]

**Cómo está hoy (captura 4):** la orden "literal solo tira una lista de todo lo que se manda, sin orden": 14 exámenes numerados del 1 al 14, mezclados (glucosa, LDH, TP, GGT, TGO, bilirrubinas, hemograma…) y con mucho espacio entre renglones.

**Qué quiero:** "que en la orden los agrupe como se agrupan en el catálogo de laboratorio".

1. Los exámenes se agrupan **con la misma agrupación que muestra el catálogo de laboratorio** (la que ve el médico en "Ordenar exámenes" y en Configuración › Catálogo; por ejemplo Hematología, Coagulación, Química en sangre…). Revisa en el código si esa agrupación es la "Categoría" o el "Subgrupo" del examen y usa la que se ve en el catálogo.
2. Cada grupo con su **título** en negrita pequeña y, debajo, sus exámenes. Los grupos van **en el orden del catálogo**, y dentro de cada grupo los exámenes también en el orden del catálogo.
3. **La numeración reinicia en cada grupo** (1, 2, 3… bajo cada título) (decidido por mí).
4. Los exámenes **no catalogados** (escritos a mano) van al final en un grupo "Otros exámenes".
5. Se quedan, por examen, "Urgente" y la indicación clínica (EX2), en letra pequeña debajo del nombre.
6. **Más compacta**: renglones con espaciado normal de documento (no el hueco de hoy). Una orden de 14 exámenes en 4 o 5 grupos cabe en **una** hoja Carta con encabezado, datos del paciente y firma.
7. **Perfiles**: si el médico pidió un perfil (ej. "Perfil hepático") y la app lo guarda como perfil, sale el nombre del perfil en su grupo con sus exámenes debajo en letra pequeña; si se guarda como exámenes sueltos, salen sueltos en sus grupos. Dime en el reporte cuál es el caso (A6).
8. **Orden de imagen y gabinete**: la misma agrupación por la clasificación de su catálogo (Rayos X, Ultrasonido, Tomografía…), con la misma regla de numeración (A7).
9. Aplica en todos los lugares donde sale una orden: al terminar la consulta (CX3), al firmar la nota (EX2), "Imprimir orden" de la pestaña Exámenes (EX5), la tarjeta de la consulta y "Órdenes impresas".

**Criterios de aceptación:**
- [ ] Como Dr. Daniel Fúnez pido glucosa, hemograma, TP, TGO, TGP, bilirrubinas, GGT y microalbuminuria como "Externo" y termino: la orden sale agrupada (por ejemplo Hematología › 1. Hemograma; Coagulación › 1. Tiempo de protrombina; Química en sangre › 1. Glucosa…; Química en orina › 1. Microalbuminuria), con los grupos y exámenes en el orden del catálogo.
- [ ] La numeración empieza en 1 en cada grupo.
- [ ] Un examen escrito a mano sale en "Otros exámenes" al final.
- [ ] La orden de la captura (14 exámenes) cabe en una hoja Carta.
- [ ] Un examen "Urgente" lo indica, y la indicación clínica sale debajo.
- [ ] Igual desde la pestaña Exámenes (EX5) y en Consultorio.

---

### Grupo CX: consulta externa

#### CX5: El expediente desplegado se puede contraer en cualquier momento [CK]

**Amplía CX4 (ronda 12).**

**Cómo está hoy (capturas 5 y 6):** en la consulta, la sección "Expediente completo de …" se despliega con la flecha de la derecha. Al desplegarla y bajar para revisar consultas anteriores, "pierdo el encabezado y no tengo forma de colapsarlo rápido o completo cuando ya me voy para abajo". En la captura 6 la sección tiene además **su propia barra de desplazamiento** dentro de la página.

**Qué quiero:** poder contraer el expediente desde donde esté.

1. **Encabezado fijo**: mientras la sección está abierta, su encabezado ("Expediente completo de [nombre]", el resumen "N consultas anteriores…" y el botón) **queda fijo** justo debajo del encabezado del paciente al desplazarse, hasta que termina la sección. No tapa contenido ni los avisos.
2. **Botón visible con texto**: abierta, el botón dice **"Contraer expediente"** (con la flecha hacia arriba); contraída, **"Ver expediente"** (flecha hacia abajo). Toda la barra del encabezado también contrae o despliega al tocarla.
3. **Al contraer**, la página se queda en el encabezado de la sección (no salta al final ni al inicio), y la nota sigue debajo con lo escrito.
4. **Sin desplazamiento doble**: la sección crece dentro de la página y se recorre con el desplazamiento normal de la página; no lleva barra interna propia (A3). Para bajar rápido a la nota está el botón flotante "Ir a la nota" de CX4; **verifica que exista y funcione** (no se ve en la captura 6) y, si falta, agrégalo como lo pidió CX4.
5. Al final de la sección, otro botón "Contraer expediente".
6. **Solo lectura** (CX4, punto 5): en esta vista, las consultas anteriores **no** muestran "Agregar adenda" ni "Generar constancia" (captura 6) (decidido por mí). Se quedan "Nota" (ver la nota completa) y "Receta" (ver o reimprimir la receta emitida). La adenda y la constancia se siguen haciendo desde la Biblioteca de pacientes y desde la consulta terminada, como hoy.
7. Igual en Consultorio y a ~390 px (ahí el encabezado fijo es una barra delgada con el nombre y "Contraer").

**Criterios de aceptación:**
- [ ] Como Dr. Daniel Fúnez, en la consulta de un paciente con 7 consultas anteriores, despliego el expediente, bajo hasta la cuarta consulta y el encabezado con "Contraer expediente" sigue a la vista.
- [ ] Pulso "Contraer expediente": la sección se cierra, la página queda en su encabezado y lo que escribí en la nota sigue ahí.
- [ ] La sección no tiene barra de desplazamiento propia.
- [ ] "Ir a la nota" aparece cuando la nota queda fuera de la vista y baja hasta ella.
- [ ] En las consultas anteriores dentro de esta vista no aparecen "Agregar adenda" ni "Generar constancia"; sí "Nota" y "Receta".
- [ ] En la Biblioteca de pacientes "Agregar adenda" y "Generar constancia" siguen existiendo.
- [ ] Funciona en Consultorio (Dra. Ana López) y a 390 px.

---

### Grupo NE: notas en observación y hospitalización

#### NE8: En cada pestaña, el contenido arriba y la nota abajo; avisos juntos [CK]

**Corrige NE7 (ronda 12), que ya pedía "cambia el contenido de arriba; la nota de abajo sigue ahí".**

**Cómo está hoy (captura 7):** en hospitalización, con una nota de evolución abierta, en la pestaña "Exámenes" salen: el recuadro "3 pendientes", el aviso azul "Nota de evolución abierta: la encuentras al final de esta pestaña. Ir a la nota", un **hueco grande**, el segundo aviso azul "Sigues escribiendo la nota de evolución: está aquí abajo. Ver las notas" y luego **la nota de evolución, encima de los exámenes**. El primer aviso dice "al final de esta pestaña", pero la nota sale antes del contenido.

**Qué quiero:** "si yo me muevo a la pestaña de exámenes quiero los exámenes arriba, lo mismo en los signos vitales, que la nota esté debajo de esos", y los dos avisos azules "están bien, solo que salgan pegados, o más juntos".

1. **En todas las pestañas** (decidido por mí): Hoja de hospitalización, Signos vitales (con la curva térmica), Notas de evolución, Medicamentos, Notas de enfermería, Exámenes, Anexos y las que existan en observación: **primero el contenido completo de la pestaña y después la nota abierta**.
2. **Los dos avisos azules** se quedan con sus textos y enlaces, arriba del contenido (debajo del recuadro de avisos "N pendientes"), **uno pegado al otro** (separación de 8 px como máximo, o como un solo bloque de dos renglones). Sin el hueco de hoy.
3. "Ir a la nota" baja hasta la nota; el botón flotante "Ir a la nota" de NE7 sigue funcionando.
4. Cambiar de pestaña **no** cierra, recarga ni borra la nota (NE7); solo cambia lo de arriba.
5. Igual con "Procedimiento" y "Nota postquirúrgica" abiertas, en observación y hospitalización, en Consultorio y para el radiólogo (DP11).

**Criterios de aceptación:**
- [ ] Como Dra. Lucía Herrera, en un hospitalizado, abro "Nueva nota de evolución", escribo algo y voy a "Exámenes": veo los exámenes completos y la nota debajo.
- [ ] En "Signos vitales" veo signos y curva térmica arriba y la nota debajo; lo mismo en las demás pestañas.
- [ ] Los dos avisos azules salen juntos, sin hueco.
- [ ] "Ir a la nota" me lleva a la nota y lo escrito sigue ahí.
- [ ] Funciona en observación, en Consultorio y a 390 px.

---

## 4. Permisos de lo nuevo

✔ puede, ○ solo ve, — no tiene acceso. "Igual que hoy" = no cambia lo que ese rol tiene. En Consultorio, la médica titular tiene los permisos de Médico y de Administración.

| Función | Recepción | Enfermería | Médico | Administración | Laboratorio | Imágenes (radiólogo) | Imágenes (técnico) |
|---|---|---|---|---|---|---|---|
| Imprimir documentos con la plantilla nueva (IM1) | igual que hoy | igual que hoy | igual que hoy | igual que hoy | igual que hoy | igual que hoy | igual que hoy |
| Casilla "Incluir diagnóstico" en la receta (IM2) | — | — | ✔ | — | — | ✔ (si emite recetas como médico) | — |
| Reimprimir una receta con o sin diagnóstico (IM2) | — | ○ (como la dejó el médico) | ✔ | ○ (registro) | — | igual que hoy | — |
| "Contraer expediente" en la consulta (CX5) | — | — | ✔ | — | — | — | — |
| Contenido arriba y nota abajo (NE8) | — | ✔ (si escribe notas de enfermería) | ✔ | — | — | ✔ (DP11) | — |

---

## 5. Orden de implementación sugerido

1. **Rápido y aislado**: AP4 → AP3 → NE8.
2. **CX5** (encabezado fijo y botones de la vista de solo lectura).
3. **IM1** (plantilla única; es la base del grupo) → **IM2** (receta) → **IM3** (orden agrupada).

No hay datos demo en esta ronda.

---

## 6. Ambigüedades y valores por defecto

Decisiones que tomé porque no las especifiqué, o que ya confirmé. Úsalas y lístalas en el reporte.

| Cód. | Tema | Valor por defecto |
|---|---|---|
| A1 | AP3 paciente con etiqueta de crónico y "Enfermedades" vacío | La tarjeta no copia la etiqueta; se ve en el encabezado del paciente. |
| A2 | IM1 qué raya se quita | **Confirmado por Emil:** solo la de encima de la firma. La gruesa del encabezado se queda. |
| A3 | CX5 desplazamiento | Sin barra interna: la sección crece en la página, con encabezado fijo y "Ir a la nota". |
| A4 | IM1 especialidad | **Confirmado por Emil:** debajo del nombre en la firma. |
| A5 | IM1 alcance | **Confirmado por Emil:** todos los documentos imprimibles. |
| A6 | IM3 perfiles | Si se guardan como perfil: nombre del perfil con sus exámenes en pequeño; si no, sueltos. Se reporta cuál es el caso. |
| A7 | IM3 orden de imagen | Misma agrupación por la clasificación de su catálogo y misma numeración. |
| A8 | IM1 e IM2 documentos ya emitidos | Al reimprimirlos salen con la plantilla nueva (formato), con **el mismo contenido** con que se emitieron: mismo folio, fecha, médico, medicamentos o estudios. Una receta vieja que se imprimió con diagnóstico lo conserva al reimprimirse. |
| A9 | IM1 tamaño | Carta 8.5 × 11 pulgadas, márgenes de 2 cm, en configuración (`VALIDAR: Emil`). |
| A10 | IM1 espacio sin firma dibujada | En blanco, al menos 3.5 cm de alto, sin raya y sin texto. |
| A11 | IM2 dónde está la casilla | **Confirmado por Emil:** solo en la receta, apagada por defecto, la decide el médico. |
| A12 | IM3 numeración | **Confirmado por Emil:** reinicia en cada grupo. |
| A13 | CX5 botones en la vista de solo lectura | **Confirmado por Emil:** sin "Agregar adenda" ni "Generar constancia"; se quedan "Nota" y "Receta". |
| A14 | NE8 alcance | **Confirmado por Emil:** todas las pestañas. |

---

## 7. Revisión final antes de entregar

**Marca cada casilla antes de decir que terminaste:**

- [ ] Todos los puntos cumplen **todos** sus criterios de aceptación (sección 3).
- [ ] Todo lo de la sección 2 sigue intacto (antecedentes de AP1/AP2, contenido de la receta, folio y fecha, firma con nombre y colegiado, expediente a la vista de CX4/NE7, los dos avisos azules, reglas de órdenes y recetas, responsables de EX6, borrador, documentos emitidos).
- [ ] Probado a **~390 px**: sin desborde horizontal y con botones de al menos 44 px (ventana de antecedentes, "Contraer expediente", pestañas con nota abierta, vista previa de documentos).
- [ ] Probado en escritorio a **1920, 1366 y 1280 px** y con la ventana no maximizada (~1100 y ~1000 px).
- [ ] **Cada documento del inventario impreso a PDF** en Carta desde Chrome y revisado (encabezado, cuadrícula, firma sin raya, pie, saltos de página).
- [ ] **Permisos** de la sección 4 comprobados también **por URL directa** (en especial la casilla "Incluir diagnóstico").
- [ ] Si hubo cambios en la base (IM2 guarda la casilla con la receta), **probados sobre una copia**, idempotentes y en todas las bases.
- [ ] La nota en borrador sobrevive a contraer y desplegar el expediente, a cambiar de pestaña, a recargar y a cortar el internet un momento (CX5, NE8).
- [ ] Sin errores de `build`, typecheck, lint, pruebas ni de consola.
- [ ] Textos en español correcto, fechas `dd/mm/aaaa` y hora de 24 horas.

**Flujo de punta a punta con usuarios demo** (haz el recorrido completo y reporta el resultado):

1. **Dr. Daniel Fúnez (consulta externa)**: abre la consulta de un paciente con varias consultas previas; despliega el expediente, baja hasta una consulta vieja y lo contrae con "Contraer expediente" sin perder lo escrito; no ve "Agregar adenda" ni "Generar constancia" ahí. Edita antecedentes: no hay Transfusionales y los tres campos hospitalarios, traumáticos y quirúrgicos miden lo mismo; la tarjeta muestra solo "Enfermedades". Receta dos medicamentos (uno de 2 cápsulas) y pide ocho exámenes de laboratorio "Externo" de cuatro grupos y un Rayos X "Externo". Termina: la receta sale sin diagnóstico; marca "Incluir diagnóstico" e imprime; la orden de laboratorio sale agrupada con numeración por grupo en una hoja; todo en Carta, sin su nombre arriba y con firma sin raya, especialidad y colegiado.
2. **Dra. Lucía Herrera (hospitalizado)**: abre "Nueva nota de evolución", pasa por Exámenes, Signos vitales, Medicamentos y Anexos: el contenido arriba, la nota abajo y los dos avisos juntos. Genera una receta desde Anexos con la casilla de diagnóstico apagada. Imprime un resultado de laboratorio (EX6): mismo encabezado y cuadrícula.
3. **Lic. Carmen Ríos (enfermería)**: reimprime la receta del paso 1 desde "Recetas emitidas" o la tarjeta: sale con el diagnóstico tal como la dejó el médico; no ve la casilla.
4. **Dra. Ana López (Consultorio)**: el encabezado de sus documentos dice el nombre del consultorio; AP3, AP4, IM1, IM2, IM3, CX5 y NE8 funcionan.
5. **Lic. Gabriela Ordóñez (laboratorio)**: imprime un resultado con "Procesado por" y "Microbiólogo responsable": los dos bloques de firma sin raya y con su colegiación.

---

## 8. Reporte final que espero

1. **Tabla por punto** (AP3, AP4, IM1, IM2, IM3, CX5, NE8): estado (**Hecho / Parcial / No hecho**), archivos cambiados y **cómo lo pruebo yo en 2 o 3 pasos**.
2. **Lo que te pedí averiguar**: por qué seguía "Transfusionales" (AP4); si la agrupación del catálogo es la Categoría o el Subgrupo (IM3); si los perfiles se guardan como perfil o sueltos (IM3, A6); si existía "Ir a la nota" en consulta externa (CX5); de dónde sale el "+504" del teléfono (IM1).
3. **Inventario de documentos imprimibles** y confirmación de que todos usan la plantilla de IM1.
4. **Cambios en la base de datos** (por ejemplo, dónde se guarda "Incluir diagnóstico" con la receta) y migraciones.
5. **Valores por defecto usados** (sección 6) y cuáles cambiaste.
6. **Lo que debo validar yo**: tamaño y márgenes, textos de las leyendas del pie, el espacio para firma y sello, y la lista de formas farmacéuticas con su plural (IM2).
7. **Capturas o PDF** de la receta, la orden de laboratorio agrupada y un resultado, antes y después.
8. **Hallazgos fuera de la lista** (otros documentos con formato distinto, otras vistas de solo lectura con botones de edición, otras pestañas con la nota arriba): repórtalos, **no los implementes** sin preguntarme.
9. **Verificaciones que no pudiste hacer** y por qué.
