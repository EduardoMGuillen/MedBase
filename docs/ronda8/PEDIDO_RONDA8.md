# Clinara (MedBase) — Ronda 8 de correcciones

> Adjunto a este prompt, **dos archivos**:
> 1. **clinara_correcciones_ronda_8.docx** (12 capturas): muestra el diseño actual de cada pantalla.
> 2. **valores_referencia_laboratorio.md**: es la **fuente de datos** de los puntos UM1 y UM2 (valores de referencia con su fuente). Úsalo tal cual; no completes ni corrijas valores con tu memoria.
>
> Ábrelos los dos antes de empezar.

---

## 0. Contexto

Soy Emil, médico general en Honduras, y me encargo de la parte clínica de **Clinara** (también llamada MedBase), una aplicación web de gestión clínica desplegada en https://medbase-lac.vercel.app. La desarrollo con un amigo programador que no es del área médica. Esta es la **ronda 8**.

**Qué es Clinara.** Sistema para clínicas pequeñas y medianas y consultorios de Honduras. Pocos médicos, una recepcionista, enfermería y a veces laboratorio. Las soluciones deben ser simples, con pocas pantallas y pocos clics, en español de Honduras.

**Qué se hizo antes (una línea por ronda relevante).**
- **Ronda 6**: menú "Ordenar exámenes" agrupado (MC4), PRN (MC2), frecuencia de signos vitales (MC6), indicaciones y medicamentos que pasan de una nota a la siguiente con etiquetas Continúa / Nueva / Modificada / Omitida (MC7), signos vitales opcionales en la nota (MC8), "Por llegar hoy" por hora o por médico (AD1/RE1), selector de rol sin "Vista de" (GE1), catálogo con subgrupos y perfiles (CF3, CF4, CF6).
- **Ronda 7**: carga real de unos 314 exámenes y 27 perfiles (CA1 a CA4) y arreglo del desborde de la ventana "Nota de evolución" (NE1, NE2).

**Esta ronda amplía** NE1 (el desborde sigue pasando dentro del formulario de medicamentos), AD1/RE1 (el mismo agrupamiento, ahora en Consulta externa), MC7 (diagnósticos), GE1 (sigue saliendo "Vista de médico") y CA1 (valores de referencia de los exámenes). **Revisa el estado real del código y de la base de datos antes de tocar cada cosa** para no duplicar funciones.

**Reglas generales (valen para todo):**

- **Dos modos**: **Clínica** (ej. "Clínica Santa Brígida") y **Consultorio** de médico independiente (ej. "Consultorio Dra. Ana López"). Todo lo de esta ronda aplica a los dos, salvo que diga otra cosa.
- **Roles**: recepción, enfermería, médico y administración; a futuro laboratorio e imágenes. Una persona puede tener varios roles.
- **Datos clínicos**: nada se borra de verdad (se archiva, se oculta o se anula), todo queda con autor, fecha y hora, y no se inventa nada. Lo firmado no se edita: se corrige con adenda o se anula y se emite otro.
- **Formatos**: fechas `dd/mm/aaaa` (mantén el estilo de cada pantalla y no lo mezcles dentro de una misma pantalla), hora de 24 horas, Lempiras (L), identidad `0000-0000-00000`, teléfonos `0000-0000`, impresión tamaño carta.
- **Firma**: una firma dibujada en pantalla no es la firma electrónica avanzada de la Ley sobre Firmas Electrónicas de Honduras. Todo documento que se entrega al paciente debe poder imprimirse con espacio para firma y sello en papel.
- **Privacidad**: el diagnóstico no sale en constancias ni en mensajes de WhatsApp salvo que el médico lo decida.
- **Conectividad**: el internet y la luz fallan. Lo que se escriba en formularios no debe perderse (mismo mecanismo de borrador/autoguardado que ya tienen las notas).
- **Valores clínicos y constantes** van en un solo archivo de configuración con el comentario `VALIDAR: Emil`.
- **Usuarios demo**: Roberto Aguilar (administración), Sofía Mejía (recepción), Lic. Carmen Ríos (enfermería), Aux. Karla Mendoza (auxiliar de enfermería), Dra. Lucía Herrera (medicina interna), Dr. Andrés Paz (pediatría), Dra. Mariela Zúñiga (ginecología y obstetricia), Dra. Ana López (consultorio), Dr. Daniel Fúnez Castillo (medicina general). **Los perfiles demo nunca se borran.**

**Advertencia sobre las capturas.** El texto que aparece dentro de mis capturas (diagnósticos, medicamentos, dosis, nombres de exámenes, indicaciones, resultados, notas) es **relleno** que escribí solo para generar las pantallas. No lo trates como requisito ni como error. Fíjate solo en el diseño, los campos, los botones, las etiquetas y el flujo. Los nombres de pacientes demo que aparecen los uso solo para que ubiques la pantalla.

### Mapa de capturas del Word (en orden de aparición)

| N.º | Pantalla | Punto |
|---|---|---|
| 1 | Consulta externa vista de Administración (En sala 41, Listos 0, Atendidos 1) | CX1 |
| 2 | Configuración › Áreas de servicio con "Umbrales críticos de laboratorio" (la pantalla está desplazada hacia abajo) | UM2 |
| 3 | "Mi configuración" vista de Recepción (menú lateral y tarjeta de usuario) | GE2 |
| 4 | Consulta externa vista de Enfermería: un paciente en "En sala" con la etiqueta "Hospitalizado" | CX2 |
| 5 | Hospitalizado › pestaña Exámenes (Imagen y gabinete: radiografía "Realizado" con "Cargar informe") | EX3 |
| 6 | Ventana "Nota de evolución" (Estándar): Diagnósticos, Signos vitales (opcional), Examen físico, Observaciones, Indicaciones activas | NE3, NE4 |
| 7 | Ventana "Nota de evolución": formulario de medicamento, cortado por el borde derecho | NE5, ME1 |
| 8 | Ventana "Nota de evolución": lista de medicamentos con dos entradas del mismo antibiótico | ME2 |
| 9 | Hospitalizado › Exámenes › Laboratorio (lista larga de resultados) | EX1 (y EX2, texto que viene después) |
| 10 | Hospitalizado › Notas de evolución: tarjeta de la nota firmada | "Me gusta" (sección 2) |
| 11 | Hospitalizado › Notas de evolución: fila de botones "Nueva nota de evolución / Procedimiento / Autorización quirúrgica / Egreso" y Nota de ingreso | RF1 |
| 12 | **Repite la captura 2** (misma pantalla, sin desplazar) | UM1, UM2 |

La captura 12 es la misma pantalla que la 2; no es un error mío ni tuyo, solo no busques una pantalla distinta. Si alguna otra captura no corresponde a su punto, dímelo en el reporte y verifica tú el código.

---

## 1. Cómo quiero que trabajes

1. **Explora primero** el código de lo que toca esta ronda. No supongas el stack: léelo.
2. **Escribe `PLAN_RONDA8.md`** antes de programar: por cada punto (CX1, CX2, GE2…), los archivos, los cambios de base de datos, los componentes que vas a reutilizar o crear y las dependencias entre puntos. Pídeme confirmación **solo** si algo está bloqueado de verdad. Para todo lo demás usa los valores por defecto de la sección 6.
3. **Un commit por punto**, con el código en el mensaje: `[ronda8][ME2] Dosis inicial distinta en una sola orden`.
4. **Migraciones seguras**: no borres columnas ni registros. Ocultar o archivar. Todo cambio de datos se prueba primero sobre **una copia de la base** y debe ser **idempotente** (correrlo dos veces no cambia nada). Las cargas deben servir en las bases de **todas** las clínicas y consultorios, y quedar garantizadas en producción (en la ronda 7 se descubrió que una carga no había llegado a producción: no quiero que se repita; si hace falta un paso manual, dime exactamente cuál).
5. **Reutiliza componentes**: el formulario de medicamento, la ventana "Nota de evolución", el componente de agrupar "Por hora | Por médico" (AD1/RE1), la plantilla de la epicrisis y de "Autorización quirúrgica", el control "Órdenes impresas", el desplegable del menú "Ordenar exámenes".
6. **Permisos por rol y auditoría** (quién, qué, cuándo) en toda acción nueva. Verifica permisos también por URL directa.
7. **Verifica cada punto en el navegador** con el rol correcto, en escritorio (1920, 1366 y 1280 px de ancho) y a ~390 px, y corre typecheck, lint, pruebas y `build` al final de cada punto.
8. Usa los textos exactos (botones, etiquetas) que pongo entre comillas.
9. **Datos externos**: no inventes valores, fuentes ni artículos de ley. Lo que no puedas respaldar, déjalo marcado y repórtalo.

---

## 2. Lo que NO se debe romper

Lo que dije que me gusta o que ya funciona, y no se toca:

- **La tarjeta de la nota firmada en Notas de evolución** (captura 10): "Me gusta cómo quedó la hoja de evolución". Dos columnas; a la derecha Indicaciones (con las etiquetas Continúa / Nueva / Modificada / Omitida y las omitidas tachadas), Exámenes (nombre, tipo, "Externo", "No catalogado", estado) y Medicamentos (con etiqueta). Solo se agrega lo que digan NE3 y ME1/ME2.
- **Cómo se agregan hoy los medicamentos** (capturas 7 y 8): "la forma en la que está ahorita me funciona para otros medicamentos". Campos Medicamento, Dosis, Vía, Frecuencia, "Según necesidad (PRN)", Hora de la dosis, Total de días, Indicaciones, y los botones "Agregar a la nota", "Guardar y agregar otro" y "Cancelar". Dos órdenes separadas del mismo medicamento (como en la captura 8) seguirán funcionando. ME1 y ME2 **agregan** opciones, no reemplazan nada.
- **"Medicamentos activos" e "Indicaciones activas" con Cambiar y OMITIR**, y los estados de la hoja de medicamentos (Administrado, Toca ahora, Atrasado, Programado, No aplicada, Omitido).
- **El menú "Ordenar exámenes"** (buscador, pestañas, "Mis sets", "Perfiles", "Seleccionados", etc.), el botón "Set de órdenes" y la fila de cada orden de examen con "Rutina | Urgente" y "En la clínica | Externo".
- **La pestaña Exámenes**: el aviso de pendientes arriba, "Subir resultado externo", el flujo del laboratorio (Ordenado → Muestra tomada → Resultado → Revisado), los valores críticos en rojo y "Órdenes impresas".
- **La pantalla Configuración › Áreas de servicio con "Umbrales críticos de laboratorio"** (capturas 2 y 12): "Este apartado de umbrales críticos está bien". Conserva su diseño: grupos desplegables, Renombrar, Archivar, Agregar grupo, Agregar analito, columnas Analito / Unidad / "Crítico si es menor de" / "Crítico si es mayor de". UM2 solo agrega la fuente y el valor predeterminado.
- **Las tarjetas de Consulta externa** (capturas 1 y 4): "En sala", "Listos para consulta", "Atendidos", con su hora grande, nombre subrayado, médico, motivo, etiquetas ("En sala", "Lista para consulta", "Consulta atendida", "Urgente", "En observación") y el botón "Preclínica". CX1 solo cambia cómo se agrupan.
- **Notas firmadas**: no se editan; se corrigen con adenda.
- **Los 314 exámenes y los 27 perfiles** de la ronda 7: no se renombran ni se borran. UM1 les pone los valores de referencia del `.md` (reemplazando los que ya tuvieran, ver UM1 punto 7).
- **Todo lo firmado y los borradores**: lo escrito en un borrador sigue ahí al reabrir.

