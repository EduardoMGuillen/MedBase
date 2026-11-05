# Clinara (MedBase): ronda 14 de correcciones

> Adjunto a este prompt dos archivos:
> - **correcioens_ronda_14.docx** (14 capturas), que muestra cómo se ve hoy cada pantalla. Ábrelo antes de empezar.
> - **Listado_material_medico_quirurgico.md** (73 líneas), el catálogo base de material médico quirúrgico que se carga en RU1.
>
> La **hoja de anestesia** de PQ3 se basa en un diseño mío ("Hoja de Registro de Anestesia"). Su contenido completo está en el **Anexo B**; si te adjunto también el PDF de ese diseño, es la misma referencia.

---

## 0. Contexto

Soy Emil, médico general en Honduras, y me encargo de la parte clínica de **Clinara** (también llamada MedBase), una aplicación web de gestión clínica desplegada en https://medbase-lac.vercel.app. La desarrollo con un amigo programador que no es del área médica. Esta es la **ronda 14**.

**Qué es Clinara.** Sistema para clínicas pequeñas y medianas y consultorios de Honduras. Pocos médicos, una recepcionista, enfermería y a veces laboratorio e imágenes. Las soluciones deben ser simples, con pocas pantallas y pocos clics, en español de Honduras.

**Qué se hizo antes (lo que toca esta ronda).**
- **Ronda 8**: órdenes imprimibles de exámenes "Externo" (**EX2**); fila de cada examen con "Rutina | Urgente" y "En la clínica | Externo".
- **Ronda 9**: "Aplicar en la clínica" en consulta externa: la orden va a la hoja de medicamentos (**ME3**); **nota postquirúrgica** con tipo de anestesia (**PQ1**) y equipo quirúrgico con "Anestesiólogo" (**PQ2**).
- **Ronda 10**: "No hay en la clínica (va a receta)" y receta desde la nota (**ME10**); "Imprimir orden" con casillas desde la pestaña Exámenes (**EX5**).
- **Ronda 11**: ventana "Generar receta" en Anexos (**ME12**); departamentos de Laboratorio e Imágenes con su bandeja y "No se realizó" con motivo (**DP2**).
- **Ronda 12**: órdenes al terminar la consulta, solo con los externos (**CX3**, A6); expediente a la vista en consulta externa (**CX4**); apartados Ambulatorios, Observación y Hospitalización del laboratorio (**DP8**).
- **Ronda 13**: plantilla única de impresión (**IM1**), "Incluir diagnóstico" en la receta (**IM2**), orden agrupada como el catálogo (**IM3**), barra fija "Contraer expediente" (**CX5**).

**Esta ronda** tiene seis partes:
1. **Exámenes en la consulta y en las notas**: lugar por defecto ("Externo" o "En la clínica") según dónde está el paciente (EX8); lista de exámenes compacta (EX9); también se genera la orden de los exámenes "En la clínica" (EX10); elegir qué exámenes imprimir desde la nota (EX11).
2. **Medicamentos**: "Aplicar en la clínica" ya no mete al paciente a observación (ME13); receta desde la nota y al firmar, con todos los medicamentos (ME14).
3. **Registro de uso de medicamentos y material** para enfermería, recepción y administración, con un catálogo de material médico quirúrgico y una lista de turno corta, que se imprime y se exporta a Excel (RU1, RU2, RU3).
4. **Consulta externa**: la barra "Contraer expediente" se queda fija mientras el expediente está abierto (CX6).
5. **General**: la primera letra que se escribe en un campo de texto sale en mayúscula (GE10).
6. **Cirugía**: la **hoja de anestesia** se sube o se llena después de la nota postquirúrgica, por quien hizo la anestesia (PQ3).

**Revisa el estado real del código y de la base de datos antes de tocar cada cosa** para no duplicar funciones.

**Reglas generales (valen para todo):**

- **Dos modos**: **Clínica** (ej. "Clínica Santa Brígida") y **Consultorio** de médico independiente (ej. "Consultorio Dra. Ana López"). Cada punto dice a cuál aplica.
- **Roles**: recepción, enfermería, médico, administración, laboratorio (Microbiólogo, Técnico de laboratorio) e imágenes (Médico radiólogo, Técnico en imágenes). Una persona puede tener varios roles.
- **Datos clínicos**: nada se borra de verdad (se archiva, se oculta o se anula), todo queda con autor, fecha y hora, y no se inventa nada. Lo firmado no se edita: se corrige con adenda o se anula y se emite otro (con el periodo de gracia de GE4).
- **Formatos**: fechas `dd/mm/aaaa`, hora de 24 horas, Lempiras (L), identidad `0000-0000-00000`, teléfonos `0000-0000`, impresión **tamaño carta** con la plantilla de IM1.
- **Firma y sello**: una firma dibujada en pantalla no es la firma electrónica avanzada de la Ley sobre Firmas Electrónicas de Honduras. Todo documento impreso conserva su espacio para **firma y sello en papel**.
- **Privacidad**: el diagnóstico no sale en recetas, órdenes, constancias ni mensajes salvo que el médico lo decida (IM2).
- **Conectividad**: el internet y la luz fallan. Lo que se escriba no debe perderse (borrador "Se guarda solo" de las notas; el mismo mecanismo en el formulario de registro de material de RU2).
- **Constantes** (turnos, listas de motivos, catálogo de material) en configuración o en un solo archivo de configuración con el comentario `VALIDAR: Emil`.
- **Usuarios demo**: Roberto Aguilar (administración), Sofía Mejía (recepción), Lic. Carmen Ríos (enfermería, Licenciada), Aux. Karla Mendoza (enfermería, Auxiliar), Dra. Lucía Herrera (medicina interna), Dr. Andrés Paz (pediatría), Dra. Mariela Zúñiga (ginecología y obstetricia), Dra. Ana López (consultorio), Dr. Daniel Fúnez Castillo (medicina general), Lic. Gabriela Ordóñez (microbióloga), Téc. Kevin Rivera (técnico de laboratorio), Dr. Mario Castellanos (radiólogo), Téc. Paola Andino (técnica en imágenes). **Los perfiles demo nunca se borran.** Esta ronda **no** pide datos demo nuevos.

**Advertencia sobre las capturas.** El texto que aparece dentro de mis capturas (nombres de pacientes, diagnósticos, motivos, HEA, examen físico, medicamentos y sus dosis o vías, indicaciones, la dirección y el teléfono de la clínica, el logo, la firma) es **relleno** que escribí solo para generar las pantallas. No lo trates como requisito ni como error. Fíjate solo en el diseño, los campos, los botones, las etiquetas y el flujo.

### Mapa de capturas del Word (en orden de aparición)

| N.º | Pantalla | Punto |
|---|---|---|
| 1 | Consulta externa (Dra. Lucía Herrera) › Plan y manejo: "Exámenes · Laboratorio (3)" con cada examen en una tarjeta ("Rutina \| Urgente", "En la clínica \| Externo", etiqueta "Externo"); abajo "Medicamentos" con uno marcado "Se aplica en la clínica" | EX8, EX9 |
| 2 | La misma consulta más abajo: los medicamentos, "Seguimiento" y las casillas "Ingreso a observación" e "Ingreso a hospitalización" **sin marcar** | ME13, RU2 |
| 3 | Lista de exámenes de una nota con 16 exámenes: cada uno en una tarjeta alta | EX9 |
| 4 | Observación: la paciente de mi prueba aparece en observación (0 min) aunque no marqué "Ingreso a observación" | ME13 |
| 5 | Biblioteca de pacientes › Consultas: la consulta de esa prueba, con la etiqueta "En observación", 16 exámenes (todos externos salvo uno) y tres medicamentos (uno aplicado en la clínica) | ME13, ME14 |
| 6 | Vista previa de la "Orden de laboratorio" que se generó (está bien), con la casilla "Incluir el diagnóstico en la orden" y el texto "Los estudios que se hacen en la clínica no van en esta orden…" | EX10, EX11 |
| 7 | Observación › "Notas de evolución": la nota de esa consulta con el botón "Órdenes de exámenes: Imprimir / Descargar PDF" y sin forma de generar la receta | EX11, ME14 |
| 8 | Observación › Exámenes: ventana "Imprimir orden de laboratorio" con una casilla por examen (los externos ya marcados) | EX11 (es el modelo) |
| 9 | Observación › Anexos › "Generar receta": solo aparece 1 de los 3 medicamentos | ME14 |
| 10 | Consulta externa (otra paciente): expediente abierto, barra "Expediente completo de…" fija con "Contraer expediente" y el botón flotante "Ir a la nota" | CX6 |
| 11 | Más abajo: final de la sección con el segundo "Contraer expediente"; la barra sigue fija | CX6 |
| 12 | Más abajo (antecedentes, signos vitales, motivo de consulta): **la barra ya no está** | CX6 |
| 13 | Plan y manejo: indicaciones escritas con la primera letra en minúscula | GE10 |
| 14 | Pantalla al terminar una consulta: "Solo la receta", "Imprimir receta y orden de exámenes", aviso con "Abrir solo las órdenes", casilla "Incluir diagnóstico" y la receta | EX10 |

Si alguna captura no corresponde a su punto, dímelo en el reporte y verifica tú el código.

---

## 1. Cómo quiero que trabajes

