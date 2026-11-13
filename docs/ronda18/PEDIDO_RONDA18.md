# Clinara (MedBase): ronda 18 de correcciones

> Adjunto a este prompt mi Word **correcciones_clinarta_ronda_18.docx** (15 capturas), que muestra cómo se ve hoy cada pantalla. Ábrelo antes de empezar.

---

## 0. Contexto

Soy Emil, médico general en Honduras, y me encargo de la parte clínica de **Clinara** (también llamada MedBase), una aplicación web de gestión clínica desplegada en https://medbase-lac.vercel.app. La desarrollo con un amigo programador que no es del área médica. Esta es la **ronda 18**.

**Qué es Clinara.** Sistema para clínicas pequeñas y medianas y consultorios de Honduras. Pocos médicos, una recepcionista, enfermería y a veces laboratorio e imágenes. Soluciones simples, pocas pantallas, pocos clics, español de Honduras.

**Qué se hizo antes (lo que toca esta ronda).**
- **Ronda 6**: "Cobrar" fuera de Atendidos; el cobro sigue en Caja y en "Cobrar" del menú del médico y del Consultorio (**CE1**). En Consultorio, la médica revisa sus propias órdenes (**MI1**) y puede tener una enfermera (**MI2**).
- **Ronda 8**: pestaña Exámenes con filas desplegables, buscador, orden, filtros y "Expandir todo / Contraer todo" (**EX1**). Menú: "Configuración" abajo y tarjeta de usuario.
- **Ronda 9**: "Nota postquirúrgica" y fila de acciones de observación y hospitalización (**PQ1**, A6).
- **Ronda 10**: el buscador de medicamentos solo sugiere al escribir, desde 2 letras (**ME8**).
- **Ronda 11**: las muestras las pueden tomar laboratorio **y** enfermería (**DP2**, punto 6).
- **Ronda 12**: el radiólogo y el laboratorio solo ven sus propios avisos en el recuadro del paciente; el radiólogo escribe notas, también postquirúrgicas (**DP11**). Se quitaron los valores críticos: solo queda Alto / Bajo (**UM4**).
- **Ronda 14**: "Externo" o "En la clínica" según si la clínica tiene laboratorio (**EX8**).
- **Ronda 15**: encabezado "Registros" en el menú (**RU6**); buscadores que filtran mientras se escribe (**RU7**).
- **Rondas 16 y 17**: **no tengo sus prompts a mano**. En las capturas ya se ven cosas que vienen de ahí (por ejemplo "Valoración preanestésica", el recuadro "N crítica · N pendientes · N aviso", la pestaña "Archivos" de la Biblioteca y la vista Médico/Administración del Inicio del consultorio). **Revisa en el código y en el historial de commits qué pidieron esas rondas** antes de tocar cada punto, y dime en el plan si algo de esta ronda choca con ellas.

**Esta ronda** es sobre todo de **orden y consistencia de la interfaz**, más dos funciones nuevas:
1. **Reportes**: porcentaje contra el periodo anterior y reporte por mes calendario (RP1, RP2).
2. **Biblioteca de pacientes**: nota para el equipo debajo del nombre (NP1) y categorías de "Archivos" (AR1).
3. **Interfaz general**: todas las listas desplegables iguales y con búsqueda (LD1); cuadros alineados (UI1); menú lateral agrupado y todo plegable (MN1).
4. **Consultorio**: el cobro fuera de la vista Médico (CO1).
5. **Observación**: botones de una fila y sin los de cirugía (OB1).
6. **Pestaña Exámenes**: todo contraído al entrar y barra de herramientas pareja (PX1, PX2).
7. **Anestesia**: cargo "Técnico en anestesia" y quién aparece en "Valoración realizada por" (AN1).
8. **Pendientes por rol**: cada quien ve y cuenta solo lo suyo (PD1) y una columna "Pendientes" en las listas (PD2).

**Códigos.** Uso códigos nuevos para no chocar con las rondas anteriores (RP, NP, AR, LD, UI, MN, CO, OB, PX, AN, PD). Si alguno ya existe en las rondas 16 o 17, en el plan y en los commits escríbelo como `R18-XX1`.

**Reglas generales (valen para todo):**

- **Dos modos**: **Clínica** (ej. "Clínica Santa Brígida") y **Consultorio** de médico independiente (ej. "Consultorio Dra. Ana López"). Cada punto dice a cuál aplica.
- **Roles**: recepción, enfermería (Licenciada y Auxiliar), médico, administración, laboratorio (Microbiólogo, Técnico de laboratorio) e imágenes (Médico radiólogo, Técnico en imágenes). Una persona puede tener varios roles.
- **Datos clínicos**: nada se borra de verdad (se archiva, se oculta o se anula), todo queda con autor, fecha y hora, y no se inventa nada. Lo firmado no se edita: se corrige con adenda o se anula y se emite otro.
- **Formatos**: fechas `dd/mm/aaaa`, hora de 24 horas, Lempiras (L), identidad `0000-0000-00000`, teléfonos `0000-0000`, impresión tamaño carta con la plantilla de IM1.
- **Privacidad**: el diagnóstico no sale en constancias ni mensajes salvo que el médico lo decida. La nota para el equipo (NP1) es interna: la ve el personal, pero no sale en ningún documento impreso ni mensaje al paciente.
- **Conectividad**: el internet y la luz fallan. Lo que se escriba no se pierde (borrador "Se guarda solo").
- **Constantes** (categorías de archivos, tipos de pendiente y su rol responsable, grupos del menú) en configuración o en un solo archivo, con el comentario `VALIDAR: Emil`.
- **Usuarios demo**: Roberto Aguilar (administración), Sofía Mejía (recepción), Lic. Carmen Ríos (enfermería), Aux. Karla Mendoza (enfermería), Dra. Lucía Herrera (medicina interna), Dr. Andrés Paz (pediatría), Dra. Mariela Zúñiga (ginecología y obstetricia), Dra. Ana López (consultorio), Dr. Daniel Fúnez Castillo (medicina general), Lic. Gabriela Ordóñez (microbióloga), Téc. Kevin Rivera (técnico de laboratorio), Dr. Mario Castellanos (radiólogo), Téc. Paola Andino (técnica en imágenes). En las capturas aparecen además Dra. Isabel Pacheco (consultorio), Dr. Hugo Nolasco, Dra. Valeria Solórzano y Aux. Rosa Vallecillo, que deben venir de las rondas 16 o 17: úsalos también si existen. **Los perfiles demo nunca se borran.** Esta ronda **no** pide datos demo nuevos.

**Advertencia sobre las capturas.** El texto que aparece dentro de mis capturas (nombres de pacientes, diagnósticos, motivos, HEA, medicamentos, procedimientos, montos, cantidades de citas, nombres del personal en las listas) es **relleno** que escribí o que generó la demo, solo para que se vean las pantallas. No lo trates como requisito ni como error. Fíjate solo en el diseño, los campos, los botones, las etiquetas y el flujo. Las capturas 3, 4, 5 y 12 tienen a la derecha mi Word abierto: ignora esa mitad.

### Mapa de capturas del Word (en orden de aparición)

| N.º | Pantalla | Punto |
|---|---|---|
| 1 | Consultorio Dra. Isabel Pacheco (Administración) › "Reportes": selector "7 días · 30 días · 90 días", cuatro cuadros (Ingresos, Consultas atendidas, Asistencia, Reservas en línea), gráficas y formas de pago | RP1, RP2 |
| 2 | Biblioteca de pacientes › expediente (rol Médico): encabezado con nombre, edad, expediente, identidad y la etiqueta "Sin alergias conocidas"; pestañas Historia clínica, Consultas, Signos vitales, Exámenes, Recetas, Constancias, Archivos | NP1 |
| 3 | Biblioteca de pacientes › pestaña "Archivos": lista desplegable nativa con Laboratorio, Imagen, Documento y Otro junto a "Elegir archivo" | AR1, LD1 |
| 4 | Observación › nota postquirúrgica: "Ayudante 2" con la lista "Elige o escribe el nombre" (otra forma de lista, con fondo oscuro) | LD1 |
| 5 | La misma nota: "Tipo de anestesia" con una lista nativa de solo elegir ("Elige…" como opción) | LD1 |
| 6 | Observación › "Nota de procedimiento": "Procedimiento realizado" y "Fecha y hora del procedimiento" desalineados | UI1 |
| 7 | Menú lateral del médico de consultorio: Inicio, Agenda, Recetas y Cobrar sueltos; solo "Pacientes" se pliega; "Registros" no | MN1 |
| 8 | Inicio del consultorio, vista "Médico" (Dra. Isabel Pacheco): "Cobrar" en el menú, cuadro "L … Cobrado hoy" solo en una segunda fila, y el aviso rojo "Tu rol no tiene permiso para esta acción" | CO1 |
| 9 | Clínica › Observación › "Notas de evolución" (Dr. Hugo Nolasco): botones azules en dos filas (Nueva nota de evolución, Procedimiento, Autorización quirúrgica, Valoración preanestésica, Nota postquirúrgica, Egreso / Pasar a hospitalización, Referencia) | OB1, PD1 |
| 10 | Hospitalización › Exámenes: Laboratorio con "Hematología" y "Hemograma" abiertos | PX1 |
| 11 | La misma pestaña después de "Contraer todo": "Hemograma" se cerró, "Hematología" no; barra con "Buscar examen", "Orden", "Todos · Pendientes · Con resultado", "Expandir todo" y "Contraer todo" de alturas distintas | PX1, PX2 |
| 12 | Observación (Aux. Rosa Vallecillo, enfermería) › ventana "Subir la valoración preanestésica": la lista "Valoración realizada por" sale oscura, fuera de la ventana y con todo el personal | LD1, AN1 |
| 13 | Menú lateral de enfermería: "Pacientes 26 ›" plegado; "Registros" sin plegar | MN1, PD1 |
| 14 | Hospitalización › Exámenes, como Aux. Rosa Vallecillo: recuadro "1 pendiente · 1 aviso" con "Autorización quirúrgica pendiente de firma" y "1 resultado listo por revisar"; en el menú "Hospitalizados 5" | PD1 |
| 15 | "Hospitalizados" (enfermería): tabla Cuarto, Estado, Paciente, Especialidad, Diagnóstico, Médico tratante, Día; solo una fila tiene la etiqueta "Autorización pendiente de firma", sin título de columna | PD2 |

