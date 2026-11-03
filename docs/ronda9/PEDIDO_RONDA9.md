# Clinara (MedBase) — Ronda 9 de correcciones

> Adjunto a este prompt **dos archivos**:
> 1. **clinara_correcciones_ronda_9.docx** (7 capturas): muestra el diseño actual de cada pantalla.
> 2. **Presentaciones_de_medicamentos.md**: es la **fuente de datos** del punto ME5 (Listado Nacional de Medicamentos Esenciales de Honduras con la presentación habitual de cada producto). Úsalo tal cual; no completes ni corrijas datos con tu memoria.
>
> Ábrelos los dos antes de empezar.

---

## 0. Contexto

Soy Emil, médico general en Honduras, y me encargo de la parte clínica de **Clinara** (también llamada MedBase), una aplicación web de gestión clínica desplegada en https://medbase-lac.vercel.app. La desarrollo con un amigo programador que no es del área médica. Esta es la **ronda 9**.

**Qué es Clinara.** Sistema para clínicas pequeñas y medianas y consultorios de Honduras. Pocos médicos, una recepcionista, enfermería y a veces laboratorio. Las soluciones deben ser simples, con pocas pantallas y pocos clics, en español de Honduras.

**Qué se hizo antes (una línea por ronda relevante).**
- **Ronda 6**: indicaciones y medicamentos que pasan de una nota a la siguiente con etiquetas Continúa / Nueva / Modificada / Omitida (MC7), signos vitales opcionales dentro de la nota (MC8), frecuencia de signos vitales (MC6), PRN (MC2).
- **Ronda 7**: arreglo del desborde de la ventana "Nota de evolución" (NE1, NE2).
- **Ronda 8**: Infusión (ME1) y primera dosis distinta en una sola orden (ME2), cuadro "Evolución" y diagnósticos que bajan de nota (NE3, NE4), formulario de medicamento sin recorte y fechas en `dd/mm/aaaa` con 24 horas (NE5), exámenes desplegables (EX1), órdenes imprimibles de exámenes externos (EX2), hoja de referencia (RF1), "Configuración" con tuerca (GE2). En las capturas de esta ronda ya se ven la opción de primera dosis distinta y el botón "Referencia".

**Esta ronda también carga el vademécum** con el Listado Nacional de Medicamentos Esenciales (ME5) y **amplía** ME2 (la primera dosis distinta también en consulta externa), NE5 (el formato de 24 horas **sigue sin cumplirse**, ver GE3), la nota de procedimiento (la separa en dos) y la regla "lo firmado no se edita" (GE4 agrega un periodo de gracia de 5 minutos). **Revisa el estado real del código antes de tocar cada cosa** para no duplicar funciones.

**Reglas generales (valen para todo):**

- **Dos modos**: **Clínica** (ej. "Clínica Santa Brígida") y **Consultorio** de médico independiente (ej. "Consultorio Dra. Ana López"). Todo lo de esta ronda aplica a los dos, salvo que diga otra cosa.
- **Roles**: recepción, enfermería, médico y administración; a futuro laboratorio e imágenes. Una persona puede tener varios roles.
- **Datos clínicos**: nada se borra de verdad (se archiva, se oculta o se anula), todo queda con autor, fecha y hora, y no se inventa nada. Lo firmado no se edita: se corrige con adenda o se anula y se emite otro. **Excepción nueva de esta ronda: GE4** (5 minutos, con versiones).
- **Formatos**: fechas `dd/mm/aaaa` (mantén el estilo de cada pantalla y no lo mezcles dentro de una misma pantalla), **hora de 24 horas siempre** (GE3), Lempiras (L), identidad `0000-0000-00000`, teléfonos `0000-0000`, impresión tamaño carta.
- **Firma**: una firma dibujada en pantalla no es la firma electrónica avanzada de la Ley sobre Firmas Electrónicas de Honduras. Todo documento que se entrega al paciente debe poder imprimirse con espacio para firma y sello en papel.
- **Privacidad**: el diagnóstico no sale en constancias ni en mensajes de WhatsApp salvo que el médico lo decida.
- **Conectividad**: el internet y la luz fallan. Lo que se escriba en formularios no debe perderse (mismo mecanismo de borrador/autoguardado que ya tienen las notas).
- **Valores clínicos y constantes** van en un solo archivo de configuración con el comentario `VALIDAR: Emil`.
- **Usuarios demo**: Roberto Aguilar (administración), Sofía Mejía (recepción), Lic. Carmen Ríos (enfermería), Aux. Karla Mendoza (auxiliar de enfermería), Dra. Lucía Herrera (medicina interna), Dr. Andrés Paz (pediatría), Dra. Mariela Zúñiga (ginecología y obstetricia), Dra. Ana López (consultorio), Dr. Daniel Fúnez Castillo (medicina general). **Los perfiles demo nunca se borran.** Esta ronda **no pide datos demo nuevos**: usa los pacientes que ya existen (hay hospitalizados y en observación).

**Advertencia sobre las capturas.** El texto que aparece dentro de mis capturas (diagnósticos, medicamentos, dosis, nombres de pacientes, indicaciones, notas) es **relleno** que escribí solo para generar las pantallas. No lo trates como requisito ni como error. Fíjate solo en el diseño, los campos, los botones, las etiquetas y el flujo.

### Mapa de capturas del Word (en orden de aparición)

| N.º | Pantalla | Punto |
|---|---|---|
| 1 | Hospitalizado › ventana "Nota de procedimiento": "Procedimiento realizado", "Fecha y hora del procedimiento" (en 12 h), "Nota" y la casilla "Procedimiento mayor (requiere autorización quirúrgica)" | PQ1, PQ2, GE3 |
| 2 | Consulta externa › bloque "Medicamentos · van a la receta" (Presentación y concentración, Dosis, Vía, Frecuencia, Total de días, Cantidad total, Indicaciones especiales, "Aplicar en la clínica"). **No tiene** la opción de primera dosis distinta | ME3 |
| 3 | Observación › "Nota de evolución" › formulario de medicamento **con** la casilla "La primera dosis es distinta" (lo que ya existe, ME2) y el campo "Primera dosis" en 12 h | ME3 (referencia), GE3 |
| 4 | Observación › "Nota de evolución" › formulario de medicamento: se ve el selector **Vía** (Intravenosa) y "Hora de la dosis" en 12 h | ME4, GE3 |
| 5 | Observación › Notas de evolución: la "Nota de egreso" se abre **dentro de la página**, debajo de la fila de botones (Nueva nota de evolución / Procedimiento / Autorización quirúrgica / Egreso / Pasar a hospitalización / Referencia) | EG1 (y PQ1: dónde va el botón nuevo) |
| 6 | Hospitalizado › "Nota de evolución" variante **SOAP**: "Signos vitales (opcional)" queda entre "S. Subjetivo" y "O. Objetivo" | NE6 |
| 7 | Hospitalizado › Medicamentos › ventana "Registrar administración" de un PRN: "Hora real" en 12 h con el selector del navegador | GE3, GE4 |

Las capturas 2 y 3 aparecen juntas en el Word, antes del párrafo del STAT: la 2 es la pantalla **sin** la opción y la 3 la que **ya la tiene**. Si alguna captura no corresponde a su punto, dímelo en el reporte y verifica tú el código.

---

## 1. Cómo quiero que trabajes

1. **Explora primero** el código de lo que toca esta ronda. No supongas el stack: léelo.
2. **Escribe `PLAN_RONDA9.md`** antes de programar: por cada punto (PQ1, PQ2, ME3…), los archivos, los cambios de base de datos, los componentes que vas a reutilizar o crear y las dependencias entre puntos. Pídeme confirmación **solo** si algo está bloqueado de verdad. Para todo lo demás usa los valores por defecto de la sección 6.
3. **Un commit por punto**, con el código en el mensaje: `[ronda9][EG1] Egreso en ventana encima`.
4. **Migraciones seguras**: no borres columnas ni registros. Ocultar o archivar. Todo cambio de datos se prueba primero sobre **una copia de la base** y debe ser **idempotente**. Debe servir en las bases de **todas** las clínicas y consultorios.
5. **Reutiliza componentes**: la ventana "Nota de evolución" (su estructura, columna derecha de órdenes, borrador, pie fijo), el formulario de medicamento, el buscador de diagnósticos CIE-11, la plantilla de impresión de la nota de evolución y de la epicrisis, el control "Rutina | Urgente". **No copies y pegues** formularios: si hay dos formularios de medicamento (consulta externa y notas), lo que agregues en esta ronda debe vivir en **una sola lógica compartida**.
6. **Permisos por rol y auditoría** (quién, qué, cuándo) en toda acción nueva. Verifica permisos también por URL directa.
7. **Verifica cada punto en el navegador** con el rol correcto, en escritorio (1920, 1366 y 1280 px de ancho) y a ~390 px, y corre typecheck, lint, pruebas y `build` al final de cada punto. Prueba GE3 además con el navegador configurado **en inglés** y en español.
8. Usa los textos exactos (botones, etiquetas) que pongo entre comillas. Cuando pido reutilizar una etiqueta que ya existe en la app (por ejemplo "La primera dosis es distinta"), usa **la que hoy tiene el código**, no la que escribí en la ronda 8.
9. **Datos externos**: no inventes valores, fuentes ni artículos de ley. Lo que no puedas respaldar, déjalo marcado y repórtalo.