1. **Explora primero** el código de lo que toca esta ronda. No supongas el stack: léelo. En especial:
   - qué pasa hoy al firmar una consulta con un medicamento "Aplicar en la clínica" (por qué crea una estancia de observación);
   - cómo se decide hoy el valor de "En la clínica | Externo" al agregar un examen, y si existe algún dato que diga que la clínica tiene laboratorio o imágenes;
   - cómo arma su lista la ventana "Generar receta" (ME12) y por qué en la captura 9 solo salió 1 de 3 medicamentos;
   - la pantalla que aparece al terminar la consulta (captura 14), la ventana "Imprimir orden de laboratorio" (captura 8, EX5) y el botón "Órdenes de exámenes" de la tarjeta de la nota (captura 7);
   - el componente compartido de campos de texto (para GE10) y si existen turnos de enfermería en algún lado (para RU2).
   - cómo se guardan hoy la nota postquirúrgica, su tipo de anestesia y su equipo quirúrgico (PQ1, PQ2), y la subida de archivos de Anexos (para PQ3).
2. **Escribe `PLAN_RONDA14.md`** antes de programar: por cada punto (GE10, CX6, EX8, EX9, EX10, EX11, ME13, ME14, RU1, RU2, RU3, PQ3), los archivos, los cambios de base de datos, los componentes que vas a reutilizar o crear y las dependencias entre puntos. Pídeme confirmación **solo** si algo está bloqueado de verdad; para todo lo demás usa los valores por defecto de la sección 6.
3. **Un commit por punto**, con el código en el mensaje: `[ronda14][ME13] Aplicar en la clínica sin ingreso a observación`.
4. **Migraciones seguras**: no borres columnas ni registros. Ocultar o archivar. Todo cambio de datos se prueba primero sobre **una copia de la base**, es **idempotente** y sirve en las bases de **todas** las clínicas y consultorios, incluidas las **nuevas** (el catálogo de RU1 debe nacer en cada clínica nueva).
5. **Reutiliza componentes**: la ventana de selección de EX5 (captura 8), la plantilla de IM1 y la agrupación de IM3, la pantalla final de la consulta (captura 14), la ventana "Generar receta" de ME12, los registros de administración de la hoja de medicamentos, el motivo de "No se realizó" de DP2, la paginación de GE5, el borrador "Se guarda solo", la bitácora. **No copies y pegues** formularios ni ventanas.
6. **Permisos por rol y auditoría** (quién, qué, cuándo) en toda acción nueva, aplicados **en el servidor**, no solo ocultando botones. Verifica permisos también por URL directa.
7. **Verifica cada punto en el navegador** con el rol correcto, en escritorio (1920, 1366 y 1280 px), con la ventana no maximizada (~1100 y ~1000 px) y a ~390 px. Los documentos se verifican además **imprimiendo a PDF** desde Chrome en tamaño Carta. Corre typecheck, lint, pruebas y `build` al final de cada punto.
8. Usa los textos exactos (botones, etiquetas) que pongo entre comillas. Cuando hablo de una etiqueta que ya existe en la app, usa **la que hoy tiene el código**.

---

## 2. Lo que NO se debe romper

- **La distinción "Se aplica en la clínica"** en los medicamentos de la consulta (captura 1): "eso está bien". ME13 cambia lo que pasa después, no la casilla.
- **La orden de laboratorio que se genera** (captura 6): "está bien". Plantilla de IM1, agrupación de IM3, firma, folio y leyendas.
- **La ventana "Imprimir orden de laboratorio" de la pestaña Exámenes** (captura 8): casillas por examen, los externos ya marcados, "Cancelar", "Descargar PDF" e "Imprimir". "Quiero que así sea en los dos lados": EX11 la reutiliza tal cual.
- **La pantalla al terminar la consulta** (captura 14): receta y órdenes se generaron bien, "Solo la receta", "Imprimir receta y orden de exámenes", "Abrir solo las órdenes", "Enviar por WhatsApp", "Anular" y "Incluir diagnóstico". EX10 solo le agrega la orden de los exámenes "En la clínica".
- **CX5**: "ya quedó mejor". La barra con "Contraer expediente", el segundo botón al final de la sección, "Ir a la nota" y las consultas anteriores en solo lectura con "Nota" y "Receta". CX6 solo hace que la barra se quede.
- **"Ingreso a observación" e "Ingreso a hospitalización"**: cuando el médico los marca, todo funciona como hoy.
- **La hoja de medicamentos, las notas, las indicaciones y la receta**: el registro de material (RU2) **no aparece** en ninguno de ellos. "No quiero que afecte en los medicamentos ni en las indicaciones."
- **Reglas de órdenes y recetas** de rondas anteriores: una orden o receta por médico, con los datos del médico que indicó y nunca de quien imprime, indicación clínica y "Urgente" por estudio, sin la palabra "Externo", sin diagnóstico (salvo IM2 en la receta), registro de impresiones y bloqueo de GE4.
- **Bandeja del laboratorio y de imágenes (DP2, DP8)**: los exámenes "En la clínica" siguen llegando ahí, se imprima o no su orden.
- **Lo ya emitido o firmado** (notas, recetas, órdenes, registros de administración) no cambia de contenido.

---

## 3. Correcciones, una por una

Cada punto indica a qué modo aplica: **[C]** Clínica, **[K]** Consultorio, **[CK]** ambos.

Códigos de esta ronda (continúan la numeración anterior; **RU** es nuevo): **EX** exámenes, **ME** medicamentos, **RU** registro de uso de medicamentos y material, **CX** consulta externa, **GE** general, **PQ** notas quirúrgicas.

---

### Grupo EX: exámenes

#### EX8: "Externo" o "En la clínica" por defecto según dónde está el paciente [CK]

**Cómo está hoy (captura 1):** cada examen que agrego trae su control "En la clínica | Externo". No hay una regla clara de cuál viene elegido según el paciente.

**Por qué:** en consulta externa el paciente se va a su casa y casi siempre se hace los exámenes afuera; si escoge el laboratorio de la clínica, igual lleva su orden (EX10). En observación y hospitalización el paciente está adentro y los exámenes los hace la clínica.

**Qué quiero:** "por defecto los pacientes atendidos en consulta externa sus exámenes de lab sean externos […] y en observación y hospitalización que sean internos, eso para las clínicas que tengan laboratorio, lo mismo para imágenes".

1. **Clínica con laboratorio**: al agregar un examen de laboratorio (desde "Ordenar exámenes", "Set de órdenes" o un perfil), el control viene en:
   - **"Externo"** en la nota de **consulta externa**;
   - **"En la clínica"** en las notas de **observación y hospitalización** (evolución, procedimiento, nota postquirúrgica, y la nota de consulta que lleva "Ingreso a observación" o "Ingreso a hospitalización" marcada; ver A3).
2. **Clínica con departamento de imágenes**: la misma regla para los estudios de imagen y gabinete.
3. **Clínica sin laboratorio** (o sin imágenes) y **Consultorio**: "Externo" por defecto en todos lados. El control se queda y el médico puede elegir "En la clínica" (A1).
4. **Cómo se sabe si la clínica tiene laboratorio o imágenes**: usa el dato que ya exista (departamento configurado, personal con rol Laboratorio o Imágenes, "Áreas de servicio"). Si no hay ninguno confiable, agrega en **Configuración de la clínica** dos interruptores, "La clínica tiene laboratorio" y "La clínica tiene departamento de imágenes", que solo cambia Administración (A2). Dime en el reporte cuál usaste.
5. Es solo el valor **inicial**: el médico lo cambia por examen como hoy. Lo que ya está ordenado no cambia.
6. Si la nota de consulta pasa a observación (marca "Ingreso a observación") **después** de haber agregado exámenes, los que siguen con el valor por defecto **no** cambian solos; el médico los ajusta (A3).
7. **Error de interfaz detectado (captura 5):** en la tarjeta de la consulta, los exámenes externos dicen "Laboratorio · Externo · Ordenado" y el de la clínica solo "Laboratorio · Ordenado". Que el de la clínica diga "Laboratorio · En la clínica · Ordenado" en las tarjetas de consulta y de notas.

**Criterios de aceptación:**
- [ ] Como Dr. Daniel Fúnez, en Clínica Santa Brígida, en una consulta externa agrego un hemograma y un Rayos X: los dos vienen en "Externo".
- [ ] Como Dra. Lucía Herrera, en una nota de evolución de un hospitalizado, agrego un hemograma: viene en "En la clínica". Igual en observación.
- [ ] Un "Set de órdenes" y un perfil siguen la misma regla.
- [ ] Como Dra. Ana López (Consultorio) todo viene en "Externo".
- [ ] Con el laboratorio apagado (o sin personal de laboratorio, según el dato del punto 4), una nota de hospitalización trae "Externo".
- [ ] Puedo cambiar cualquier examen de "Externo" a "En la clínica" y al revés.
- [ ] La tarjeta muestra "En la clínica" en los exámenes de la clínica.

#### EX9: Lista de exámenes compacta en la nota [CK]

**Cómo está hoy (captura 3):** cada examen ocupa una tarjeta alta: nombre, la etiqueta "Externo" flotando a media fila, un campo "Indicación clínica (opcional)" a todo el ancho y los dos controles. Con 16 exámenes hay que bajar varias pantallas: "es muy difícil verlos todos".

**Qué quiero:** que se puedan ver todos de un vistazo.

1. **Una fila por examen**, de ~44 px de alto: nombre del examen (a la izquierda, baja de renglón si es largo), "Rutina | Urgente", "En la clínica | Externo" y "✕", todo en la misma línea.
2. **Indicación clínica**: deja de ser un campo siempre abierto. En cada fila, un botón pequeño "Indicación" que abre el campo **debajo de esa fila**. Si ya tiene texto, se muestra en gris pequeño debajo del nombre y al tocarlo se edita. El texto sigue saliendo en la orden como hoy.
3. **Agrupados**: "Laboratorio" e "Imagen y gabinete" como hoy y, dentro de Laboratorio, por los grupos del catálogo (los mismos de IM3: Hematología, Coagulación, Química en sangre…), con un título pequeño por grupo. En el orden del catálogo.
4. **Encabezado con conteo**: "Laboratorio (16) · 15 externos · 1 en la clínica".
5. **Se quita la etiqueta "Externo"** que flota en medio de cada tarjeta (error de interfaz, captura 1 y 3): repite lo que ya dice el control y cambia de lugar según el largo del nombre.
6. A ~390 px, cada fila en dos renglones: nombre y "✕" arriba; los dos controles abajo. Sin desborde.
7. Es el mismo componente en consulta externa, nota de evolución, procedimiento, nota postquirúrgica, observación, hospitalización y Consultorio.