Si alguna captura no corresponde a su punto, dímelo en el reporte y verifica tú el código.

---

## 1. Cómo quiero que trabajes

1. **Explora primero** el código de lo que toca esta ronda. No supongas el stack: léelo. En especial:
   - cómo calcula hoy "Reportes" sus cuadros y periodos, y si los cálculos se hacen en el servidor;
   - el encabezado del paciente (el mismo componente en Biblioteca, consulta externa, observación y hospitalización);
   - **todas** las listas desplegables de la app: haz un inventario (pantalla, campo, si hoy es nativa, "Elige o escribe" u otra, y si la lista es cerrada o abierta);
   - el componente del menú lateral, sus grupos y de dónde salen los números (insignias) de cada entrada;
   - la fila de acciones de observación y hospitalización;
   - la pestaña Exámenes (EX1) y su estado de abierto/cerrado;
   - **de dónde sale cada pendiente y cada aviso** (recuadro del paciente, insignias del menú, listas de Observación y Hospitalizados), qué tipos existen y a quién se le cuentan hoy.
2. **Escribe `PLAN_RONDA18.md`** antes de programar: por cada punto (RP1, RP2, NP1, AR1, LD1, UI1, MN1, CO1, OB1, PX1, PX2, AN1, PD1, PD2), los archivos, los cambios de base de datos, los componentes que vas a reutilizar o crear y las dependencias. Incluye el **inventario de listas desplegables** (LD1) y la **tabla de tipos de pendiente** (PD1). Pídeme confirmación **solo** si algo está bloqueado de verdad; para lo demás usa los valores por defecto de la sección 6.
3. **Un commit por punto**, con el código en el mensaje: `[ronda18][LD1] Un solo componente de lista desplegable`.
4. **Migraciones seguras**: no borres columnas ni registros. Ocultar o archivar. Todo cambio de datos se prueba primero sobre **una copia de la base**, es **idempotente** y sirve en las bases de **todas** las clínicas y consultorios, incluidas las **nuevas**.
5. **Reutiliza componentes**: el encabezado del paciente, los buscadores que filtran mientras se escriben (RU7), el componente de grupos desplegables de "Por llegar hoy" y del catálogo (AD1, RU4), la fila de acciones, la pestaña Exámenes de EX1, la bitácora. **No copies y pegues**: LD1 termina con **un solo** componente de lista desplegable y MN1 con **un solo** componente de grupo del menú.
6. **Permisos por rol y auditoría** (quién, qué, cuándo) en toda acción nueva, aplicados **en el servidor**, no solo ocultando botones. Verifica permisos también por URL directa.
7. **Verifica cada punto en el navegador** con el rol correcto, en escritorio (1920, 1366 y 1280 px), con la ventana no maximizada (~1100 y ~1000 px) y a ~390 px. Corre typecheck, lint, pruebas y `build` al final de cada punto.
8. Usa los textos exactos (botones, etiquetas) que pongo entre comillas. Cuando hablo de una etiqueta que ya existe en la app, usa **la que hoy tiene el código**.

---

## 2. Lo que NO se debe romper

- **Reportes**: los cuadros, las gráficas "Citas por día" e "Ingresos por día" con "Ver tabla", "Formas de pago", "Por servicio", "Diagnósticos más frecuentes", "Exportar CSV" y los periodos "7 días", "30 días" y "90 días". RP1 y RP2 **agregan**; no quitan nada.
- **Encabezado del paciente**: nombre, edad, sexo, expediente, identidad, alergias y etiquetas de crónico como están. NP1 agrega una línea debajo.
- **"Archivos"**: las cuatro categorías de hoy (Laboratorio, Imagen, Documento, Otro): "está bien que tenga esas 4 cosas". AR1 agrega categorías y mejora la lista.
- **Buscadores que ya filtran bien** (pacientes, CIE-11, vademécum, material): LD1 no cambia su comportamiento; el buscador de medicamentos sigue sin abrir nada al enfocarlo (ME8).
- **Los pendientes y avisos en sí**: PD1 cambia **a quién se le cuentan y cómo se muestran**, no qué se registra ni cuándo nace o se cierra un pendiente. El radiólogo y el laboratorio siguen viendo solo lo suyo (DP11).
- **Cómo se ve un resultado abierto** en la pestaña Exámenes (tabla de valores, rango, Alto/Bajo, línea de tiempo, "Ver PDF", "Imprimir", "Marcar revisado"). PX1 y PX2 solo cambian el estado inicial y la barra.
- **Hospitalización**: conserva todos sus botones (también "Autorización quirúrgica", "Valoración preanestésica" y "Nota postquirúrgica"). OB1 solo los quita de **Observación**.
- **El cobro**: Caja y "Cobrar" siguen funcionando igual. CO1 cambia **dónde** se ve en el Consultorio, no lo que hace.
- **Lo ya firmado, emitido o subido** no cambia de contenido (incluidas autorizaciones quirúrgicas y valoraciones preanestésicas que ya existan en estancias de observación).

---

## 3. Correcciones, una por una

Cada punto indica a qué modo aplica: **[C]** Clínica, **[K]** Consultorio, **[CK]** ambos.

---

### Grupo RP: reportes

#### RP1: Porcentaje contra el periodo anterior en los cuadros de arriba [CK]

**Cómo está hoy (captura 1):** los cuatro cuadros de arriba (Ingresos, Consultas atendidas, Asistencia, Reservas en línea) muestran solo el número del periodo, sin comparación.

**Qué quiero:** "todos los primeros cuadros tengan una comparativa con el mes anterior, no en números brutos, sino % mayor o menor comparado con el mes anterior, o la semana anterior dependiendo de cómo lo seleccionemos". En clínicas y en consultorio.

1. En cada cuadro de arriba, debajo del número grande, una línea con la variación contra **el periodo anterior de la misma duración**:
   - "7 días" contra los 7 días anteriores; "30 días" contra los 30 anteriores; "90 días" contra los 90 anteriores; "Mes" (RP2) contra el mes calendario anterior.
   - Formato: flecha y signo, porcentaje con un decimal y el periodo: **"▲ 12.5 % vs. mes anterior"**, **"▼ 3.0 % vs. 7 días anteriores"**. Sin cambio: **"= 0 % vs. …"**.
   - Color: verde si sube, rojo si baja, gris si igual. La flecha y el signo van siempre, para que se entienda sin color (impresión en blanco y negro, daltonismo).
2. **Cómo se calcula**: (actual − anterior) ÷ anterior × 100. Si el periodo anterior es 0 y el actual no: **"Sin datos del periodo anterior"** (no "∞ %" ni "100 %"). Si los dos son 0: "= 0 % vs. …".
3. **Asistencia** también se compara en **porcentaje** (cambio relativo), como los demás cuadros: de 88 % a 91 % es "▲ 3.4 % vs. …" (A1).
4. En pantalla va solo el porcentaje, no el número bruto del periodo anterior.
5. Las líneas secundarias de hoy ("Ticket promedio", "de 203 citas", "18 no asistieron", "0 pacientes nuevos") se quedan.
6. El cálculo se hace con las mismas reglas del cuadro (mismos estados de cita, mismos cobros anulados excluidos), en zona America/Tegucigalpa.
7. **Error de interfaz detectado (captura 1):** en el Consultorio el subtítulo dice "Actividad e ingresos **de la clínica**". En modo Consultorio debe decir "del consultorio".