---

## 2. Lo que NO se debe romper

Lo que ya funciona, o que dije que me gusta, y no se toca:

- **La tarjeta de la nota firmada en Notas de evolución** (dos columnas; a la derecha Indicaciones con las etiquetas Continúa / Nueva / Modificada / Omitida, Exámenes y Medicamentos). La nota postquirúrgica (PQ1) se parece a ella; no la alteres.
- **Cómo se agregan hoy los medicamentos** en la ventana de nota y en consulta externa: ME3 y ME4 **agregan** opciones, no reemplazan nada. Un medicamento normal (c/8h, dosis única, PRN, infusión, primera dosis distinta) se agrega igual que antes. **Las órdenes existentes no se convierten ni cambian**, incluidas las que usan la vía "Inhalada" (inhaladores): "Nebulización" es una vía nueva y aparte.
- **El vademécum que ya tiene cada clínica o consultorio**: los medicamentos que ya estaban, los que la clínica agregó y sus ediciones no se tocan ni se duplican (ME5 solo agrega). Escribir un medicamento a mano que no esté en el vademécum sigue permitido, con su aviso.
- **"Medicamentos activos" e "Indicaciones activas" con Cambiar y OMITIR**, y los estados de la hoja de medicamentos (Administrado, Toca ahora, Atrasado, Programado, No aplicada, Omitido).
- **La ventana "Nota de evolución"** (variantes Estándar y SOAP): solo cambia lo que diga NE6. Dos columnas, pie con "Cancelar" y "Firmar nota" siempre visible, sin desborde horizontal.
- **Los botones y el orden de la fila de acciones** (Nueva nota de evolución, Procedimiento, Autorización quirúrgica, Egreso, Pasar a hospitalización, Referencia): solo se agrega "Nota postquirúrgica" (PQ1). Su forma de abrirse (ventana encima) sí cambia en EG1.
- **El contenido y la lógica de la Nota de egreso** (secciones numeradas, borrador "Se guarda solo", cierre de la observación o de la hospitalización, receta de salida): EG1 cambia **dónde se abre**, no qué contiene ni qué hace.
- **"Autorización quirúrgica"** y todo lo que ya existe de autorizaciones con firma.
- **Notas firmadas anteriores a esta ronda**: se muestran igual. Una nota de procedimiento ya firmada con la casilla "Procedimiento mayor" **conserva** esa marca y su aspecto.
- **Todo lo firmado y los borradores**: lo escrito en un borrador sigue ahí al reabrir. No se pierde ningún borrador al aplicar los cambios de esta ronda.
- **Adenda y anulación**: siguen siendo la forma de corregir **después** del periodo de gracia (GE4).

---

## 3. Correcciones, una por una

Cada punto indica a qué modo aplica: **[C]** Clínica, **[K]** Consultorio, **[CK]** ambos.

Códigos de esta ronda: **PQ** nota postquirúrgica, **ME** medicamentos, **EG** egreso, **NE** nota de evolución, **GE** general.

---

### Grupo PQ — Nota postquirúrgica

#### PQ1 — Nueva "Nota postquirúrgica" (y la casilla "Procedimiento mayor" pasa a ella) [CK]

**Cómo está hoy (captura 1):** la ventana "Nota de procedimiento" tiene "Procedimiento realizado", "Fecha y hora del procedimiento", un cuadro "Nota" y la casilla **"Procedimiento mayor (requiere autorización quirúrgica)"**. Una nota de procedimiento **no tiene órdenes** (ni indicaciones, ni exámenes, ni medicamentos), así que después de una cirugía el médico no puede dejar las órdenes del posoperatorio en la misma nota.

**Qué quiero:** una nota nueva, **"Nota postquirúrgica"**, "más parecida a las notas de evolución", para las cirugías (procedimientos mayores). "El apartado que dice procedimiento mayor ya pasaría a la nota postquirúrgica."

1. **Botón.** "Nota postquirúrgica" en la fila de acciones de **Observación y Hospitalización**, justo **después de "Autorización quirúrgica"** (A6 de la sección 6), y en Consultorio donde hoy aparece "Procedimiento". Misma ventana que "Nota de evolución": se abre **encima** de la página, con encabezado "Nota postquirúrgica", cierre ✕, cuerpo que se desplaza y pie fijo con "Cancelar" y "Firmar nota". Reutiliza la estructura de la ventana de evolución (dos columnas; a ~390 px, una).
2. **Columna izquierda** (en este orden):
   - **"Diagnóstico preoperatorio"** (CIE-11, uno o varios, cada uno con ✕): precargado con los diagnósticos vigentes del paciente (misma cadena de NE4), editable. Obligatorio.
   - **"Diagnóstico postoperatorio"** (CIE-11, uno o varios): empieza vacío, con un botón pequeño **"Igual al preoperatorio"** que lo copia (editable después). Obligatorio.
   - **"Hora de inicio"** y **"Hora de cierre"**: fecha y hora de cada una, con el selector de **24 horas** de GE3, por defecto ahora. Validación: el cierre no puede ser anterior al inicio; ninguna puede estar en el futuro. Conserva el texto de ayuda que hoy tiene el campo de hora ("Si escribes la nota después del procedimiento, corrige la hora. La hora en que escribes la nota se guarda sola.").
   - **"Tipo de anestesia"**: selector obligatorio con las opciones: General, Raquídea, Epidural, Bloqueo regional, Local, Sedación, Otra (con un cuadro para especificar). La lista va en el archivo de configuración con `VALIDAR: Emil`.
   - **"Procedimiento realizado"**: texto, obligatorio (el mismo campo que hoy tiene la nota de procedimiento).
   - **"Descripción del procedimiento"**: cuadro de texto grande con micrófono de dictado, obligatorio. Mismo estilo que Examen físico y Observaciones de la nota de evolución (crece solo al escribir).
   - **Equipo quirúrgico**: ver PQ2.
3. **Columna derecha: igual que la de la nota de evolución**, reutilizada tal cual: "Set de órdenes", "Guardar estas órdenes como set", "Indicaciones" (con la frecuencia de signos vitales, "Indicaciones activas" con Cambiar y OMITIR y el campo de indicaciones nuevas), "Exámenes" con "Ordenar exámenes" y "Medicamentos" con su formulario completo (incluidas las opciones de ME1, ME2, ME3 y ME4). Todo lo que hoy hace en la nota de evolución lo hace aquí: pasa a la hoja de medicamentos, a la bandeja de enfermería, al checklist, y los exámenes externos generan su orden imprimible (EX2).
4. **No lleva** (porque no los pedí): Signos vitales, Examen físico ni Observaciones. Si quiero algo más, lo pido aparte (A7).
5. **La cadena de órdenes la incluye.** Como esta nota sí tiene órdenes, entra en la cadena de MC7 y NE4: las indicaciones, los medicamentos y la frecuencia de signos vitales **bajan** de la nota anterior a la postquirúrgica y de ella a la siguiente evolución; los diagnósticos vigentes que baja a la siguiente nota son los **postoperatorios**. Los exámenes no bajan (MC5). El egreso termina la cadena, como siempre.
6. **"Procedimiento mayor" pasa aquí.**
   - La casilla desaparece de la "Nota de procedimiento". Esa nota se queda **solo para procedimientos menores** (sin cambios, salvo el selector de 24 horas de GE3) y su texto de ayuda deja de hablar de "mayor".
   - Toda "Nota postquirúrgica" **es** un procedimiento mayor. **Averigua qué hace hoy la casilla** (si exige una autorización quirúrgica firmada antes de firmar, si solo pone una etiqueta, si crea algo) y **reproduce exactamente esa lógica** en la nota postquirúrgica, con los mismos mensajes. Dime en el reporte qué hacía.
   - Las notas ya firmadas y los **borradores** de procedimiento que tenían la casilla marcada no se pierden ni se convierten (ver "Lo que no se debe romper"). Propón en el plan cómo terminar un borrador así sin perder nada.