---

## 3. Correcciones, una por una

Cada punto indica a qué modo aplica: **[C]** Clínica, **[K]** Consultorio, **[CK]** ambos.

Códigos de esta ronda: **CX** consulta externa, **GE** general, **NE** nota de evolución, **ME** medicamentos, **EX** exámenes, **RF** referencia, **UM** umbrales y valores de referencia, **DM** datos demo.

---

### Grupo CX — Consulta externa

#### CX1 — Consulta externa por hora o por médico, para Administración [C]

**Cómo está hoy (captura 1):** como Roberto Aguilar (Administración) la página Consulta externa tiene tres columnas (En sala 41, Listos para consulta, Atendidos). Cada columna es una lista seguida ordenada solo por hora de la cita; con 41 pacientes de varios médicos se mezclan y no se puede ubicar a los de un médico.

**Qué quiero:** que Administración pueda **organizar la vista de pacientes en sala o listos para consulta por médico, y también por horario**. Es la misma idea de AD1/RE1 de la ronda 6 ("Por llegar hoy"), ahora en Consulta externa. **Reutiliza ese mismo componente** (si AD1/RE1 no existe en el código, dímelo y constrúyelo una sola vez para los dos lugares).

- Un selector arriba de las tres columnas (a la altura de "Paciente sin cita"): **"Por hora | Por médico"** y botones **"Expandir todo / Contraer todo"**.
- **Por hora**: dentro de cada columna, grupos por hora de la cita (08:00, 08:30, 09:00…), cada grupo con su encabezado, la cantidad de pacientes y una flecha para desplegar o contraer. Los pacientes **sin cita** van en un grupo **"Sin cita"** al final de la columna.
- **Por médico**: dentro de cada columna, un grupo por médico (nombre y especialidad si ya se muestra, cantidad de pacientes y flecha), con los pacientes ordenados por hora dentro de cada grupo. Pacientes sin médico asignado: grupo "Sin médico asignado".
- El selector aplica a las **tres columnas** a la vez. Cada columna conserva su conteo total en el encabezado.
- Las **tarjetas de paciente no cambian** (sección 2). Al pasar un paciente de columna (preclínica hecha, consulta firmada) sale de su grupo y los conteos se actualizan sin recargar.
- La vista elegida **se recuerda** por usuario, entre sesiones. Valor por defecto: **Por hora**, con los grupos abiertos.
- Grupo sin pacientes: no se muestra.
- A ~390 px las columnas ya se apilan; los grupos siguen siendo desplegables.
- Solo para **Administración** en esta ronda (A12 de la sección 6). Deja el componente listo para activarlo en otros roles con un solo valor de configuración.

**Criterios de aceptación:**
- [ ] Como Roberto Aguilar veo el selector "Por hora | Por médico" y "Expandir todo / Contraer todo" en Consulta externa.
- [ ] "Por médico" muestra en "En sala" un grupo por médico con su conteo; contraigo uno y los otros siguen abiertos.
- [ ] "Por hora" muestra grupos por hora desplegables; los pacientes sin cita quedan en "Sin cita".
- [ ] Cierro sesión, entro de nuevo y mantiene la vista que elegí.
- [ ] Hago "Preclínica" a un paciente (como Lic. Carmen Ríos): pasa a "Listos para consulta" dentro de su médico o su hora, y el conteo de las dos columnas cambia.
- [ ] Como Sofía Mejía (Recepción) y Lic. Carmen Ríos (Enfermería) la pantalla se ve **igual que antes** (sin selector).
- [ ] En Consultorio no aparece el selector.
- [ ] A 390 px se usa con el dedo, sin desborde horizontal.

#### CX2 — Un paciente hospitalizado no puede estar en la cola de consulta externa [CK]

**Cómo está hoy (capturas 4 y 5):** en Consulta externa (vista de Enfermería) el paciente de la captura 4 (Nelson Omar Pineda Galeas, EXP-00033) aparece en **"En sala"** con el botón "Preclínica", y a la vez muestra la etiqueta **"Hospitalizado"**; en la captura 5 es el mismo paciente, hospitalizado en el Cuarto 103, día 5 de estancia.

**Por qué:** "hay incongruencias que no deberían pasar: ¿cómo va a haber un paciente que viene a consulta externa y que esté hospitalizado?". Un paciente con una estancia abierta no entra a la cola de consulta externa. (Distinto es el paciente que **ya fue atendido en consulta** y de ahí pasó a observación u hospitalización: ese sigue apareciendo en "Atendidos" con su etiqueta, como en la captura 1; no se toca.)

**Qué quiero:**
1. **Definición**: "estancia activa" = el paciente tiene un ingreso a **Observación** u **Hospitalización** sin egreso.
2. **Prevenir**. Si el paciente tiene una estancia activa:
   - **No se puede marcar "Llegó"** ni agregarlo con **"Paciente sin cita"**: el sistema lo impide con el mensaje "Este paciente está hospitalizado (Cuarto 103, desde 29/10/2026). No puede pasar a consulta externa hasta su egreso." (o "en observación", según el caso), con un enlace "Ver paciente hospitalizado" para los roles que ya tienen acceso a esa pantalla.
   - **No se puede agendar una cita para hoy**; el mensaje es el mismo. Para **fechas futuras** sí se puede agendar, con un aviso: "Hoy está hospitalizado. Si sigue hospitalizado ese día, la cita quedará en conflicto."
   - Si llega el día de una cita y el paciente sigue con estancia activa, la cita **no entra** a "Por llegar hoy" ni a "En sala". En la Agenda aparece con la etiqueta **"Hospitalizado: cita en conflicto"** y las acciones que ya existen (Reprogramar, Cancelar cita).
3. **Corregir lo que ya está mal** (migración, probada sobre una copia de la base): las citas de hoy de pacientes con estancia activa que estén en "Por llegar" o "En sala" pasan a **cancelada**, con el motivo "Paciente con estancia activa (hospitalizado/observación)", autor **"Sistema"**, fecha y hora. No se borra nada y cualquier rol con permiso de agenda puede reprogramarla.
4. Si por cualquier razón llegara a quedar una tarjeta así en "En sala", muestra la etiqueta "Conflicto: hospitalizado" y **desactiva** el botón "Preclínica" con la explicación en un texto de ayuda.
5. **Revisión de otras incongruencias** (solo reportar, **no corregir**): escribe una consulta o script que busque otras combinaciones imposibles en los datos y lístalas en el reporte. Por ejemplo: un paciente con dos estancias activas a la vez, una cita en cola con un paciente ya egresado por fallecimiento, o un paciente en "En sala" y en "Listos para consulta" al mismo tiempo. Si las encuentras, dime cuáles y cuántas; yo decido qué se hace.
6. Los **datos demo** se corrigen en DM1.

**Criterios de aceptación:**
- [ ] Como Sofía Mejía (Recepción) busco al paciente hospitalizado de la captura 4 y intento "Paciente sin cita": no me deja y el mensaje dice dónde está.
- [ ] Intento agendarle una cita para hoy: no me deja. Para el mes siguiente: me deja, con el aviso.
- [ ] En Consulta externa (Enfermería) ya no aparece ese paciente en "En sala".
- [ ] La cita cancelada por el sistema queda en la Agenda con motivo, autor "Sistema" y fecha, y se puede reprogramar.
- [ ] Un paciente atendido hoy que pasó a observación **sigue** en "Atendidos" con "En observación".
- [ ] Tras el egreso del paciente, se puede volver a agendar o a marcar "Llegó" con normalidad.
- [ ] La migración corre dos veces sin cambiar nada la segunda vez.
- [ ] El reporte incluye la lista de otras incongruencias encontradas, o dice que no encontró ninguna.

---

### Grupo GE — General

#### GE2 — Barra lateral: "Configuración" (tuerca) arriba del perfil, y el perfil deja de ser botón [CK]

**Cómo está hoy (capturas 3 y 12):** en la barra izquierda hay un elemento **"Mi configuración"** (icono de controles deslizantes) y, abajo, la **tarjeta con el nombre y el rol** del usuario, que también funciona como botón y abre la misma pantalla. Son dos entradas a lo mismo. Además, la tarjeta de la Dra. Herrera dice **"Vista de médico"** (capturas 6 a 11), cuando en la ronda 6 (GE1) pedí que dijera solo el nombre del rol.

**Qué quiero:**
- El elemento de menú **"Mi configuración" se baja** y queda **abajo del todo de la lista, justo arriba de la tarjeta del usuario**, separado del resto del menú.
- Su texto pasa a **"Configuración"** (sin "Mi") y su icono pasa a ser una **tuerca** (engranaje). El título de la pantalla personal también dice "Configuración". Las pestañas internas (Datos personales, Preferencias, Seguridad, Mi actividad) no cambian.
- **La tarjeta del usuario deja de ser un botón**: muestra el nombre y el rol y nada más (sin hover de botón, sin cursor de mano, sin abrir pantalla). El botón de **cerrar sesión** que está a su lado se conserva.
- La tarjeta dice **solo el nombre del rol**: "Médico", "Enfermería", "Recepción", "Administración" (pendiente de GE1: sin "Vista de"). Revisa por qué la Dra. Herrera aún dice "Vista de médico" y corrígelo.
- **Usuarios con más de un rol**: conservan la función de cambiar de rol de GE1, que no debe perderse. Pon ese cambio de rol en un control propio dentro de la tarjeta (por ejemplo una flecha junto al nombre del rol) que abre la lista de roles; esa lista **nunca abre Configuración**. Si la persona tiene un solo rol, no hay control.
- **Administración tiene dos configuraciones** (la de la clínica, en el grupo "Administración", y la personal). Para que no haya dos elementos con el mismo nombre: el de la clínica pasa a llamarse **"Configuración de la clínica"** (conserva su icono de tuerca y su lugar) y el título de esa pantalla también. La personal queda abajo como "Configuración" (A4 de la sección 6; yo confirmo).
- En Consultorio, aplica lo mismo: si hay una configuración del consultorio y una personal, que se distingan por nombre.
- A ~390 px (menú lateral como cajón), mismo orden y misma regla.