**Criterios de aceptación:**
- [ ] Como Roberto Aguilar, en "30 días", cada cuadro de arriba muestra su flecha y su porcentaje contra los 30 días anteriores; cambio a "7 días" y el porcentaje se recalcula.
- [ ] Con "Mes" anoto los Ingresos de octubre y de septiembre (dos meses cerrados) y calculo a mano: el porcentaje de octubre coincide.
- [ ] Asistencia muestra el cambio relativo en porcentaje (de 88 % a 91 % dice "▲ 3.4 %").
- [ ] Un periodo anterior en 0 dice "Sin datos del periodo anterior".
- [ ] La línea muestra solo el porcentaje, sin el número bruto anterior.
- [ ] Funciona en Consultorio (Dra. Ana López o Dra. Isabel Pacheco) y dice "del consultorio"; a 390 px se lee sin cortar.

#### RP2: Reporte por mes calendario [CK]

**Cómo está hoy (captura 1):** solo hay "7 días", "30 días" y "90 días" (periodos móviles).

**Qué quiero:** "quiero reporte mensual en mes calendario [...] además de esos que ya están".

1. Una cuarta opción en el mismo selector: **"Mes"**. Al elegirla aparece al lado un selector de mes con flechas: **"‹ Noviembre 2026 ›"**. Por defecto, el mes actual. No deja ir a meses futuros.
2. El mes va del día 1 a las 23:59 del último día (America/Tegucigalpa). Todo el reporte (cuadros, gráficas, formas de pago, por servicio, diagnósticos) usa ese rango; las gráficas muestran los días del 1 al último.
3. **Mes en curso**: el reporte llega hasta hoy; la comparación de RP1 es contra **los mismos días del mes anterior** (1 al 12 de noviembre contra 1 al 12 de octubre), y la línea lo dice: "vs. 1–12 oct" (A2). Un mes cerrado se compara con el mes anterior completo.
4. "Exportar CSV" exporta el mes elegido; el nombre del archivo lleva el mes (`reporte_2026-11.csv`).
5. El periodo elegido queda en la dirección (URL), para que "Atrás" y recargar lo mantengan.

**Criterios de aceptación:**
- [ ] Elijo "Mes" › "Octubre 2026": las gráficas van del 1 al 31 de octubre y los cuadros comparan con septiembre.
- [ ] En el mes en curso, la comparación dice contra qué días del mes anterior es.
- [ ] No puedo pasar a un mes futuro.
- [ ] El CSV trae solo el mes elegido.
- [ ] Funciona en Consultorio y a 390 px.

---

### Grupo NP: nota del paciente

#### NP1: "Nota para el equipo" debajo del nombre del paciente [CK]

**Cómo está hoy (captura 2):** el encabezado del paciente muestra nombre, edad, sexo, expediente, identidad y la etiqueta de alergias. No hay dónde dejar un aviso práctico para quien lo atienda después.

**Qué quiero:** "debajo del nombre, como en el encabezado, se le pudiera agregar una nota tipo *paciente con discapacidad mental, debe ser atendido con su madre*, algo así, solo para que los médicos puedan agregar una nota ahí y que si otro médico abre el expediente pueda ver esa nota y agregar o cambiarla".

1. **Dónde se ve**: en el encabezado del paciente, debajo de la fila de etiquetas (alergias, crónicos), en **todos** los lugares donde aparece ese encabezado (Biblioteca de pacientes, consulta externa, observación, hospitalización, "Expediente completo"). Una línea con un icono de nota, fondo suave de aviso (no rojo, para no confundirla con alergias), el texto y, en gris pequeño, "Dr./Dra. [nombre] · dd/mm/aaaa".
2. **Sin nota**: médicos, enfermería y administración ven un enlace pequeño **"+ Agregar nota para el equipo"** en ese lugar. Los demás roles no ven nada.
3. **Agregar o cambiar**: al tocar la nota (o el enlace) se abre un campo de texto en el mismo lugar, máximo **200 caracteres** con contador, y "Guardar" / "Cancelar". Cualquier médico, enfermera o persona de administración de la clínica puede cambiarla.
4. **Nada se borra**: cada cambio guarda una versión nueva (texto, autor, fecha y hora). Un enlace **"Historial (n)"** muestra las versiones anteriores. "Quitar nota" deja la nota vacía (queda en el historial quién la quitó).
5. **Quién la ve y quién la cambia** (A3, confirmado por Emil): la **ve todo el personal** que abre al paciente (recepción, enfermería, médicos, administración, laboratorio e imágenes). La **agregan, cambian o quitan** médicos, enfermería y administración; los demás solo la leen (permiso aplicado en el servidor). En Consultorio, la titular y su enfermera.
6. Es **interna**: no sale en recetas, órdenes, constancias, resultados, epicrisis ni mensajes de WhatsApp.
7. Una sola nota vigente por paciente. Texto largo baja de renglón; no tapa nada.

**Criterios de aceptación:**
- [ ] Como Dra. Lucía Herrera agrego "Debe ser atendido con su madre" a un paciente: aparece debajo del nombre con mi nombre y la fecha.
- [ ] Como Dr. Daniel Fúnez abro el mismo paciente en consulta externa: veo la nota, la cambio y el historial muestra las dos versiones.
- [ ] Como Lic. Carmen Ríos la veo en hospitalización y la cambio; como Roberto Aguilar también puedo cambiarla.
- [ ] Como Sofía Mejía y como Téc. Kevin Rivera la veo, pero no puedo cambiarla (tampoco por URL directa).
- [ ] No sale en una receta ni en una constancia impresas.
- [ ] Funciona en Consultorio y a 390 px.

---

### Grupo AR: archivos del paciente

#### AR1: Categorías de "Archivos": más apartados y lista más clara [CK]

**Cómo está hoy (captura 3):** en Biblioteca de pacientes › "Archivos", junto a "Arrastra aquí resultados o imágenes" hay una lista nativa del navegador con cuatro categorías: Laboratorio, Imagen, Documento, Otro.

**Qué quiero:** "está bien que tenga esas 4 cosas, pero pienso que se debería de desplegar mejor el menú, de forma más estética, y además tener más apartados".

1. La lista usa el componente de LD1 (lista cerrada, con búsqueda), con un icono por categoría.
2. **Categorías** (A4; en configuración con `VALIDAR: Emil`), en este orden:
   - Laboratorio
   - Imagen
   - Electrocardiograma y otros estudios
   - Referencia o contrarreferencia
   - Informe o epicrisis de otro centro
   - Consentimiento o autorización firmada
   - Receta externa
   - Constancia o incapacidad
   - Fotografía clínica
   - Identificación o carné de seguro
   - Documento
   - Otro
3. Las cuatro de hoy no cambian de nombre ni de significado; los archivos ya subidos conservan la suya.
4. **Lista de archivos**: agrupada por categoría (solo las que tienen archivos), con título y conteo por grupo (A15).
5. **Revisa** si la pestaña "Anexos" de observación y hospitalización usa otra lista de categorías (por ejemplo "Hoja de anestesia"). Si es así, que las dos salgan de **la misma** configuración y dime en el reporte cómo quedaron.

**Criterios de aceptación:**
- [ ] Como Dra. Lucía Herrera abro "Archivos": la lista de categorías no es la nativa del navegador, tiene las 12 categorías y escribo "refer" para encontrar "Referencia o contrarreferencia".
- [ ] Subo un PDF como "Receta externa": sale en su grupo.
- [ ] Un archivo viejo de "Documento" sigue en "Documento".
- [ ] Funciona en Consultorio y a 390 px.

---

### Grupo LD: listas desplegables

#### LD1: Todas las listas desplegables iguales: se escribe y se elige [CK]

**Cómo está hoy (capturas 3, 4, 5 y 12):** en la app hay dos (o más) tipos de lista:
- **Nativa del navegador, de solo elegir** (capturas 3 y 5): "Tipo de anestesia" con "Elige…" como si fuera una opción, la categoría de "Archivos".
- **"Elige o escribe el nombre"** (capturas 4 y 12): se puede escribir, pero la lista sale con fondo oscuro, con otro estilo, y en la captura 12 se sale de la ventana "Subir la valoración preanestésica" y queda flotando encima de la página.

**Qué quiero:** "son distintas, eso no puede ser así [...] quiero que en ambas se pueda escribir y que, si hay 3 letras que sean de ese nombre, salga para elegirla; quiero que absolutamente todas y cada una de las listas desplegables sean así, que se pueda escribir y escoger de lo que se vaya escribiendo, y en las que solo se puede elegir, que te dé la opción de escribir pero que al final no sea solo escrito sino escogido".