7. **Estados y firma**: Borrador (autoguardado) → **Firmada** (se corrige con adenda; ver GE4 para los primeros 5 minutos). Firmarla **no** hace egreso.
8. **Tarjeta en la lista de notas**: mismo estilo que la tarjeta de la nota de evolución (dos columnas, "Ver nota completa"), con una etiqueta "Nota postquirúrgica". Izquierda: Diagnóstico preoperatorio, Diagnóstico postoperatorio, "Inicio" y "Cierre" (con fecha y hora), Tipo de anestesia, Procedimiento realizado, Descripción del procedimiento y el Equipo quirúrgico (PQ2). Derecha: Indicaciones (con sus etiquetas), Exámenes y Medicamentos, como en la tarjeta de evolución.
9. **Impresión** en hoja carta, con membrete, datos del paciente (nombre, edad, sexo, expediente, identidad, alergias), todo lo anterior, nombre del médico que firma, especialidad, **número de colegiado** y espacio para firma y sello. Botones "Imprimir" y "Descargar PDF"; cada impresión queda registrada (como en las demás notas).
10. **Donde ya se listan procedimientos**, la nota postquirúrgica también aparece: epicrisis ("tratamiento recibido"), hoja de referencia (RF1) y "Ver nota completa". Verifica dónde se consultan hoy las notas de procedimiento y no la dejes fuera.
11. Disponible para **Médico** (crea y firma); Enfermería y Administración **ven e imprimen** (sección 4). En Consultorio, la médica.

**Errores de interfaz detectados (capturas 1 y 5):**
- En la captura 1 el cuadro "Escribe qué se hizo" queda **más abajo** que el campo de fecha y hora de su misma fila (la ayuda debajo de la fecha desalinea los dos). Alinéalos.
- En la captura 5 la frase "Procedimientos y egreso también son notas de evolución" quedará incompleta: actualízala para que incluya la nota postquirúrgica.

**Criterios de aceptación:**
- [ ] Como Dra. Lucía Herrera, en un hospitalizado veo "Nota postquirúrgica" después de "Autorización quirúrgica"; en observación también.
- [ ] Se abre como ventana encima, con los campos de la lista, en ese orden; a 390 px se apila sin desborde.
- [ ] No deja firmar sin diagnóstico preoperatorio, diagnóstico postoperatorio, tipo de anestesia, procedimiento realizado, descripción y cirujano principal; ni con cierre anterior al inicio ni con horas futuras.
- [ ] Agrego una indicación, un examen y un medicamento (incluida una nebulización y una primera dosis distinta): al firmar, pasan a la hoja de medicamentos, a la bandeja y al checklist de enfermería igual que desde una nota de evolución.
- [ ] La siguiente nota de evolución trae precargados los diagnósticos **postoperatorios**, las indicaciones y los medicamentos de la postquirúrgica.
- [ ] La "Nota de procedimiento" ya no tiene la casilla "Procedimiento mayor"; una nota antigua firmada con esa marca se ve igual que antes.
- [ ] La nota postquirúrgica cumple la misma regla de autorización quirúrgica que cumplía la casilla (el reporte dice cuál era).
- [ ] La tarjeta firmada se ve como la de evolución, con el equipo y las horas; "Ver nota completa" y la impresión carta traen todo, con colegiado y espacio para firma y sello.
- [ ] La nota aparece en la epicrisis y en la hoja de referencia donde se listan los procedimientos.
- [ ] Un borrador se conserva al cerrar y reabrir.
- [ ] Lic. Carmen Ríos (Enfermería) la ve e imprime pero no la crea; Sofía Mejía (Recepción) no la ve (también por URL directa).
- [ ] Funciona en Consultorio (Dra. Ana López).

#### PQ2 — Equipo quirúrgico en la nota postquirúrgica [CK]

**Cómo está hoy:** la nota de procedimiento no registra quién participó.

**Qué quiero:** "en esa nota tiene que llevar Cirujano principal, ayudante 1, ayudante 2, circular, instrumentista, anestesiólogo". Interpreto "esa nota" como la **nota postquirúrgica** (A1 de la sección 6; confírmalo conmigo si el código te sugiere otra lectura). La nota de procedimiento menor no cambia.

- Bloque **"Equipo quirúrgico"** en la columna izquierda, con seis campos y estas etiquetas exactas: **"Cirujano principal"**, **"Ayudante 1"**, **"Ayudante 2"**, **"Circular"**, **"Instrumentista"**, **"Anestesiólogo"**. En escritorio, en dos columnas dentro del bloque; a 390 px, una.
- Cada campo permite **elegir a una persona del personal de la clínica** (buscador por nombre; muestra nombre y rol) **o escribir un nombre** que no esté en el sistema (cirujanos y anestesiólogos visitantes son comunes). Se guarda como persona del sistema o como texto libre.
- Solo **"Cirujano principal"** es obligatorio; por defecto trae al médico que está escribiendo la nota (editable). Los demás son opcionales y los vacíos no se muestran en la tarjeta ni en la impresión.
- Orden y nombres iguales en el formulario, la tarjeta, "Ver nota completa" y la impresión.
- Queda en la bitácora quién participó (para poder consultarlo después).

**Criterios de aceptación:**
- [ ] El bloque tiene los seis campos con esas etiquetas y el orden indicado.
- [ ] Puedo elegir a Dra. Lucía Herrera como cirujano principal, a Lic. Carmen Ríos como circular y escribir a mano el nombre de un anestesiólogo visitante.
- [ ] Sin cirujano principal no deja firmar; con los demás vacíos sí.
- [ ] La tarjeta firmada y la impresión muestran solo los roles llenos, con su rol y su nombre.
- [ ] En Consultorio puedo escribir nombres a mano aunque no haya más personal.

---

### Grupo ME — Medicamentos

#### ME3 — La "primera dosis distinta" (STAT) también en consulta externa [CK]

**Cómo está hoy (capturas 2 y 3):** la opción para escribir **una sola orden** con primera dosis distinta (ME2, ronda 8: "2 g IM STAT y luego 1 g cada 12 horas") existe en el formulario de la ventana de nota (captura 3, casilla **"La primera dosis es distinta"** con su ayuda "Dosis de carga o STAT…"). El formulario de **consulta externa** (captura 2, "Medicamentos · van a la receta") **no la tiene**. Ojo: el campo "Primera dosis" que se ve en la captura 3 es la hora de inicio del esquema, **no** la dosis inicial; no los confundas.

**Qué quiero:** "si yo se lo quiero poner en consulta externa quiero que también tenga la opción de hacerlo así, en caso de ser necesario".

- En el formulario de consulta externa, la **misma casilla y los mismos campos** que ya existen en la nota (reutiliza la lógica; no la copies): debajo de "Frecuencia", la casilla (apagada por defecto) y, si la marco, la **dosis inicial** y el cambio de rótulo de "Dosis" a las dosis siguientes. Solo aparece cuando la frecuencia es repetitiva (cada X horas, diaria…), no con dosis única, infusión ni PRN, igual que en la nota. Conserva los campos "Presentación y concentración", "Cantidad total (opcional)" e "Indicaciones especiales" tal cual.
- **Una sola línea** en la lista del formulario, en la receta impresa y en cualquier otro lugar donde se muestre, con el mismo texto que ya genera ME2 (ej. `Ceftriaxona IM · 2 g STAT y luego 1 g c/12h`). Usa **el mismo generador de texto** que la nota para que nunca difieran.
- **Dos casos en consulta externa:**
  1. **Va a la receta** (casilla "Aplicar en la clínica" apagada): no hay hoja de medicamentos ni hora programada, así que **no se pide fecha y hora** de la dosis inicial; la receta dice el texto de arriba. "Cantidad total (opcional)" sigue siendo texto libre; **no la calcules automáticamente**.
  2. **"Aplicar en la clínica" marcada**: la orden va a la hoja de medicamentos y se comporta como en ME2 (dosis inicial a la hora indicada, por defecto ahora; las siguientes desde esa hora más el intervalo).
- **En todo lugar donde haya un formulario de medicamento** (consulta externa, receta de salida del egreso, observación, hospitalización, Consultorio, nota postquirúrgica) debe estar la misma opción; lista en el reporte cuáles formularios existen y cuáles usan el mismo componente (A9).
- Las recetas ya emitidas no cambian.

**Criterios de aceptación:**
- [ ] Como Dr. Daniel Fúnez, en una consulta externa, agrego un medicamento con frecuencia c/12h y marco la casilla: aparece la dosis inicial; escribo 2 g y 1 g; en la lista queda **una sola línea** con el texto de ME2.
- [ ] La receta impresa muestra esa misma línea.
- [ ] Con "Dosis única", "Infusión" o PRN la casilla no aparece.
- [ ] Con "Aplicar en la clínica" marcada, la hoja de medicamentos muestra la dosis inicial y las siguientes como en ME2.
- [ ] Sin marcar la casilla, el formulario se ve y funciona igual que antes.
- [ ] La opción existe en todos los formularios de medicamento que listé en el reporte.
- [ ] Probado a 390 px sin desborde y en Consultorio (Dra. Ana López).

#### ME4 — Vía "Nebulización", con varios medicamentos en una sola orden [CK]