**Criterios de aceptación:**
- [ ] En Recepción, Enfermería, Médico y Administración, "Configuración" (tuerca) aparece abajo de la lista del menú, arriba de la tarjeta de usuario.
- [ ] Ya no existe "Mi configuración" en ningún menú ni título.
- [ ] Tocar la tarjeta del usuario no hace nada (no navega).
- [ ] La tarjeta dice "Médico" (no "Vista de médico") para Dra. Herrera y Dra. López.
- [ ] Como Roberto Aguilar el menú tiene "Configuración de la clínica" (grupo Administración) y "Configuración" (abajo), y cada uno abre su pantalla.
- [ ] Un usuario de prueba con dos roles puede cambiar de rol y el menú cambia; con un solo rol, no hay control.
- [ ] Cerrar sesión sigue funcionando.
- [ ] A 390 px se ve igual de claro.

---

### Grupo NE — Ventana "Nota de evolución"

#### NE3 — Un cuadro "Evolución" entre los diagnósticos y el examen físico [CK]

**Cómo está hoy (captura 6):** en la variante **Estándar**, la columna izquierda tiene Diagnósticos (CIE-11), Signos vitales (opcional), Examen físico y Observaciones. No hay un lugar para escribir cómo ha evolucionado el paciente desde la nota anterior.

**Qué quiero:** en la variante **Estándar**, un cuadro de texto nuevo **"Evolución"** colocado **entre "Diagnósticos" y "Examen físico"** (si "Signos vitales (opcional)" queda entre ellos, el orden es: Diagnósticos → **Evolución** → Signos vitales (opcional) → Examen físico → Observaciones). Interpreto "cuadro" como un cuadro de texto (A1 de la sección 6; confírmalo conmigo si ves otra lectura más lógica en el código).

- Mismo estilo que Examen físico y Observaciones: altura inicial moderada (unas 4 líneas) que crece sola al escribir, micrófono de dictado, autoguardado en el borrador.
- **Opcional** (no agrega obligaciones).
- Se muestra en la tarjeta de la nota firmada (columna izquierda, entre Diagnósticos y Examen físico, con el rótulo "Evolución"), en "Ver nota completa" y en la impresión. Si está vacío, no se muestra el rótulo.
- La variante **SOAP** no cambia (su "S" ya cumple esa función).
- Notas antiguas: no cambian.

**Criterios de aceptación:**
- [ ] El cuadro "Evolución" aparece entre Diagnósticos y Examen físico en la variante Estándar, y no existe en SOAP.
- [ ] Lo que escribo se guarda en el borrador y sobrevive a cerrar y reabrir.
- [ ] La nota firmada muestra "Evolución" en el lugar correcto, en "Ver nota completa" y en la impresión.
- [ ] Una nota con "Evolución" vacío no muestra el rótulo.
- [ ] Funciona en Clínica y en Consultorio, sin desborde horizontal (ver NE5).

#### NE4 — Los diagnósticos también bajan de la nota anterior y se pueden modificar [CK]

**Cómo está hoy (capturas 6 y 10):** las indicaciones y los medicamentos ya bajan de nota en nota (MC7), pero la ventana de la nueva nota trae el campo **Diagnósticos (CIE-11) vacío**. En la nota de ingreso sí está la "Impresión diagnóstica" (captura 11).

**Qué quiero:** "los diagnósticos, al igual que las órdenes, se traen de la nota anterior, y si se deben modificar, se modifican".

- Al abrir "Nueva nota de evolución", los **diagnósticos vigentes** aparecen **precargados** en el campo Diagnósticos, cada uno con su ✕ para quitarlo, y el buscador CIE-11 para agregar otros. Modificar un diagnóstico = quitarlo y agregar el correcto.
- Qué se precarga: los diagnósticos de la **última nota firmada** del paciente en esa estancia (cualquier nota: ingreso, evolución, procedimiento). La **primera** evolución trae la "Impresión diagnóstica" de la nota de ingreso. Igual que en MC7, **el egreso termina la cadena**.
- Aplica a las variantes **Estándar y SOAP** (el campo es el mismo), en Clínica y Consultorio, y a la nota de procedimiento si usa ese campo.
- La nota firmada **guarda la lista completa** de diagnósticos vigentes en ese momento, no solo los cambios. En la tarjeta se muestra la lista simple, **sin etiquetas Continúa/Nueva** (la tarjeta "me gusta como quedó", sección 2).
- El cambio queda en la bitácora: qué diagnóstico se quitó o se agregó, quién y cuándo (esto es interno, no cambia la tarjeta).
- Si ya hay un **borrador** guardado, el borrador manda (no se vuelve a precargar encima de lo que el médico editó). Si mientras tanto se firmó otra nota del mismo paciente, al firmar se avisa y se recalcula sobre la última firmada (misma regla que MC7).
- Nada se borra: los diagnósticos quitados siguen en las notas anteriores donde se firmaron.

**Criterios de aceptación:**
- [ ] Un paciente con "Rinofaringitis aguda (CA00)" en el ingreso: la primera nota de evolución ya trae ese diagnóstico.
- [ ] Quito uno y agrego "Insuficiencia respiratoria (CB41)" y firmo: la nota firmada muestra los diagnósticos vigentes; la siguiente nota trae esa lista.
- [ ] Una nota de procedimiento entre dos evoluciones no rompe la cadena.
- [ ] Tras un egreso, no se precarga nada.
- [ ] Reabrir un borrador no pisa mis cambios.
- [ ] La tarjeta de la nota firmada se ve como en la captura 10 (sin etiquetas nuevas en Diagnósticos).
- [ ] Funciona como Dra. Lucía Herrera (clínica) y como Dra. Ana López (consultorio).

#### NE5 — El formulario de medicamento sigue cortado a la derecha [CK]

**Cómo está hoy (capturas 7 y 8):** al abrir el formulario de medicamento dentro de la ventana "Nota de evolución", **la tarjeta del formulario se sale por el borde derecho**: se ven recortados el selector "Vía", el campo "Total de días (opcional)" y el borde de la tarjeta. En la lista de medicamentos agregados, los iconos de editar y quitar quedan pegados al borde y la etiqueta "No está en el vademécum de la clínica" se parte en dos líneas cortadas.

**Por qué:** en la ronda 7 (NE1) pedí que la ventana no se desbordara. La ventana ya no tiene barra horizontal, pero **dentro del formulario de medicamentos el problema persiste**.

**Qué quiero:**
- Cero recorte y cero desplazamiento horizontal con el formulario de medicamento abierto, en 1920, 1366, 1280 y ~390 px.
- Revisa la **causa de raíz** (columnas de cuadrícula que no pueden encogerse, campos o selectores con ancho fijo, relleno que suma de más, contenedor con ancho mayor al visible) y corrígela. Verifica por qué NE1 no cubrió este caso.
- Cubre **todos los estados** del formulario: nuevo, editando uno ya agregado, "Cambiar" desde Medicamentos activos, con el aviso "No está en el vademécum", y con las secciones nuevas de ME1 (Infusión) y ME2 (Dosis inicial) abiertas.
- La fila de cada medicamento agregado muestra completos los iconos de editar y quitar; la etiqueta del vademécum se acomoda sin cortarse.

**Errores de interfaz detectados (capturas 7 y 8):**
- El campo **"Hora de la dosis"** muestra `11/02/2026 12:52 PM` (mes/día/año y 12 horas, formato del navegador en inglés). Debe mostrarse **`dd/mm/aaaa` y 24 horas** (por ejemplo `02/11/2026 12:52`) sin depender del idioma del navegador. Ojo: hoy es 2 de noviembre; con el formato actual es imposible saber si dice 2 de noviembre o 11 de febrero.
- El botón **"Agregar a la nota"** queda con aspecto desactivado hasta que se llena el medicamento; si es intencional, déjalo, y si no, revisa el estado.

**Criterios de aceptación:**
- [ ] Con el formulario de medicamento abierto no hay barra de desplazamiento horizontal ni nada recortado a 1920, 1366, 1280 y 390 px.
- [ ] Se ven completos "Vía", "Total de días (opcional)", los botones de editar y quitar de cada fila y la etiqueta del vademécum.
- [ ] El campo de fecha y hora muestra `dd/mm/aaaa HH:mm` en un navegador configurado en inglés.
- [ ] Lo anterior se cumple también con Infusión y Dosis inicial abiertas (ME1, ME2).
- [ ] Con 10 o más medicamentos la ventana solo se desplaza hacia abajo.

---

### Grupo ME — Medicamentos

#### ME1 — Infusión: nueva opción en Frecuencia, con velocidad de goteo [CK]

**Cómo está hoy (capturas 7 y 8):** el formulario de medicamento no tiene forma de indicar una infusión; el médico escribe "Infusión de…" en el nombre y la deja como "Dosis única".

**Qué quiero:**
- En el selector **Frecuencia**, agrega la opción **"Infusión"**.
- Si elijo "Infusión", aparece un bloque obligatorio **"Velocidad de infusión"** con un campo numérico y un selector de unidad: **"mL/h"** (por defecto) o **"mL/min"**. Validación: número mayor que 0, hasta dos decimales. Las unidades y límites van en el archivo de configuración con `VALIDAR: Emil`.
- Con "Infusión" elegida: el rótulo "Hora de la dosis" pasa a **"Hora de inicio"**, y "Según necesidad (PRN)" se oculta (una infusión no es PRN). "Total de días (opcional)" se conserva. Dosis, Vía e Indicaciones no cambian.
- La orden se escribe, en la lista, en la nota, en "Medicamentos activos", en "Ver nota completa", en la receta y en la hoja de enfermería, así: `Infusión de midazolam 50 mg IV · Infusión a 20 mL/h`.
- **Cambiar** una infusión permite modificar la velocidad (cierra la orden anterior y crea la nueva, como ya funciona). **OMITIR** la suspende.
- **Hoja de medicamentos (enfermería)** — mínimo necesario para que funcione (A6 de la sección 6):
  - Una infusión **no genera dosis programadas cada X horas**. Genera **un solo evento de inicio** a la "Hora de inicio", con los estados habituales ("Toca ahora", "Atrasado") hasta que enfermería lo registra.
  - Al registrar el inicio (con hora, nombre y rol), la fila pasa a **"En infusión desde HH:MM · 20 mL/h"**, sin aviso de atraso.
  - Un botón **"Suspender infusión"** registra la hora y quién (y un motivo opcional). Si el médico cambia la velocidad, la fila nueva aparece como un inicio pendiente de registrar.
  - Una infusión en curso nunca aparece en pendientes ni como "Atrasada".
- Los medicamentos que no son infusión no cambian en nada.