1. **Un solo componente** de lista desplegable para toda la app, con el patrón *combobox* editable con lista de sugerencias (patrón de accesibilidad WAI-ARIA "Combobox", con `role="combobox"`, `aria-expanded`, `aria-autocomplete="list"` y navegación con flechas, Enter y Esc).
2. **Comportamiento común**:
   - Al tocar el campo o la flecha, se abre la lista completa (en listas cortas) y el cursor queda listo para escribir.
   - Al escribir, la lista se filtra **mientras se escribe**, sin importar tildes ni mayúsculas, por cualquier parte del texto ("anest" encuentra "Valoración preanestésica"; "raq" encuentra "Raquídea"). Primero las opciones que **empiezan** con lo escrito.
   - Lo escrito se resalta en cada opción. Sin resultados: "Ninguna opción coincide".
   - Flechas para moverse, Enter para elegir, Esc para cerrar sin cambiar.
3. **Dos tipos, el mismo componente**:
   - **Lista cerrada** (solo valores de la lista: tipo de anestesia, categoría de archivo, sexo, estado civil, forma de pago, etc.): se escribe para filtrar, pero **el valor final siempre es una opción elegida**. Si se sale del campo con un texto que no es una opción, el campo vuelve al valor anterior (o queda vacío) y muestra "Elige una opción de la lista". "Elige…" es el texto de ayuda gris, **nunca** una opción.
   - **Lista abierta** (se acepta un nombre escrito: equipo quirúrgico, "Valoración realizada por", médico que solicita): se escribe y se elige, y si no está, la última fila de la lista dice **"Usar «[lo escrito]»"**. Lo escrito a mano queda marcado como escrito (como hoy).
   - Las opciones que hoy tienen "Otra (especificar)" siguen pidiendo su campo de texto aparte.
4. **Cuántas letras**: en las listas de opciones fijas filtra desde la primera letra. Los buscadores de catálogos grandes (pacientes, CIE-11, vademécum, material) **siguen** como están (sugerencias desde 2 letras, ME8 y RU7), con el mismo aspecto visual (A5).
5. **Aspecto único**: fondo claro, mismo borde, sombra, tipografía y alto de fila (~40 px; 44 px en pantallas táctiles) que el resto de campos; flecha a la derecha; la opción elegida con check. Nada de listas oscuras.
6. **Dentro de ventanas**: la lista se abre **dentro** de la ventana o pegada al campo, sin salirse de la ventana ni taparla, y sube si no cabe abajo. Probado en las ventanas de las capturas 4 y 12.
7. **Inventario**: reemplaza **todas** las listas desplegables (nativas y "Elige o escribe") por este componente, incluidas Configuración, Personal, Caja, agenda y formularios de pacientes. Lista en el reporte cada pantalla y campo cambiado, y cuáles dejaste (con el motivo). Agrega una prueba automática que falle si alguien vuelve a usar un `<select>` nativo.
8. **Error de interfaz detectado (captura 12):** el título del recuadro detrás de la ventana dice "Órdenes por revisar**0**" (número pegado al texto). Sepáralo ("Órdenes por revisar · 0"). En la misma captura, el título de la ventana sale cortado ("Subir la valoración preanestésica e…"): que baje de renglón. En la captura 4 la lista abierta tapa el rótulo "Instrumentista" y el aviso de autorización: con el punto 6 no debe tapar rótulos de otros campos más de lo necesario y se cierra al salir del campo.
9. **"Valoración realizada por"** (captura 12) hoy ofrece a todo el personal, incluidas auxiliares de enfermería y técnicos. Se corrige en AN1. Dime además si las demás listas de personal filtran por rol (no las cambies).

**Criterios de aceptación:**
- [ ] En la nota postquirúrgica, "Tipo de anestesia" y "Ayudante 2" se ven iguales; en "Tipo de anestesia" escribo "raq" y elijo "Raquídea" con Enter.
- [ ] En "Tipo de anestesia" escribo "xyz" y salgo del campo: no queda "xyz"; sale "Elige una opción de la lista".
- [ ] En "Ayudante 2" escribo un nombre que no existe y elijo "Usar «…»": queda como nombre escrito.
- [ ] La lista de la ventana "Subir la valoración preanestésica" se abre dentro de la ventana y con fondo claro.
- [ ] No queda ningún `<select>` nativo en la app (la prueba automática lo confirma) y el inventario está en el reporte.
- [ ] El buscador de medicamentos sigue sin abrir nada al enfocarlo.
- [ ] Todo se puede usar solo con el teclado y a 390 px con el dedo.

---

### Grupo UI: alineación de formularios

#### UI1: Cuadros alineados en "Nota de procedimiento" y en los demás formularios [CK]

**Cómo está hoy (captura 6):** en "Nota de procedimiento", los rótulos "Procedimiento realizado" y "Fecha y hora del procedimiento" están en la misma línea, pero el cuadro de la izquierda empieza más abajo que el de la derecha; el campo de fecha y el botón "Ahora" no miden lo mismo que el cuadro de la izquierda. "Esos cuadros descuadrados, están desalineados."

**Qué quiero:**

1. En una misma fila, los campos empiezan a la misma altura y miden lo mismo (40 px; 44 px en táctil), incluidos los botones pegados a un campo ("Ahora", calendario). El texto de ayuda va **debajo** del campo y no empuja al campo vecino.
2. Revisa con la misma regla las ventanas que comparten ese formulario: "Nota de procedimiento", "Nota postquirúrgica" (capturas 4 y 5, "Hora de inicio" y "Hora de cierre" con "Ahora"), "Nueva nota de evolución", "Egreso", "Referencia" y las de observación y hospitalización. Arréglalo una vez en el componente de fila de formulario, no campo por campo.
3. Lista en el reporte qué formularios corregiste.

**Criterios de aceptación:**
- [ ] En "Nota de procedimiento" a 1366 px, la parte de arriba de "Procedimiento realizado" y la de "Fecha y hora del procedimiento" están a la misma altura (mídelo) y "Ahora" mide lo mismo que el campo.
- [ ] Igual en "Nota postquirúrgica" con "Hora de inicio" y "Hora de cierre".
- [ ] A 390 px los campos van uno debajo del otro, sin desborde.

---

### Grupo MN: menú lateral

#### MN1: Menú lateral agrupado y todos los grupos plegables [CK]

**Cómo está hoy (capturas 7 y 13):** en el médico de consultorio, Inicio, Agenda, Recetas y Cobrar están sueltos; solo "Pacientes" se pliega (con "⌄"); "Registros" es un título que no se pliega. En enfermería, "Pacientes" plegado muestra "26 ›" (otra flecha). "Solo algunas se despliegan y se colapsan, se mira desordenado y desorganizado así; agrúpalas como tiene que ser y que todas sean desplegables y colapsables." "Lo mismo de lo desplegable y colapso de cosas en pacientes" (captura 13).

**Qué quiero:**

1. **Grupos** (A6; en configuración con `VALIDAR: Emil`). Cada rol ve solo las entradas que hoy tiene, acomodadas así:
   - **Inicio**: suelto, siempre arriba (no es grupo).
   - **"Agenda y cobros"**: Agenda, Caja o Cobrar (según CO1). Si el rol no tiene ninguna entrada de cobro (por ejemplo, la vista Médico del Consultorio después de CO1), el grupo se llama solo **"Agenda"**.
   - **"Pacientes"**: Consulta externa, Observación, Hospitalizados, Biblioteca de pacientes, Crónicos y seguimientos, Recetas.
   - **"Registros"**: Uso de medicamentos y material, Rol de turnos.
   - **"Administración"** (en Consultorio hoy se llama "Mi consultorio": conserva ese nombre ahí): Reportes, Personal, Configuración de la clínica o del consultorio, Bitácora y lo que hoy esté en ese grupo.
   - Los menús propios de Laboratorio e Imágenes (DP8, DP11) se acomodan con la misma regla.
   - **"Configuración"** personal y la tarjeta de usuario quedan abajo, sueltos, como hoy.
2. **Todos los grupos se pliegan** con el mismo encabezado: nombre, insignia (si hay) y una sola flecha que apunta hacia abajo abierto (▾) y a la derecha cerrado (▸). Toda la fila del encabezado pliega o despliega.
3. **Plegado**: el encabezado muestra la suma de las insignias de sus entradas (con las reglas de PD1: solo lo del usuario).
4. **Estado**: al entrar, todos abiertos; lo que el usuario pliegue se recuerda por usuario en el navegador. El grupo de la página actual se abre solo.
5. Si un rol no tiene entradas en un grupo, el grupo no aparece. El médico de clínica sigue sin ver "Registros" (RU6, ronda 15).
6. **Error de interfaz detectado (capturas 7, 13 a 15):** las insignias salen unas rojas y otras amarillas sin una regla visible. Usa una sola regla y dímela en el reporte (por ejemplo, rojo solo si hay algo atrasado del usuario).
7. A ~390 px (menú como cajón), la misma estructura.

**Criterios de aceptación:**
- [ ] Como Dra. Ana López (vista Médico) veo Inicio, "Agenda" (sin cobro, por CO1) y "Pacientes", y cada grupo se pliega y despliega con la misma flecha; en la vista Administración veo "Agenda y cobros" y "Mi consultorio".
- [ ] Como Dra. Lucía Herrera no veo "Registros".
- [ ] Como Lic. Carmen Ríos pliego "Pacientes": el encabezado muestra la suma de sus insignias; recargo y sigue plegado.
- [ ] Entro a "Hospitalizados" con "Pacientes" plegado: el grupo se abre solo.
- [ ] Como Roberto Aguilar veo "Administración" plegable.
- [ ] No hay grupos vacíos ni dos flechas distintas; funciona a 390 px.