**Criterios de aceptación:**
- [ ] Como Dr. Daniel Fúnez agrego 16 exámenes: a 1366 px veo los 16 en una pantalla.
- [ ] Escribo una indicación en un examen con "Indicación": sale debajo del nombre y en la orden impresa.
- [ ] Los exámenes salen agrupados como el catálogo y el encabezado dice cuántos son externos y cuántos en la clínica.
- [ ] No queda la etiqueta "Externo" flotante.
- [ ] A 390 px no hay desborde y los controles miden al menos 44 px.

#### EX10: También sale la orden de los exámenes "En la clínica" [CK]

**Esto cambia CX3 (ronda 12) y su valor A6, que decía que al terminar la consulta solo se imprimen los externos.**

**Cómo está hoy (capturas 6 y 14):** pedí dos exámenes, uno externo y otro en la clínica. Al terminar salió la orden del externo. La del examen "En la clínica" no se genera: la vista previa dice "Los estudios que se hacen en la clínica no van en esta orden".

**Por qué:** "en algún caso el paciente no quiera aquí o cambie de opinión después, se la pueda imprimir, o no; si el paciente afirma que se la va a hacer ahí, yo pueda no imprimirla y mandarlo allá, y de un solo le cae al técnico en laboratorio o microbiólogo que va paciente". Y si escoge el laboratorio de la clínica, "que lleve la orden igual".

**Qué quiero:**

1. **Al terminar una consulta externa** con exámenes de los dos tipos, se generan **dos órdenes por tipo de estudio**:
   - la de los exámenes **"Externo"** (como hoy);
   - la de los exámenes **"En la clínica"**, con la misma plantilla (IM1, IM3), el mismo título ("Orden de laboratorio" u "Orden de imagen y gabinete") y su propio folio. El documento **no** dice "externo" ni "en la clínica".
2. **En la pantalla final (captura 14)**:
   - "Imprimir receta y orden de exámenes" imprime la receta y las órdenes de los **externos** (como hoy).
   - La orden de los exámenes "En la clínica" aparece debajo como otra hoja, con el aviso "Esta orden ya le llegó al laboratorio de la clínica. Imprímala solo si el paciente la quiere llevar." y su propio botón **"Imprimir esta orden"** (y "Descargar PDF"). **No** se imprime con el botón principal (confirmado por mí).
   - El aviso verde de arriba cuenta las dos ("También se ordenaron exámenes: …"); "Abrir solo las órdenes" muestra todas.
   - Se quita el texto "Los estudios que se hacen en la clínica no van en esta orden…" de la vista previa (captura 6).
3. **Se imprima o no**, los exámenes "En la clínica" llegan a la bandeja del laboratorio o de imágenes (Ambulatorios, DP8) como hoy.
4. **Si el paciente cambia de opinión** y se lo hace afuera: el laboratorio usa "No se realizó" con un motivo nuevo en la lista, **"El paciente se lo hará en otro laboratorio"** (en imágenes: "…en otro centro"). Sigue la regla de DP2: se avisa al médico y él decide si lo cancela (A4).
5. **Después**: las dos órdenes quedan en la tarjeta de la consulta y en "Órdenes impresas", y se pueden reimprimir con la ventana de EX11.
6. **Observación y hospitalización**: no se genera una orden aparte de lo "En la clínica" (el paciente está adentro); si hace falta, se imprime con la ventana de EX11 (A5).
7. Funciona igual en Consultorio cuando el médico elige "En la clínica".

**Criterios de aceptación:**
- [ ] Como Dr. Daniel Fúnez termino una consulta con un perfil lipídico "Externo" y un hemograma "En la clínica": veo la receta, la orden del perfil y, debajo, la orden del hemograma con su aviso y su botón.
- [ ] "Imprimir receta y orden de exámenes" imprime la receta y la orden del perfil, no la del hemograma.
- [ ] "Imprimir esta orden" imprime la del hemograma, con su folio, en Carta.
- [ ] Sin imprimirla, el hemograma aparece en Ambulatorios del laboratorio (Téc. Kevin Rivera).
- [ ] El Téc. Kevin Rivera marca "No se realizó" con "El paciente se lo hará en otro laboratorio": el Dr. Fúnez recibe el aviso.
- [ ] Una consulta con solo exámenes externos se ve como hoy.

#### EX11: Elegir qué exámenes imprimir también desde la nota [CK]

**Cómo está hoy (capturas 7 y 8):** en la tarjeta de la nota, el botón "Órdenes de exámenes: Imprimir / Descargar PDF" imprime directo, **sin dejar elegir** qué exámenes van. En la pestaña Exámenes, "Imprimir orden de laboratorio" abre una ventana con casillas, y "ahí sí" puedo elegir.

**Qué quiero:** "quiero que así sea en los dos lados".

1. El botón **"Órdenes de exámenes"** de la tarjeta de la nota (consulta externa, notas de observación y hospitalización, "Ver nota completa", tarjeta de la consulta en la Biblioteca de pacientes y en el expediente) abre **la misma ventana** de la captura 8 (no una copia), con los exámenes **de esa nota**.
2. Si la nota tiene laboratorio e imagen, la ventana muestra dos secciones, "Laboratorio" e "Imagen y gabinete", y genera un documento por tipo (y uno por médico, EX5).
3. Vienen marcados los **externos**; los "En la clínica" sin marcar (como hoy en la captura 8). Se pueden marcar y desmarcar todos.
4. Los exámenes cancelados no salen; los que ya tienen resultado salen sin marcar.
5. "Cancelar", "Descargar PDF" e "Imprimir" como hoy. Cada impresión queda en "Órdenes impresas" y cuenta para GE4.
6. **Error de interfaz detectado (captura 6):** la vista previa de la orden de laboratorio tiene la casilla "Incluir el diagnóstico en la orden". La ronda 13 (IM2, punto 5) dijo que las órdenes **no** la tienen. **Quítala** (decidido por mí) de la orden de laboratorio y de la de imagen y gabinete, en todos los lugares donde se imprimen. Las órdenes salen siempre sin diagnóstico; las ya emitidas con diagnóstico lo conservan al reimprimirse (A8 de la ronda 13). Dime en el reporte de qué ronda venía.

**Criterios de aceptación:**
- [ ] Como Dra. Lucía Herrera, en la tarjeta de una nota con 16 exámenes, pulso "Órdenes de exámenes": sale la ventana con casillas, desmarco tres e imprimo solo los demás.
- [ ] Una nota con laboratorio e imagen muestra las dos secciones y genera dos documentos.
- [ ] Igual desde la tarjeta de la consulta en la Biblioteca de pacientes y en Consultorio.
- [ ] Lic. Carmen Ríos puede usarla igual que en la pestaña Exámenes; Sofía Mejía no (también por URL directa).
- [ ] Ninguna vista previa de orden tiene la casilla "Incluir el diagnóstico en la orden".

---

### Grupo ME: medicamentos

#### ME13: "Aplicar en la clínica" en consulta externa no mete al paciente a observación [CK]

**Corrige ME3 (ronda 9), que mandaba esos medicamentos a la hoja de medicamentos.**

**Cómo está hoy (capturas 2, 4 y 5):** en una consulta puse dos analgésicos orales y un medicamento "Se aplica en la clínica", **sin** marcar "Ingreso a observación". Al terminar, la paciente **quedó en observación**.

**Por qué:** "hay pacientes que yo les pongo una inyección en la clínica y los mando a la casa; no quiere decir que los vaya a observar".

**Qué quiero:**

1. **Solo las casillas "Ingreso a observación" e "Ingreso a hospitalización" ingresan al paciente.** Un medicamento "Aplicar en la clínica" nunca crea una estancia. **Averigua** por qué la crea hoy y dímelo en el reporte.
2. **Sin ingreso**, al terminar la consulta, el medicamento queda **"Por aplicar"** para enfermería:
   - En **Consulta externa**, la tarjeta del paciente (columna Atendidos) muestra la etiqueta **"Medicamento por aplicar (1)"** y un botón **"Aplicar"**. Si enfermería tiene una bandeja o lista de pendientes, aparece ahí también. El médico que atendió también ve "Aplicar" en la tarjeta de la consulta terminada, por si él mismo pone la inyección.
   - "Aplicar" abre una ventana pequeña con cada medicamento (texto completo de la orden: nombre, presentación, dosis, vía) y dos opciones:
     - **"Aplicado"**: hora (por defecto, ahora; editable con el componente de hora de GE3) y quién lo aplicó (el usuario).
     - **"No aplicado"**: motivo obligatorio de una lista ("El paciente se retiró", "El paciente lo rechazó", "No hay en la clínica", "Otro" escribible; `VALIDAR: Emil`).
   - Al guardar, la etiqueta pasa a "Medicamento aplicado" (o "No aplicado"). Queda en el expediente: la tarjeta de la consulta muestra "Aplicado DD/MM/AAAA HH:mm por Lic. Ríos" debajo del medicamento.
   - Este registro alimenta el registro de uso (RU2).