**Criterios de aceptación:**
- [ ] "Infusión" aparece en Frecuencia; al elegirla aparece "Velocidad de infusión" con mL/h o mL/min, obligatoria.
- [ ] Sin velocidad no deja agregar; con 0 o negativo, tampoco.
- [ ] La orden se lee "… · Infusión a 20 mL/h" en la lista, la tarjeta de la nota firmada, "Medicamentos activos", "Ver nota completa", la impresión y la hoja de enfermería.
- [ ] En la hoja de medicamentos la infusión muestra un evento de inicio; al registrarlo queda "En infusión desde HH:MM · 20 mL/h" con quién; "Suspender infusión" la cierra.
- [ ] Cambiar la velocidad desde "Medicamentos activos": la anterior queda "Modificada" y la nueva "Nueva", como cualquier medicamento.
- [ ] Un medicamento normal (c/8h, dosis única, PRN) se agrega igual que antes.
- [ ] Probado como Dra. Lucía Herrera (indicar), Lic. Carmen Ríos (registrar) y Dra. Ana López (consultorio).

#### ME2 — Primera dosis distinta y luego la dosis de mantenimiento, en una sola orden [CK]

**Cómo está hoy (captura 8):** para dar un antibiótico con una primera dosis mayor hay que escribir **dos órdenes** separadas: una "dosis única" (2 gr) y otra "c/12h" (1 gr). Salen como dos medicamentos distintos en la lista, en la nota, en "Medicamentos activos" y en la hoja de enfermería.

**Qué quiero:** una forma inteligente de escribir **una sola orden** así: *"Ceftriaxona (1 gr) aplicar 2 gr IM STAT y luego 1 gr c/12h"*. "La forma en la que está ahorita me funciona para otros medicamentos, no rompas lo que ya está" (sección 2).

- En el formulario, debajo de Frecuencia, una casilla **"Primera dosis diferente (STAT)"**, **apagada por defecto**. Solo aparece cuando la Frecuencia es repetitiva (cada X horas, diaria…), no con "Dosis única", "Infusión" ni PRN.
- Si la marco aparece un bloque con **"Dosis inicial"** (texto, mismo formato que Dosis, ej. "2 gr") y **"Hora de la dosis inicial"** (por defecto **"Ahora (STAT)"**, con opción de elegir fecha y hora). El campo **Dosis** del formulario pasa a rotularse **"Dosis siguientes"**, y la Frecuencia aplica a las dosis siguientes. La **vía** es la misma para todas (A7 de la sección 6).
- **Una sola línea** en todas partes (lista del formulario, tarjeta de la nota, "Medicamentos activos", "Ver nota completa", receta, hoja de enfermería): `Ceftriaxona IM · 2 gr STAT y luego 1 gr c/12h`. Si la dosis inicial no es "ahora": `… · 2 gr el 02/11/2026 14:00 y luego 1 gr c/12h`.
- **Hoja de medicamentos**: la primera dosis queda programada a la hora inicial con la etiqueta **"Dosis inicial"** y la cantidad 2 gr. Las dosis siguientes se programan **desde la hora inicial más el intervalo de la frecuencia** (c/12h → 12 horas después) con la cantidad 1 gr. Cada registro de administración guarda la cantidad que correspondía a esa dosis.
- **Cambiar y OMITIR**: es una sola orden con un solo Cambiar y un solo OMITIR. Si la dosis inicial **ya se administró**, al usar Cambiar el bloque de dosis inicial no se repite (se muestra "Dosis inicial ya administrada el dd/mm/aaaa HH:mm"); si **aún no se administró**, se puede editar. OMITIR suspende todo lo pendiente de la orden.
- Las órdenes ya existentes (incluidas las dos separadas de la captura 8) **no se convierten ni cambian**.
- Aplica en consulta externa (receta), observación, hospitalización y Consultorio, porque el formulario es el mismo.

**Criterios de aceptación:**
- [ ] Marco "Primera dosis diferente (STAT)", pongo dosis inicial 2 gr, dosis siguientes 1 gr, c/12h: en la lista queda una sola línea con el texto de arriba.
- [ ] La hoja de enfermería muestra la primera dosis "Dosis inicial · 2 gr" ahora, y la siguiente de 1 gr 12 horas después, y así cada 12 horas.
- [ ] Al registrar cada administración, la cantidad propuesta es la de esa dosis.
- [ ] "Medicamentos activos" muestra una sola línea con Cambiar y OMITIR.
- [ ] Cambiar una vez administrada la dosis inicial no vuelve a pedir ni a programar la dosis inicial.
- [ ] La casilla no aparece con Dosis única, Infusión ni PRN.
- [ ] La receta impresa muestra una sola línea con el texto de la orden.
- [ ] Dos órdenes separadas, como la captura 8, siguen funcionando.
- [ ] Probado sin desborde a 390 px (NE5).

---

### Grupo EX — Exámenes e imágenes

#### EX1 — Laboratorio desplegable, con búsqueda y orden por fecha [CK]

**Cómo está hoy (captura 9):** la pestaña **Exámenes** de un paciente muestra Laboratorio como una lista larga de exámenes seguidos, cada uno con todo su detalle (fechas, resultado, valores) siempre abierto. Con muchos exámenes queda en desorden y no se encuentra nada.

**Qué quiero:** "los laboratorios se generan y se ingresan bien" (no cambia), pero que sean **desplegables, que podamos buscarlos y organizarlos según fecha y así**.

- Cada examen es una **fila desplegable**. **Cerrada** muestra: nombre, estado (Pedido, Muestra tomada, Resultado listo, Revisado por el médico), fecha y hora del pedido, y la insignia de **"Valor crítico"** si aplica. **Abierta** muestra todo lo de hoy (línea de tiempo con autores, tabla de resultados con rangos y etiquetas Alto/Bajo/crítico, botones).
- Los botones de acción de un examen pendiente ("Muestra tomada", "Cargar resultado", "Cancelar") se pueden usar **sin abrir** la fila.
- Un examen con **valor crítico sin revisar** se muestra **abierto** por defecto; el resto, cerrado.
- Barra de herramientas arriba de Laboratorio: **buscador** ("Buscar examen"), orden **"Más recientes primero | Más antiguos primero"** (por defecto, recientes), agrupar por **fecha del pedido** con encabezados de día (mismo estilo de fecha que usa la pantalla), filtros de estado **"Todos | Pendientes | Con resultado | Críticos"** con su conteo, y **"Expandir todo / Contraer todo"**.
- Al buscar, solo se ven los exámenes con coincidencia; si no hay, un texto "Ningún examen coincide".
- Los encabezados de sección ("0 pendientes · 6 con resultado") y "Subir resultado externo" se conservan.
- Aplica **igual a "Imagen y gabinete"** en la misma pestaña (mismo componente), en observación, hospitalización, expediente y Consultorio.
- Es solo presentación: no cambia ningún dato ni permiso.

**Criterios de aceptación:**
- [ ] Con 6 exámenes de laboratorio, la pestaña los muestra cerrados (salvo un crítico sin revisar, abierto) en una lista compacta.
- [ ] Abro uno y veo el detalle completo; "Expandir todo" abre todos y "Contraer todo" los cierra.
- [ ] Escribo "gases" y solo queda ese examen.
- [ ] Cambio el orden a "Más antiguos primero" y la lista se invierte; los encabezados por fecha se mantienen.
- [ ] El filtro "Críticos" deja solo los exámenes con valor crítico.
- [ ] Puedo pulsar "Muestra tomada" en un pendiente sin abrirlo.
- [ ] Imagen y gabinete se comporta igual.
- [ ] A 390 px se usa con el dedo y no hay desborde horizontal.

#### EX2 — Los exámenes pedidos "Externo" generan su orden imprimible [CK]

**Cómo está hoy (capturas 6, 7, 9 y 10):** pedí a la paciente de las capturas una tomografía "Externo" (se hace fuera de la clínica; en la captura 10 aparece como "Imagen y gabinete · Externo · No catalogado"). Quedó registrada, pero **no se generó ninguna orden para imprimirla**. En la captura 6 el propio formulario dice que enfermería recibe los pendientes en su bandeja "(los externos no)", así que hoy los externos **no pasan por ningún lado**.

**Por qué:** igual que las recetas, los pacientes van a los laboratorios y centros de imágenes **con el papel en la mano, físico o virtual**. Si el estudio se hace por fuera, la orden es lo único que lleva el paciente. Sin orden impresa, el estudio externo no se puede cumplir.

**Qué quiero:**
1. **Primero averigua por qué no se genera** (¿la orden imprimible solo incluye estudios "En la clínica"? ¿se crea al ingresar al paciente pero no desde la nota de evolución? ¿no se crea para "No catalogado"?) y dímelo en el reporte. Hoy existe el control "Órdenes impresas" en la pestaña Exámenes (captura 5): reutilízalo.
2. **Todo estudio ordenado como "Externo" queda en una orden imprimible**, sea de laboratorio o de imagen y gabinete, catalogado o no, en **cualquier lugar donde se ordene** (consulta externa, observación, hospitalización, nota de evolución, procedimiento y Consultorio). Los documentos son dos, como ya se definió en la ronda 6: **"Orden de laboratorio"** y **"Orden de imagen y gabinete"**; cada uno lista los estudios de su tipo. Los estudios que se hacen en la clínica siguen con el comportamiento actual.
3. **Contenido** (plantilla de documento clínico, tamaño carta): membrete de la clínica o consultorio; título del documento; fecha y hora; número de orden; datos del paciente (nombre, edad, sexo, expediente, identidad); lista de estudios (el nombre tal como se ordenó, "Urgente" si lo es, y la **indicación clínica** que el médico escribió en cada orden, como "Deterioro respiratorio" en la captura 7); nombre del médico, especialidad, **número de colegiado del Colegio Médico de Honduras**, y **espacio para firma y sello**. No se imprime la palabra "Externo" ni se agregan los diagnósticos CIE-11 de la nota por defecto (privacidad, A8).
4. **Cómo se entrega:** botones **"Imprimir"** y **"Descargar PDF"**. Si la receta ya tiene envío virtual (por ejemplo por WhatsApp), reutiliza exactamente el mismo mecanismo y las mismas reglas de privacidad; si no existe, solo PDF. No inventes un canal nuevo.
5. **Cuándo aparece:** al firmar una nota que incluya estudios externos, se ofrece un cuadro **"Órdenes de exámenes: Imprimir / Descargar PDF"**; y siempre disponible después desde la tarjeta de la nota, "Ver nota completa" y la pestaña Exámenes ("Órdenes impresas"). Cada impresión o descarga queda registrada (quién, cuándo), como ya lo hace "Órdenes impresas".
6. Si la nota no tiene estudios externos, no se genera nada. Los estudios agregados en una nota posterior salen en la orden de esa nota.

**Criterios de aceptación:**
- [ ] Como Dra. Lucía Herrera, en una nota de evolución ordeno una "Tomografía simple de tórax" **Externo** (no catalogada, imagen) y un examen de laboratorio **Externo**; firmo: se me ofrece imprimir y descargar la "Orden de imagen y gabinete" y la "Orden de laboratorio".
- [ ] Cada documento lleva membrete, datos del paciente, los estudios, la indicación clínica, nombre y colegiado del médico, y espacio para firma y sello; cabe en una hoja carta.
- [ ] El documento **no** dice "Externo" y **no** trae diagnósticos CIE-11.
- [ ] Desde la tarjeta de la nota firmada y desde la pestaña Exámenes puedo volver a imprimir la orden; la impresión queda en el registro.
- [ ] Un estudio "En la clínica" sigue el flujo de siempre.
- [ ] Funciona en consulta externa, observación, hospitalización y Consultorio.
- [ ] El reporte explica por qué antes no se generaba.