---

### Grupo CO: consultorio

#### CO1: En el Consultorio, el cobro se ve en Administración, no en la vista Médico [K]

**Cambia CE1 (ronda 6) solo para el Consultorio, en lo que dice de "Cobrar" en el menú del médico.**

**Cómo está hoy (captura 8):** la Dra. Isabel Pacheco tiene los roles Médico y Administración. En la vista **Médico** le sale "Cobrar" en el menú y el cuadro "L 1,200.00 Cobrado hoy" en el Inicio, solo en una segunda fila debajo de los otros cuatro cuadros. "El UI está mal hecho; en el rol médico le sale el cobro y se mira mal, y teniendo el rol administrativo, entonces no tiene sentido."

**Qué quiero:**

1. En **Consultorio**, si la persona tiene el rol **Administración**, la vista **Médico** no muestra "Cobrar" en el menú ni el cuadro "Cobrado hoy" en el Inicio. El cobro y el dinero se ven en la vista **Administración** (Caja, Reportes).
2. Si un usuario de Consultorio tiene **solo** el rol Médico (sin Administración), conserva "Cobrar" como hoy (A7). Quitar también "Cobrar" del menú (no solo el cuadro) está confirmado por mí (A16).
3. En Clínica no cambia nada.
4. El Inicio de la vista Médico queda con los cuatro cuadros en **una sola fila** (Citas hoy, En sala de espera, Listos para consulta, Atendidos), sin la fila huérfana.
5. **Error de interfaz detectado (captura 8):** en la vista Médico, en "Por llegar hoy", el botón "Llegó" está visible y al pulsarlo sale "Tu rol no tiene permiso para esta acción". En el Consultorio, la médica **sí** puede marcar la llegada desde la vista Médico: dale el permiso (A8, confirmado por Emil). En general, ningún botón visible debe dar ese error.
6. **Revisa y repórtame (no lo cambies):** en la captura 8 hay dos selectores de rol a la vez (las pestañas "Administración · Médico" arriba del Inicio y "Médico ⌄" en la tarjeta de usuario), y el cobro se llama "Cobrar" en una vista y "Caja" en la otra. Dime si son dos controles distintos o el mismo.

**Criterios de aceptación:**
- [ ] Como Dra. Isabel Pacheco (o Dra. Ana López) en la vista Médico: no hay "Cobrar" ni "Cobrado hoy"; cambio a Administración y el cobro está en Caja.
- [ ] El Inicio de la vista Médico tiene los cuatro cuadros en una fila a 1366 px.
- [ ] En la vista Médico marco "Llegó" a un paciente y funciona; ningún botón visible da "Tu rol no tiene permiso para esta acción".
- [ ] En Clínica, Dra. Lucía Herrera sigue como hoy.
- [ ] A 390 px se ve bien.

---

### Grupo OB: observación

#### OB1: Botones de Observación en una fila y sin los de cirugía [CK]

**Reemplaza en parte PQ1 (ronda 9, A6) y DP11 (ronda 12), que ponían "Autorización quirúrgica" y "Nota postquirúrgica" también en Observación (para médicos y radiólogo).**

**Cómo está hoy (captura 9):** en Observación › "Notas de evolución" hay ocho botones azules en dos filas: Nueva nota de evolución, Procedimiento, Autorización quirúrgica, Valoración preanestésica, Nota postquirúrgica, Egreso y, abajo y con otro color, Pasar a hospitalización y Referencia. "No entiendo por qué son 2 filas."

**Por qué:** "si un paciente solo va a estar en observación no va a tener un procedimiento mayor, por lo cual la valoración preanestésica, notas postquirúrgicas tampoco necesita, ni la autorización quirúrgica". Si va a cirugía, primero se pasa a hospitalización.

**Qué quiero:**

1. En **Observación** se quitan **"Autorización quirúrgica"**, **"Valoración preanestésica"** y **"Nota postquirúrgica"**. Se quedan, en este orden: **"Nueva nota de evolución"**, **"Procedimiento"** (nota de procedimiento menor), **"Egreso"**, **"Pasar a hospitalización"** y **"Referencia"**, en **una sola fila**.
2. Mismo estilo para todos (los cinco del mismo color y tamaño), o, si se quiere distinguir, el primero como principal y los demás como secundarios; pero **en una fila**, sin la mezcla de hoy.
3. **Hospitalización** conserva todos sus botones. Si no caben en una fila al ancho de la pantalla, los últimos pasan a un botón **"Más acciones ▾"** al final de la fila (con el componente de LD1 para el menú), en lugar de bajar a otra fila. Lo mismo en Observación a anchos angostos.
4. Quítalos también por permisos en el servidor: no se puede crear una autorización quirúrgica, valoración preanestésica ni nota postquirúrgica **nueva** en una estancia de **observación** (tampoco por URL directa). Lo que ya exista en estancias de observación se sigue viendo en sus notas y en Anexos, y lo que esté **pendiente de firma** se puede firmar o anular como hoy.
5. Al pasar a hospitalización, los botones de cirugía aparecen.
6. **Textos que nombran la nota postquirúrgica en Observación**: el aviso de arriba de la fila (captura 9: "Procedimientos, notas postquirúrgicas y egreso también son notas de evolución") y la ayuda de "Nota de procedimiento" (captura 6: "Una cirugía se escribe en «Nota postquirúrgica»"). En Observación deben decir, por ejemplo, "Procedimientos y egreso también son notas de evolución" y "Para una cirugía, pasa al paciente a hospitalización". En hospitalización quedan como están.
7. Aplica igual para el radiólogo (DP11) y para todos los roles que hoy ven esos botones (en la captura 12 también los ve enfermería).
8. **Consultorio**: la misma regla. Aunque el consultorio no use hospitalización, los tres botones de cirugía **se quitan** de su Observación (A14, confirmado por Emil).

**Criterios de aceptación:**
- [ ] Como Dr. Daniel Fúnez, en un paciente de Observación a 1366 px, veo cinco botones en una fila y ninguno de cirugía.
- [ ] El mismo paciente pasado a hospitalización muestra "Autorización quirúrgica", "Valoración preanestésica" y "Nota postquirúrgica".
- [ ] Una autorización quirúrgica creada antes en una observación se sigue viendo.
- [ ] Crear una nota postquirúrgica en observación por URL directa da "Sin permiso".
- [ ] En hospitalización a ~1100 px los botones que no caben están en "Más acciones", sin segunda fila.
- [ ] Como Lic. Carmen Ríos en Observación tampoco veo los botones de cirugía.
- [ ] Los textos de ayuda de Observación ya no nombran la nota postquirúrgica.
- [ ] En un consultorio sin hospitalización, Observación tampoco tiene botones de cirugía; funciona a 390 px.

---

### Grupo PX: pestaña Exámenes

#### PX1: Todo contraído al entrar, y "Contraer todo" contrae todo [CK]

**Cambia EX1 (ronda 8) en lo que dice del estado inicial.**

**Cómo está hoy (capturas 10 y 11):** al entrar, "Hematología" y "Hemograma" vienen abiertos. Al pulsar "Contraer todo", "Hemograma" se cierra pero el grupo "Hematología" no.

**Qué quiero:** "que los exámenes salgan colapsados por default" y "le di a contraer todo y Hematología no se contrajo".

1. **Al entrar**, todos los niveles cerrados: grupos (Hematología, Química en sangre…) y exámenes. Cerrado, cada grupo muestra su nombre y conteo; cada examen, su fila corta (nombre, "Urgente", estado, fecha, y las etiquetas de valores fuera de rango como en la captura 11).
2. **Sin excepciones** (A9): ya no existen valores críticos (UM4, ronda 12), así que nada abre solo. Un examen con valores fuera de rango muestra sus etiquetas Alto / Bajo en la fila cerrada, como en la captura 11. **Averigua** por qué hoy el Hemograma de la captura 10 abre solo (¿queda lógica de EX1 de "crítico abierto"?) y dímelo en el reporte.
3. **Error de interfaz detectado (capturas 10 y 11):** con el examen abierto, "Resultado listo", "Ver PDF", "Imprimir" y "Marcar revisado" bajan a la fila del primer analito (Leucocitos); cerrado, están en la fila del examen. Que se queden siempre en la fila del examen. Además, la etiqueta "Alto" es amarilla con el examen abierto y roja "(alto)" con el examen cerrado: un solo estilo.
4. **"Contraer todo"** cierra **todos** los niveles (grupos y exámenes); **"Expandir todo"** abre todos.
5. Aplica a Laboratorio e Imagen y gabinete, en observación, hospitalización, Biblioteca de pacientes y Consultorio, y para todos los roles.
6. Lo que el usuario abre se queda abierto mientras está en la pestaña; al volver a entrar, empieza cerrado.