3. **Sin ingreso, solo dosis STAT** (decidido por mí: "si el paciente no se queda, solo es dosis STAT"):
   - En el formulario de medicamento de la consulta externa, al marcar "Aplicar en la clínica", **Frecuencia** queda en **"Dosis única (STAT)"** y no ofrece frecuencias repetidas, infusión ni PRN; tampoco aparece "Primera dosis distinta" (ME3). Texto de ayuda pequeño: "Sin ingreso se aplica una sola dosis en la clínica. Si debe seguir en casa, agrégalo también a la receta."
   - Si el médico marca "Ingreso a observación" o "Ingreso a hospitalización", vuelven todas las frecuencias como hoy.
   - Si quita el ingreso y quedó un medicamento "Aplicar en la clínica" con frecuencia repetida, "Terminar consulta" no deja terminar y señala ese medicamento con "Sin ingreso solo se permite dosis STAT. Cámbiala o marca el ingreso." Nunca se cambia la frecuencia por su cuenta.
   - No se programan dosis siguientes ni se crea hoja (A6). **Esto reemplaza, sin ingreso, el caso 2 de ME3 (ronda 9).**
4. **Con "Ingreso a observación" o "Ingreso a hospitalización" marcado**: todo sigue como hoy (los medicamentos pasan a la hoja).
5. El medicamento aplicado en la clínica **no** va a la receta, como hoy; "No hay en la clínica (va a receta)" (ME10) sigue funcionando igual.
6. **Pacientes que ya quedaron en observación por este error**: no los cambies solos. Dime en el reporte cuántas estancias se crearon así; el médico les da egreso.
7. **Quién registra la aplicación**: enfermería **o** el médico (decidido por mí). En Consultorio, la médica titular (A7).

**Criterios de aceptación:**
- [ ] Como Dr. Daniel Fúnez termino una consulta con Diclofenaco IM "Aplicar en la clínica" y dos medicamentos orales, sin marcar ingreso: el paciente **no** aparece en Observación.
- [ ] Como Lic. Carmen Ríos veo "Medicamento por aplicar (1)" en su tarjeta de Atendidos, pulso "Aplicar", dejo la hora en ahora y guardo: la tarjeta dice "Medicamento aplicado".
- [ ] La tarjeta de la consulta en el expediente dice quién lo aplicó y a qué hora.
- [ ] "No aplicado" sin motivo no deja guardar.
- [ ] Como Dr. Daniel Fúnez, al marcar "Aplicar en la clínica" la frecuencia queda en "Dosis única (STAT)" y no puedo elegir "Cada 12 horas"; si marco "Ingreso a observación", sí puedo.
- [ ] Como Dr. Daniel Fúnez registro yo mismo "Aplicado" desde la tarjeta de la consulta: queda con mi nombre.
- [ ] Marcando "Ingreso a observación", el paciente entra a observación y el medicamento pasa a la hoja, como hoy.
- [ ] Funciona en Consultorio (Dra. Ana López) y a 390 px.

#### ME14: Receta de los medicamentos de la nota, al firmar y desde la tarjeta [CK]

**Amplía ME10 y ME12.**

**Cómo está hoy (capturas 7 y 9):**
- La paciente de mi prueba quedó en observación (por el error de ME13). Al firmar **no se generó la receta** de los dos analgésicos ni la orden "de un solo para dársela".
- En la tarjeta de la nota (captura 7) hay "Órdenes de exámenes", pero **no** hay forma de generar la receta de los medicamentos de esa nota.
- En Anexos, "Generar receta" (captura 9) **solo muestra 1 de los 3** medicamentos: el que pasó a la hoja.

**Qué quiero:**

1. **Al firmar una consulta con "Ingreso a observación" o "Ingreso a hospitalización"**, aparece la **misma pantalla final** que en una consulta normal (captura 14): la receta con los medicamentos que van a receta (los que no son "Aplicar en la clínica", más los marcados "No hay en la clínica") y las órdenes de exámenes (EX10). Después, el médico sigue a la estancia.
2. **Tarjeta de cada nota con medicamentos** (consulta, ingreso, evolución, procedimiento, postquirúrgica; en observación, hospitalización, expediente y "Ver nota completa"): un botón **"Receta"** junto a "Órdenes de exámenes" que abre la ventana "Generar receta" de ME12 con **los medicamentos de esa nota**. Vienen marcados los que van a receta y los "No hay en la clínica"; los demás, sin marcar.
3. **"Generar receta" en Anexos** lista **todos** los medicamentos de la estancia: los activos de la hoja **y** los que se indicaron en las notas de esta estancia para receta (como los dos analgésicos de la consulta de ingreso). Sin repetidos. Mismas reglas de ME12 ("Días", "Cantidad a comprar", solo para esta receta).
4. **Averigua** por qué la ventana solo listó 1 de 3 y dímelo en el reporte.
5. La receta sigue con IM1 e IM2 ("Incluir diagnóstico" apagada por defecto), una por médico, y queda en "Recetas emitidas".
6. Enfermería sigue como en ME12: reimprime y saca la de los "No hay en la clínica"; no elige otros medicamentos.

**Criterios de aceptación:**
- [ ] Como Dra. Lucía Herrera firmo una consulta con "Ingreso a observación", dos analgésicos orales y Ceftriaxona "Aplicar en la clínica": aparece la pantalla con la receta de los dos analgésicos y las órdenes.
- [ ] En Observación › Notas de evolución, la tarjeta de esa nota tiene "Receta"; al pulsarlo salen los tres medicamentos y los dos analgésicos vienen marcados.
- [ ] En Anexos › "Generar receta" salen los tres.
- [ ] Una nota de evolución con un medicamento nuevo muestra "Receta" en su tarjeta.
- [ ] Como Lic. Carmen Ríos no puedo marcar otros medicamentos (también por URL directa).
- [ ] Funciona en hospitalización y en Consultorio.

---

### Grupo RU: registro de uso de medicamentos y material

**Por qué (todo el grupo):** "a veces a los pacientes se les aplica medicamento en la clínica […] quiero que eso quede registrado". Además, el material médico quirúrgico común (gasas, guantes estériles, jeringas, venoclisis, hilos de sutura) se gasta y no queda constancia. "Esto es solo para llevar registro": es un apartado **administrativo de enfermería**, no clínico.

#### RU1: Catálogo de material médico quirúrgico en Configuración [CK]

**Qué quiero:** "para ese material médico quirúrgico añadí una lista en la configuración de administración; no quiero que sea muy larga de momento, depende más de las clínicas, pero sí quiero que pongas una básica completa", y que se distinga "si es nylon 2/0 o seda 4/0".

1. Pantalla **Configuración › "Material médico quirúrgico"** (Administración; en Consultorio, la médica titular).
2. Cada línea guarda: **Categoría**, **Material**, **Variante** (calibre, tipo de aguja, talla, tamaño), **Unidad** de conteo (unidad, par, sobre, rollo, frasco, hoja) y si está **"En la lista de turno"**. Material + Variante es lo que distingue un "Nylon 2/0, aguja cortante" de una "Seda 4/0, aguja cortante".
   - **Agujas, jeringas, catéteres y mariposas se distinguen solo por calibre (G)**, nunca por longitud: "eso es lo que confunde a la gente". Si al agregar o editar una aguja se escribe una longitud, no se pide ni se muestra en el registro.
3. **Carga inicial** con el archivo adjunto `Listado_material_medico_quirurgico.md` (73 líneas), con un script que lea el archivo (no a mano). La columna "En la lista de turno inicial" dice cuáles vienen marcadas de inicio (15). Deja el `.md` en el repositorio como fuente. Idempotente, en todas las bases y en toda clínica o consultorio **nuevo**. No cargues la sección "Cambios respecto al listado original".
4. **"Lista de turno"**: "ese listado no va a salir así de grande"; "que ellos seleccionen cuáles quieren en su lista de turno diaria, porque no son todas las cosas por lo general".
   - En cada línea del catálogo, una casilla **"En la lista de turno"**. Arriba, el filtro "Solo mi lista de turno (15)" y un contador.
   - La lista de turno es la lista **corta** que enfermería ve al registrar (RU2). El resto del catálogo sigue disponible con el buscador "Agregar otro material".
   - La clínica la arma a su gusto: **Administración y Enfermería** pueden marcar y desmarcar líneas (decidido por mí). Enfermería lo hace también desde el formulario de registro: al agregar un material con "Agregar otro material", una casilla "Agregar a la lista de turno". Agregar, editar y archivar materiales del catálogo sigue siendo solo de Administración.
   - Lo que se marque o desmarque no se pisa en cargas futuras y queda en la bitácora. Una clínica nueva nace con las 15 marcadas del `.md` (A23).
5. **Acciones**: "Agregar material", "Editar" y "Archivar" (y "Ver archivados" con "Restaurar"). Nada se borra. Lo que la clínica edite o archive **no** se pisa en cargas futuras.
6. Lista agrupada por categoría, con buscador y la paginación de GE5.
7. En la misma pantalla, **"Periodo de registro del material"**: la clínica elige **"Por turno"**, **"Por día"** o **"Por semana"** ("que me deje elegir si es por turno, día o como la clínica quiera"). Por defecto "Por turno", con turnos editables (nombre, hora de inicio y fin). Si ya existen turnos de enfermería en la app, **reutilízalos**. Valores por defecto en A10.
8. Cada cambio queda en la bitácora.