#### EX3 — Las radiografías no obligan a cargar informe [CK]

**Cómo está hoy (captura 5):** una radiografía de tórax en estado **"Realizado"** muestra el botón azul **"Cargar informe"** y sigue contando como **pendiente** ("2 pendientes: Imagen y gabinete: 1 examen pendiente…"). Así queda pendiente para siempre aunque nadie vaya a redactar un informe.

**Por qué:** "los Rx no siempre se les realiza lectura". Un estudio de Rayos X queda terminado cuando se toma; el informe es un extra.

**Qué quiero:**
- A **todos los estudios de Rayos X**, el informe es **opcional**: una vez en **"Realizado"** el estudio queda **terminado** (estado final "Realizado · sin informe"), **deja de contar como pendiente** (aviso de la pestaña, contadores, bandeja) y el botón pasa a **"Agregar informe (opcional)"**. Si después se agrega un informe, el estado pasa a "Con informe".
- Qué es "Rayos X": los estudios del subgrupo **"Rayos X"** del catálogo, y los estudios no catalogados de tipo Imagen y gabinete cuyo nombre empiece por "Rayos X", "Radiografía" o "Rx" (sin importar mayúsculas ni tildes). La lista de subgrupos y prefijos va en el archivo de configuración con `VALIDAR: Emil` (A10 de la sección 6).
- El resto de **imágenes** (tomografía, resonancia, ultrasonido, etc.) no cambia: siguen con "Cargar informe" como paso para terminar.
- "Cancelar" solo se ofrece antes de "Realizado" (como hoy) y "Subir resultado externo" se conserva.
- El estado se refleja en la tarjeta de la nota (Exámenes: "Realizado") y en "Ver nota completa".
- Los Rayos X que hoy están en "Realizado" esperando informe quedan terminados automáticamente al aplicar el cambio (el estado se calcula, no se borra ni se altera ningún dato).

**Criterios de aceptación:**
- [ ] Una radiografía en "Realizado" aparece terminada, con "Agregar informe (opcional)", y no cuenta en el aviso de pendientes.
- [ ] Agrego un informe: pasa a "Con informe".
- [ ] Una tomografía en "Realizado" sigue pidiendo "Cargar informe" y sigue contando como pendiente.
- [ ] Una radiografía escrita a mano ("Rayos X lateral de columna lumbar", no catalogada) se comporta igual que las del catálogo.
- [ ] El paciente de la captura 5 (radiografía de tórax) queda sin pendientes de imagen; los signos vitales pendientes siguen en el aviso.
- [ ] Permisos de cargar informe iguales que hoy.

---

### Grupo RF — Referencia a otro centro

#### RF1 — Hoja de referencia a otro centro [CK]

**Cómo está hoy (captura 11):** en Hospitalización la fila de acciones solo tiene "Nueva nota de evolución", "Procedimiento", "Autorización quirúrgica" y "Egreso". No hay forma de **referir** al paciente a otro centro, ni en observación, ni en hospitalización, ni desde consulta externa.

**Qué quiero:** un documento de **referencia** que el médico pueda emitir en tres lugares: **consulta externa, observación y hospitalización**. "Las referencias son parecidas a la epicrisis: llevan diagnóstico de ingreso, de egreso, HEA, tratamiento recibido, y lo nuevo sería la razón o motivo de referencia."

1. **Dónde está el botón**:
   - **Hospitalización y Observación**: un botón **"Referencia"** en la misma fila que "Nueva nota de evolución / Procedimiento / Autorización quirúrgica / Egreso" (captura 11).
   - **Consulta externa**: un botón **"Referir a otro centro"** en la nota de consulta (junto al bloque "Ingreso a observación / Ingreso a hospitalización"), disponible con la nota en borrador o ya firmada.
   - En **Consultorio**, igual desde la nota de consulta y desde observación.
2. **Contenido** (reutiliza la **plantilla de la epicrisis** y de "Autorización quirúrgica"; no agregues secciones que la epicrisis no tenga):
   - Membrete de la clínica o consultorio, "Hoja de referencia", fecha y hora, **número de referencia** correlativo por clínica.
   - Datos del paciente (nombre, edad, sexo, expediente, identidad, **alergias**).
   - **Destino**: "Centro o establecimiento al que se refiere", "Servicio o especialidad", y prioridad **"Rutina | Urgente"** (mismo control que ya usan las órdenes de examen). Esto es necesario para que la referencia sirva, aunque no lo mencioné (A11).
   - **Motivo de referencia** (texto obligatorio): lo nuevo.
   - **Diagnóstico de ingreso** y **diagnóstico de egreso o actual** (en consulta externa, "Diagnósticos de la consulta"), **HEA** (historia de la enfermedad actual) y **tratamiento recibido** (medicamentos, procedimientos y lo que la epicrisis ya resuma), **precargados** desde el expediente y **editables antes de firmar**. Lo demás que la epicrisis lleve (por ejemplo condición del paciente y resultados relevantes) se incluye igual que allí.
   - Nombre del médico, especialidad, **número de colegiado del Colegio Médico de Honduras** y espacio para firma y sello.
   - Una casilla obligatoria antes de firmar: **"El paciente (o su representante) fue informado de la referencia y está de acuerdo en que su información clínica se comparta con el centro receptor."** Queda guardada con fecha y hora (ver "Base legal" abajo).
   - Pie de página con una frase fija de confidencialidad (por ejemplo "Documento confidencial. Contiene información clínica para uso exclusivo del personal de salud del centro receptor."), en el archivo de configuración con `VALIDAR: Emil`.
3. **Estados**: Borrador (con autoguardado) → **Firmada** (no se edita; se corrige con adenda o se **anula** y se emite otra, con motivo, quién y cuándo; la anulada conserva su número). Nada se borra.
4. **Dónde se ve**: queda como una tarjeta en el expediente del paciente, siguiendo el mismo patrón que "Autorización quirúrgica" (la lista de **Referencias** del paciente, con "Ver", "Imprimir", "Descargar PDF"). Cada impresión o descarga se registra.
5. **No cierra la estancia**: firmar una referencia **no** da de alta ni hace el egreso. Si el paciente está en observación u hospitalización, después de firmar se ofrece un aviso "¿Registrar el egreso?" que lleva al flujo de Egreso que ya existe (si ese flujo ya tiene un tipo de egreso "Referido" o "Traslado", se propone; si no existe, no lo inventes y repórtalo).
6. **Privacidad**: la referencia contiene diagnóstico y datos clínicos porque va dirigida al médico del centro receptor. **No se envía por WhatsApp** ni por ningún canal automático; se imprime o se descarga el PDF y se entrega al paciente o a su familia. Si ya existe un envío para otros documentos, **no** lo conectes a la referencia en esta ronda.
7. **No incluye** (esta ronda): hoja de respuesta o contrarreferencia del centro receptor, ni comunicación con otros sistemas.
8. Disponible para **Médico** (crea, firma, anula); Enfermería y Administración la **ven e imprimen** (sección 4). En Consultorio, la médica.

**Base legal — lo que verifiqué y lo que no** (para que lo valide yo o un abogado; no pongas citas legales en la pantalla):
- La Secretaría de Salud de Honduras tiene un **Sistema Nacional de Referencia y Respuesta** (SINARR, 2016) y "Lineamientos de Referencia y Respuesta" para la red pública. **No pude acceder al texto con los campos obligatorios de su formato ni verificar que obligue a clínicas privadas.** Por eso la hoja sigue la estructura que pedí (epicrisis + motivo + destino) y queda marcada para mi validación.
- El **Código de Ética del Colegio Médico de Honduras** (versión publicada en la Biblioteca Virtual en Salud de Honduras, bvs.hn, en un documento de 2005, sin fecha de aprobación; existe una versión más reciente que no pude comparar) dice que la información del paciente no debe compartirse sin su consentimiento salvo daño al paciente o a terceros (Art. 14 en ese texto), exige discreción al equipo (Art. 16), protege la intimidad ante los sistemas de informática médica (Art. 18) y prohíbe comisiones por referir pacientes (Art. 44). **Otra fuente numera esos mismos artículos distinto (9, 13, 14, 16, 111), así que no cites números en la aplicación** hasta que verifique el texto vigente.
- Otras normas citadas por un informe regional, **sin verificar yo el texto**: Código Penal (secretos por razón del oficio; datos de salud como agravante) y Código de Salud (confidencialidad de información epidemiológica).
- **Ley de protección de datos personales**: no pude confirmar que esté vigente; la prensa de agosto y octubre de 2026 la presenta aún en discusión. Pendiente de validar.
- De ahí salen la casilla de consentimiento, la prohibición de envío automático y el pie de confidencialidad. **Esto no es asesoría legal.**

**Criterios de aceptación:**
- [ ] Como Dra. Lucía Herrera, en un hospitalizado veo el botón "Referencia" en la fila de acciones; en observación también; en una consulta externa veo "Referir a otro centro".
- [ ] La hoja se abre con diagnóstico de ingreso, diagnóstico de egreso o actual, HEA y tratamiento recibido ya llenos desde el expediente, y los puedo editar.
- [ ] No se puede firmar sin "Motivo de referencia", sin centro de destino ni sin marcar la casilla de consentimiento.
- [ ] Firmada, no se edita; puedo agregar adenda o anularla (con motivo) y emitir otra; la anulada conserva su número.
- [ ] Se imprime en una hoja carta con membrete, número de colegiado y espacio para firma y sello, y se descarga en PDF.
- [ ] Firmarla no da de alta; se ofrece ir a Egreso.
- [ ] No hay botón de enviar por WhatsApp.
- [ ] Aparece en la lista de Referencias del paciente; cada impresión queda registrada.
- [ ] Lic. Carmen Ríos (Enfermería) puede verla e imprimirla pero no crearla; Sofía Mejía (Recepción) no la ve (probado también por URL directa).
- [ ] Funciona en Consultorio (Dra. Ana López).
- [ ] Probado a ~390 px.

---

### Grupo UM — Valores de referencia y umbrales críticos con su fuente

**Importante, léelo antes de empezar.** Pedí "los umbrales críticos del catálogo, con la referencia de la fuente". El archivo adjunto **`valores_referencia_laboratorio.md`** trae los rangos de unos 300 exámenes (con fuente) y 6 valores críticos de fármacos (Anexo A). Decisión mía: **esos valores son los que usa la app**. **UM1** los carga como valores de referencia (Alto/Bajo) y **UM2** los carga como umbrales críticos; en ambos, si ya había un valor se reemplaza y si no existía se crea. No inventes valores que el archivo no trae: lo que el `.md` no tenga se queda como está o dice "Sin umbral crítico definido".