**Criterios de aceptación:**
- [ ] Como Dra. Lucía Herrera entro a Exámenes de un hospitalizado: todo cerrado, con conteos.
- [ ] Abro todo con "Expandir todo" y pulso "Contraer todo": se cierran también los grupos.
- [ ] Un examen con valores Alto sale cerrado, con sus etiquetas visibles; con el examen abierto, sus botones siguen en la fila del examen.
- [ ] Igual en la Biblioteca de pacientes y en Consultorio.

#### PX2: Barra de herramientas de Exámenes pareja [CK]

**Cómo está hoy (captura 11):** "Buscar examen", "Orden", el selector "Todos · Pendientes · Con resultado", "Expandir todo" y "Contraer todo" tienen alturas distintas y no se alinean. "Está mal hecho ese UI, arreglarlo."

**Qué quiero:**

1. Todos los controles de la barra con la **misma altura** (40 px; 44 px en táctil), alineados abajo, con la misma separación.
2. **Error de interfaz:** el rótulo "Orden" se confunde con una orden médica: cámbialo a **"Ordenar por"**.
3. "Ordenar por" usa el componente de LD1.
4. A ~1100 px y a 390 px, la barra pasa a dos renglones ordenados (buscador a todo el ancho arriba; los demás controles abajo), sin desborde.

**Criterios de aceptación:**
- [ ] A 1366 px los cinco controles miden lo mismo y su borde de abajo está alineado (mídelo).
- [ ] El rótulo dice "Ordenar por".
- [ ] A ~1100 px y a 390 px no hay desborde.

---

### Grupo AN: anestesia

#### AN1: Cargo "Técnico en anestesia" y lista "Valoración realizada por" [CK]

**Cómo está hoy (captura 12):** en la ventana "Subir la valoración preanestésica", la lista "Valoración realizada por" ofrece a **todo** el personal (auxiliares de enfermería, técnicos de laboratorio, médicos de cualquier especialidad). En Personal no existe un cargo para los técnicos en anestesia.

**Por qué (aclarado por mí):** la valoración preanestésica **la hacen los anestesiólogos o los técnicos en anestesia**, pero **la sube cualquiera** (por ejemplo, enfermería sube la hoja en papel).

**Qué quiero:**

1. **Cargo nuevo** en Personal y roles: **"Técnico(a) en anestesia"**, con prefijo "Téc." en firmas y número de registro opcional (A18). Usa el mismo diseño de cargos de PE1 y DP1 (un rol con cargos, no un rol por cargo).
2. **Qué puede hacer** quien tiene ese cargo (A18, confirmado por Emil): ver el expediente de los pacientes de observación y hospitalización en solo lectura (como el radiólogo en DP4), subir la valoración preanestésica y la hoja de anestesia en papel, y **llenar y firmar la hoja de anestesia en el sistema** (PQ3) cuando figure como quien hizo la anestesia. No escribe notas, no ordena y no indica medicamentos.
3. **Cambia PQ3 (ronda 14)**, que decía que solo el médico anestesiólogo llena y firma la hoja en el sistema: ahora también el técnico en anestesia. En la nota postquirúrgica, el campo "Anestesiólogo" del equipo quirúrgico (PQ2) ofrece también a los técnicos en anestesia, y la firma sale con "Téc.", su nombre, "Técnico(a) en anestesia" y su número de registro si lo tiene.
4. **Lista "Valoración realizada por"** (lista abierta de LD1): ofrece solo a los **médicos con especialidad de Anestesiología** y al personal con cargo **"Técnico(a) en anestesia"**, y permite escribir el nombre de alguien de afuera ("Usar «…»"), como hoy.
5. **Quién sube** la valoración: no cambia (cualquiera que hoy pueda subirla).
6. Si la clínica no tiene a nadie con esa especialidad ni ese cargo, la lista dice "No hay anestesiólogos ni técnicos en anestesia registrados" y deja escribir el nombre.
7. En Consultorio, la titular también puede agregar personal con ese cargo si hoy puede agregar personal (MI2); si no, se escribe el nombre a mano.

**Criterios de aceptación:**
- [ ] Como Roberto Aguilar asigno a una persona el cargo "Técnico(a) en anestesia".
- [ ] En la ventana de la valoración preanestésica, "Valoración realizada por" solo ofrece anestesiólogos y técnicos en anestesia, y deja escribir un nombre de afuera.
- [ ] Como Lic. Carmen Ríos subo una valoración eligiendo al técnico en anestesia.
- [ ] El técnico en anestesia entra, ve el expediente en lectura y sube una valoración; no puede escribir notas (también por URL directa).
- [ ] En una nota postquirúrgica pongo al técnico en anestesia como anestesiólogo: le sale el pendiente, llena la hoja de anestesia en el sistema y la firma; la firma dice "Téc. … · Técnico(a) en anestesia".
- [ ] Funciona a 390 px.

---

### Grupo PD: pendientes por rol

**Por qué (todo el grupo):** "a esta enfermera no tiene pendientes con este paciente: ya actualizó los signos, puso los medicamentos, le pidió la firma pendiente al paciente; ella no puede firmar por el médico y realmente no puede leer los resultados porque tienen que ser valorados por el médico; entonces a ella no le deberían salir tantas notificaciones a la izquierda, o contarse las de ese, pero sí salir que el médico tiene pendiente eso en el expediente". Y: "es importante hacer la distinción de qué pendientes son de médico y de enfermería, de técnico en rayos X y laboratorio; hay pendientes compartidos, como muestras o firmas de algunas cosas; entonces discierne lo que le corresponde a cada quien".

#### PD1: Cada pendiente tiene responsable; cada quien cuenta solo lo suyo [CK]

**Cómo está hoy (capturas 9, 13 y 14):**
- Como Aux. Rosa Vallecillo (enfermería), el recuadro del paciente dice "1 pendiente · 1 aviso": "Autorización quirúrgica pendiente de firma" y "1 resultado listo por revisar". En el menú, "Hospitalizados 5" y "Pacientes 26".
- Como Dr. Hugo Nolasco (médico), el recuadro rojo dice "1 orden nueva sin revisar de Dra. Solórzano", que es tarea de enfermería.

**Qué quiero:**

1. **Tabla de tipos de pendiente** (en un solo archivo de configuración, `VALIDAR: Emil`). Haz el inventario de los tipos que existen hoy en el código y asigna a cada uno su **responsable**. Mi propuesta de partida (A10):

   | Tipo de pendiente | Responsable |
   |---|---|
   | Signos vitales que tocan o atrasados | Enfermería |
   | Dosis que toca ahora o atrasada | Enfermería |
   | Orden nueva sin revisar (checklist de indicaciones) | Enfermería |
   | Medicamento por aplicar en consulta externa (ME13) | Enfermería y médico que atendió (compartido) |
   | Resultado listo por revisar | Médico (el que pidió el examen y el tratante) |
   | Firma del médico pendiente (autorización, consentimiento, nota, epicrisis) | Médico que debe firmar |
   | Firma del paciente, familiar o testigo pendiente (autorización quirúrgica, consentimiento) | Compartido: enfermería y médico tratante (cualquiera de los dos puede obtenerla). Aunque la obtenga enfermería, el documento **sigue necesitando la firma del médico**, que es un pendiente aparte del médico (fila anterior). |
   | Alerta de signos (por ejemplo fiebre con "Registrar signos") | Enfermería |
   | Toma de muestra pendiente | Compartido: laboratorio y enfermería (DP2 de la ronda 11: las muestras las toman los dos); sin laboratorio en la clínica (EX8), enfermería |
   | Estudio de imagen por realizar | Técnico en imágenes; informe pendiente: radiólogo |
   | Hoja de anestesia pendiente | Solo el anestesiólogo (PQ3; no cuenta en el recuadro del paciente) |

   Si encuentras tipos que no están aquí (por ejemplo, la valoración preanestésica pendiente), asígnalos con el mismo criterio y lístalos en el reporte.
   - **Cada pendiente de firma dice qué firma falta** (médico, paciente o familiar, testigo) y se asigna según eso: "Autorización quirúrgica pendiente de firma" no basta. Usa el mismo nombre del pendiente en el recuadro y en las listas (hoy dice "Autorización quirúrgica pendiente de firma" en la captura 14 y "Autorización pendiente de firma" en la captura 15).
   - **"Médico" es la persona, no el rol**: el pendiente es del médico tratante y, en resultados, también del que pidió el examen. A otro médico de la clínica que abra el expediente le sale en "Pendientes de otros".