**Criterios de aceptación:**
- [ ] Como Roberto Aguilar veo las 73 líneas agrupadas en 10 categorías; busco "seda" y salen las 8 variantes.
- [ ] Agrego "Nylon 4/0, aguja cortante" (sobre) y lo marco "En la lista de turno": aparece en la lista corta al registrar material.
- [ ] Una clínica nueva trae 15 líneas en su lista de turno; desmarco "Algodón" y deja de salir en la lista corta, pero lo encuentro con "Agregar otro material".
- [ ] Ninguna aguja, jeringa, catéter ni mariposa muestra longitud; solo el calibre (ej. "Aguja hipodérmica 21 G").
- [ ] Archivo "Mascarilla N95": deja de aparecer al registrar; los registros viejos la siguen mostrando.
- [ ] Una clínica nueva nace con las 73 líneas; correr la carga dos veces no cambia nada.
- [ ] Cambio a "Por día": el registro de RU2 deja de pedir turno y agrupa por día; con "Por semana", por semana (lunes a domingo).
- [ ] Como Lic. Carmen Ríos marco "Mascarilla N95" en la lista de turno y desde el formulario agrego "Seda 3/0" a la lista; pero no puedo agregar, editar ni archivar materiales del catálogo (también por URL directa).

#### RU2: "Registro de uso de medicamentos y material" [CK]

**Qué quiero:** un apartado para enfermería, recepción y administración, "algo tipo registro de uso de material y medicamentos", con:
- "una lista de qué medicamento se aplicó ese día, con el registro de los medicamentos que pone enfermería en observación, hospitalización y los que se aplican en la clínica de la consulta externa";
- el material médico quirúrgico común, que "las enfermeras lo metan ya sea por turno, por día o como ellos quieran", y "que sea como modo suma"; y, dentro del periodo escogido, "se tiene que dividir por paciente";
- "no va a ser un listado a lo loco, tiene que ser un listado con los medicamentos que se administraron por paciente y que lleve el registro de la hora y quién puso el medicamento".

1. **Menú**: entrada **"Uso de medicamentos y material"** para Enfermería, Recepción y Administración (en Consultorio, la médica titular). Título de la página: **"Registro de uso de medicamentos y material"** (A9).
2. **Arriba**: periodo según RU1 (por defecto, el turno, día o semana actual; con opción de rango de fechas), turno (si la clínica registra "Por turno"), área ("Todas", "Consulta externa", "Observación", "Hospitalización") y buscador (paciente, medicamento o material). Dos pestañas: **"Medicamentos"** y **"Material"**.
3. **Pestaña "Medicamentos"** (solo lectura; se llena sola):
   - Sale de los registros que ya existen: las dosis marcadas **"Administrado"** en la hoja de medicamentos (observación y hospitalización) y las aplicaciones de consulta externa de ME13. Las "No aplicada", "Omitido" y similares **no** cuentan. Nebulizaciones: una línea por componente. Infusiones: una línea al iniciar.
   - **Agrupada por paciente**: nombre, expediente y ubicación ("Consulta externa", "Observación · Cama X", "Hospitalización · Cuarto 201"). Debajo, una fila por aplicación: **fecha y hora** (`dd/mm/aaaa HH:mm`), **medicamento** (texto completo de la orden: nombre, presentación, dosis, vía), **aplicado por** (nombre y cargo) y **médico que lo indicó**.
   - **"Resumen"** (modo suma): por medicamento y presentación, cuántas aplicaciones hubo en el periodo y, si todas las dosis tienen la misma unidad, el total (ej. "Ceftriaxona vial 1 g · 6 aplicaciones · 6 g") (A11).
   - Aquí no se corrige nada: las correcciones se hacen donde se registró (hoja de medicamentos o ME13), con sus reglas.
4. **Pestaña "Material"**:
   - Botón **"Registrar material"** (Enfermería; en Consultorio, la titular). Abre un formulario con fecha (hoy), periodo (el turno actual según la hora, o el día o la semana, según RU1) y **paciente** (buscador; sugiere primero a los pacientes atendidos o internados en ese periodo). Debajo, **la lista de turno** de la clínica (RU1), agrupada por categoría, una fila por material con su campo **cantidad** (vacío = no se usó; entero, mínimo 1, en su unidad) y botones − / + de al menos 44 px. Debajo, **"Agregar otro material"**: buscador del resto del catálogo (por material o variante, ej. "seda 4"). Solo se guardan las filas con cantidad. "Cancelar" y "Guardar". El formulario no pierde lo escrito si se cae el internet (borrador).
   - En lugar de un paciente se puede elegir **"Uso general del servicio"**, para lo que no se gasta en un paciente concreto (alcohol, gorros) (A13).
   - Cada registro guarda paciente (o uso general), quién, cuándo y el periodo.
   - **Dividido por paciente** (vista principal): dentro del periodo elegido, un bloque por paciente (nombre, expediente, ubicación) con su material y la cantidad de cada uno; al final, el bloque "Uso general del servicio".
   - **Modo suma**: registrar "Guante estéril 7.5 × 2" dos veces al mismo paciente en el mismo periodo suma 4. Arriba, un **"Total del periodo"** por material y variante (todos los pacientes más el uso general). Al abrir una fila se ven los registros que la forman (quién, cuándo, cantidad).
   - **Corregir**: el autor puede editar su registro durante el periodo de gracia de GE4. Después, solo **"Anular"** con motivo (el autor o Administración); el registro anulado se ve tachado y no suma. Nada se borra (A12).
5. **No toca lo clínico**: el material no aparece en notas, indicaciones, hoja de medicamentos, recetas ni expediente, y **no** es inventario (no descuenta existencias) ni se cobra en Caja (A13).
6. Paginación de GE5 en las dos pestañas. A ~390 px, tarjetas por paciente y por material.

**Criterios de aceptación:**
- [ ] Como Lic. Carmen Ríos, después de aplicar el medicamento de ME13 y administrar dos dosis en la hoja de un hospitalizado, abro "Uso de medicamentos y material": en "Medicamentos" veo a los dos pacientes, cada aplicación con hora, mi nombre y el médico que la indicó.
- [ ] Una dosis "No aplicada" no sale.
- [ ] "Resumen" muestra el número de aplicaciones por medicamento y el total cuando la unidad es la misma.
- [ ] En el turno de la mañana registro a un paciente: Gasa hospitalaria × 1, Guante estéril 7.5 × 2, Seda 4/0 aguja cortante × 1, Jeringa 5 mL × 3; luego, al mismo paciente, Guante estéril 7.5 × 2: su bloque dice Guante estéril 7.5 = 4.
- [ ] Registro Jeringa 5 mL × 2 a otro paciente y Alcohol al 70 % × 1 como "Uso general del servicio": cada uno sale en su bloque y el "Total del periodo" dice Jeringa 5 mL = 5.
- [ ] Sin paciente ni "Uso general del servicio" no deja guardar.
- [ ] Anulo un registro con motivo: deja de sumar y se ve tachado.
- [ ] Como Sofía Mejía y Roberto Aguilar veo las dos pestañas, pero no puedo registrar material (también por URL directa); Roberto sí puede anular.
- [ ] Como Dra. Lucía Herrera no veo el apartado (también por URL directa).
- [ ] La nota, la hoja de medicamentos y la receta del paciente no muestran nada del material.
- [ ] Funciona en Consultorio (Dra. Ana López) y a 390 px.

#### RU3: Imprimir y exportar a Excel el registro de uso [CK]

**Qué quiero:** "quiero que esos listados se puedan imprimir y exportar en Excel y así, que sea ordenado y se vea bien".

1. En las dos pestañas de RU2 ("Medicamentos" y "Material"), botones **"Imprimir"** y **"Exportar a Excel"**. Exportan **lo que está filtrado** en pantalla (periodo, turno, área, búsqueda), completo (no solo la página visible de GE5).
2. **Impreso** (plantilla de IM1, Carta; horizontal si la tabla no cabe en vertical):
   - Título "Registro de uso de medicamentos" o "Registro de uso de material", periodo (`dd/mm/aaaa` y turno, si aplica), área y la fecha y hora en que se imprimió y quién lo imprimió.
   - **Medicamentos**: por paciente (nombre, expediente, ubicación) y, debajo, sus aplicaciones en orden de hora (hora, medicamento, aplicado por, médico que indicó). Al final, el "Resumen".
   - **Material**: por paciente, sus materiales con cantidad y unidad; luego "Uso general del servicio"; al final, el "Total del periodo" por material y variante, agrupado por categoría.
   - Encabezados de tabla repetidos en cada hoja, "Página 1 de N", sin cortar un paciente a media fila. Espacio para firma de quien entrega el turno y de quien recibe (sin raya, como IM1).
3. **Excel** (`.xlsx`, no CSV):
   - Un libro con hojas separadas: en Medicamentos, "Aplicaciones" (una fila por aplicación: fecha, hora, paciente, expediente, ubicación, medicamento, aplicado por, médico) y "Resumen"; en Material, "Por paciente" (una fila por paciente y material: periodo, paciente o "Uso general del servicio", categoría, material, variante, unidad, cantidad, registrado por) y "Total del periodo".
   - Ordenado y legible: título y periodo arriba, encabezados en negrita con fondo, encabezado fijo al desplazarse, filtros de columna activados, anchos de columna ajustados, fechas como fecha de Excel en formato `dd/mm/aaaa` y cantidades como número (para que se puedan sumar).
   - Nombre del archivo: `Uso_material_AAAA-MM-DD_turno.xlsx` o `Uso_medicamentos_AAAA-MM-DD.xlsx`.
   - **Librería**: si el proyecto ya tiene una para Excel, reutilízala. Si no, usa **ExcelJS** (licencia MIT; permite negrita, fondos, anchos y filtros). Evita la edición comunitaria de SheetJS para esto: su licencia (Apache 2.0) sirve, pero su formato de celdas es limitado. Revisa la licencia en el `package.json` de la versión que instales y dímela en el reporte.
4. Cada impresión y exportación queda en la bitácora (quién, cuándo, qué periodo).
5. Pueden imprimir y exportar quienes ven el registro (Enfermería, Recepción, Administración; en Consultorio, la titular).