#### UM1 — Cargar los valores de referencia del .md, con su fuente [CK]

**Cómo está hoy (captura 12 y ronda 7):** muchos exámenes del catálogo nacieron **sin valores de referencia** (ronda 7, B11: "los completo yo o Administración"). Los pocos que tienen (Creatinina, Glucosa en ayunas, Glucosa posprandial) muestran "N valores con rango de referencia". Ninguno muestra de dónde sale el valor.

**Qué quiero:**
1. **Carga** los valores del `.md` adjunto en los exámenes del catálogo, **con un script que lea el archivo** (no los copies a mano, para evitar errores de dedo), idempotente y para las bases de **todas** las clínicas y consultorios. Deja el `.md` en el repositorio como fuente (por ejemplo en `data/`).
2. **Tabla de fuentes**: crea una tabla de fuentes (código, cita completa, enlace) con las **59 fuentes** de la sección "Fuentes consultadas" del `.md` (códigos como `ABIM-2026`, `ADA-2026`, `MSD-TDM`). Cada valor de referencia guarda **una o más fuentes** (algunas filas citan dos, por ejemplo `[ABIM-2026] / [ADA-2026]`).
3. **Emparejar** cada fila del `.md` con un **examen y analito** del catálogo (los nombres finales de la ronda 7). Escribe la tabla de emparejamientos en `PLAN_RONDA8.md`. **Si una fila no tiene pareja en el catálogo, créala**: crea el examen o analito con el nombre del `.md`, su sección como grupo (Hematología, Química en sangre, etc.), su unidad y su valor con fuente; si es un analito de un examen que ya existe (por ejemplo Potasio dentro de Electrolitos), agrégalo a ese examen. **Antes de crear, busca sinónimos** (TGO/AST, TGP/ALT, VCM, ADE/RDW, Hb, etc.) para no duplicar lo que ya existe con otro nombre. Lo que crees queda con origen "Catálogo Clinara 2026-11-02" y lo lista el reporte como "creado". Lista también los exámenes del catálogo que quedaron sin ningún valor.
4. **Tipos de valor y cómo cargarlos** (sin inventar nada):
   - **Intervalo numérico** (ej. Hemoglobina 12–16 g/dL): mínimo, máximo y unidad.
   - **Un solo límite** (ej. `<0.5`, `≤0.04`): solo máximo o solo mínimo.
   - **Por sexo** (ej. Mujeres / Hombres): un valor para cada sexo, que se compara con el **sexo del paciente**. Si el modelo actual no distingue sexo, agrega la dimensión mínima (todos / femenino / masculino) sin romper los valores ya existentes.
   - **Categorías** (glucosa en ayunas, HbA1c, lípidos, PCR ultrasensible, TFG KDIGO, albuminuria): usa como rango el primer nivel "normal / deseable / óptimo" que indica el archivo, y guarda **todas las categorías como texto de nota** (por ejemplo "Prediabetes 100–125; Diabetes ≥126") para que se vean.
   - **Resultado cualitativo o título** ("Negativo", "No reactivo", "No detectado", "≤1:64"): se guarda como **"Resultado esperado"** (texto), sin comparación numérica. Si el ingreso de resultados de ese examen ya permite elegir un valor, usa ese mecanismo para marcar lo que difiere; **no construyas pantallas nuevas de resultados**.
   - **Por edad o fase del ciclo** (AMH, IGF-1, IGFBP-3, estradiol, FSH, LH, progesterona, 17-OH-progesterona, NT-proBNP por edad…): guárdalo como **texto de referencia** (nota) con su fuente, **sin marcar Alto/Bajo automático**; no construyas lógica de bandas de edad en esta ronda y lístalo en el reporte.
   - Filas marcadas **‡** (resultado esperado por definición, sin fuente específica verificada): se cargan con la fuente **"Sin fuente específica verificada"** (gris), tal como dice el archivo. No les inventes cita.
   - Filas marcadas **⚠️** (aldolasa, colinesterasa, digoxina): se cargan con un **icono de advertencia** y la nota del archivo ("verifica la unidad que usa tu laboratorio").
   - Filas que dicen "Sin intervalo estandarizado": no se cargan como rango; quedan como nota.
5. **Unidades**: el valor debe quedar **en la unidad del analito en Clinara**. Ejemplo: el `.md` dice plaquetas `150,000–450,000 /µL` y leucocitos `4,000–11,000 /µL`, pero en Clinara están en `×10³/µL` (captura 12): cárgalos como `150–450` y `4–11` ×10³/µL. Si no puedes convertir con seguridad, **no cargues** y repórtalo. Nunca mezcles unidades.
6. **A quién se aplica**: a **todos los pacientes**, sin distinguir edad ni embarazo. Decisión mía: ningún laboratorio cambia el resultado por ser niño o embarazada, así que **no pongas la marca "Adultos no embarazadas" ni el mensaje "Sin referencia para esta edad o estado"** y no construyas lógica de edad o embarazo. Solo cuenta el **sexo** cuando el valor lo distingue. (A5 de la sección 6.)
7. **Los del `.md` mandan y reemplazan**: si un analito **ya tiene** un valor de referencia (por ejemplo Creatinina, Glucosa en ayunas o Glucosa posprandial), **quítalo y pon el del `.md`**, con su fuente. El valor anterior **no se borra**: queda archivado en el historial del analito (valor, quién y cuándo lo reemplazó) y en el reporte lista cada reemplazo como "antes → ahora" para que yo lo vea. Esto aplica aunque la clínica lo haya editado a mano. Si una fila del `.md` no tiene pareja en el catálogo, **créala** (punto 3). Si un analito tiene valor propio y el `.md` no trae ninguno para él, se queda como está.
8. **Marca de origen**: cada valor cargado queda con origen "Catálogo Clinara 2026-11-02" y fuente. Si después Administración lo edita, pasa a "Editado por la clínica" y **una carga futura (otra versión del `.md`) no lo pisa**. Esto no contradice el punto 7: la carga de hoy reemplaza lo que haya; las futuras respetan lo que la clínica edite desde hoy.
9. **Dónde se ve la fuente**: en **Configuración › Catálogo de exámenes › Editar**, cada rango muestra una etiqueta pequeña con la fuente (ej. "ABIM 2026") que al tocarla abre la cita completa y el enlace. Las filas con ‡ muestran "Sin fuente específica verificada".
10. **Edición**: la clínica (Administración) o el médico del Consultorio puede editar cualquier valor, con el mismo "Editar" de siempre; al editar se pide, opcional, una nota y la fuente pasa a "Definido por la clínica".
11. **Verificación de los valores (la haces tú, Max)**: yo no pude abrir ABIM ni MSD. Antes de cargar, **verifica los valores del `.md` contra sus fuentes citadas** (empieza por ABIM-2026, MSD-TDM y CHI-TDM) con tu acceso a internet. Revisa al menos Hemoglobina, Hematocrito, Creatinina, Sodio, Potasio, TSH, Troponina I y Ferritina, y de ahí amplía a todo lo que puedas. **Si un valor del `.md` no coincide con su fuente, no lo cargues ni lo cambies por tu cuenta**: déjalo en el reporte como "diferencia con la fuente" con ambos números y el enlace. Si no puedes abrir una fuente, repórtalo como "no verificado".

**Criterios de aceptación:**
- [ ] Hemoglobina muestra 12–16 g/dL para mujeres y 14–18 g/dL para hombres, con la etiqueta "ABIM 2026".
- [ ] Potasio (3.5–5.0 mEq/L) y Sodio (136–145 mEq/L) existen con su valor y fuente; si alguno no existía en el catálogo, se creó.
- [ ] Plaquetas queda `150–450 ×10³/µL`, no `150,000–450,000`.
- [ ] Un resultado de hemoglobina se marca Bajo/Alto según el sexo del paciente, sea adulto, niño o embarazada; no aparece ningún mensaje de edad o embarazo.
- [ ] Glucosa en ayunas, que ya tenía un valor, queda con el del `.md` (70–99 mg/dL, con su fuente); el valor anterior queda archivado en el historial y el reporte lo lista como "antes → ahora". Lo mismo con Creatinina y Glucosa posprandial.
- [ ] Un examen cualitativo (ej. VIH 4.ª generación) muestra "Resultado esperado: No reactivo" y la fuente CDC.
- [ ] Un examen con ‡ muestra "Sin fuente específica verificada".
- [ ] Digoxina y Aldolasa muestran la advertencia de unidad.
- [ ] Todas las filas del `.md` están en una de tres listas del reporte: cargadas (reemplazadas o creadas), o no cargadas con motivo. Ninguna fila queda "sin pareja": si no existía, se creó. Sin duplicados por sinónimos. Todos los exámenes del catálogo están en: con valor o sin valor.
- [ ] El reporte trae la verificación contra las fuentes: valores verificados, diferencias encontradas y fuentes que no se pudieron abrir.
- [ ] La carga corre dos veces sin cambiar nada la segunda vez, y una edición hecha por la clínica **después** de la carga no se pisa en cargas futuras.
- [ ] Probada sobre una copia de la base.

#### UM2 — Umbrales críticos: los valores del .md pasan a ser los límites, con fuente [CK]

**Cómo está hoy (capturas 2 y 12):** "Umbrales críticos de laboratorio" funciona como quiero (grupos Hemograma, Química sanguínea, Electrolitos… con "Crítico si es menor de / mayor de"), pero **cada clínica empieza con pocos umbrales** (por ejemplo Hemoglobina 7 y 20, Potasio 2.8 y 6.2) y ninguno dice de dónde sale.

**Qué quiero:** "que la app tenga ya los umbrales establecidos, y que la clínica o el doctor, si quiere, pueda cambiarlos", "que vayan con referencia". Mi decisión (confirmada): **los valores del `.md` son los umbrales de la app.** Si el analito ya tiene umbral, se corrige con el del `.md`; si no existe, se crea.

1. **Qué se carga como umbral.** Para **cada analito numérico** del `.md` (intervalo, o un solo límite) y para los **6 fármacos** del Anexo A:
   - **Intervalo** (ej. Hemoglobina mujeres 12–16, hombres 14–18; Sodio 136–145; Potasio 3.5–5.0; Plaquetas 150–450 ×10³/µL): "Crítico si es menor de **mín**" y "Crítico si es mayor de **máx**".
   - **Por sexo** (Hemoglobina, Hematocrito, Creatinina, GGT, CPK, Ferritina, etc.): un umbral para mujeres y otro para hombres, comparado con el sexo del paciente (misma dimensión mínima de UM1).
   - **Un solo límite** (ej. `<0.5`): solo el límite que existe, el otro queda vacío.
   - **Fármacos** (Anexo A): su valor crítico del `.md` (ej. digoxina ≥ 2.1), en un grupo nuevo **"Fármacos (niveles séricos)"**.
   - **No se cargan como umbral**: resultados cualitativos, categorías (glucosa, HbA1c, lípidos, KDIGO), valores por edad o fase del ciclo, filas ‡ sin intervalo, y "sin intervalo estandarizado". Esos quedan solo como referencia (UM1).