2. **Pendientes compartidos**: cuentan para todos sus responsables. Cuando uno de ellos lo resuelve, se cierra para todos (por ejemplo, la firma del paciente la recoge enfermería o el médico; el que la recoja la cierra). Si la recoge enfermería, el pendiente "Firma del médico" sigue abierto para el médico hasta que firme.
3. **Recuadro del paciente** ("N crítica · N pendientes · N aviso"):
   - El encabezado y los números cuentan **solo lo del usuario** (los suyos y los compartidos).
   - Debajo de lo suyo, una sección gris y más pequeña, **"Pendientes de otros"**, con lo que les toca a otros roles, cada uno con su responsable: "Médico: revisar resultado de Hemograma", "Médico: firmar autorización quirúrgica". Solo informativa: no cuenta, no es roja y no tiene botones de acción que el usuario no pueda usar.
   - Lo de otros que lleva mucho tiempo (por ejemplo, una orden sin revisar de más de 30 minutos) va primero en esa sección, con el tiempo resaltado, aunque no cuente.
   - **Error de interfaz detectado (captura 14):** el aviso "1 resultado listo por revisar" tiene el botón "Ver resultados" aunque el usuario ya está en la pestaña Exámenes. En ese caso, que baje hasta el resultado.
   - Si el usuario no tiene pendientes propios pero sí hay de otros, el recuadro no se pinta de alerta: queda gris con "Sin pendientes para ti · 2 de otros".
4. **Insignias del menú** (Observación, Hospitalizados, el grupo "Pacientes" plegado de MN1): cuentan **solo** los pendientes del usuario, con la regla de PD2 punto 3. Las insignias de Consulta externa y Crónicos y seguimientos conservan su significado de hoy (pacientes en espera, controles por vencer); dime en el reporte qué cuenta cada insignia.
5. **Radiólogo y laboratorio** siguen como DP11: ven solo lo suyo y no ven "Pendientes de otros".
6. **Consultorio**: la titular cuenta todo como suyo mientras **no** tenga enfermera activa (MI2). Con enfermera activa, lo de enfermería cuenta para la enfermera y le sale a la titular en "Pendientes de otros", aunque la titular siga pudiendo resolverlo (MI1) (A11).
7. **Una persona con varios roles** cuenta los pendientes del rol que tiene activo en ese momento (selector de GE1).

**Criterios de aceptación:**
- [ ] Como Aux. Rosa Vallecillo (o Lic. Carmen Ríos), en el hospitalizado de la captura 14, con signos al día, medicamentos registrados y la firma del paciente ya recogida: el recuadro dice "Sin pendientes para ti" y debajo, en gris, "Médico: revisar resultado de Hemograma" y "Médico: firmar autorización quirúrgica".
- [ ] Ese paciente no suma en la insignia "Hospitalizados" de enfermería.
- [ ] Como Dr. Hugo Nolasco (o Dra. Lucía Herrera), una orden nueva sin revisar sale en "Pendientes de otros" como "Enfermería: revisar orden nueva", no como crítica suya; un resultado listo sí cuenta como suyo.
- [ ] La enfermera recoge la firma del paciente: ese pendiente desaparece para ella y para el médico, pero al médico le sigue saliendo "Firmar autorización quirúrgica" hasta que la firme.
- [ ] Como Téc. Kevin Rivera sigue viendo solo los de laboratorio.
- [ ] En Consultorio sin enfermera, la titular ve todo como suyo; con enfermera activa, lo de enfermería pasa a "Pendientes de otros".
- [ ] La tabla de tipos y responsables está en el reporte.

#### PD2: Columna "Pendientes" en Hospitalizados y Observación [CK]

**Cómo está hoy (captura 15):** la lista "Hospitalizados" tiene Cuarto, Estado, Paciente, Especialidad, Diagnóstico, Médico tratante y Día. El menú dice "Hospitalizados 5", pero no se sabe en qué pacientes; solo una fila muestra la etiqueta "Autorización pendiente de firma", al final y sin título de columna. "Debería de haber un apartado así como sale estado, paciente, especialidad, que salga pendientes tal tal tal, para que sea más fácil darse cuenta qué pendientes hay."

**Qué quiero:**

1. Una columna **"Pendientes"** con su título en la lista de **Hospitalizados** y en la de **Observación** (A12).
2. En cada fila, las etiquetas de los pendientes **del usuario** (PD1), cortas y con color por tipo: "2 signos atrasados", "1 dosis atrasada", "Firma del paciente", "Resultado por revisar". Hasta 3 etiquetas y "+N". Debajo, en gris pequeño, "Otros: Médico 2" si hay pendientes de otros roles. Sin pendientes: "—".
3. La **insignia del menú** es el número de pacientes con al menos un pendiente del usuario, y coincide con las filas que deja el filtro del punto 4.
4. Un filtro arriba, junto a "Todas · Ocupadas · Libres": **"Con pendientes para mí (n)"** (A17).
5. Al tocar una etiqueta se abre el expediente del paciente en la pestaña donde se resuelve (Signos vitales, Medicamentos, Exámenes, Anexos) (A17).
6. **Error de interfaz detectado (captura 15):** la columna "Paciente" repite la especialidad debajo de la edad, y ya hay una columna "Especialidad". Quita la repetición.
7. A 390 px, la lista en tarjetas con los pendientes visibles.

**Criterios de aceptación:**
- [ ] Como Lic. Carmen Ríos veo la columna "Pendientes" en Hospitalizados y Observación con sus etiquetas, y la insignia del menú coincide con "Con pendientes para mí".
- [ ] Como Dra. Lucía Herrera, la misma lista me muestra mis pendientes (resultados por revisar, firmas) y no los de enfermería.
- [ ] Tocar "2 signos atrasados" me lleva a Signos vitales de ese paciente.
- [ ] La columna "Paciente" ya no repite la especialidad.
- [ ] A 390 px se ven los pendientes en cada tarjeta.

---

## 4. Permisos de lo nuevo

✔ puede, ○ solo ve, — no tiene acceso. "Igual que hoy" = no cambia. En Consultorio, la médica titular tiene los permisos de Médico, Enfermería y Administración (salvo lo que dice CO1 sobre la vista Médico). Lab = Microbiólogo y Técnico de laboratorio; Img = Radiólogo y Técnico en imágenes.

| Función | Recepción | Enfermería | Médico | Administración | Lab | Img |
|---|---|---|---|---|---|---|
| Ver el porcentaje y el reporte por mes (RP1, RP2) | igual que hoy | — | igual que hoy | ✔ | — | — |
| Ver la nota para el equipo y su historial (NP1) | ○ | ✔ | ✔ | ✔ | ○ | ○ |
| Agregar, cambiar o quitar la nota (NP1) | — | ✔ | ✔ | ✔ | — | — |
| Subir archivos con las categorías nuevas (AR1) | igual que hoy | igual que hoy | igual que hoy | igual que hoy | igual que hoy | igual que hoy |
| Lista desplegable única (LD1), alineación (UI1), menú (MN1) | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| "Cobrar" en la vista Médico del Consultorio (CO1) | — | — | — si tiene Administración; ✔ si no | ✔ (Caja) | — | — |
| Crear autorización quirúrgica, valoración preanestésica o nota postquirúrgica en Observación (OB1) | — | — | — | — | — | — |
| Lo mismo en Hospitalización | — | igual que hoy | igual que hoy | — | — | igual que hoy (radiólogo) |
| Pestaña Exámenes contraída y barra pareja (PX1, PX2) | igual que hoy | ✔ | ✔ | igual que hoy | igual que hoy | igual que hoy |
| Ver sus pendientes y "Pendientes de otros" (PD1) | igual que hoy | ✔ | ✔ | igual que hoy | solo los suyos | solo los suyos |
| Cargo "Técnico(a) en anestesia" (AN1): asignarlo | — | — | — | ✔ | — | — |
| Columna "Pendientes" y filtro (PD2) | igual que hoy (si ve la lista) | ✔ | ✔ | igual que hoy (si ve la lista) | — | — |

En Consultorio, la titular sin rol Administración conserva "Cobrar" (A7). El **Técnico(a) en anestesia** (AN1) no está en la tabla porque es un cargo nuevo: ve el expediente en solo lectura (observación y hospitalización), sube la valoración preanestésica y la hoja de anestesia en papel, y llena y firma la hoja de anestesia en el sistema (A18).

---

## 5. Orden de implementación sugerido

1. **Rápido y aislado**: UI1 → PX2 → PX1 → CO1 → OB1.
2. **Componentes base**: LD1 (lista única; la usan AR1, PX2 y OB1 en "Más acciones") → AR1.
3. **Menú**: MN1.
4. **Anestesia**: AN1 (usa LD1).
5. **Reportes**: RP2 (periodo "Mes") → RP1 (comparación; usa los periodos de RP2).
6. **Paciente**: NP1.
7. **Pendientes**: PD1 (tabla de tipos y responsables) → PD2 (columna, filtro e insignias; depende de PD1). Revisa al final que las insignias de MN1 usen la regla de PD1.

No hay datos demo en esta ronda.

---

## 6. Ambigüedades y valores por defecto

Decisiones que tomé porque no las especifiqué. Úsalas y lístalas en el reporte para que las confirme.