**Cómo está hoy (captura 4):** el selector **Vía** no tiene "Nebulización", y cada orden lleva **un solo** medicamento. Para dejar una nebulización con dos o tres fármacos hay que escribir varias órdenes sueltas.

**Qué quiero:** "agregues el apartado de vía nebulización, y en ese se tiene que poder poner más de un medicamento en una nebulización". Lo normal es dejarla así: *"Nebulizar con: Salbutamol 3 ml + Bromuro de ipratropio 1 ml diluido en 3 ml de SSN 0.9% cada x horas"*. Quiero una forma inteligente de hacerlo, en **una sola orden**.

- En el selector **Vía**, agrega la opción **"Nebulización"** (en **todos** los formularios de medicamento, igual que ME3). No toques la vía "Inhalada" que ya existe.
- Al elegir "Nebulización", el formulario cambia: los campos de un solo medicamento ("Medicamento", "Dosis" y, en consulta externa, "Presentación y concentración") se reemplazan por un bloque **"Nebulizar con:"**:
  - Una lista de **componentes**; cada fila tiene **"Medicamento"** (busca en el vademécum o se escribe, con el mismo aviso "No está en el vademécum" y, si hoy existe, la alerta de alergia del paciente **aplicada a cada componente**) y **"Cantidad"** (texto libre, ej. "3 mL"), más un ✕ para quitar la fila.
  - Botón **"+ Agregar otro medicamento"**. Empieza con una fila. Mínimo uno; máximo 5 (valor en la configuración, `VALIDAR: Emil`).
  - Un renglón opcional **"Diluir en"**: volumen (ej. "3 mL") y diluyente (selector: "SSN 0.9%", "Agua estéril", "Otro" con cuadro para escribir). La lista de diluyentes va en el archivo de configuración con `VALIDAR: Emil`.
- Siguen igual: **Frecuencia** (cada X horas, dosis única, PRN, etc.), "Hora de la dosis" (24 h, GE3), "Total de días", "Indicaciones" (ej. "con oxígeno") y, en consulta externa, "Cantidad total" y "Aplicar en la clínica".
- Con nebulización **no** se ofrecen "Infusión" ni "La primera dosis es distinta" (no tienen sentido aquí; A10).
- **Texto de la orden** (una sola línea en todas partes: lista del formulario, tarjeta de la nota, "Medicamentos activos", "Ver nota completa", receta, hoja de enfermería): `Nebulizar con: Salbutamol 3 mL + Bromuro de ipratropio 1 mL, diluido en 3 mL de SSN 0.9% · c/6h`. Sin diluyente, se omite "diluido en…". La frecuencia se escribe con el mismo generador que ya usan los demás medicamentos.
- **Una orden, un Cambiar, un OMITIR.** Cambiar edita la nebulización completa (cierra la anterior y crea la nueva, como ya funciona); OMITIR suspende toda la orden.
- **Hoja de medicamentos (enfermería):** la nebulización se programa como cualquier medicamento de frecuencia fija o PRN. Cada casilla de hora es **una sesión**: se registra **una sola administración** para todos los componentes, no una por componente. La ventana "Registrar administración" muestra el título "Nebulización" y la lista de componentes con sus cantidades, y guarda la composición que se aplicó en esa sesión.
- **Receta** (consulta externa): imprime la línea `Nebulizar con: …`.
- Las órdenes existentes no cambian.

**Criterios de aceptación:**
- [ ] "Nebulización" aparece en Vía en el formulario de consulta externa y en el de las notas.
- [ ] Al elegirla veo "Nebulizar con:" con una fila; agrego una segunda y escribo Salbutamol 3 mL + Bromuro de ipratropio 1 mL, diluido en 3 mL de SSN 0.9%, c/6h: queda **una sola línea** con el texto de arriba.
- [ ] No deja agregar sin al menos un componente con nombre y cantidad.
- [ ] La hoja de enfermería muestra una casilla por sesión; "Registrar administración" muestra los componentes y registra **una** administración.
- [ ] "Medicamentos activos" muestra una línea con un Cambiar y un OMITIR; Cambiar permite editar los componentes; OMITIR suspende todo.
- [ ] La receta impresa trae la línea de nebulización.
- [ ] Con Vía "Nebulización" no aparecen "Infusión" ni "La primera dosis es distinta".
- [ ] Un medicamento con vía "Inhalada" o cualquier otro se agrega igual que antes.
- [ ] Probado a 390 px sin desborde, como Dra. Lucía Herrera, Lic. Carmen Ríos (registrar) y Dra. Ana López (consultorio).

#### ME5 — Cargar el Listado Nacional de Medicamentos Esenciales (LNME) al vademécum [CK]

**Cómo está hoy (capturas 2, 3 y 4):** los formularios de medicamento buscan en el vademécum ("Busca en el vademécum por nombre genérico o comercial", "Busca en el vademécum o escríbelo") y avisan "No está en el vademécum de la clínica" cuando no lo encuentran. **No sé cuántos medicamentos trae hoy cada clínica**: averígualo y dímelo en el reporte.

**Qué quiero:** que el vademécum incluya los medicamentos del **Listado Nacional de Medicamentos Esenciales** de Honduras, que son los del archivo adjunto **`Presentaciones_de_medicamentos.md`**.

1. **Fuente.** El archivo es el LNME 2023 de la Secretaría de Salud (Acuerdo Ministerial 5230-2023), con la **presentación habitual** de cada producto (ej. "Ampolla 8 mg/2 ml", "Tableta 500 mg", "Frasco 120 ml (120 mg/5 ml)"). Tiene 33 grupos terapéuticos (Anestésicos, Anticonvulsivantes, Antiinfecciosos, Tracto respiratorio, etc.) y filas numeradas con las columnas: **#, Medicamento, Presentación habitual, Forma farmacéutica, Vía, Envase primario**. Fuentes oficiales, **solo para cotejar** (no para completar ni corregir datos): [OMS, "Honduras: LNME 2023"](https://www.who.int/publications/m/item/honduras--listado-nacional-de-medicamentos-esenciales-lnme-2018-(spanish)) y [Biblioteca Virtual en Salud de Honduras](https://honduras.bvsalud.org/wp-content/uploads/2024/04/Listado-Nacional-de-Medicamentos-Esenciales.pdf).
2. **Carga con un script que lea el archivo** (no copies a mano). Deja el `.md` en el repositorio como fuente (por ejemplo en `data/`). Debe ser **idempotente** (correrla dos veces no cambia nada), servir en las bases de **todas** las clínicas y consultorios, y que **toda clínica o consultorio nuevo nazca con el listado ya cargado**. Quedó garantizada en producción: si hace falta un paso manual, dime exactamente cuál. Pruébala primero sobre **una copia de la base**.
3. **Qué se guarda por medicamento** (todo sale de las columnas del archivo; no inventes nada):
   - **Nombre** (columna "Medicamento"), **sin** los símbolos ni las anotaciones de formato: `*(Lista complementaria)*`, `*(Lista compl.)*`, `*(uso exclusivo oncología)*` y similares **no** van dentro del nombre.
   - **Presentación** (columna "Presentación habitual"), sin negritas ni símbolos ✔️ / ⚠️.
   - **Forma farmacéutica**, **vía(s)** y **envase primario**.
   - **Grupo terapéutico** y subgrupo (los encabezados `##` y `###` del archivo, ej. "1. Anestésicos › 1.3 Anestésicos locales").
   - **Número del LNME** (columna "#").
   - **Lista complementaria**: sí/no (cuando el nombre trae esa anotación; son unos 59 productos).
   - **Restricción de uso**: el texto de la anotación cuando existe (ej. "uso exclusivo oncología"), conservado tal cual.
   - **Certeza de la presentación**: ✔️ = confirmada, ⚠️ = por confirmar con farmacia (unos 10), sin símbolo = sin marca. El encabezado del archivo explica que las presentaciones varían según laboratorio y licitación.
   - **Origen**: "LNME Honduras 2023 (AM 5230-2023)".
   - Las líneas "Ver también" **no** se cargan (son referencias entre filas).
   - Si la presentación trae "(también …)", guarda el texto completo y, aparte, la parte principal y las alternativas **solo cuando el patrón sea exacto**; si no, deja el texto completo sin dividir.