2. **Reemplazar o crear.** Si el analito **ya tiene umbral**, quita el anterior y pon el del `.md`, con su fuente (aunque la clínica lo haya editado a mano). El anterior **no se borra**: queda archivado en el historial (valor, quién y cuándo) y el reporte lo lista como "antes → ahora" (ej. Hemoglobina "7 y 20 → 12 y 16"). Si el analito **no tiene umbral** o ni siquiera existe, créalo (igual que en UM1, con búsqueda de sinónimos). Si un analito tiene umbral propio y el `.md` no trae valor para él, se queda como está, con la fuente "Valor inicial de Clinara (sin fuente) · VALIDAR: Emil".
3. **Unidades**: igual que UM1, en la unidad del analito en Clinara (Plaquetas `150` y `450` en ×10³/µL, no `150,000`). Si no puedes convertir con seguridad, no cargues y repórtalo.
4. **Todo analito sin umbral**: se muestra "Sin umbral crítico definido" (no un cero). El reporte lista los analitos del catálogo sin umbral.
5. **Editable**: Administración (en Clínica) y la médica titular (en Consultorio) pueden cambiar cualquier umbral, como hoy. El valor **predeterminado se conserva aparte** del editado:
   - un umbral editado muestra **"Personalizado"** con quién y cuándo (bitácora);
   - un botón pequeño **"Restablecer"** lo devuelve al predeterminado (el del `.md`);
   - si el predeterminado se actualiza en el futuro, **no pisa** los personalizados (A9).
6. **Fuente a la vista**: columna **"Fuente"** angosta en la pantalla de Umbrales (etiqueta pequeña que abre la cita completa y el enlace, como en UM1); a ~390 px baja debajo de cada fila. El diseño de la pantalla no cambia (sección 2).
7. **Operador del límite**: el `.md` dice "≥100" en algunos valores y la pantalla dice "mayor de". Revisa **cómo compara el código hoy** (> o ≥) y **no cambies esa lógica**; carga el número tal como está en la fuente y anota el operador original en la nota del umbral. Repórtamelo (A9).
8. **A quién se aplica**: a **todos los pacientes**, sin distinguir edad ni embarazo (misma decisión que UM1 punto 6). El umbral anterior queda archivado (punto 2) y no se vuelve a aplicar.
9. **No se vuelven umbrales** los puntos de corte diagnósticos que no son rangos normales (etanol "intoxicación ≥80–100", glucosa o HbA1c diagnósticas, NT-proBNP por probabilidad de insuficiencia cardíaca).

**Criterios de aceptación:**
- [ ] Hemoglobina tiene umbral por sexo: mujeres 12 y 16, hombres 14 y 18 g/dL, con fuente "ABIM 2026"; los anteriores (7 y 20) quedan en el historial y el reporte dice "antes → ahora".
- [ ] Potasio 3.5 y 5.0, Sodio 136 y 145, Plaquetas 150 y 450 ×10³/µL tienen umbral con su fuente; si alguno no existía, se creó.
- [ ] Una paciente con Hb 11 se marca crítica; un niño de 3 años con la misma Hb también se evalúa con el mismo rango (según su sexo), sin mensaje de edad.
- [ ] En Configuración › Áreas de servicio › Umbrales críticos aparece el grupo "Fármacos (niveles séricos)" con Ácido valproico, Carbamazepina, Digoxina, Fenitoína, Fenobarbital y Litio, cada uno con su umbral y su fuente.
- [ ] Una clínica **nueva** y un consultorio **nuevo** nacen con todos estos umbrales ya cargados.
- [ ] Un analito sin valor numérico en el `.md` y sin umbral previo dice "Sin umbral crítico definido".
- [ ] Un analito con umbral propio que el `.md` no trae conserva su número con la fuente "Valor inicial de Clinara (sin fuente)".
- [ ] Cambio el umbral de digoxina: queda "Personalizado" con mi nombre y hora; "Restablecer" lo devuelve al del `.md`.
- [ ] Como Dra. Ana López (consultorio) puedo editarlos; un médico de la clínica que no es Administración no puede (probado también por URL directa).
- [ ] Un resultado de digoxina de 2.5 ng/mL se marca crítico; uno de 1.2 no.
- [ ] El diseño de la pantalla se conserva; la columna "Fuente" no desborda a 390 px.
- [ ] El reporte lista: umbrales reemplazados ("antes → ahora"), creados, analitos sin umbral, y la lógica de comparación (> o ≥) del código.
- [ ] La carga corre dos veces sin cambiar nada la segunda vez; probada sobre una copia de la base.

---

### Grupo DM — Datos demo (al final)

#### DM1 — Quitar las citas imposibles de los datos demo [C]

Para probar CX2: en los datos demo ningún paciente con **estancia activa** (observación u hospitalización) puede tener una cita de hoy en la cola de consulta externa (como el paciente de la captura 4). Ajusta la semilla de datos demo para que **no se generen** esas combinaciones y corrige las que ya existen (con la migración de CX2). **No borres ningún perfil demo** (Roberto Aguilar, Sofía Mejía, Lic. Carmen Ríos, Aux. Karla Mendoza, Dra. Lucía Herrera, Dr. Andrés Paz, Dra. Mariela Zúñiga, Dra. Ana López, Dr. Daniel Fúnez Castillo): solo se ajustan citas y lo que dependa de ellas. Deja **al menos un paciente demo hospitalizado** y **uno en observación** sin cita hoy, para poder probar CX2 y RF1.

**Criterios de aceptación:**
- [ ] En Consulta externa de los datos demo no hay ningún paciente hospitalizado o en observación en "Por llegar" ni "En sala".
- [ ] Todos los perfiles demo siguen igual.
- [ ] Hay al menos un hospitalizado y uno en observación para probar.

---

## 4. Permisos de lo nuevo

✔ puede, ○ solo ve, — no tiene acceso. En Consultorio, la médica titular tiene los permisos de Médico y de Administración del consultorio.

| Función | Recepción | Enfermería | Médico | Administración |
|---|---|---|---|---|
| Vista "Por hora / Por médico" en Consulta externa (CX1) | — | — | — | ✔ |
| El bloqueo de pacientes con estancia activa aplica al marcar "Llegó", "Paciente sin cita" y agendar (CX2) | ✔ (se aplica) | ✔ (se aplica) | — | ✔ (se aplica) |
| "Configuración" personal abajo del menú (GE2) | ✔ | ✔ | ✔ | ✔ (más "Configuración de la clínica") |
| Cuadro "Evolución", diagnósticos precargados (NE3, NE4) | — | — | ✔ | — |
| Indicar infusión y primera dosis diferente (ME1, ME2) | — | — | ✔ | — |
| Registrar inicio y suspensión de infusión; administrar dosis inicial (ME1, ME2) | — | ✔ | ✔ en Consultorio | — |
| Ver Exámenes desplegable con búsqueda (EX1) | según acceso actual | ✔ | ✔ | según acceso actual |
| Imprimir o descargar la orden de exámenes (EX2) | según acceso actual a "Órdenes impresas" | ✔ | ✔ | según acceso actual |
| Agregar informe a un Rayos X (EX3) | — | según acceso actual | ✔ | — |
| Crear, firmar y anular una referencia (RF1) | — | — | ✔ | — |
| Ver e imprimir una referencia (RF1) | — | ✔ | ✔ | ○ |
| Editar valores de referencia del catálogo (UM1) | — | — | ✔ en Consultorio | ✔ |
| Editar y restablecer umbrales críticos (UM2) | — | — | ✔ en Consultorio | ✔ |
| Ejecutar las cargas y migraciones (UM1, UM2, CX2, DM1; quedan en bitácora) | — | — | — | solo el equipo técnico |

---

## 5. Orden de implementación sugerido

De lo rápido y aislado a lo grande. Lo que depende de otro punto va después. Los datos demo, siempre al final.

1. **Rápidos y aislados**: GE2, EX3, NE3.
2. **Desborde y formulario de medicamento**: NE5 (antes de ME1 y ME2, porque ambos agregan secciones al formulario).
3. **Medicamentos**: ME1 → ME2.
4. **Exámenes**: EX1 → EX2.
5. **Notas**: NE4 (usa la cadena de MC7).
6. **Consulta externa**: CX1 (reutiliza el componente de AD1/RE1) → CX2 (migración).
7. **Valores de referencia**: UM1 (crea la tabla de fuentes) → UM2 (usa la tabla de fuentes).
8. **Referencia**: RF1 (usa la plantilla de la epicrisis y de las órdenes de EX2).
9. **Datos demo**: DM1.

---

## 6. Ambigüedades y valores por defecto

Decisiones que tomé porque no las especifiqué. Usa estas y listalas en el reporte para que yo las confirme. Las más importantes son **A1, A4, A5 y A11**.