**Criterios de aceptación:**
- [ ] Como Lic. Carmen Ríos filtro el turno de la mañana en "Material" e imprimo: sale en Carta, por paciente, con el uso general y el total, encabezados repetidos y espacio para las firmas de entrega y recepción.
- [ ] Exporto a Excel: el archivo abre en Excel con dos hojas, encabezados en negrita y fijos, filtros, fechas como fecha y cantidades como número (la suma en Excel coincide con el "Total del periodo").
- [ ] Con un rango de 7 días y más de 25 filas, el Excel trae todas las filas, no solo la primera página.
- [ ] Igual en "Medicamentos".
- [ ] Como Sofía Mejía puedo imprimir y exportar; como Dra. Lucía Herrera no (también por URL directa).
- [ ] La bitácora registra la exportación.

---

### Grupo CX: consulta externa

#### CX6: La barra "Contraer expediente" se queda mientras el expediente esté abierto [CK]

**Cambia el punto 1 de CX5 (ronda 13), que la dejaba fija solo "hasta que termina la sección".**

**Cómo está hoy (capturas 10, 11 y 12):** "ya quedó mejor". Pero cuando sigo bajando y paso el final del expediente (antecedentes, signos vitales, motivo de consulta…), la barra "Expediente completo de… · Contraer expediente" **desaparece**. "Quiero que se quede ahí."

**Qué quiero:**

1. Mientras el expediente esté **abierto**, la barra queda fija debajo del encabezado del paciente en **toda** la página de la consulta, hasta que lo contraiga.
2. **Contraído**, la barra vuelve a su lugar normal y no se queda fija (como hoy).
3. **Al contraer desde abajo** (por ejemplo, mientras escribo la HEA), la página se queda mostrando lo mismo que estaba viendo: el expediente se cierra arriba sin que la nota salte de lugar (A16). Contraer desde dentro del expediente sigue como CX5 (la página queda en el encabezado de la sección).
4. La barra no tapa los campos de la nota ni el chip "Borrador · Se guarda solo"; alto máximo ~64 px. A ~390 px, la barra delgada de CX5 con el nombre y "Contraer".
5. "Ir a la nota" y el segundo "Contraer expediente" al final de la sección siguen como están.

**Criterios de aceptación:**
- [ ] Como Dr. Daniel Fúnez abro el expediente de una paciente con 4 consultas y bajo hasta "Plan y manejo": la barra sigue fija arriba.
- [ ] Pulso "Contraer expediente" desde ahí: el expediente se cierra y sigo viendo "Plan y manejo" en el mismo lugar, con lo escrito.
- [ ] Contraído, la barra no está fija.
- [ ] La barra no tapa ningún campo, en escritorio y a 390 px.
- [ ] Funciona en Consultorio.

---

### Grupo GE: general

#### GE10: La primera letra que se escribe sale en mayúscula [CK]

**Cómo está hoy (captura 13):** si empiezo a escribir en minúscula, el texto se queda en minúscula ("panos con agua helada.") y así sale en la receta impresa (captura 14).

**Qué quiero:** "que cuando uno empiece a escribir, la primera letra sea mayúscula siempre".

1. En los campos de **texto libre** (de una línea y de varias), al escribir la **primera letra** del campo en minúscula, se convierte en mayúscula al instante (también á → Á, ñ → Ñ). Lo mismo si se pega un texto que empieza en minúscula.
2. **En las listas** (cada indicación de "Indicaciones y plan", cada línea que se agrega con Enter), la primera letra de **cada elemento**.
3. **Dónde sí**: motivo de consulta, HEA, examen físico, evolución, observaciones, indicaciones, indicación clínica de los exámenes, antecedentes, notas de enfermería, informes, comentarios de resultados, motivo de referencia, constancias, motivos de "No se realizó" y de anulación, y cualquier otro campo de texto narrativo.
4. **Dónde no**: buscadores (CIE-11, vademécum, exámenes, pacientes, material), correo, usuario y contraseña, identidad, teléfono, números, unidades, dosis, códigos y direcciones web.
5. **Si la persona la vuelve a minúscula** a propósito (por ejemplo "pH" o "mL"), se respeta: la regla solo actúa al escribir o pegar la primera letra, no cada vez que se edita.
6. Hazlo **una vez** en el componente compartido de campos de texto, con una opción para apagarlo en los campos del punto 4. Agrega `autocapitalize="sentences"` para los teclados de celular.
7. Lo ya guardado no cambia.

**Criterios de aceptación:**
- [ ] Como Dr. Daniel Fúnez escribo "paños con agua" en una indicación: queda "Paños con agua"; la segunda indicación también empieza en mayúscula.
- [ ] Escribo "ácido fólico" en la HEA: queda "Ácido fólico".
- [ ] El buscador de CIE-11 y el de pacientes no cambian lo que escribo.
- [ ] Cambio la primera letra de "PH" a "pH": se queda "pH".
- [ ] En un celular, el teclado arranca en mayúscula.

---

### Grupo PQ: notas quirúrgicas

#### PQ3: Hoja de anestesia, ligada a la nota postquirúrgica [CK]

**Amplía PQ1 y PQ2 (ronda 9).**

**Cómo está hoy:** la nota postquirúrgica la escribe el cirujano, con el tipo de anestesia (PQ1) y el "Anestesiólogo" en el equipo quirúrgico (PQ2), que puede ser una persona del sistema o un nombre escrito a mano. No existe ningún lugar para el registro de quien hizo la anestesia.

**Por qué:** "a las notas postoperatorias, que haya un apartado para el anestesiólogo o médico que haga la anestesia, de subir o llenar una hoja de anestesia". La subida es **posterior**, "porque se ocupa la nota postquirúrgica primero". En la práctica, el anestesiólogo llena la hoja en papel durante la cirugía y muchas veces es un médico visitante sin usuario en la clínica.

**Qué quiero (flujo de trabajo):**

1. **Antes de la cirugía (opcional): hoja en blanco.** En la tarjeta de la "Autorización quirúrgica" (y en la pestaña Anexos), un botón **"Imprimir hoja de anestesia en blanco"**: la hoja del Anexo B en Carta, con la plantilla de IM1 y los datos que ya existen llenos (paciente, expediente, edad, sexo, alergias, peso y talla si los hay, diagnóstico y cirugía de la autorización). Así el anestesiólogo la llena a mano en sala.
2. **Al firmar la nota postquirúrgica** queda disponible su **hoja de anestesia**, ligada a esa nota. Es un **agregado** a la nota postquirúrgica: no es obligatoria y no bloquea nada ("no pasa nada si no se la pone, pero siempre se la van a poner"; A19, A20).
   - La tarjeta de la nota muestra **"Hoja de anestesia · Sin agregar"** con el botón **"Agregar hoja de anestesia"**. No cuenta en el recuadro de avisos del paciente.
   - Si el anestesiólogo de PQ2 es **una persona del sistema**, le aparece en sus pendientes (en "Inicio" o donde el médico vea hoy sus avisos): "Hoja de anestesia pendiente · [paciente] · [cirugía] · [fecha]", con un clic a la nota.
3. **"Agregar hoja de anestesia"** ofrece dos caminos:
   - **"Subir hoja en papel"**: una o varias fotos o un PDF (reutiliza la subida de Anexos), con "Anestesia realizada por" (precargado con el anestesiólogo de PQ2; editable) y "Observación (opcional)". Queda quién la subió y cuándo.
   - **"Llenar en el sistema"**: el formulario del Anexo B, con lo que ya existe precargado (paciente, alergias, diagnóstico, cirugía practicada, equipo quirúrgico y horas que la nota postquirúrgica ya tenga). Solo lo firma **quien hizo la anestesia**, con su nombre, especialidad y número de colegiado. Tiene el borrador "Se guarda solo". El monitoreo transanestésico se escribe como una tabla (hora, PAS, PAD, FC, SpO₂, EtCO₂, temperatura) con "Agregar registro"; al imprimir, la tabla se dibuja en la cuadrícula del Anexo B.
4. **Quién puede**:
   - **Subir hoja en papel**: el médico que hizo la anestesia, el cirujano o cualquier médico del paciente, y enfermería (la circulante suele traer la hoja). En Consultorio, la médica titular.
   - **Llenar en el sistema y firmar**: solo el médico que aparece como anestesiólogo en la nota y tiene usuario. Si el anestesiólogo no tiene usuario, el camino es subir la hoja en papel.
   - El Radiólogo, cuando escribe una nota postquirúrgica (DP11), sigue la misma regla.
5. **Después**: la tarjeta dice "Hoja de anestesia · Subida por [nombre], DD/MM/AAAA HH:mm" o "· Firmada por Dr. [nombre]", con "Ver" e "Imprimir". También aparece en Anexos (categoría "Hoja de anestesia") y en el expediente.
6. **Lo firmado no se edita**: la hoja llenada en el sistema se corrige con adenda; una hoja subida se puede **reemplazar** con motivo (la anterior queda anulada, visible y sin borrarse). Aplica el periodo de gracia de GE4.
7. **Impresión**: plantilla de IM1 (encabezado de la clínica, cuadrícula del paciente, firma sin raya con nombre, especialidad y colegiado). Firmas para instrumentista y circulante como espacios en blanco.