4. **No dupliques lo que ya existe.** Empareja cada fila con el vademécum actual (sin tildes ni mayúsculas, nombre + presentación) y busca sinónimos y nombres usados en Honduras (por ejemplo acetaminofén/paracetamol, epinefrina/adrenalina). Si ya existe: **conserva sus datos** (no los pises), agrégale el número y la etiqueta LNME y guarda el nombre del listado como **alias de búsqueda**. Si hay duda, **no unas**: lístalo en el reporte. Lo que no exista se crea.
5. **Qué ve el médico.**
   - La búsqueda encuentra por nombre y por alias y muestra nombre y presentación. Etiquetas pequeñas: **"LNME"**, **"Lista complementaria"** cuando aplique y un icono de advertencia **"Presentación por confirmar con farmacia"** en las marcadas ⚠️. La restricción de uso se muestra como texto de ayuda; **no bloquea**.
   - Al elegir un medicamento, el formulario se comporta como con cualquier otro del vademécum: la presentación llena el campo que hoy corresponde (en consulta externa, "Presentación y concentración"). Si hay alternativas ("también …"), precarga la principal y muestra "También: …" como sugerencia. Siempre editable.
   - Si hoy el formulario precarga la **vía** al elegir un medicamento, mapea la vía del listado a las vías del formulario (IV → Intravenosa, IM → Intramuscular, SC → Subcutánea, etc.); si el listado trae **varias vías** o no hay equivalente, no precargues. Para las soluciones "para nebulizar" (ej. #525 Salbutamol y #529 Ipratropio, vía "Inhalación oral") la vía correcta es **"Nebulización"** (ME4); los inhaladores van como "Inhalada". Si hoy no se precarga la vía, **no lo agregues**.
   - **Salbutamol solución para nebulizar** e **Ipratropio solución para nebulizar** deben poder elegirse como componentes de una nebulización (ME4).
6. **El listado no limita.** El médico puede seguir escribiendo cualquier medicamento, y el aviso "No está en el vademécum de la clínica" se mantiene para lo que no esté.
7. **Administración** (en Consultorio, la médica titular) puede **editar la presentación**, **archivar** (ocultar) cualquier medicamento del listado que su clínica no use y agregar los propios. Nada se borra. Un medicamento **editado o archivado por la clínica no se vuelve a pisar ni a reactivar** en cargas futuras (queda con origen "Editado por la clínica"). Si el vademécum tiene una pantalla en Configuración, ahí van estas acciones; si no existe, dime dónde se administra hoy y no inventes una pantalla grande.
8. **Lo ya escrito no cambia**: notas, recetas y órdenes existentes, y los medicamentos escritos a mano, se quedan como están.
9. **Revisa el propio archivo antes de cargar.** El archivo trae **530 filas numeradas** (una por producto, sin repetidos) y su encabezado explica que los otros **60 renglones** de los 590 del PDF son duplicados exactos que el LNME repite en otra sección (por eso faltan esos números). Yo ya conté las filas y coinciden. Aun así, **verifica con tu script**: 530 filas únicas, 6 columnas en todas, y reporta cualquier fila con la presentación vacía, nombre cortado o duplicado exacto. No agregues productos que el archivo no trae.
10. **Lo que no pude verificar** (para que lo valide yo): no confirmé que esta sea la edición **vigente** hoy (encontré la de 2023, presentada por la OPS en enero de 2024), no encontré términos de uso del documento, y no verifiqué si el listado es obligatorio para clínicas privadas; por eso **solo se ofrece**, no se impone. Las presentaciones ⚠️ quedan marcadas hasta que la farmacia las confirme.

**Criterios de aceptación:**
- [ ] El script lee el `.md` y carga las 530 filas (menos las que emparejen con medicamentos que ya existían); el reporte dice cuántas se crearon, cuántas se emparejaron y cuántas quedaron en duda.
- [ ] Corre dos veces sin cambiar nada la segunda vez; probado sobre una copia de la base; una clínica **nueva** y un consultorio **nuevo** nacen con el listado.
- [ ] Busco "Aciclovir" y salen las tres presentaciones del archivo (suspensión, IV, tableta) con su presentación.
- [ ] Busco "Paracetamol" y "Acetaminofén": ambos encuentran el mismo medicamento, sin duplicados.
- [ ] Un medicamento que la clínica ya tenía conserva sus datos y solo gana la etiqueta "LNME".
- [ ] Una fila marcada ⚠️ muestra "Presentación por confirmar con farmacia"; una con "Lista complementaria" muestra esa etiqueta; ninguna anotación de formato queda dentro del nombre ni de la presentación.
- [ ] En consulta externa elijo "Ceftriaxona": la presentación llena "Presentación y concentración" y puedo editarla; una presentación con "(también …)" muestra la sugerencia "También: …".
- [ ] En una nota, en una nebulización (ME4), elijo "Salbutamol solución para nebulizar" e "Ipratropio solución para nebulizar" como componentes.
- [ ] Escribo a mano un medicamento fuera del listado: sigue permitido, con su aviso.
- [ ] Como Roberto Aguilar archivo un medicamento del listado: deja de salir en la búsqueda, no se borra, y una nueva corrida de la carga no lo reactiva.
- [ ] Las notas, recetas y órdenes existentes no cambiaron.
- [ ] El reporte trae el conteo del archivo (530 filas únicas) y cuántos medicamentos tenía cada vademécum antes.

---

### Grupo EG — Egreso

#### EG1 — El egreso (y las demás acciones que hoy se abren dentro de la página) pasan a ventana encima [CK]

**Cómo está hoy (captura 5):** al pulsar **"Egreso"** en Observación (y en Hospitalización), la "Nota de egreso" aparece **dentro de la página**, debajo de la fila de botones y empujando todo hacia abajo, mientras que "Nueva nota de evolución" se abre como ventana encima.

**Qué quiero:** "si se le da a evolución que sale en pestaña encima, entonces el egreso también que popee en una ventana encima. Mantén el orden que ya llevas."

- "Egreso" abre la "Nota de egreso" en **una ventana encima de la página**, con la **misma estructura que "Nota de evolución"**: encabezado con el título, cierre ✕, cuerpo que se desplaza, **pie fijo** con los botones de hoy, sin desborde horizontal (NE1, NE5). A ~390 px ocupa la pantalla completa.
- **El contenido no cambia**: el aviso ("Al guardarla se cierra la observación y el paciente sale de la lista…"), las secciones numeradas, los campos, el borrador "Se guarda solo" y los **textos y la lógica** del botón que hoy guarda el egreso. Solo cambia **dónde** se muestra.
- **Borrador**: cerrar la ventana (✕ o "Cancelar") **no pierde** lo escrito; al volver a pulsar "Egreso" se reabre el borrador. Si hoy un borrador de egreso aparece en la lista de notas, muestra el borrador igual que se muestra el de una nota de evolución.
- Al firmar o guardar, la ventana se cierra y el egreso queda en la lista de notas como hoy, con las mismas consecuencias (sale de la lista, receta de salida si hay medicamentos).
- Aplica en **Observación, Hospitalización y Consultorio**, y también cuando se llega al egreso desde otro flujo (por ejemplo el aviso "¿Registrar el egreso?" de la referencia, RF1).
- **También pasan a ventana** "Referencia", "Autorización quirúrgica" y "Pasar a hospitalización", **si hoy se abren dentro de la página** (A11, confirmado por Emil). Misma estructura que la ventana de evolución y de egreso; su **contenido y su lógica no cambian** (borrador, firma, adenda, anulación). Las que ya se abran en ventana no se tocan. Dime en el reporte cómo se abría cada una antes y cómo quedó.

**Criterios de aceptación:**
- [ ] Como Dr. Daniel Fúnez, en un paciente en observación pulso "Egreso" y se abre una ventana encima; la página de atrás no cambia de tamaño ni se desplaza.
- [ ] La ventana tiene ✕, cuerpo con desplazamiento y pie fijo; no hay barra horizontal a 1920, 1366, 1280 ni 390 px.
- [ ] Escribo en la historia de la enfermedad actual, cierro con ✕ y vuelvo a pulsar "Egreso": lo escrito sigue ahí.
- [ ] Guardo el egreso: la ventana se cierra, el paciente sale de la lista como antes y, si hay medicamentos al alta, se emite la receta de salida como antes.
- [ ] Funciona igual en Hospitalización y en Consultorio.
- [ ] "Referencia", "Autorización quirúrgica" y "Pasar a hospitalización" se abren como ventana encima, igual que el egreso, sin perder borradores ni cambiar su contenido (el reporte dice cómo se abría cada una antes).

---

### Grupo NE — Nota de evolución

#### NE6 — En SOAP, los signos vitales van arriba [CK]

**Cómo está hoy (captura 6):** en la variante **SOAP**, el bloque "Signos vitales (opcional)" con su botón "+ Agregar signos vitales" queda **en medio**, entre "S. Subjetivo" y "O. Objetivo".

**Qué quiero:** "en las hojas de evolución tipo SOAP, quiero que los signos vitales estén arriba, no en medio de eso".

- En SOAP, "Signos vitales (opcional)" pasa a ser **el primer bloque de la columna izquierda**, antes de "S. Subjetivo". Después van, en el mismo orden de hoy, S. Subjetivo, O. Objetivo, A. Análisis y P. Plan.
- El bloque funciona **igual** (opcional, mismos campos y validaciones, mismo registro en la pestaña Signos vitales y en la curva térmica; MC8). Solo cambia su posición.
- La variante **Estándar no cambia**.
- El campo "Diagnósticos" no se ve en la captura de SOAP: NE4 (ronda 8) pidió que existiera y se precargara también en SOAP. **Verifica dónde está** y déjalo donde está; dime en el reporte dónde queda.
- La tarjeta de la nota firmada y la impresión de una nota SOAP muestran los signos vitales **en la misma posición nueva** (arriba), si hoy los muestran dentro de la nota.

**Errores de interfaz detectados (captura 6):**
- El texto "Enfermería recibe los pendientes en su bandeja (los externos no)" bajo "Exámenes": desde EX2 los externos generan una orden imprimible. **Solo repórtalo**; no lo cambies sin preguntarme.

**Criterios de aceptación:**
- [ ] En una nota SOAP, "Signos vitales (opcional)" aparece arriba de "S. Subjetivo".
- [ ] El orden después de eso es S, O, A, P, como antes.
- [ ] Agrego signos vitales y firmo: aparecen en la tarjeta, en la pestaña Signos vitales y en la curva térmica, como antes.
- [ ] En la variante Estándar nada cambió.
- [ ] A 390 px el bloque sigue arriba y no hay desborde.

---

### Grupo GE — General

#### GE3 — Fecha y hora siempre en 24 horas; el selector de hora no tiene AM/PM [CK]

**Cómo está hoy (capturas 1, 3, 4 y 7):** los campos de fecha y hora ("Fecha y hora del procedimiento", "Primera dosis", "Hora de la dosis", "Hora real" del registro de administración) muestran `11/02/2026 08:14 PM`: **mes/día/año y 12 horas con AM/PM**, y al pulsar el icono se abre el selector del navegador, también en 12 horas. Hoy es 2 de noviembre; con ese formato no se sabe si dice 2 de noviembre o 11 de febrero. En la ronda 8 (NE5) ya pedí `dd/mm/aaaa` y 24 horas para el formulario de medicamento y **no se cumplió**. El resto de la app ya muestra 24 horas ("Ingresó 2 nov, 20:03"), así que además está inconsistente.

**Qué quiero:** "aquí siempre quiero que sea en formato 24 horas, y que si le doy a cambiar hora, sea en formato 24 horas; no existe PM ni AM".

1. **Averigua la causa.** Lo probable es que se use un campo nativo del navegador (`datetime-local`, `time` o `date`), que muestra el formato según el idioma del navegador o del sistema y **no se puede forzar a 24 horas desde la aplicación**. Dime en el reporte qué era y por qué la ronda 8 no lo resolvió.
2. **Un solo componente de fecha y hora** para toda la aplicación, que **no dependa del navegador ni del idioma**:
   - Fecha escrita como `dd/mm/aaaa` (con máscara y validación) y un botón de calendario en español.
   - Hora como `HH:mm` en 24 horas (00:00 a 23:59): escribible, o con dos selectores/flechas de hora y minutos. **Sin AM/PM en ningún lado**, tampoco en el selector que se abre al "cambiar la hora".
   - Un botón **"Ahora"** que pone la fecha y hora actuales.
   - Respeta las reglas que cada campo ya tiene (no permitir futuro, mínimos y máximos, obligatorio, el valor por defecto de hoy). Mismo tamaño táctil mínimo (44 px) a ~390 px.
   - Zona horaria **America/Tegucigalpa** (UTC−6, sin horario de verano) para mostrar y guardar; no debe haber corrimientos de hora al guardar y reabrir.
3. **Reemplázalo en todos los lugares**, no solo en los de las capturas: notas (ingreso, evolución, procedimiento, postquirúrgica, egreso, referencia), formulario de medicamento (hora de la dosis, primera dosis, hora de inicio de infusión, dosis inicial), registro de administración, signos vitales, exámenes (toma de muestra, resultados), agenda y citas, preclínica, ingresos y egresos, caja y filtros de fecha de reportes. Busca en el código todo `datetime-local`, `type="time"`, `type="date"` y todo formato de hora que use `hour12`, `AM`/`PM` o el idioma del navegador.
4. **Salidas también en 24 horas**: pantallas, tarjetas, impresiones, PDF, mensajes de WhatsApp y exportaciones.
5. **Que no vuelva a pasar**: agrega una prueba automática o regla de lint que falle el `build` si alguien vuelve a usar un campo nativo de fecha/hora o un formato de 12 horas.

**Criterios de aceptación:**
- [ ] Con el navegador en **inglés (Estados Unidos)**, y también en español, el campo "Hora real" de "Registrar administración" muestra `02/11/2026 20:14` (no `11/02/2026 08:14 PM`).
- [ ] Al pulsar "cambiar hora" no existe AM ni PM; elijo 20 y 14 y queda 20:14.
- [ ] Lo mismo en "Fecha y hora del procedimiento", "Hora de inicio" y "Hora de cierre" (PQ1), "Primera dosis", "Hora de la dosis", hora de inicio de la infusión y dosis inicial.
- [ ] Escribo `31/10/2026` y `23:05` a mano y se guarda bien; escribo `31/02/2026` y me avisa que no es una fecha válida.
- [ ] Guardo y reabro: la hora es la misma (sin corrimientos).
- [ ] No queda ningún campo nativo de fecha/hora ni formato de 12 horas en el código (el reporte lista los que encontró y reemplazó).
- [ ] Una impresión y un PDF de una nota muestran la hora en 24 horas.
- [ ] A 390 px se usa con el dedo.

**Error de interfaz detectado (captura 1):** la tarjeta del usuario de la Dra. Herrera dice "Vista de médico", mientras que en las capturas 3 a 7 (Dr. Fúnez) dice "Médico". GE2 (ronda 8) pidió solo el nombre del rol. Verifica en el código por qué sale distinto en ese usuario y repórtalo.

#### GE4 — Periodo de gracia de 5 minutos para corregir un error, con versiones [CK]

**Cómo está hoy:** lo firmado o registrado no se puede editar; se corrige con adenda o se anula y se emite otro. Eso es correcto para el expediente, pero **un error de dedo apenas firmado** (una hora mal, una dosis mal) obliga a hacer una adenda o una anulación.

**Qué quiero:** "de forma general, que las notas, la administración de medicamentos y todo se puedan modificar en caso de un error durante un periodo de gracia de 5 minutos, y que se pueda guardar una nueva versión dentro de ese periodo".

**Esto cambia una regla del sistema** ("lo firmado no se edita"). Por eso nada se sobrescribe: cada corrección es una **versión nueva** y las anteriores se conservan.

1. **Qué es el periodo de gracia.** Desde el momento en que el autor **firma** una nota o **registra** algo, tiene **5 minutos** para usar un botón **"Corregir"**. Guardar la corrección crea la **versión 2** (y así sucesivamente: puede guardar varias versiones dentro de los 5 minutos). Pasado el tiempo, el botón desaparece y se corrige como hasta hoy (adenda o anulación).
2. **Quién y cuándo.**
   - Solo el **autor** (la persona que firmó o registró) puede corregir; no Administración ni otro médico.
   - Los 5 minutos se cuentan desde la **primera** firma o registro y **no se reinician** con cada versión (A14).
   - La hora la decide el **servidor**, no el reloj del navegador. El valor (5) va en el archivo de configuración con `VALIDAR: Emil`.
   - Junto al botón se muestra "Corregible hasta HH:mm" (24 horas). El botón desaparece solo al vencer, sin recargar. Si el médico tenía el formulario abierto y el tiempo vence, **el servidor rechaza el guardado, el texto escrito no se pierde** (queda como borrador) y se le ofrece pasarlo a una adenda.
3. **A qué aplica** (revisa el código y escribe en `PLAN_RONDA9.md` la lista final de tipos de registro con su decisión):
   - **Notas**: ingreso, consulta externa, evolución, procedimiento, postquirúrgica, egreso, notas de enfermería y la hoja de referencia (RF1).
   - **Administración de medicamentos**: registrar, "No aplicada", "Omitido", inicio y suspensión de infusión, nebulización.
   - **Signos vitales** y **preclínica**.
   - **Exámenes**: toma de muestra, carga de resultados e informes.
   - **Recetas, constancias y órdenes** emitidas.
   - **No aplica** (exclusiones, A14): **pagos y caja** (tienen su propia anulación), **autorizaciones y consentimientos con firma del paciente** (la firma es evidencia y no se toca), la agenda (no es un registro firmado) y las **anulaciones** ya hechas.
4. **Cuando lo corregido ya tuvo consecuencias**, protégelo:
   - Un **medicamento ya administrado** o un **examen con muestra tomada** (u otra orden que alguien ya cumplió) **no se puede quitar ni cambiar** dentro de la nota; ese renglón aparece bloqueado con el texto "Ya fue administrado por [nombre] a las HH:mm. Corrígelo con una adenda.". El resto de la nota sí se corrige.
   - Lo que **no** se ha cumplido sí se actualiza: si se corrige un medicamento aún no administrado, la hoja de medicamentos se actualiza; si se quita un examen sin muestra tomada, se cancela su pedido; los avisos programados aún no enviados se ajustan.
   - **Documentos ya impresos, descargados o enviados** (receta, orden de exámenes, referencia, constancia): **no se corrigen** dentro del periodo de gracia (Emil lo confirmó, A14). Los renglones que alimentan un documento ya impreso (los medicamentos de una receta impresa, los exámenes externos de una orden impresa) quedan **bloqueados** igual que los ya cumplidos, con el texto "Ya se imprimió [documento]. Corrígelo con una adenda."; el resto de la nota sí se corrige. Una hoja de referencia ya impresa se bloquea completa. Si el documento **no** se ha impreso, descargado ni enviado, sí se corrige. El estado "impreso" sale del registro de impresiones que ya existe.
   - **Egreso**: se puede corregir el **contenido**; la estancia **no se reabre**. Si la corrección cambia los medicamentos al alta, la receta de salida se regenera como versión nueva. Si no puedes hacerlo de forma segura, **exclúyelo y repórtalo** en lugar de dejarlo a medias.
   - La cadena de órdenes (MC7, NE4) siempre lee la **última versión** de la última nota.
5. **Versiones.**
   - Cada versión guarda el contenido completo, el autor, la fecha y hora y, opcional, un **"Motivo de la corrección"** (campo corto).
   - Lo que se ve y se imprime es la **última versión**, con una etiqueta discreta **"Corregida · v2"** (junto a "Firmada por…") y un enlace **"Ver versiones"** que muestra las anteriores en solo lectura, para quien ya tiene permiso de ver ese registro. Si hay una sola versión, no aparece nada nuevo.
   - Las versiones anteriores **nunca se borran**. Cada corrección queda en la bitácora con quién, cuándo y qué cambió.
   - Cada versión queda firmada por el autor (con su sesión; no pidas otra firma).
6. **Después de los 5 minutos**: nada cambia respecto a hoy (adenda o anulación).
7. **Formularios de corrección**: el botón "Corregir" abre el mismo formulario del registro, ya llenado, con el pie "Cancelar" y "Guardar corrección". No inventes pantallas nuevas.

**Criterios de aceptación:**
- [ ] Firmo una nota de evolución como Dr. Daniel Fúnez: veo "Corregir" y "Corregible hasta HH:mm"; corrijo un dato y guardo: la nota muestra "Corregida · v2" y "Ver versiones" muestra la versión 1 intacta.
- [ ] Guardo una tercera corrección dentro de los 5 minutos: queda v3. A los 5 minutos de la **primera** firma el botón desaparece sin recargar.
- [ ] Con el formulario abierto, dejo pasar los 5 minutos y guardo: el servidor lo rechaza, no pierdo el texto y se me ofrece hacer una adenda.
- [ ] Como Lic. Carmen Ríos registro una administración con la hora equivocada y la corrijo dentro de los 5 minutos: la hoja de medicamentos muestra la hora corregida y el estado (Administrado, Atrasado…) se recalcula; la versión anterior queda en el historial.
- [ ] Otro usuario (por ejemplo Dra. Lucía Herrera sobre la nota del Dr. Fúnez, o Administración) **no** ve "Corregir" ni puede hacerlo por URL directa.
- [ ] En una nota con un medicamento que enfermería ya administró, ese renglón sale bloqueado con su explicación y el resto de la nota se corrige.
- [ ] Una receta ya impresa: sus medicamentos salen bloqueados con "Ya se imprimió la receta. Corrígelo con una adenda."; en una receta aún no impresa, la corrección sí se permite.
- [ ] Pagos, caja y firmas de pacientes no muestran "Corregir".
- [ ] Todo queda en la bitácora; después de los 5 minutos, la adenda funciona como hoy.
- [ ] Funciona en Consultorio (Dra. Ana López).

---

## 4. Permisos de lo nuevo

✔ puede, ○ solo ve, — no tiene acceso. En Consultorio, la médica titular tiene los permisos de Médico y de Administración del consultorio.

| Función | Recepción | Enfermería | Médico | Administración |
|---|---|---|---|---|
| Crear y firmar "Nota postquirúrgica" y equipo quirúrgico (PQ1, PQ2) | — | — | ✔ | — |
| Ver e imprimir "Nota postquirúrgica" (PQ1) | — | ✔ | ✔ | ○ |
| Primera dosis distinta en consulta externa (ME3) | — | — | ✔ | — |
| Indicar nebulización (ME4) | — | — | ✔ | — |
| Registrar la administración de una nebulización (ME4) | — | ✔ | ✔ en Consultorio | — |
| Ver y usar el vademécum con el LNME (ME5) | — | — | ✔ | ○ |
| Editar, archivar o agregar medicamentos del vademécum (ME5) | — | — | ✔ en Consultorio | ✔ |
| Ejecutar la carga del LNME (ME5; queda en bitácora) | — | — | — | solo el equipo técnico |
| "Egreso" en ventana (EG1) | — | — | ✔ (mismo permiso que hoy) | — |
| Signos vitales arriba en SOAP (NE6) | — | — | ✔ | — |
| Selector de fecha y hora de 24 h (GE3) | ✔ | ✔ | ✔ | ✔ |
| "Corregir" dentro de los 5 minutos (GE4) | — (no registra datos clínicos) | ✔ solo lo que ella misma registró | ✔ solo lo que él mismo firmó | — |
| Ver versiones anteriores (GE4) | — | ✔ (donde ya ve el registro) | ✔ | ✔ (bitácora) |

---

## 5. Orden de implementación sugerido

De lo rápido y aislado a lo grande. Lo que depende de otro punto va después.

1. **GE3** primero: el componente de fecha y hora lo usan casi todos los demás puntos (PQ1, ME3, ME4, GE4).
2. **NE6** (rápido y aislado).
3. **EG1** (reutiliza la estructura de la ventana de evolución).
4. **ME3** (extiende ME2 al formulario de consulta externa) → **ME4** (agrega componentes al mismo formulario) → **ME5** (carga del LNME; sirve para probar la nebulización con salbutamol e ipratropio).
5. **PQ1 → PQ2** (usa GE3, ME3, ME4 y la ventana de evolución; PQ2 es el bloque del equipo dentro de PQ1).
6. **GE4** al final: toca todos los tipos de registro, incluidos los nuevos de esta ronda (la nota postquirúrgica, la nebulización y el egreso en ventana).

No hay datos demo en esta ronda.

---

## 6. Ambigüedades y valores por defecto

Decisiones que tomé porque no las especifiqué. Usa estas y lístalas en el reporte para que yo las confirme. Ya confirmados por Emil: **A1** (equipo solo en postquirúrgica), **A9** (se deja "STAT"), **A11** y **A14** (impresos bloqueados). Quedan por confirmar, sobre todo **A3** y **A16**.

| Cód. | Tema | Valor por defecto |
|---|---|---|
| A1 | PQ2 "en esa nota de procedimiento" | **Confirmado por Emil.** Se refiere a la **nota postquirúrgica**. El equipo quirúrgico va solo ahí; la nota de procedimiento menor no lo lleva. |
| A2 | PQ1 qué pasa con la nota de procedimiento | Se queda para procedimientos **menores**, sin casilla "Procedimiento mayor" y sin órdenes. Lo que ya está firmado no cambia. |
| A3 | PQ1 diagnósticos | Preoperatorio precargado de los diagnósticos vigentes (editable); postoperatorio vacío con botón "Igual al preoperatorio"; los dos obligatorios. |
| A4 | PQ1 tipo de anestesia | Lista: General, Raquídea, Epidural, Bloqueo regional, Local, Sedación, Otra (especificar). En el archivo de configuración, `VALIDAR: Emil`. |
| A5 | PQ2 equipo | Solo "Cirujano principal" es obligatorio (por defecto, quien escribe la nota). Cada campo acepta una persona del sistema o un nombre escrito a mano. |
| A6 | PQ1 dónde aparece | Después de "Autorización quirúrgica" en la fila de acciones, en Observación, Hospitalización y Consultorio; no en Consulta externa. |
| A7 | PQ1 campos que no pedí | No lleva Signos vitales, Examen físico ni Observaciones. No agrego duración, conteo de material, complicaciones ni muestras a patología. |
| A8 | PQ1 "Procedimiento mayor" | Se reproduce la lógica exacta que hoy tiene la casilla (autorización quirúrgica u otra); toda nota postquirúrgica es mayor. |
| A9 | ME3 alcance | La primera dosis distinta y la nebulización existen en **todos** los formularios de medicamento (no solo consulta externa y notas). En la receta no se pide hora de la dosis inicial; el texto es el mismo de ME2 (con "STAT"), generado por un solo código. |
| A10 | ME4 detalles | Cantidad en texto libre; diluyente opcional; máximo 5 componentes; sin Infusión ni primera dosis distinta con nebulización; una administración por sesión; la vía "Inhalada" no cambia. |
| A11 | EG1 alcance | Egreso, Referencia, Autorización quirúrgica y Pasar a hospitalización se abren en ventana encima si hoy se abren dentro de la página (**confirmado por Emil**). Contenido y lógica no cambian. |
| A12 | NE6 alcance | Solo la variante SOAP; Estándar no cambia. Signos vitales va arriba de "S. Subjetivo". |
| A13 | GE3 implementación | Componente propio (no nativo), zona America/Tegucigalpa, en toda la app, con prueba automática que impide volver a usar campos nativos o AM/PM. |
| A14 | GE4 reglas | Solo el autor; 5 minutos desde la primera firma, sin reiniciarse; hora del servidor; nada se borra (versiones); renglones ya cumplidos bloqueados; renglones que alimentan un documento ya impreso, descargado o enviado, bloqueados (**confirmado por Emil**: no se corrigen, van por adenda); egreso corrige contenido sin reabrir la estancia; **excluidos**: pagos y caja, autorizaciones y consentimientos con firma del paciente, agenda, anulaciones. Motivo de la corrección opcional. `VALIDAR: Emil` (y un abogado la regla de integridad del expediente). |
| A15 | GE4 qué ve el resto | Se muestra la última versión; las anteriores se consultan con "Ver versiones" solo en lectura, sin etiquetas extra si hay una sola versión. |

| A16 | ME5 alcance | Se cargan **todas** las filas del archivo (los 33 grupos, incluidos radiofármacos, soluciones de diálisis y agentes no terapéuticos), visibles; Administración puede archivar lo que no use. El listado es una ayuda: no limita lo que el médico puede escribir. |
| A17 | ME5 presentación | Se guarda la presentación habitual del archivo y se precarga en el campo de presentación; si trae "(también …)", se precarga la principal y se sugiere el resto. Las ⚠️ se marcan "por confirmar con farmacia". |
| A18 | ME5 duplicados | Si el medicamento ya existe (incluso con otro nombre como acetaminofén/paracetamol) se conserva lo de la clínica y solo se agrega la etiqueta, el número y el alias; en caso de duda no se une y se reporta. |

---

## 7. Revisión final antes de entregar

**Marca cada casilla antes de decir que terminaste:**

- [ ] Todos los puntos cumplen **todos** sus criterios de aceptación (sección 3).
- [ ] Todo lo de la sección 2 sigue intacto (tarjeta de la nota firmada, formulario de medicamento actual, vía "Inhalada", "Medicamentos activos" con Cambiar y OMITIR, contenido y lógica del egreso, notas de procedimiento firmadas, adenda).
- [ ] Probado a **~390 px**: sin desborde horizontal y con botones de al menos 44 px, **con el formulario de medicamento abierto** (incluidas nebulización y primera dosis distinta) y con la ventana de egreso y la de nota postquirúrgica.
- [ ] Probado en escritorio a **1920, 1366 y 1280 px**.
- [ ] Probado con el navegador en **inglés y en español**: ningún campo muestra AM/PM ni mes/día.
- [ ] **Permisos** de la sección 4 comprobados también **por URL directa** (incluido "Corregir" de otro usuario).
- [ ] **Migraciones probadas sobre una copia de la base**, idempotentes y válidas en todas las bases (clínicas y consultorios); ningún borrador, nota ni orden existente se perdió ni cambió.
- [ ] Sin errores de `build`, typecheck, lint, pruebas ni de consola.
- [ ] Textos en español correcto, fechas `dd/mm/aaaa` y hora de 24 horas.
- [ ] Las constantes nuevas están en el archivo de configuración con `VALIDAR: Emil` (lista de anestesia, diluyentes, máximo de componentes, minutos del periodo de gracia).
- [ ] La carga del LNME (ME5) se probó sobre una copia de la base, es idempotente, está en todas las bases y en las clínicas y consultorios nuevos; el reporte trae filas cargadas, emparejadas, dudosas y el conteo del archivo (530 filas).

**Flujo de punta a punta con usuarios demo** (haz el recorrido completo y reporta el resultado):

1. **Dra. Lucía Herrera (médico, un hospitalizado)**: "Nueva nota de evolución" en **SOAP**: signos vitales arriba; agrega una **nebulización** (Salbutamol + Bromuro de ipratropio, diluido en SSN 0.9%, c/6h) y un **Ceftriaxona** con la primera dosis distinta; firma. Luego "Nota postquirúrgica": diagnósticos pre y postoperatorio, horas de inicio y cierre en 24 horas, anestesia, procedimiento, descripción y el equipo quirúrgico completo (los seis cargos); agrega una indicación, un examen y un medicamento; firma, imprime el PDF.
2. **Dra. Herrera**: corrige la nota postquirúrgica dentro de los 5 minutos (queda v2, "Ver versiones"); espera a que pasen los 5 minutos y comprueba que "Corregir" desaparece y que la adenda sigue funcionando.
3. **Lic. Carmen Ríos (enfermería)**: en la hoja de medicamentos registra la **sesión de nebulización** (una sola administración, con sus componentes) y la dosis inicial del antibiótico; corrige la hora de una administración dentro de los 5 minutos; verifica que no puede corregir lo que firmó la Dra. Herrera.
4. **Dr. Daniel Fúnez (médico, paciente en observación)**: abre "Egreso" (ventana encima), escribe, cierra con ✕, reabre y confirma que el borrador sigue; guarda el egreso y comprueba la receta de salida.
5. **Dr. Daniel Fúnez en consulta externa**: receta con un medicamento con **primera dosis distinta** y otro con vía **Nebulización**; imprime la receta.
6. **Dra. Ana López (Consultorio)**: nota postquirúrgica con un anestesiólogo escrito a mano, una nebulización y un egreso en ventana; corrige dentro de los 5 minutos.
7. **Sofía Mejía (recepción)**: no ve la nota postquirúrgica ni "Corregir" (también por URL directa).
8. **Navegador en inglés**: abre "Registrar administración" y comprueba que "Hora real" muestra `dd/mm/aaaa HH:mm` y que "cambiar hora" no tiene AM/PM.
9. **Dra. Lucía Herrera**: busca "Paracetamol" y "Acetaminofén" (el mismo medicamento), elige Ceftriaxona y arma una nebulización con "Salbutamol solución para nebulizar" e "Ipratropio solución para nebulizar" del listado. **Roberto Aguilar**: archiva un medicamento del listado y comprueba que ya no sale en la búsqueda.

---

## 8. Reporte final que espero

1. **Tabla por punto** (PQ1, PQ2, ME3, ME4, ME5, EG1, NE6, GE3, GE4): estado (**Hecho / Parcial / No hecho**), archivos cambiados y **cómo lo pruebo yo en 2 o 3 pasos**.
2. **Lo que te pedí averiguar**: qué hacía la casilla "Procedimiento mayor" (PQ1); cuáles formularios de medicamento existen y cuáles comparten componente (ME3); por qué la ronda 8 no logró las 24 horas y qué campos nativos reemplazaste (GE3); cómo se abría cada una de Referencia, Autorización quirúrgica y Pasar a hospitalización antes y cómo quedó (EG1); dónde quedó "Diagnósticos" en SOAP (NE6); cuántos medicamentos tenía cada vademécum y cuántos quedaron tras ME5 (ME5); por qué la tarjeta de la Dra. Herrera decía "Vista de médico" (GE3).
3. **GE4**: la lista final de tipos de registro con su decisión (corregible / bloqueado / excluido y por qué), cómo resolviste las consecuencias (medicamentos administrados, exámenes, documentos impresos, egreso) y qué quedó fuera por no poder hacerse de forma segura.
4. **Cambios en la base de datos**: tablas y columnas nuevas (componentes de nebulización, equipo quirúrgico, nota postquirúrgica, versiones, campos del vademécum para el LNME), migraciones, y qué datos se convirtieron (si alguno).
5. **Valores por defecto usados** (sección 6) y cuáles cambiaste.
6. **Lo que debo validar yo o un abogado**: la edición vigente y los términos de uso del LNME, las presentaciones ⚠️, la lista de tipos de anestesia, los diluyentes, la regla de corrección en 5 minutos (integridad del expediente; no verifiqué ninguna norma hondureña sobre modificación de registros clínicos, por eso se conservan todas las versiones) y el texto de la receta con "STAT".
7. **Hallazgos fuera de la lista** (errores de interfaz, otros formularios inconsistentes, textos desactualizados como el de "los externos no"): repórtalos, **no los implementes** sin preguntarme.
8. **Verificaciones que no pudiste hacer** y por qué.