| Cód. | Tema | Valor por defecto |
|---|---|---|
| A1 | NE3 qué es "un cuadro entre el diagnóstico y el examen físico" | Un **cuadro de texto "Evolución"** (cómo ha evolucionado el paciente desde la nota anterior), opcional, solo en Estándar. El orden queda Diagnósticos → Evolución → Signos vitales (opcional) → Examen físico → Observaciones. |
| A2 | NE4 diagnósticos | Se precargan los de la última nota firmada, editables con ✕ y buscador CIE-11; la tarjeta firmada no lleva etiquetas Continúa/Nueva; los cambios quedan en bitácora. |
| A3 | CX1 alcance | Solo **Administración**, en **Consulta externa** de Clínica; las tres columnas; los pacientes sin cita van en un grupo "Sin cita" (por hora) o "Sin médico asignado" (por médico). Otros roles, apagado (se activa con un valor de configuración). |
| A4 | GE2 nombres | La personal pasa a "Configuración" (abajo, tuerca); la de la clínica pasa a "Configuración de la clínica". La tarjeta no es botón; el cambio de rol (GE1) se conserva en un control aparte solo para quien tiene varios roles. |
| A5 | UM1 y UM2 poblaciones | Decidido por Emil: los valores del `.md` se aplican a **todos** los pacientes; sin lógica de edad ni embarazo y sin marca "Adultos no embarazadas". Solo se usa el sexo cuando el valor lo distingue. |
| A6 | ME1 hoja de enfermería para infusión | Un evento de inicio a la hora de inicio ("Toca ahora"/"Atrasado" hasta registrarlo); luego "En infusión desde HH:MM · X mL/h"; botón "Suspender infusión"; cambiar la velocidad = nueva orden con nuevo inicio. Unidades mL/h y mL/min. |
| A7 | ME2 detalles | La vía es la misma para todas las dosis; la primera dosis de mantenimiento se programa a **hora inicial + intervalo**; la casilla solo aparece con frecuencias repetitivas; las órdenes viejas no se convierten. |
| A8 | EX2 contenido de la orden | Lleva la **indicación clínica** escrita por el médico y **no** los diagnósticos CIE-11 (privacidad); no dice "Externo"; incluye colegiado, firma y sello en papel. Reutiliza el envío virtual de la receta si existe; si no, solo PDF. |
| A9 | UM2 valores y operador | Decidido por Emil: el rango del `.md` es el umbral crítico (Hb mujeres 12 y 16, hombres 14 y 18, etc.) más los 6 de fármacos; si el analito no existe se crea y si ya tenía umbral se reemplaza (el anterior queda en el historial). **Riesgo clínico: todo valor fuera del rango normal sale como crítico; valídalo.** `VALIDAR: Emil`. El predeterminado se guarda aparte del personalizado; "Restablecer" por umbral. No se cambia la lógica de comparación (> o ≥); se anota el operador de la fuente. |
| A10 | EX3 qué es Rayos X | Subgrupo "Rayos X" del catálogo y los no catalogados de imagen cuyo nombre empiece por "Rayos X", "Radiografía" o "Rx". Lista en configuración. |
| A11 | RF1 campos que no mencioné | Destino (centro, servicio o especialidad, prioridad), casilla de consentimiento del paciente, número correlativo, pie de confidencialidad, permisos (médico crea; enfermería y administración ven), sin envío por WhatsApp, no cierra la estancia, sin hoja de respuesta. |
| A12 | UM1 analitos creados | Los analitos que se creen desde el `.md` quedan **visibles y activos** desde el inicio; Administración puede archivarlos. Se listan en el reporte. |
| A12 | CX1 otros roles | Recepción y Enfermería siguen con la lista actual. Si los quiero ahí, lo pido aparte. |
| A13 | CX2 observación | La regla de bloqueo cubre estancias en **Observación y Hospitalización**. Citas futuras: se permiten con aviso; si llega el día con estancia activa, quedan en conflicto. |
| A14 | EX1 vistas | Orden por fecha del pedido (recientes primero); agrupa por día; filtros Todos / Pendientes / Con resultado / Críticos; el crítico sin revisar abre solo. |
| A15 | Fuentes | Las 59 fuentes del `.md` entran a una tabla (código, cita, enlace). Las filas con ‡ dicen "Sin fuente específica verificada". |

---

## 7. Revisión final antes de entregar

**Marca cada casilla antes de decir que terminaste:**

- [ ] Todos los puntos cumplen **todos** sus criterios de aceptación (sección 3).
- [ ] Todo lo de la sección 2 sigue intacto (tarjeta de nota firmada, formulario de medicamento actual, menú "Ordenar exámenes", pestaña Exámenes, pantalla de Umbrales, tarjetas de Consulta externa).
- [ ] Probado a **~390 px**: sin desborde horizontal y con botones de al menos 44 px, **con el formulario de medicamento abierto** y con Infusión y Dosis inicial desplegadas.
- [ ] Probado en escritorio a **1920, 1366 y 1280 px** (NE5).
- [ ] **Permisos** de la sección 4 comprobados también **por URL directa**.
- [ ] **Migraciones y cargas probadas sobre una copia de la base** (CX2, UM1, UM2, DM1), **idempotentes** y garantizadas en todas las bases (clínicas y consultorios).
- [ ] La carga de UM1 reporta: filas cargadas, creadas (no existían), no cargadas con motivo, valores existentes reemplazados ("antes → ahora") y exámenes del catálogo sin valor.
- [ ] La lista de analitos sin umbral crítico (UM2) y la lógica de comparación (> o ≥) están en el reporte.
- [ ] Sin errores de `build`, typecheck, lint ni de consola.
- [ ] Textos en español correcto, fechas `dd/mm/aaaa` y hora de 24 horas.
- [ ] Las constantes nuevas están en el archivo de configuración con `VALIDAR: Emil` (unidades de infusión, Rayos X, pie de confidencialidad, poblaciones).

**Flujo de punta a punta con usuarios demo** (haz este recorrido completo y reporta el resultado):

1. **Roberto Aguilar (Administración)**: menú con "Configuración de la clínica" y "Configuración" (tuerca, abajo); la tarjeta de usuario no es botón. Consulta externa: "Por médico" y "Por hora", contraer un grupo. Configuración de la clínica › Catálogo de exámenes › Editar Hemoglobina (valores por sexo con fuente); Áreas de servicio › Umbrales críticos (grupo "Fármacos", fuente, "Personalizado" y "Restablecer").
2. **Sofía Mejía (Recepción)**: intentar "Paciente sin cita" y agendar para hoy a un paciente hospitalizado: bloqueado con mensaje.
3. **Lic. Carmen Ríos (Enfermería)**: Consulta externa sin pacientes hospitalizados en "En sala"; en un hospitalizado, pestaña Exámenes: radiografía "Realizado" terminada sin pendiente; laboratorio desplegable con búsqueda y orden por fecha.
4. **Dra. Lucía Herrera (médico)**: en un hospitalizado, "Nueva nota de evolución" (Estándar): diagnósticos precargados, cuadro "Evolución", formulario de medicamento sin recorte; agregar **Ceftriaxona** con "Primera dosis diferente (STAT)" 2 gr y luego 1 gr c/12h; agregar una **Infusión** a 20 mL/h; ordenar una tomografía "Externo" y un examen de laboratorio "Externo"; firmar; imprimir las órdenes; luego "Referencia" a otro centro (firmar, imprimir PDF, anular y emitir otra).
5. **Lic. Carmen Ríos**: hoja de medicamentos: dosis inicial de 2 gr ahora y siguiente de 1 gr a las 12 horas; registrar el inicio de la infusión y suspenderla; ver e imprimir la referencia (sin poder crearla).
6. **Dra. Ana López (Consultorio)**: nota de evolución en observación con los mismos cambios, referencia desde la nota de consulta, editar un umbral crítico y un valor de referencia.
7. **Un médico que no es Administración, por URL directa**, a la edición de umbrales del catálogo de una clínica: debe dar "sin permiso".
8. **Un paciente menor de edad (Dr. Andrés Paz)**: un resultado de hemoglobina se evalúa con el mismo rango según su sexo.

---

## 8. Reporte final que espero

1. **Tabla por punto** (CX1, CX2, GE2, NE3, NE4, NE5, ME1, ME2, EX1, EX2, EX3, RF1, UM1, UM2, DM1): estado (**Hecho / Parcial / No hecho**), archivos cambiados y **cómo lo pruebo yo en 2 o 3 pasos**.
2. **Por qué pasaba cada falla** que te pedí investigar: el desborde del formulario de medicamentos (NE5), por qué los externos no generaban orden (EX2), de dónde sale la etiqueta "Hospitalizado" en "En sala" (CX2) y por qué la Dra. Herrera aún decía "Vista de médico" (GE2).
3. **Cambios en la base de datos**: tablas y columnas nuevas (fuentes, valores de referencia, umbrales, referencias, órdenes impresas), migraciones, y qué datos se convirtieron (citas canceladas por el sistema, Rayos X ahora terminados).
4. **Valores por defecto usados** (sección 6) y cuáles cambiaste.
5. **UM1 y UM2**: filas cargadas, creadas (no existían), no cargadas con motivo, valores existentes reemplazados ("antes → ahora"), exámenes sin valor, analitos sin umbral crítico, lógica de comparación (> o ≥), y cómo quedó garantizado en producción.
6. **Lo que debo validar yo o un abogado**: la base legal de RF1 y el texto del consentimiento, los umbrales críticos (ahora iguales al rango normal del `.md`) y los umbrales propios sin fuente, la velocidad de infusión y sus unidades, y la lista de Rayos X.
7. **Hallazgos fuera de la lista** (otras incongruencias de datos, errores de interfaz): repórtalos, **no los implementes** sin preguntarme.
8. **Verificaciones que no pudiste hacer** y por qué.

---

## Anexo A — Valores críticos que trae el `valores_referencia_laboratorio.md` (UM2)

Son los únicos valores que el archivo marca expresamente como críticos. Los demás umbrales salen del rango normal de cada analito (UM2 punto 1). Los números salen del `.md`; verifícalos contra el archivo antes de cargarlos.

| Analito | Crítico si es mayor de | Unidad | Fuente | Nota |
|---|---|---|---|---|
| Ácido valproico | 100 (la fuente: ≥100) | µg/mL | MSD-TDM | Rango terapéutico 50–99 |
| Carbamazepina | 15.0 (≥15.0) | µg/mL | MSD-TDM | Rango terapéutico 4.0–12.0 |
| Digoxina | 2.1 (≥2.1) | ng/mL | MSD-TDM | ⚠️ la fuente escribe "mg/dL"; el rango se expresa en ng/mL; rango terapéutico 0.8–2.0 |
| Fenitoína | 25.0 (≥25.0) | µg/mL | MSD-TDM | Rango terapéutico 10.0–20.0 |
| Fenobarbital | 50.0 (≥50.0) | µg/mL | MSD-TDM | Rango terapéutico 10.0–30.0 |
| Litio | 2.0 (">2.0", valor de pánico) | mmol/L (= mEq/L) | CHI-TDM | Rango terapéutico 0.6–1.2 |

**No son umbrales críticos** y no se cargan como tales: "Etanol (sangre): intoxicación ≥80–100 mg/dL", los puntos de corte diagnósticos de glucosa, HbA1c y lípidos, y las probabilidades de insuficiencia cardíaca por NT-proBNP.

## Anexo B — Reglas de lectura del `.md` (UM1)

- El archivo tiene 15 secciones (Hematología, Coagulación, Química en sangre, Química en orina, Hormonas, Drogas de abuso y fármacos, Inmunología, Enfermedades infecciosas, Marcadores tumorales, COVID-19, Microbiología, Orina, Heces, Biología molecular, PCR/cargas virales), una sección **Notas** y una lista de **59 fuentes** con su código.
- **Población**: el archivo dice adultos no embarazadas (≥18 años), pero **se aplica a todos los pacientes** (A5). Unidades convencionales.
- **"Un solo valor por prueba"**: cuando dos fuentes diferían, el archivo ya dejó el de la fuente más reciente; no busques el otro.
- Símbolos: **⚠️** = revisar unidad o dato llamativo (ver la sección Notas); **‡** = resultado esperado por definición sin fuente específica; sin símbolo = verificado en la fuente citada, según el archivo.
- Los rangos del laboratorio que emite el resultado siempre mandan sobre estos valores generales: el rótulo en la pantalla de edición debe decir "Referencia general; el rango oficial es el del laboratorio que emite el resultado".
- **No incluye estudios de imagen** y no cubre algunos exámenes del catálogo (por ejemplo Gases arteriales): esos se quedan como están.