**Criterios de aceptación:**
- [ ] Como Dra. Mariela Zúñiga, en una paciente con autorización quirúrgica, imprimo la hoja de anestesia en blanco: sale en Carta con los datos de la paciente llenos.
- [ ] Firmo una nota postquirúrgica con anestesia "Raquídea" y un anestesiólogo escrito a mano: la tarjeta dice "Hoja de anestesia · Sin agregar", con su botón; el recuadro de avisos no cambia.
- [ ] Como Lic. Carmen Ríos subo dos fotos de la hoja en papel: la tarjeta dice quién la subió y cuándo; se ve en Anexos.
- [ ] En otra nota postquirúrgica pongo como anestesiólogo a Dra. Lucía Herrera (sedación): a ella le aparece el pendiente; llena la hoja en el sistema, sale de la página y vuelve (el borrador sigue), agrega tres registros de monitoreo y firma; al imprimir, la tabla se ve en la cuadrícula.
- [ ] Dr. Daniel Fúnez no puede firmar la hoja llenada en el sistema de una cirugía en la que no fue anestesiólogo (también por URL directa), pero sí puede subir la hoja en papel.
- [ ] Doy egreso a una paciente sin hoja de anestesia: no sale ningún aviso ni bloqueo.
- [ ] Sofía Mejía no ve el botón (también por URL directa).
- [ ] Funciona en observación, hospitalización, Consultorio (Dra. Ana López) y a 390 px.

---

## 4. Permisos de lo nuevo

✔ puede, ○ solo ve, — no tiene acceso. "Igual que hoy" = no cambia lo que ese rol tiene. En Consultorio, la médica titular tiene los permisos de Médico, Enfermería y Administración. Lab = Microbiólogo y Técnico de laboratorio; Img = Radiólogo y Técnico en imágenes.

| Función | Recepción | Enfermería | Médico | Administración | Lab | Img |
|---|---|---|---|---|---|---|
| Interruptores "La clínica tiene laboratorio / imágenes" (EX8, si se crean) | — | — | — | ✔ | — | — |
| Imprimir la orden "En la clínica" al terminar la consulta (EX10) | — | igual que hoy | ✔ | ○ (registro) | — | — |
| Motivo "El paciente se lo hará en otro laboratorio" (EX10) | — | — | — | — | ✔ | ✔ |
| Ventana de selección desde la nota (EX11) | — | ✔ | ✔ | ○ (registro) | — | — |
| Registrar "Aplicado" / "No aplicado" en consulta externa (ME13) | — | ✔ | ✔ | — | — | — |
| "Receta" en la tarjeta de la nota (ME14) | — | igual que ME12 | ✔ | — | — | — |
| Catálogo de material y periodo de registro (RU1) | — | ○ | — | ✔ | — | — |
| Marcar y desmarcar la lista de turno (RU1) | — | ✔ | — | ✔ | — | — |
| Ver "Registro de uso de medicamentos y material" (RU2) | ○ | ✔ | — | ○ | — | — |
| Registrar material (RU2) | — | ✔ | — | — | — | — |
| Imprimir y exportar a Excel el registro (RU3) | ✔ | ✔ | — | ✔ | — | — |
| Editar el registro propio en el periodo de gracia / anular (RU2) | — | ✔ (el propio) | — | ✔ (anular) | — | — |
| Barra fija (CX6) | — | — | ✔ | — | — | — |
| Mayúscula inicial (GE10) | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| Imprimir hoja de anestesia en blanco (PQ3) | — | ✔ | ✔ | — | — | ✔ (radiólogo) |
| Subir hoja de anestesia en papel (PQ3) | — | ✔ | ✔ | — | — | ✔ (radiólogo) |
| Llenar y firmar la hoja en el sistema (PQ3) | — | — | ✔ (solo el anestesiólogo de esa nota) | — | — | ✔ (si fue el anestesiólogo) |
| Ver la hoja de anestesia (PQ3) | — | ✔ | ✔ | — | — | ✔ (radiólogo) |

---

## 5. Orden de implementación sugerido

1. **Rápido y aislado**: GE10 → CX6.
2. **Exámenes**: EX9 (lista compacta) → EX8 (valor por defecto) → EX11 (ventana desde la nota) → EX10 (orden "En la clínica").
3. **Medicamentos**: ME13 (sin ingreso; aplicación en consulta externa) → ME14 (receta desde la nota y al firmar).
4. **Registro de uso**: RU1 (catálogo, lista de turno y carga del `.md`) → RU2 (registro; depende de ME13 y RU1) → RU3 (imprimir y exportar).
5. **Hoja de anestesia**: PQ3 (usa la plantilla de IM1 y la subida de Anexos).

No hay datos demo en esta ronda.

---

## 6. Ambigüedades y valores por defecto

Decisiones que tomé porque no las especifiqué. Úsalas y lístalas en el reporte para que las confirme.

| Cód. | Tema | Valor por defecto |
|---|---|---|
| A1 | EX8 clínica sin laboratorio o imágenes, y Consultorio | "Externo" por defecto en todos lados; "En la clínica" sigue disponible. |
| A2 | EX8 cómo se sabe si hay laboratorio | El dato que ya exista; si no hay uno confiable, dos interruptores en Configuración de la clínica (Administración). |
| A3 | EX8 consulta que pasa a observación | Los exámenes ya agregados no cambian solos al marcar "Ingreso a observación"; los que se agreguen después vienen en "En la clínica". |
| A4 | EX10 el paciente cambia de opinión | El laboratorio marca "No se realizó" con el motivo nuevo; el médico decide si lo cancela (regla de DP2). |
| A5 | EX10 alcance (la orden interna va aparte: **confirmado por Emil**) | Solo al terminar la consulta externa. En observación y hospitalización se imprime con la ventana de EX11. |
| A6 | ME13 frecuencia sin ingreso | **Confirmado por Emil:** sin ingreso, "Aplicar en la clínica" solo permite "Dosis única (STAT)". |
| A7 | ME13 quién registra la aplicación | **Confirmado por Emil:** enfermería o el médico; en Consultorio, la titular. |
| A8 | ME14 qué lista "Generar receta" en Anexos | Activos de la hoja + medicamentos para receta de las notas de la estancia, sin repetidos. |
| A9 | RU2 nombre | Menú "Uso de medicamentos y material"; página "Registro de uso de medicamentos y material". |
| A10 | RU1 periodo y turnos | "Por turno", "Por día" o "Por semana", lo elige la clínica (**confirmado por Emil**; "Por semana" lo agregué yo). "Por turno" por defecto, con Mañana 07:00–13:00, Tarde 13:00–19:00 y Noche 19:00–07:00. `VALIDAR: Emil`. Si ya existen turnos de enfermería, se usan esos. |
| A11 | RU2 suma de medicamentos | Número de aplicaciones por medicamento y presentación; total de dosis solo si todas tienen la misma unidad. |
| A12 | RU2 correcciones | El autor edita dentro del periodo de gracia de GE4; después, "Anular" con motivo (autor o Administración). |
| A13 | RU2 material por paciente | **Confirmado por Emil:** el periodo lo elige la clínica y dentro se divide por paciente. Con la opción "Uso general del servicio" para lo que no es de un paciente (**confirmada por Emil**). Sin inventario y sin cobro. |
| A14 | RU1 estructura | Material + Variante + Unidad; carga del `.md` adjunto; lo editado o archivado por la clínica no se pisa. |
| A15 | GE10 campos | Texto narrativo sí; buscadores, datos de contacto, números, unidades, dosis y códigos no. Respeta si la persona la vuelve a minúscula. |
| A16 | CX6 contraer desde abajo | La nota se queda en el mismo lugar de la pantalla. |
| A17 | EX9 indicación clínica | Detrás de un botón "Indicación" por fila; visible en gris si tiene texto. |
| A18 | EX11 casilla de diagnóstico en la orden | **Confirmado por Emil:** se quita; las órdenes salen sin diagnóstico. |
| A23 | RU1 lista de turno inicial | Las 15 líneas marcadas "Sí" en el `.md` (jeringas de 3, 5 y 10 mL; aguja 21 G; catéter IV 20 y 22 G; venoclisis; gasa; algodón; alcohol; esparadrapo hospitalario; nylon 3/0; guante descartable M; guantes estériles 7.0 y 7.5). La cambian Administración y Enfermería (**confirmado por Emil**). `VALIDAR: Emil`. |
| A24 | RU3 librería de Excel | La que ya tenga el proyecto; si no hay, ExcelJS (MIT). |
| A19 | PQ3 cuándo está disponible | En toda nota postquirúrgica, sea cual sea el tipo de anestesia. |
| A20 | PQ3 obligatoriedad | **Confirmado por Emil:** es un agregado; no es obligatoria y no genera avisos en el paciente ni en el egreso. Solo el anestesiólogo con usuario ve el recordatorio en sus pendientes. |
| A21 | PQ3 quién firma la hoja llenada en el sistema | Solo el médico que figura como anestesiólogo en la nota y tiene usuario; si no tiene usuario, se sube la hoja en papel. |
| A22 | PQ3 monitoreo en el sistema | Tabla de registros (hora y signos); al imprimir, se dibuja en la cuadrícula del Anexo B. |

---

## 7. Revisión final antes de entregar

**Marca cada casilla antes de decir que terminaste:**

- [ ] Todos los puntos cumplen **todos** sus criterios de aceptación (sección 3).
- [ ] Todo lo de la sección 2 sigue intacto ("Se aplica en la clínica", la orden de laboratorio, la ventana de EX5, la pantalla final de la consulta, CX5, el ingreso cuando sí se marca, la hoja de medicamentos y las notas sin material, las reglas de órdenes y recetas, la bandeja del laboratorio, lo ya emitido).
- [ ] Probado a **~390 px**: sin desborde horizontal y con botones de al menos 44 px (lista de exámenes, "Aplicar", "Registrar material", barra fija).
- [ ] Probado en escritorio a **1920, 1366 y 1280 px** y con la ventana no maximizada (~1100 y ~1000 px).
- [ ] Órdenes y recetas nuevas **impresas a PDF** en Carta desde Chrome.
- [ ] **Permisos** de la sección 4 comprobados también **por URL directa**.
- [ ] **Migraciones y la carga del catálogo** probadas sobre una copia de la base, idempotentes y en todas las bases, incluidas una clínica y un consultorio **nuevos**.
- [ ] El borrador de la nota sobrevive a contraer el expediente desde abajo, y el de "Registrar material" a cortar el internet un momento.
- [ ] Sin errores de `build`, typecheck, lint, pruebas ni de consola.
- [ ] Textos en español correcto, fechas `dd/mm/aaaa` y hora de 24 horas.
- [ ] Las constantes nuevas están en configuración con `VALIDAR: Emil` (turnos, motivos de "No aplicado", motivo nuevo de "No se realizó", catálogo de material).