| Cód. | Tema | Valor por defecto |
|---|---|---|
| A1 | RP1 Asistencia | **Confirmado por Emil:** en porcentaje (cambio relativo), igual que los demás cuadros. |
| A2 | RP2 mes en curso | **Confirmado por Emil:** se compara con los mismos días del mes anterior y la línea lo dice ("vs. 1–12 oct"). |
| A3 | NP1 quién la ve | **Confirmado por Emil:** la ve todo el personal; la cambian médicos, enfermería y administración. Máximo 200 caracteres (valor mío). |
| A4 | AR1 categorías nuevas | **Confirmado por Emil:** las 12 de la lista (las 4 de hoy más 8). `VALIDAR: Emil`. |
| A5 | LD1 cuántas letras | **Confirmado por Emil.** Listas fijas: desde la primera letra. Buscadores de catálogos grandes: desde 2 letras, como hoy (ME8, RU7). |
| A6 | MN1 grupos | **Confirmado por Emil:** Inicio suelto; "Agenda y cobros"; "Pacientes" (con Recetas); "Registros"; "Administración" ("Mi consultorio" en Consultorio); Configuración personal abajo. Todos abiertos al entrar. `VALIDAR: Emil`. |
| A7 | CO1 médico de consultorio sin rol Administración | **Confirmado por Emil:** conserva "Cobrar" en su menú. |
| A8 | CO1 botón "Llegó" en la vista Médico | **Confirmado por Emil:** en el Consultorio se le da permiso a la vista Médico para marcar la llegada. |
| A9 | PX1 estado inicial | Todo cerrado, sin excepciones (ya no hay valores críticos desde UM4). Las etiquetas Alto / Bajo se ven en la fila cerrada. |
| A10 | PD1 responsables | La tabla de PD1; ajustada con los tipos reales del código. `VALIDAR: Emil`. |
| A11 | PD1 Consultorio | **Confirmado por Emil:** sin enfermera activa, la titular cuenta todo; con enfermera, lo de enfermería le sale en "Pendientes de otros". |
| A12 | PD2 alcance | **Confirmado por Emil:** Hospitalizados y Observación (en el Word mencioné Hospitalizados; Observación tiene la misma insignia y el mismo problema). |
| A13 | OB1 hospitalización | Conserva todos los botones; lo que no cabe va a "Más acciones". |
| A14 | OB1 consultorio | **Confirmado por Emil:** también se quitan de la Observación del consultorio, aunque no use hospitalización. |
| A15 | AR1 lista de archivos | **Confirmado por Emil:** agrupada por categoría con conteo. |
| A16 | CO1 alcance | **Confirmado por Emil:** se quitan de la vista Médico el cuadro "Cobrado hoy" **y** "Cobrar" del menú. |
| A18 | AN1 permisos del técnico en anestesia | **Confirmado por Emil:** expediente en solo lectura, subir valoración preanestésica y hoja de anestesia en papel, y llenar y firmar la hoja de anestesia en el sistema. Número de registro opcional (valor mío). |
| A17 | PD2 filtro y enlace | **Confirmado por Emil:** filtro "Con pendientes para mí" y etiquetas que llevan a la pestaña donde se resuelve. |

---

## 7. Revisión final antes de entregar

**Marca cada casilla antes de decir que terminaste:**

- [ ] Todos los puntos cumplen **todos** sus criterios de aceptación (sección 3).
- [ ] Todo lo de la sección 2 sigue intacto (reportes de hoy, encabezado del paciente, las 4 categorías de archivos, buscadores, los pendientes en sí, cómo se ve un resultado abierto, botones de hospitalización, cobro, lo ya firmado).
- [ ] Probado a **~390 px**: sin desborde horizontal y con controles de al menos 44 px (listas, menú, botones de observación, barra de exámenes, columna de pendientes).
- [ ] Probado en escritorio a **1920, 1366 y 1280 px** y con la ventana no maximizada (~1100 y ~1000 px).
- [ ] **Permisos** de la sección 4 comprobados también **por URL directa** (nota del paciente, notas quirúrgicas en observación, cobro en la vista Médico).
- [ ] Migraciones (nota del paciente y su historial, categorías de archivos, tabla de pendientes) probadas sobre una copia de la base, idempotentes y en todas las bases, incluidas una clínica y un consultorio **nuevos**.
- [ ] Prueba automática de LD1 (sin `<select>` nativo) pasando.
- [ ] Sin errores de `build`, typecheck, lint, pruebas ni de consola.
- [ ] Textos en español correcto, fechas `dd/mm/aaaa` y hora de 24 horas.
- [ ] Constantes nuevas con `VALIDAR: Emil` (categorías de archivos, grupos del menú, tabla de pendientes).

**Flujo de punta a punta con usuarios demo** (haz el recorrido completo y reporta el resultado):

1. **Roberto Aguilar (administración)**: en "Reportes" ve los porcentajes en "30 días" y "7 días"; elige "Mes" › octubre y luego el mes en curso; exporta el CSV del mes. Pliega y despliega los grupos del menú.
2. **Dra. Lucía Herrera (médico)**: en la Biblioteca agrega a un paciente la nota "Debe ser atendido con su madre". Lo hospitaliza o abre un hospitalizado: en Exámenes todo viene cerrado, "Contraer todo" cierra los grupos y la barra está pareja. En un paciente de Observación ve cinco botones en una fila; lo pasa a hospitalización y aparecen los de cirugía. Escribe una nota postquirúrgica: "Tipo de anestesia" y "Ayudante 2" son la misma lista; los campos están alineados. Sube un archivo como "Receta externa". En un hospitalizado abre "Valoración preanestésica": la lista "Valoración realizada por" solo ofrece anestesiólogos y técnicos en anestesia. En la lista de Hospitalizados ve sus pendientes (resultado por revisar, firma) y no los de enfermería.
3. **Dr. Daniel Fúnez (médico)**: abre el mismo paciente en consulta externa, ve la nota y la cambia; el historial tiene dos versiones.
4. **Lic. Carmen Ríos (enfermería)**: ve la nota y la puede cambiar. Registra signos y dosis de un hospitalizado y recoge la firma del paciente: su recuadro dice "Sin pendientes para ti" con los del médico en gris; el paciente deja de sumar en su insignia "Hospitalizados"; el filtro "Con pendientes para mí" coincide con la insignia. Plegando "Pacientes" ve la suma correcta.
5. **Sofía Mejía (recepción)**: ve la nota del paciente pero no la puede cambiar (tampoco por URL directa); sus listas desplegables son las nuevas.
6. **Téc. Kevin Rivera (laboratorio)**: solo ve sus pendientes de laboratorio.
7. **Dra. Ana López o Dra. Isabel Pacheco (Consultorio)**: en la vista Médico no ve "Cobrar" ni "Cobrado hoy" y el Inicio tiene una sola fila de cuadros; ningún botón le da "Tu rol no tiene permiso". En Administración, "Reportes" dice "del consultorio" y muestra los porcentajes. Sin enfermera, cuenta todos los pendientes como suyos.

---

## 8. Reporte final que espero

1. **Tabla por punto** (RP1, RP2, NP1, AR1, LD1, UI1, MN1, CO1, OB1, PX1, PX2, AN1, PD1, PD2): estado (**Hecho / Parcial / No hecho**), archivos cambiados y **cómo lo pruebo yo en 2 o 3 pasos**.
2. **Lo que te pedí averiguar**: qué pidieron las rondas 16 y 17 que choque con esta (sección 0); si "Anexos" usaba otra lista de categorías (AR1); qué lista usa "Valoración realizada por" y si las listas de personal filtran por rol (LD1); cómo quedó el permiso de "Llegó" en la vista Médico y si los dos selectores de rol son el mismo control (CO1); por qué el Hemograma abría solo (PX1); la regla de color de las insignias (MN1); qué cuenta cada insignia del menú y los tipos de pendiente que encontraste con su responsable (PD1).
3. **Inventario de listas desplegables** cambiadas y las que dejaste, con el motivo (LD1); **formularios** alineados (UI1).
4. **Cambios en la base de datos**: nota del paciente y su historial, categorías de archivos, cargo "Técnico(a) en anestesia", responsable por tipo de pendiente, y migraciones.
5. **Valores por defecto usados** (sección 6) y cuáles cambiaste.
6. **Lo que debo validar yo**: categorías de archivos, grupos del menú y la tabla de pendientes y responsables.
7. **Capturas** de: Reportes con porcentajes y "Mes"; la nota debajo del nombre; la lista desplegable nueva en la nota postquirúrgica y en la ventana de la valoración preanestésica; el menú plegable de médico y de enfermería; la fila de botones de Observación; Exámenes contraído; el recuadro de pendientes de enfermería con "Pendientes de otros"; la columna "Pendientes".
8. **Hallazgos fuera de la lista**: repórtalos, **no los implementes** sin preguntarme.
9. **Verificaciones que no pudiste hacer** y por qué.