**Flujo de punta a punta con usuarios demo** (haz el recorrido completo y reporta el resultado):

1. **Dr. Daniel Fúnez (consulta externa, Clínica Santa Brígida)**: abre la consulta de un paciente con consultas previas; abre el expediente, baja hasta "Plan y manejo" (la barra sigue fija) y lo contrae desde ahí sin que la nota salte. Escribe las indicaciones en minúscula (salen con mayúscula inicial). Agrega 12 exámenes de laboratorio (vienen en "Externo", en la lista compacta y agrupada) y cambia uno a "En la clínica"; agrega un Rayos X. Indica dos medicamentos orales y Diclofenaco IM "Aplicar en la clínica"; **no** marca ingreso. Termina: el paciente no entra a observación; la pantalla final muestra la receta, la orden de externos, la de imagen y, aparte, la orden "En la clínica" con su botón; imprime solo la principal. Desde la tarjeta de la consulta, "Órdenes de exámenes" abre la ventana con casillas.
2. **Téc. Kevin Rivera (laboratorio)**: ve el examen "En la clínica" en Ambulatorios; lo marca "No se realizó" con "El paciente se lo hará en otro laboratorio"; el Dr. Fúnez recibe el aviso.
3. **Lic. Carmen Ríos (enfermería)**: en Consulta externa ve "Medicamento por aplicar (1)", registra "Aplicado". En un hospitalizado administra dos dosis en la hoja. Abre "Uso de medicamentos y material": ve las tres aplicaciones agrupadas por paciente con hora y su nombre, y el "Resumen". Registra material del turno a un paciente (gasa, guantes estériles 7.5 × 2, Seda 4/0 cortante, jeringas de 5 mL × 3) y otra vez guantes 7.5 × 2 al mismo paciente: suman 4; registra alcohol como "Uso general del servicio"; la vista sale dividida por paciente, con el total del periodo. En el formulario solo ve su lista de turno corta y agrega Seda 4/0 con "Agregar otro material". Imprime y exporta a Excel el turno. Corrige un registro suyo dentro del periodo de gracia.
4. **Dra. Lucía Herrera (consulta con ingreso)**: en una consulta pide un hemograma (viene "Externo"), indica dos analgésicos orales y Ceftriaxona "Aplicar en la clínica" y marca "Ingreso a observación"; firma: sale la pantalla con receta y orden. En Observación, la tarjeta de la nota tiene "Receta" y "Órdenes de exámenes" con casillas; Anexos › "Generar receta" muestra los tres medicamentos; un examen nuevo en una nota de evolución viene "En la clínica". No ve "Uso de medicamentos y material".
5. **Roberto Aguilar (administración)**: en Configuración › "Material médico quirúrgico" ve las 73 líneas y la lista de turno de 15, marca y desmarca líneas, agrega "Nylon 4/0, aguja cortante", archiva una línea, revisa los turnos; en el registro ve los totales y anula un registro con motivo.
6. **Sofía Mejía (recepción)**: ve el registro; no puede registrar material ni editar el catálogo (también por URL directa).
7. **Dra. Ana López (Consultorio)**: los exámenes vienen en "Externo"; aplica ella misma un medicamento sin ingreso (ME13); usa "Uso de medicamentos y material" y el catálogo; GE10, CX6, EX9, EX11, ME14 y PQ3 funcionan.
8. **Dra. Mariela Zúñiga (cirugía)**: imprime la hoja de anestesia en blanco desde la autorización quirúrgica; firma una nota postquirúrgica (anestesia raquídea, anestesiólogo visitante escrito a mano); Lic. Carmen Ríos sube la hoja en papel. En otra cirugía, con Dra. Lucía Herrera como anestesióloga (sedación), Lucía ve el pendiente, llena la hoja en el sistema y la firma. Al dar egreso a una paciente sin hoja no sale ningún aviso.

---

## 8. Reporte final que espero

1. **Tabla por punto** (GE10, CX6, EX8, EX9, EX10, EX11, ME13, ME14, RU1, RU2, RU3, PQ3): estado (**Hecho / Parcial / No hecho**), archivos cambiados y **cómo lo pruebo yo en 2 o 3 pasos**.
2. **Lo que te pedí averiguar**: por qué "Aplicar en la clínica" creaba una estancia de observación y cuántas estancias se crearon así (ME13); por qué "Generar receta" listaba 1 de 3 (ME14); cómo se decide si la clínica tiene laboratorio o imágenes (EX8); de qué ronda venía la casilla "Incluir el diagnóstico en la orden" que quitaste (EX11); si ya existían turnos de enfermería (RU1); y si sigue saliendo "+504" en el teléfono de los documentos (pendiente de IM1, ronda 13; se ve en las capturas 6 y 14).
3. **Cambios en la base de datos**: aplicaciones de consulta externa, catálogo de material, registros de material y anulaciones, configuración de turnos e interruptores de laboratorio o imágenes, y migraciones.
4. **Carga del catálogo (RU1)**: cuántas líneas se cargaron y cualquier fila del `.md` que no se pudo leer.
5. **Valores por defecto usados** (sección 6) y cuáles cambiaste.
6. **Lo que debo validar yo**: el catálogo de material, los turnos, los motivos de "No aplicado" y el motivo nuevo de "No se realizó".
7. **Capturas** de la lista compacta de exámenes, la pantalla final con la orden "En la clínica", la ventana "Aplicar" y las dos pestañas del registro de uso.
8. **Hallazgos fuera de la lista** (otros lugares donde un medicamento o examen cree una estancia, otros botones que impriman sin dejar elegir, otros campos donde la mayúscula estorbe): repórtalos, **no los implementes** sin preguntarme.
9. **Verificaciones que no pudiste hacer** y por qué.

---

## Anexo B: contenido de la hoja de anestesia (PQ3)

Es la referencia de mi diseño "Hoja de Registro de Anestesia" (una hoja Carta). Se usa para la hoja en blanco, el formulario "Llenar en el sistema" y su impresión. Al imprimir, el encabezado y la firma son los de IM1. Ningún campo es obligatorio salvo "Anestesia realizada por" y la técnica.

| Sección | Campos |
|---|---|
| **Encabezado** | Fecha, Sala, Expediente |
| **Paciente y equipo quirúrgico** | Nombre, Edad, Sexo, Peso (kg), Talla (cm), Programada / Urgencia; Diagnóstico preoperatorio, Cirugía propuesta; Cirujano, 1.er ayudante, 2.º ayudante, Anestesiólogo |
| **Valoración preanestésica** | ASA (I, II, III, IV, V, E); Mallampati (I–IV); Vía aérea difícil (Sí / No); Alergias; Ayuno sólidos / líquidos (h); Antecedentes y medicación; Hb, Hto, Plaquetas, TP/INR, Glucosa, Tipo y Rh |
| **Verificación y técnica** | Lista OMS: Entrada, Pausa, Salida; Consentimiento, Máquina verificada, Succión, Equipo de vía aérea difícil; Técnica: General balanceada, TIVA, Sedación, Subaracnoidea, Epidural, Bloqueo periférico, Combinada |
| **Tiempos** | Entrada a sala, Inicio de anestesia, Inicio de cirugía, Fin de cirugía, Fin de anestesia, Salida de sala |
| **Monitoreo transanestésico (cada 5 min)** | Cuadrícula de 0 a 240 con marcas para PAS, PAD, FC, SpO₂, inicio de anestesia e inicio de cirugía; franjas de SpO₂ %, EtCO₂, Temperatura °C, O₂ L/min, N₂O L/min, Sevoflurano/Isoflurano %, Diuresis y Sangrado |
| **Fármacos** | Tabla Categoría / Fármaco / Dosis / Vía / Hora, con las categorías Premedicación, Inductor, Opioide, Relajante neuromuscular, Antibiótico, Antiemético, Analgésico, Reversión y Otro; Mantenimiento (agente, CAM o TIVA con su ritmo) |
| **Vía aérea y ventilación** | Mascarilla, Mascarilla laríngea, Tubo endotraqueal oral / nasal, N.º; Cormack (I–IV), Intentos, EtCO₂ confirma; Espontánea / Controlada, VT, FR, PEEP |
| **Regional, monitoreo y accesos** | Nivel / aguja, Fármaco / volumen; ECG, PANI, SpO₂, EtCO₂, Temperatura, TOF, Sonda vesical; Vías IV (calibre y sitio), Posición |
| **Balance de líquidos (mL)** | Ingresos: Cristaloides, Coloides / hemoderivados. Egresos: Sangrado, Diuresis / otros. Balance |
| **Operación practicada e incidentes** | Operación practicada; Incidentes / eventos; Extubado en sala, TOF ≥ 0.9; Destino: Recuperación, UCI, Sala |
| **Condición al egreso de sala** | PA, FC, FR, SpO₂; Aldrete: Actividad, Respiración, Circulación, Conciencia, Saturación y total |
| **Firmas** | Anestesiólogo (firma y sello, con nombre, especialidad y colegiado); Instrumentista; Circulante |

En el formulario del sistema, los marcadores (ASA, Mallampati, técnica…) son botones de opción o casillas; el monitoreo es la tabla de A22; el balance se calcula solo (ingresos − egresos); el Aldrete suma solo. Las listas de opciones van en configuración con `VALIDAR: Emil`.
