# Clinara (MedBase) — Ronda 11 de correcciones

> Adjunto a este prompt el archivo **correcioens_ronda_11.docx** (6 capturas), que muestra cómo se ve hoy cada pantalla. Ábrelo antes de empezar.

---

## 0. Contexto

Soy Emil, médico general en Honduras, y me encargo de la parte clínica de **Clinara** (también llamada MedBase), una aplicación web de gestión clínica desplegada en https://medbase-lac.vercel.app. La desarrollo con un amigo programador que no es del área médica. Esta es la **ronda 11**.

**Qué es Clinara.** Sistema para clínicas pequeñas y medianas y consultorios de Honduras. Pocos médicos, una recepcionista, enfermería y a veces laboratorio e imágenes. Las soluciones deben ser simples, con pocas pantallas y pocos clics, en español de Honduras.

**Qué se hizo antes (una línea por ronda relevante).**
- **Ronda 6**: menú "Ordenar exámenes" (MC4), catálogo con subgrupos (CF3) y perfiles de laboratorio (CF6), estudios no catalogados con tipo (MC3), Rol de turnos con panel y repetición (TU1), rol de turnos de enfermería (TU2), cargos Licenciada/Auxiliar dentro del rol Enfermería (PE1).
- **Ronda 8**: pestaña Exámenes desplegable (EX1), órdenes imprimibles de exámenes externos (EX2), Rayos X sin informe obligatorio (EX3), umbrales críticos (UM1, UM2).
- **Ronda 9**: nebulización (ME4), carga del LNME al vademécum (ME5), componente propio de fecha y hora de 24 h (GE3), periodo de gracia de 5 minutos con versiones (GE4).
- **Ronda 10**: catálogo de Imagen y gabinete por región con proyección, contraste y lado (CA5), quitar umbrales archivados (UM3), vademécum completo y paginado (ME6, ME7), buscador de medicamentos (ME8), STAT solo IV (ME9), **receta de medicamentos que la clínica no tiene** (ME10), ventana de dosis (EN4), **resultado en pantalla y "Ver archivo"** (EX4), "Imprimir orden" desde Exámenes (EX5), paginación (GE5), ventana "Ordenar exámenes" de tamaño fijo (GE6).

**Esta ronda** corrige CA5 (lo entendimos mal: el catálogo de imagen quedó con decenas de estudios por región y yo quiero pocos estudios con campos al ordenar), amplía EX4 (imprimir y ver en PDF los resultados), amplía ME10 (receta con **cualquier** medicamento, también desde **Anexos**), arregla dos problemas de interfaz y agrega una parte grande nueva: los **departamentos de Laboratorio clínico e Imágenes** con sus propios perfiles. **Revisa el estado real del código y de la base de datos antes de tocar cada cosa** para no duplicar funciones.

**Reglas generales (valen para todo):**

- **Dos modos**: **Clínica** (ej. "Clínica Santa Brígida") y **Consultorio** de médico independiente (ej. "Consultorio Dra. Ana López"). Cada punto dice a cuál aplica.
- **Roles**: recepción, enfermería, médico y administración; **esta ronda agrega laboratorio e imágenes** (DP1). Una persona puede tener varios roles.
- **Datos clínicos**: nada se borra de verdad (se archiva, se oculta o se anula), todo queda con autor, fecha y hora, y no se inventa nada. Lo firmado no se edita: se corrige con adenda o se anula y se emite otro (con el periodo de gracia de GE4). **Excepción**: el **catálogo** de exámenes no es expediente; ahí sí se borra, con las condiciones de CA6 y CA7 (decisión mía, la misma de la ronda 10).
- **Formatos**: fechas `dd/mm/aaaa`, hora de 24 horas (componente de GE3), Lempiras (L), identidad `0000-0000-00000`, teléfonos `0000-0000`, impresión tamaño carta.
- **Firma y sello**: una firma dibujada en pantalla no es la firma electrónica avanzada de la Ley sobre Firmas Electrónicas de Honduras. Toda receta, orden o resultado impreso lleva espacio para **firma y sello en papel**.
- **Privacidad**: el diagnóstico no sale en constancias, recetas, órdenes, resultados impresos ni mensajes de WhatsApp salvo que el médico lo decida.
- **Conectividad**: el internet y la luz fallan. Lo que se escriba en formularios no debe perderse (mismo mecanismo de borrador/autoguardado que ya tienen las notas).
- **Valores clínicos y constantes** van en un solo archivo de configuración con el comentario `VALIDAR: Emil`.
- **Usuarios demo**: Roberto Aguilar (administración), Sofía Mejía (recepción), Lic. Carmen Ríos (enfermería, Licenciada), Aux. Karla Mendoza (enfermería, Auxiliar), Dra. Lucía Herrera (medicina interna), Dr. Andrés Paz (pediatría), Dra. Mariela Zúñiga (ginecología y obstetricia), Dra. Ana López (consultorio), Dr. Daniel Fúnez Castillo (medicina general). **Los perfiles demo nunca se borran.** Esta ronda agrega 4 usuarios demo (DM2).

**Advertencia sobre las capturas.** El texto que aparece dentro de mis capturas (nombres de pacientes, diagnósticos, medicamentos, dosis, valores de laboratorio, notas) es **relleno** que escribí solo para generar las pantallas. No lo trates como requisito ni como error. Fíjate solo en el diseño, los campos, los botones, las etiquetas y el flujo.

### Mapa de capturas del Word (en orden de aparición)

| N.º | Pantalla | Punto |
|---|---|---|
| 1 | Configuración de la clínica › Catálogo de exámenes › Imagen y gabinete (128) › Rayos X (28): "Rayos X de abdomen", "de antebrazo", "de cadera"… cada uno con "Pide al ordenar: proyección (…) · lado". **Va antes del primer párrafo**, que se refiere a ella | CA6 |
| 2 | Configuración › Catálogo de exámenes completo: buscador, casilla **"Ver archivados (6)"**, Laboratorio (315), Imagen y gabinete (128) y la tarjeta "Perfiles de laboratorio" | CA7 |
| 3 | Hospitalizado (como Lic. Carmen Ríos) con la ventana del navegador **no maximizada**: la fila de pestañas llega hasta "Notas de enfermería (1)"; "Exámenes" y "Anexos" quedan fuera de la pantalla | GE7 |
| 4 | El mismo paciente con la ventana maximizada: pestañas completas hasta "Anexos (2)"; pestaña Exámenes con Electrolitos "Resultado listo" y su tabla de valores | EX6 (y comparación para GE7) |
| 5 | Consulta externa (Dra. Lucía Herrera), "Medicamentos · van a la receta", vía Nebulización: un componente escrito a mano con la franja naranja **"No está en el vademécum de la clínica"** | ME11 |
| 6 | Tarjeta de una "Nota de evolución" firmada: la columna derecha (Indicaciones, Exámenes con "Órdenes de exámenes: Imprimir / Descargar PDF", Medicamentos con un medicamento "Nueva") **se sale por la derecha** | GE8, ME12 |

Las capturas 3 y 4 son la misma pantalla a propósito: muestran que las pestañas no caben cuando la ventana es más angosta. Si alguna captura no corresponde a su punto, dímelo en el reporte y verifica tú el código.

---

## 1. Cómo quiero que trabajes

1. **Explora primero** el código de lo que toca esta ronda. No supongas el stack: léelo. En especial, antes de DP1 a DP6, averigua **qué existe ya** de laboratorio e imágenes (yo creo que "ya está establecido en cierta medida"): roles previstos, "Áreas de servicio", bandejas de enfermería, estados de los exámenes, permisos. Reutiliza eso.
2. **Escribe `PLAN_RONDA11.md`** antes de programar: por cada punto (CA6, CA7, GE7…), los archivos, los cambios de base de datos, los componentes que vas a reutilizar o crear y las dependencias entre puntos. Pídeme confirmación **solo** si algo está bloqueado de verdad. Para todo lo demás usa los valores por defecto de la sección 6.
3. **Un commit por punto**, con el código en el mensaje: `[ronda11][CA6] Imagen y gabinete con estudios genéricos`.
4. **Migraciones seguras**: no borres columnas ni registros clínicos. Ocultar o archivar (la única excepción autorizada es el catálogo de exámenes, en CA6 y CA7, con sus condiciones). Todo cambio de datos se prueba primero sobre **una copia de la base**, es **idempotente** y sirve en las bases de **todas** las clínicas y consultorios, incluidas las **nuevas**. Si hace falta un paso manual en producción, dime exactamente cuál.
5. **Reutiliza componentes**: la ventana "Ordenar exámenes" y sus chips de CA5, el formulario "Cargar resultado" (EX4), la vista previa de archivos de EX4, la plantilla de receta de ME10, la plantilla de documento clínico de EX2, el registro "Órdenes impresas", el calendario de turnos de TU1/TU2, el campo "Cargo" de PE1, el buscador de personal de PQ2, el formulario de alta de paciente, la paginación de GE5. **No copies y pegues** formularios ni plantillas.
6. **Permisos por rol y auditoría** (quién, qué, cuándo) en toda acción nueva, incluidas cada impresión y cada descarga. Los permisos se aplican **en el servidor**, no solo ocultando botones. Verifica permisos también por URL directa.
7. **Verifica cada punto en el navegador** con el rol correcto, en escritorio (1920, 1366 y 1280 px de ancho), con la **ventana no maximizada** (~1100 px y ~1000 px) y a ~390 px, y corre typecheck, lint, pruebas y `build` al final de cada punto.
8. Usa los textos exactos (botones, etiquetas) que pongo entre comillas. Cuando hablo de una etiqueta que ya existe en la app, usa **la que hoy tiene el código**.
9. **Datos externos**: no inventes valores, fuentes ni artículos de ley. Lo que no puedas respaldar, déjalo marcado y repórtalo.

---

## 2. Lo que NO se debe romper

- **"Estudios contrastados" (fluoroscopía)** de CA5: "me gustó, porque no son rayos convencionales". Se quedan **tal cual** (Esofagograma, SEGD, Tránsito intestinal, Colon por enema, Urografía excretora, Uretrocistografía miccional, Histerosalpingografía, Fistulografía con su región).
- **Cardiología, Endoscopia y Otros** de Imagen y gabinete: no los mencioné; no cambian.
- **Cómo se ven hoy los resultados en la pestaña Exámenes** (captura 4: fila desplegable, tabla de valores con unidad, rango, "Bajo · crítico", línea de tiempo con autores, aviso de valor crítico arriba): "me gusta ver los resultados como está". EX6 solo **agrega** "Ver PDF" e "Imprimir".
- **El laboratorio del catálogo** (los ~315 exámenes, perfiles, valores de referencia y fuentes de UM1/UM2). CA6 solo toca Rayos X, Ultrasonido, Tomografía y Resonancia.
- **Ultrasonido Doppler** de CA5: se queda **tal cual** (sus estudios por región, con lado), por decisión mía (A4).
- **El menú "Ordenar exámenes"** (buscador sin tildes, pestañas, "Mis sets", "Perfiles", "Seleccionados (N)", "Agregar (N)", **tamaño fijo de GE6**), los sinónimos de búsqueda de CA5 ("rx", "tac", "usg", "rm", "eco", "doppler"…) y el aviso "Falta elegir…" de CA5 (se reutiliza con los campos nuevos).
- **EX2, EX5 y "Órdenes impresas"**: las órdenes de exámenes desde la nota y desde la pestaña Exámenes siguen igual, ahora con los nombres armados de CA6.
- **EX3**: todo estudio del subgrupo Rayos X queda terminado al marcarse "Realizado", sin informe obligatorio.
- **ME10**: la casilla "No hay en la clínica (va a receta)", su etiqueta "Receta" y "Cantidad a comprar" siguen existiendo. ME12 amplía, no reemplaza.
- **La nebulización (ME4)** y el aviso "No está en el vademécum de la clínica": ME11 solo agrega un botón dentro de esa franja; escribir un medicamento a mano sigue permitido sin agregarlo.
- **Enfermería** sigue pudiendo marcar "Muestra tomada", "Realizado" y "Cargar resultado" como hoy. Los departamentos nuevos (DP2) **se suman**; no le quitan nada a enfermería.
- **Rol de turnos** de médicos y de enfermería (TU1, TU2) y los cargos Licenciada/Auxiliar (PE1): DP6 agrega departamentos al mismo componente.
- **Las órdenes, notas, recetas y resultados ya emitidos**: no cambian de texto ni de contenido por nada de esta ronda (incluidas las órdenes con nombres de CA5 como "Rayos X de rodilla AP y lateral · Lado derecho").
- **GE4 (periodo de gracia)**: un documento ya impreso bloquea la corrección de los renglones que lo alimentan. Las impresiones nuevas de EX6 y ME12 entran en esa misma regla.

---

## 3. Correcciones, una por una

Cada punto indica a qué modo aplica: **[C]** Clínica, **[K]** Consultorio, **[CK]** ambos.

Códigos de esta ronda (continúan la numeración de rondas anteriores): **CA** catálogo de exámenes, **GE** general, **EX** exámenes, **ME** medicamentos y recetas, **DP** departamentos de Laboratorio e Imágenes, **DM** datos demo.

---

### Grupo CA — Catálogo de Imagen y gabinete

#### CA6 — Imagen y gabinete: un estudio por modalidad, y el detalle se escribe al ordenar [CK]

**Esto corrige CA5 de la ronda 10.** "Evidentemente algo se entendió o explicó mal."

**Cómo está hoy (captura 1):** Imagen y gabinete tiene 128 estudios. Rayos X tiene 28 **estudios separados** ("Rayos X de abdomen", "Rayos X de antebrazo", "Rayos X de cadera"…), cada uno con sus proyecciones y lado. Ultrasonido, Tomografía y Resonancia están igual: un estudio del catálogo por región (Anexo A de la ronda 10). "No ese montón que ya pusiste solo porque sí."

**Qué quiero:** en el catálogo, **un solo estudio por modalidad**. Cuando en la orden médica marco, por ejemplo, **"Rayos X"**, me aparecen **campos para escribir** de qué es el estudio y, según la modalidad, la proyección o el contraste. **Los campos dependen del estudio** (Rayos X pide proyección; tomografía y resonancia piden contraste; ultrasonido solo de qué). Donde hay botones para elegir (proyección, contraste, lado), **también puedo escribir** lo que quiera. Se quedan como estudios propios solo los que mencioné:

| Subgrupo | Queda en el catálogo | Campos al ordenar |
|---|---|---|
| **Rayos X** | Solo **"Rayos X"** | **"¿De qué?"** + **"Proyección"** + "Lado" (opcional) |
| **Estudios contrastados** | Todos los de hoy, sin cambios (sección 2) | Los de hoy (Fistulografía pide región) |
| **Ultrasonido** | **"Ultrasonido"** + se quedan **"Perfil biofísico fetal"**, **"Ultrasonido FAST (trauma)"**, **"Ultrasonido obstétrico"** y **"Ultrasonido obstétrico transvaginal"** | "Ultrasonido": **"¿De qué?"** + "Lado" (opcional). Los otros cuatro: ninguno |
| **Ultrasonido Doppler** | **Sin cambios**: se quedan los estudios por región de CA5 (A4) | Los de hoy (lado) |
| **Tomografía** | **"Tomografía"** + **"Angiotomografía"** | "Tomografía": **"Contraste"** + **"¿De qué?"** + "Lado" (opcional). "Angiotomografía": **"¿De qué?"**, sin contraste (se sobreentiende) |
| **Resonancia** | **"Resonancia magnética"** + se quedan **"Angiorresonancia magnética cerebral"** y **"Colangiorresonancia"** | "Resonancia magnética": **"Contraste"** + **"¿De qué?"** + "Lado" (opcional). Las otras dos: ninguno |
| **Cardiología, Endoscopia, Otros** | Sin cambios | Sin cambios |

1. **Los campos** (en la ventana "Ordenar exámenes", en todo lugar donde se ordena; aparecen debajo de la fila al marcar el estudio; reutiliza el mecanismo de chips y el aviso "Falta…" de CA5):
   - **"¿De qué?"**: **campo de texto libre**, **obligatorio**, con ejemplo gris según la modalidad ("Ej. tórax", "Ej. rodilla", "Ej. abdomen y pelvis", "Ej. tiroides", "Ej. venoso de miembros inferiores"). **No es una lista.** Si escribo "de tórax", el texto armado no repite "de".
   - **"Proyección"** (solo Rayos X): botones de selección **múltiple** "AP", "PA", "Lateral", "Oblicua", "Axial" **y además** un cuadro **"Escribir proyección"** siempre visible, para poner lo que no esté en los botones (ej. "Towne", "Waters", "axial de rótula"). Obligatoria: al menos un botón **o** algo escrito; se pueden combinar. Los botones van en configuración con `VALIDAR: Emil`.
   - **"Contraste"** (Tomografía y Resonancia magnética): botones de selección única —Tomografía: "Simple" o "Contrastada"; Resonancia: "Simple" o "Con contraste"— **y además** un cuadro para escribir otro (ej. "doble contraste"). Obligatorio: un botón **o** algo escrito. **Reemplaza** los cinco contrastes y el "Con gadolinio" de CA5 (A6, A9).
   - **"Lado"** (opcional, en Rayos X, Ultrasonido, Tomografía y Resonancia magnética): botones "Derecho", "Izquierdo", "Bilateral". No es obligatorio, porque no todo estudio tiene lado; también puedo escribirlo dentro de "¿De qué?" (A3).
   - Mientras falte algo obligatorio, la fila dice "Falta escribir de qué" / "Falta la proyección" / "Falta el contraste" y "Agregar (N)" no deja continuar, como en CA5.
2. **Varias veces el mismo estudio en una orden.** Tengo que poder pedir un Rayos X de tórax **y** uno de rodilla en la misma nota. Debajo de los campos, un botón pequeño **"+ Otro Rayos X"** (u "+ Otro ultrasonido", "+ Otra tomografía"…) agrega otra fila con sus propios campos. Cada una cuenta en "Seleccionados (N)" y se quita con su ✕. La ventana no cambia de tamaño (GE6).
3. **Texto de la orden** (se arma solo, igual en "Seleccionados (N)", la tarjeta de la nota, la pestaña Exámenes, las órdenes impresas de EX2/EX5, "Ver nota completa", las bandejas de DP2 y los resultados de EX6). Formato: `[Estudio] [contraste] de [de qué] [proyecciones] · Lado [lado]`:
   - `Rayos X de tórax PA y lateral`
   - `Rayos X de rodilla AP, lateral y axial de rótula · Lado derecho` (botones y texto escrito se unen con comas y "y")
   - `Ultrasonido de tiroides` · `Ultrasonido de mama · Lado izquierdo`
   - `Tomografía simple de cráneo` · `Tomografía contrastada de abdomen y pelvis` · `Tomografía con doble contraste de abdomen` (escrito)
   - `Angiotomografía de aorta`
   - `Resonancia magnética con contraste de rodilla · Lado derecho`
   - `Perfil biofísico fetal`, `Colangiorresonancia` (sin campos, el nombre tal cual)
4. **Qué pasa con lo de CA5** (migración idempotente, probada en una copia, con exportación previa de lo que borras):
   - Se **borran del catálogo** (no se archivan, igual que decidí en la ronda 10) todos los estudios por región de Rayos X, Ultrasonido, Tomografía (incluidas las 4 angiotomografías, la urotomografía y la de tórax de alta resolución) y Resonancia, **salvo** los que la tabla dice que se quedan. **No toques el subgrupo Ultrasonido Doppler.** No deben quedar en "Ver archivados" ni en ninguna pantalla, **ni como listas de opciones**. Lista en el reporte sus nombres exactos.
   - Se crean los genéricos ("Rayos X", "Ultrasonido", "Tomografía", "Angiotomografía", "Resonancia magnética"). "Angiorresonancia cerebral" se renombra **"Angiorresonancia magnética cerebral"**.
   - **Condición para borrar** (la misma de CA5): las órdenes antiguas conservan su texto original en la nota, la pestaña Exámenes, las órdenes impresas y los resultados. Si una orden solo guarda una referencia al catálogo, primero copia el texto a la orden y después borra. Si algún registro clínico no se puede conservar sin el estudio, no lo borres: déjalo retirado e invisible y repórtamelo.
   - **"Mis sets" y perfiles** que tengan un estudio borrado: se le quita al set y se lista en el reporte (qué set y de quién). Un set **nuevo** que incluya un estudio genérico guarda también lo escrito y elegido en sus campos; al usarlo, vienen llenos y se pueden cambiar.
   - Los estudios nuevos nacen activos, sin precio, con "En la clínica | Externo" como cualquier otro.
5. **Catálogo › Editar** (Administración, y el radiólogo en DP5): en los genéricos se ve qué campos pide cada uno ("Pide al ordenar: de qué · proyección · lado"). Los botones de proyección y contraste quedan en el archivo de configuración; si el editor de CA5 ya permite editarlos, se editan desde ahí.
6. **Búsqueda**: los sinónimos de CA5 llevan a los genéricos ("rx", "placa", "radiografía" → Rayos X; "tac", "tc", "tomo" → Tomografía; "angiotac" → Angiotomografía; "rm", "rmn" → Resonancia magnética; "usg", "eco", "ecografía" → Ultrasonido; "doppler" sigue llevando a los estudios Doppler de CA5). Si busco "rx torax", sale "Rayos X".
7. **EX3** sigue igual: "Rayos X" queda terminado al marcarse "Realizado". Revisa que su regla reconozca el genérico.

**Criterios de aceptación:**
- [ ] Como Roberto Aguilar, en Catálogo de exámenes › Imagen y gabinete: Rayos X tiene un solo estudio; Ultrasonido 5; Tomografía 2; Resonancia 3; Ultrasonido Doppler, Estudios contrastados, Cardiología, Endoscopia y Otros siguen como antes. Nada de lo borrado aparece en "Ver archivados".
- [ ] Como Dra. Lucía Herrera, en una nota marco "Rayos X": aparecen "¿De qué?" (texto), "Proyección" (botones y cuadro para escribir) y "Lado" (opcional); sin de qué o sin proyección, "Agregar" no deja y dice qué falta.
- [ ] Escribo "tórax", marco PA y Lateral: queda `Rayos X de tórax PA y lateral`. Escribo "rodilla", marco AP y Lateral, escribo "axial de rótula" y marco Derecho: queda `Rayos X de rodilla AP, lateral y axial de rótula · Lado derecho`.
- [ ] Con "+ Otro Rayos X" pido los dos en la misma orden; "Seleccionados (2)".
- [ ] "Tomografía" pide contraste (botones o escrito) y de qué; escribo "doble contraste" y sale en el texto. "Angiotomografía" solo pide de qué.
- [ ] "Resonancia magnética" pide contraste (Simple / Con contraste o escrito) y de qué; "Colangiorresonancia" y "Angiorresonancia magnética cerebral" no piden nada.
- [ ] "Ultrasonido" pide de qué; "Perfil biofísico fetal" no pide nada.
- [ ] Ningún campo "¿De qué?" es una lista: puedo escribir cualquier cosa.
- [ ] La orden impresa (EX2/EX5) muestra los textos armados.
- [ ] Una orden antigua con "Rayos X de rodilla AP y lateral · Lado derecho" (CA5) o "Radiografía de tórax" sigue mostrando su texto.
- [ ] Busco "rx torax", "tac", "angiotac", "usg" y "rmn" y salen los genéricos.
- [ ] Un Rayos X en "Realizado" queda terminado sin informe (EX3).
- [ ] La ventana "Ordenar exámenes" no cambia de tamaño al aparecer los campos (GE6).
- [ ] Funciona en Consultorio (Dra. Ana López) y a 390 px.

#### CA7 — Quitar "Ver archivados" y "Archivar" del catálogo de exámenes [CK]

**Cómo está hoy (captura 2):** Configuración › Catálogo de exámenes muestra la casilla **"Ver archivados (6)"** junto al buscador.

**Qué quiero:** "eso de ver archivados quiero que lo borres". Y, como confirmé, que en el catálogo de exámenes ya no se archive nada: se quita.

1. **Averigua qué son esos 6** (¿quedaron de la migración de CA5? ¿los archivó alguien? ¿laboratorio o imagen?) y lístalos en el reporte.
2. **Bórralos** del catálogo con la misma condición de CA6 punto 4 (las órdenes antiguas conservan su texto; si algo clínico depende de uno y no se puede conservar, se retira invisible y me lo reportas). Exportación previa y registro en la bitácora.
3. **Se quita la casilla "Ver archivados" y también el botón "Archivar"** de cada examen del catálogo (Laboratorio e Imagen y gabinete), en Configuración y en DP5 (A11, confirmado). En su lugar, un botón **"Quitar"** que, tras confirmar ("Se quitará del catálogo. Las órdenes que ya lo usan no cambian."), **borra** el examen con la misma condición de CA6 punto 4 (las órdenes antiguas conservan su texto; si algo clínico no se puede conservar, se retira invisible). Queda en la bitácora. Actualiza el texto de la tarjeta "Catálogo de exámenes" que hoy dice "Quitar uno lo archiva…" para que diga que se quita y que las notas que ya lo tienen no cambian.
   - Los **Perfiles de laboratorio** no los mencioné: su botón "Archivar" se queda como está.
4. En todas las bases (idempotente). Los estudios borrados en CA6 no deben terminar aquí.

**Criterios de aceptación:**
- [ ] El reporte lista los 6 y qué se hizo con cada uno.
- [ ] Como Roberto Aguilar, el catálogo ya no muestra "Ver archivados".
- [ ] Ningún examen del catálogo tiene "Archivar"; "Quitar" pide confirmación y lo borra; una orden antigua con ese examen sigue mostrando su nombre.
- [ ] Un médico o un técnico no pueden quitar exámenes (también por URL directa).
- [ ] Correr la limpieza dos veces no cambia nada la segunda vez.

---

### Grupo GE — Interfaz general

#### GE7 — Las pestañas que no caben se pueden recorrer y tocar [CK]

**Cómo está hoy (captura 3):** con la ventana del navegador **no maximizada**, la fila de pestañas del paciente (Hoja de hospitalización, Signos vitales, Notas de evolución, Medicamentos, Notas de enfermería, Exámenes, Anexos) se corta en "Notas de enfermería (1)". **No hay forma de desplazarse** hasta "Exámenes" ni "Anexos" ni de hacer clic en ellas. La pestaña activa (Exámenes) también queda fuera de la vista: solo se ve su subrayado en el borde. Maximizada (captura 4) sí caben.

**Qué quiero:** "no me deja recorrer y darle clic a Anexos". Que siempre se pueda llegar a todas las pestañas.

- Cuando las pestañas no caben, la fila se **desplaza horizontalmente** (rueda del ratón, arrastre con el dedo, teclado) con **flechas "‹" y "›"** en los extremos que aparecen solo cuando hay pestañas ocultas de ese lado, y un degradado suave que indique que hay más.
- La **pestaña activa siempre queda visible**: al abrir la página o cambiar de pestaña, la fila se desplaza sola hasta ella.
- Ninguna pestaña se corta a la mitad sin poder alcanzarla; la página no gana barra horizontal.
- **Un solo componente de pestañas** para toda la app: aplícalo a las pestañas del paciente (observación, hospitalización, expediente, Consultorio), a las de **Configuración** (9 pestañas) y a cualquier otra fila de pestañas. Lista en el reporte dónde lo aplicaste.
- A ~390 px se desliza con el dedo; botones de 44 px.

**Error de interfaz detectado (captura 4):** algunas pestañas muestran **dos números**: "Exámenes (1)" con una burbuja naranja "1" y "Anexos (2)" con una burbuja "1". No se entiende qué cuenta cada uno. Dime en el reporte qué significa cada número; **no lo cambies** sin preguntarme.

**Criterios de aceptación:**
- [ ] Como Lic. Carmen Ríos, con la ventana a ~1000 px de ancho, en un hospitalizado puedo llegar a "Anexos" con la flecha "›" y con la rueda, y abrirla.
- [ ] Abro el paciente directamente en la pestaña Exámenes: la fila se desplaza sola y "Exámenes" se ve completa.
- [ ] Lo mismo en Configuración a ~1000 px.
- [ ] Con la ventana maximizada no aparecen flechas.
- [ ] A 390 px se desliza con el dedo y no hay desborde horizontal de la página.

#### GE8 — La tarjeta de la nota firmada no se sale por la derecha [CK]

**Cómo está hoy (captura 6):** en la tarjeta de una "Nota de evolución" firmada, la **columna derecha** (Indicaciones con "Continúa", Exámenes con "Órdenes de exámenes: Imprimir / Descargar PDF", Medicamentos) **queda cortada por el borde derecho**: las líneas punteadas de separación siguen más allá de la tarjeta y el contenido toca el borde. "Problemas con el UI de esas órdenes de laboratorio."

**Qué quiero:** que la tarjeta quepa siempre.

- Las dos columnas caben dentro de la tarjeta a cualquier ancho; los separadores no pasan del borde; el botón "Órdenes de exámenes: Imprimir / Descargar PDF" (y "Receta" de ME10/ME12) caben en su columna, con el texto en dos líneas si hace falta, sin cortarse.
- Cuando no hay espacio para dos columnas, la derecha pasa **debajo** de la izquierda.
- Revisa **todas** las tarjetas de notas que usan ese diseño (evolución, ingreso, postquirúrgica, egreso, procedimiento, Consultorio) y "Ver nota completa".
- No sé si la captura es de la ventana maximizada o no: **prueba los dos casos** y dime en el reporte cuál era la causa.

**Criterios de aceptación:**
- [ ] A 1920, 1366, 1280, ~1100 y ~1000 px, la tarjeta de una nota con indicaciones, exámenes externos y tres medicamentos no se corta ni genera barra horizontal.
- [ ] El botón de órdenes se ve completo y funciona.
- [ ] A 390 px las columnas se apilan.

---

### Grupo EX — Exámenes

#### EX6 — "Ver PDF" e "Imprimir" en los resultados [CK]

**Cómo está hoy (captura 4):** un examen con resultado se ve en la misma fila (tabla de valores, rango, "Bajo · crítico"). **Me gusta así** (sección 2). Pero **no hay forma de sacar el resultado en PDF ni imprimirlo** cuando lo cargaron como valores. EX4 (ronda 10) solo dio "Descargar" e "Imprimir" al **archivo adjunto**.

**Por qué:** "en caso de que se los quiera dar a los familiares". Los familiares y otros médicos piden el resultado en papel.

**Qué quiero ("te dije… y no me sale"):**

1. En cada examen con resultado (Laboratorio e Imagen y gabinete), junto al estado "Resultado listo", dos botones: **"Ver PDF"** (abre la vista previa dentro de la app, con "Descargar" e "Imprimir", reutilizando la ventana de EX4) e **"Imprimir"** (abre directamente el diálogo de impresión). Deben verse con la fila **abierta**; si caben, también con la fila cerrada.
2. En el encabezado de **Laboratorio** y de **Imagen y gabinete**, un botón **"Imprimir resultados"** que abre una ventana con los exámenes con resultado (casillas, ninguno marcado por defecto, con buscador y filtro por fecha) y genera **un solo PDF** con los elegidos, cada uno en su bloque (A12).
3. **El documento** ("Resultado de laboratorio" / "Resultado de imagen y gabinete"), tamaño carta, plantilla de documento clínico de EX2:
   - Membrete de la clínica o consultorio; título; número; fecha y hora de impresión.
   - Paciente: nombre, edad, sexo, expediente, identidad.
   - Por examen: nombre (con el texto armado de CA6), médico que lo pidió, fecha y hora del pedido, de la toma de muestra o realización y del resultado; **tabla de valores** con unidad, rango de referencia, marca Alto/Bajo y **"Crítico"** en negrita (sin depender del color, para que se lea en blanco y negro); para imagen, el **texto del informe**.
   - **Responsables del resultado** (A24, confirmado):
     - **Laboratorio**: aparecen **los dos**: "Procesado por: [Téc./Lic. Nombre]" (quien cargó el resultado) y **"Microbiólogo responsable: Lic. [Nombre] · N.º de colegiación"**, cada uno con **espacio para firma y sello**. El microbiólogo responsable es el que está de turno en Laboratorio (DP6) a la hora del resultado; si no hay ninguno asignado o hay varios, al cargar el resultado se pide elegirlo de la lista de microbiólogos (obligatorio). Si lo cargó el propio microbiólogo, aparece una sola vez. No hay paso de validación aparte: el resultado queda "listo" al cargarse, como hoy.
     - **Imagen y gabinete**: "Realizado por: Téc. [Nombre]" y, si hay informe, "Informe: Dr./Dra. [Nombre] · N.º de colegiado", con espacio para firma y sello.
     - Si el resultado lo cargó enfermería o un médico (como hoy, sin departamento), aparece su nombre y cargo.
   - **Sin diagnósticos** (privacidad) y sin la indicación clínica por defecto.
   - Si el resultado tiene archivo adjunto, una línea "Archivo adjunto: [nombre]" (el archivo se imprime aparte con "Ver archivo" de EX4).
   - Pie con "Página X de Y".
4. Si el resultado es **solo un archivo** (sin valores ni texto), "Ver PDF" abre ese archivo (EX4) e "Imprimir" lo imprime.
5. Cada vista, impresión o descarga queda en el registro de impresiones (quién, cuándo) y cuenta para GE4.
6. En observación, hospitalización, expediente, Consultorio y las bandejas de DP2.

**Error de interfaz detectado (captura 4):** Sodio 133 mEq/L y Potasio 3.1 mEq/L salen como **"Bajo · crítico"**. Los valores son relleno mío, pero que se marquen **críticos** depende de los umbrales de la app. Dime en el reporte qué umbral y qué fuente se aplicaron (UM2); **no los cambies**, que los reviso yo.

**Criterios de aceptación:**
- [ ] Como Dra. Lucía Herrera, en un hospitalizado con Electrolitos con resultado, pulso "Ver PDF": veo el documento en la app con membrete, paciente, tabla, críticos marcados, quién cargó; sin diagnósticos; cabe en carta.
- [ ] "Imprimir" abre el diálogo de impresión del mismo documento.
- [ ] "Imprimir resultados" con 3 exámenes elegidos genera un solo PDF.
- [ ] Un resultado de imagen imprime el texto del informe.
- [ ] Un resultado solo con archivo abre el archivo.
- [ ] Queda registrado quién imprimió.
- [ ] Como Lic. Carmen Ríos también puedo; Sofía Mejía no (también por URL directa).
- [ ] Funciona en Consultorio y a 390 px.

---

### Grupo ME — Medicamentos y recetas

#### ME11 — Agregar al vademécum desde el aviso "No está en el vademécum" [CK]

**Cómo está hoy (captura 5):** si escribo un medicamento que no está en el vademécum, sale la franja naranja **"No está en el vademécum de la clínica"** y nada más.

**Qué quiero:** "que me dé la opción de agregarlo en ese momento, ahí mismo, en esa franja anaranjada".

1. Dentro de la franja, a la derecha, un botón **"Agregar al vademécum"**.
2. Abre una ventana pequeña **encima** del formulario (sin cerrarlo ni perder lo escrito) con: **"Nombre genérico"** (lleno con lo que escribí, obligatorio), "Nombre comercial (opcional)", **"Presentación"** (llena con lo de "Presentación y concentración" si lo escribí), "Forma farmacéutica (opcional)" y **"Vía"** (llena con la vía del formulario; para un componente de nebulización, la del `.md` o vacía). Botones "Cancelar" y **"Guardar en el vademécum"**.
3. Antes de guardar, si existe uno parecido (sin tildes ni mayúsculas, o por alias), muestra **"¿Es este?"** con los parecidos; elegir uno lo usa en el formulario sin crear otro.
4. Al guardar: el medicamento entra al vademécum con origen **"Catálogo base Clinara"** (como pidió ME7), queda enlazado en el formulario (el mismo icono de enlace que los demás) y la franja desaparece. La bitácora registra quién lo agregó y cuándo.
5. **No es obligatorio**: puedo seguir sin agregarlo, como hoy.
6. En **todos** los formularios de medicamento (consulta externa, ventana de nota, egreso, receta, nebulización por componente, Consultorio): es un solo componente.
7. **Quién**: Médico (también en Clínica: solo **agregar**, no editar ni archivar, que sigue siendo de Administración) y Administración (A13).

**Criterios de aceptación:**
- [ ] Como Dra. Lucía Herrera, en consulta externa, en un componente de nebulización escribo un medicamento que no existe: veo "Agregar al vademécum" en la franja; lo agrego y la franja desaparece sin perder el resto del formulario.
- [ ] Al escribirlo en otro paciente, el buscador ya lo sugiere.
- [ ] En Configuración › Vademécum aparece con origen "Catálogo base Clinara"; la bitácora dice quién lo agregó.
- [ ] Si escribo "acetaminofen 500" y elijo "Agregar", me ofrece el Acetaminofén existente.
- [ ] Un médico no puede editar ni archivar medicamentos del vademécum en Clínica (también por URL directa).
- [ ] Funciona en la ventana de nota de evolución, en Consultorio y a 390 px.

#### ME12 — Generar receta con cualquier medicamento activo, con días para la receta, también desde Anexos [CK]

**Amplía ME10 (ronda 10).**

**Cómo está hoy (captura 6):** puse un medicamento nuevo en la nota y **no me deja generar receta** de ese medicamento. Hoy la receta solo sale con los medicamentos marcados "No hay en la clínica (va a receta)" (ME10).

**Por qué:** muchas veces mando al familiar a comprar el medicamento. En la nota no pongo "3 días" porque no sé cuánto va a durar el tratamiento, pero en la receta sí quiero poner "por 3 días" para que compre lo de esos días.

**Qué quiero:** "quiero que siempre, al poner un medicamento, independientemente de si está en el vademécum o no, me dé la opción de generar receta con el medicamento que yo quiera"; "que le pueda añadir x 3 días"; "ese mismo apartado de generar receta que esté en Anexos, y que me deje seleccionar dentro de los medicamentos activos cuál va a salir en la receta".

1. **Averigua** por qué el medicamento de la captura no permitía receta (¿la casilla de ME10 no aparece con medicamentos fuera del vademécum? ¿no se ofrece al firmar?) y dímelo en el reporte. Corrige esa causa.
2. **Ventana "Generar receta"** (una sola, que reemplaza a la ventana "Imprimir receta" de ME10 y la amplía):
   - Lista **todos los medicamentos activos** del paciente, estén o no en el vademécum: normales, PRN, infusiones, STAT, nebulizaciones (con sus componentes).
   - Cada uno con su casilla. Vienen **marcados** los que tienen "No hay en la clínica (va a receta)"; los demás, sin marcar.
   - Por cada medicamento marcado, dos campos **solo para esta receta**: **"Días"** (número; la receta dice "por 3 días") y **"Cantidad a comprar"** (texto, ya existe en ME10; si la orden ya la tiene, viene llena). **No cambian la orden** ni la hoja de medicamentos.
   - Botones "Imprimir" y "Descargar PDF".
3. **Documento**: la plantilla de receta de ME10 (membrete, paciente, medicamento completo con presentación, dosis, vía, frecuencia, "por N días" si lo puse, cantidad a comprar, espacio para firma y sello, leyenda "Válida solo con firma y sello del médico", sin diagnósticos). Cuando la genera un **médico**, la receta lleva **sus** datos y número de colegiado (él decide qué medicamentos y cuántos días; A14).
4. **Dónde está**:
   - **Pestaña Anexos** (observación, hospitalización, Consultorio): botón **"Generar receta"** arriba, y una sección **"Recetas emitidas"** con cada receta (fecha y hora, médico, medicamentos) y "Ver PDF" / "Imprimir" para volver a imprimirla.
   - **Hoja de medicamentos**: el botón de ME10 abre esta misma ventana.
   - **Tarjeta de la nota firmada** y el cuadro al firmar (ME10): "Receta: Imprimir / Descargar PDF" sigue para los marcados, y se agrega "Elegir medicamentos" que abre esta ventana.
5. **Enfermería** sigue como en ME10: imprime la receta de los marcados "No hay en la clínica" (con los datos del médico que indicó) y reimprime las "Recetas emitidas". **No** elige otros medicamentos ni pone días: eso es del médico.
6. Consulta externa no cambia (ahí todo ya va a la receta, con "Total de días").
7. Cada receta queda guardada, en el registro de impresiones y bloquea la corrección según GE4.

**Criterios de aceptación:**
- [ ] Como Dra. Lucía Herrera, en un hospitalizado con un medicamento escrito a mano (fuera del vademécum) y Ceftriaxona del vademécum, abro Anexos › "Generar receta": salen los dos; marco el escrito a mano, pongo "Días: 3" y "Cantidad a comprar: 9 tabletas"; imprimo: la receta dice "por 3 días" y la cantidad, con mi colegiado y sin diagnósticos.
- [ ] La orden en la hoja de medicamentos sigue sin días.
- [ ] La receta aparece en "Recetas emitidas" y se puede volver a imprimir.
- [ ] Una nebulización marcada sale con su línea completa.
- [ ] Lic. Carmen Ríos imprime la receta de los marcados "No hay en la clínica" y reimprime una emitida, pero no puede marcar otros ni poner días (también por URL directa).
- [ ] Funciona en observación y en Consultorio (Dra. Ana López), y a 390 px.

---

### Grupo DP — Departamentos de Laboratorio clínico e Imágenes

**Por qué (todo el grupo):** a las clínicas llegan pacientes **solo a hacerse exámenes**, y también hay hospitalizados u observados que necesitan un estudio. El laboratorio y el departamento de imágenes tienen su propio personal, que necesita ver las órdenes pendientes, tomar muestras o hacer estudios, subir resultados y manejar su catálogo, sin ver todo el expediente. "Hazlo de la forma más inteligente que puedas": pocas pantallas, una bandeja de trabajo por departamento, y todo conectado a la pestaña Exámenes que ya existe (una sola fuente de verdad).

Todo este grupo es **[C]**: solo modo Clínica (A15).

#### DP1 — Roles "Laboratorio" e "Imágenes", con cargos [C]

Mismo diseño que PE1 (un rol con cargos, no un rol por cargo):

| Rol de acceso | Cargos | Prefijo en firmas (configurable) | N.º de colegiación |
|---|---|---|---|
| **Laboratorio** | "Microbiólogo(a)" · "Técnico(a) de laboratorio" | "Lic." · "Téc." | Obligatorio para Microbiólogo (Colegio de Microbiólogos y Químicos Clínicos de Honduras) |
| **Imágenes** | "Médico(a) radiólogo(a)" · "Técnico(a) en imágenes (radiotecnología)" | "Dr./Dra." · "Téc." | Obligatorio para Radiólogo (Colegio Médico de Honduras) |

- En **Personal y roles**, al asignar Laboratorio o Imágenes aparece el campo obligatorio **"Cargo"** y, según el cargo, **"N.º de colegiación"**. Cambiar el cargo queda en la bitácora.
- Una persona puede tener varios roles (ej. un radiólogo que también da consulta como Médico); usa el selector de rol de GE1.
- **Diferencias por cargo** (el resto de permisos son iguales dentro del rol; tabla de la sección 4):
  - Microbiólogo y Radiólogo: además, configuran su departamento (DP5) y editan su rol de turnos (DP6).
  - Técnicos: trabajan la bandeja y suben resultados; ven la configuración y los turnos sin editar.
- **Menú lateral** de estos roles: "Inicio" (si aplica), **"Bandeja de laboratorio"** / **"Bandeja de imágenes"** (con conteo de pendientes), "Pacientes" (búsqueda; lo que ve cada perfil está en DP4), **"Configuración de laboratorio"** / **"Configuración de imágenes"** (DP5) y **"Rol de turnos"** (DP6).
- Si "Áreas de servicio" o algún rol previsto ya modela laboratorio o imágenes, **reutilízalo** y dime cómo.

**Criterios de aceptación:**
- [ ] Como Roberto Aguilar asigno a una persona el rol Laboratorio: el cargo es obligatorio y, si es Microbiólogo, el número de colegiación también.
- [ ] La firma en un resultado dice "Lic. [Nombre]" o "Téc. [Nombre]" según el cargo.
- [ ] Cada rol ve solo su menú.
- [ ] Cambiar el cargo queda en la bitácora.

#### DP2 — Bandeja de trabajo de cada departamento [C]

Un **solo componente** para los dos departamentos, configurado por tipo (Laboratorio / Imagen y gabinete).

1. **Qué entra**: todas las órdenes **"En la clínica"** del tipo del departamento, vengan de donde vengan (consulta externa, observación, hospitalización, Consultorio no aplica, pacientes ambulatorios de DP3). Las órdenes **"Externo"** no entran (las hace otro laboratorio).
2. **Pestañas** con conteo:
   - Laboratorio: **"Por tomar muestra"** · **"En proceso"** (muestra tomada, sin resultado) · **"Resultados de hoy"**.
   - Imágenes: **"Por realizar"** · **"Por informar"** (realizado, sin informe; los Rayos X que no lo necesitan no se quedan aquí, EX3) · **"Terminados hoy"**.
3. **Cada fila** agrupa por paciente y orden: **"Urgente"** si lo es, nombre, edad, sexo, expediente, **ubicación** ("Consulta externa", "Observación · Cama X", "Hospitalización · Cuarto 201", "Ambulatorio"), estudios (texto armado de CA6), médico que pidió, **indicación clínica** de la orden, hora del pedido y **tiempo de espera**.
4. **Orden**: urgentes primero, después los más antiguos. **Filtros**: ubicación, "Solo urgentes", buscador por paciente o estudio, fecha. Paginación de GE5 en "Resultados de hoy"/"Terminados hoy".
5. **Acciones sin salir de la bandeja** (reutiliza las de la pestaña Exámenes, no las copies):
   - Laboratorio: **"Muestra tomada"** (para varios exámenes del mismo paciente a la vez), **"Cargar resultado"** (formulario de EX4: valores, archivo o ambos), "Ver PDF" e "Imprimir" (EX6).
   - Imágenes: **"Realizado"**, **"Cargar informe"** (texto del informe y archivos/imágenes), "Ver PDF" e "Imprimir".
   - El personal del departamento **no cancela** órdenes del médico. Si no se puede hacer (no hay reactivo, el paciente no llegó o se fue, equipo dañado, muestra insuficiente), usa **"No se realizó"** con **motivo obligatorio** (lista en configuración con `VALIDAR: Emil` + "Otro" escribible). La orden queda marcada "No se realizó: [motivo]" en la bandeja (filtro "No realizados") y en la pestaña Exámenes, **se avisa al médico que la pidió** (mismo canal que los avisos de hoy) y sigue **pendiente**: el médico decide si la cancela, y el departamento puede pulsar **"Reintentar"** para devolverla a la bandeja. Queda en la bitácora (A21, confirmado).
6. **Las muestras las toman los dos (lo pidió Emil):** el personal de laboratorio **y** enfermería pueden tomar muestras y marcar "Muestra tomada", sea desde la bandeja de laboratorio o desde la pestaña Exámenes / bandeja de enfermería. Enfermería **sigue recibiendo** las órdenes de laboratorio en su bandeja como hoy. Quien la marque primero queda registrado con nombre, cargo, fecha y hora; para el otro, el examen aparece ya como "Muestra tomada por [nombre] HH:mm" y el botón deja de ofrecerse (si los dos lo pulsan casi a la vez, el servidor acepta solo el primero y al segundo le muestra quién la tomó). Esto no depende de la ubicación del paciente: vale en consulta externa, observación, hospitalización y ambulatorios.
7. **Una sola fuente de verdad**: lo que se hace en la bandeja se ve al instante en la pestaña Exámenes del paciente (con autor, fecha y hora) y al revés. Enfermería sigue pudiendo hacer lo mismo desde la pestaña Exámenes.
8. **Valores críticos**: al cargar un resultado crítico se dispara el mismo aviso que hoy (al médico que pidió y a enfermería del paciente). El personal de laboratorio ve una confirmación "Valor crítico: se avisó a [médico]".
9. La bandeja se actualiza sola (sin recargar) cuando entra una orden nueva, y el conteo del menú también.
10. GE4 aplica: quien cargó un resultado puede corregirlo en 5 minutos, con versiones.

**Criterios de aceptación:**
- [ ] Dra. Lucía Herrera pide un hemograma "En la clínica" y un "Rayos X de tórax PA y lateral" a un hospitalizado: el hemograma aparece en la bandeja de laboratorio (Por tomar muestra) y el Rayos X en la de imágenes (Por realizar), con "Hospitalización · Cuarto …" y la indicación clínica.
- [ ] Un examen pedido "Externo" no aparece en ninguna bandeja.
- [ ] El técnico de laboratorio marca "Muestra tomada" y carga valores: la pestaña Exámenes del paciente muestra lo mismo, con su nombre.
- [ ] Lic. Carmen Ríos marca "Muestra tomada" en un hemograma de un hospitalizado: en la bandeja de laboratorio el Téc. Kevin Rivera lo ve como "Muestra tomada por Lic. Ríos" y ya no puede marcarla. Al revés también: si la toma el técnico, enfermería la ve tomada por él.
- [ ] Un valor crítico avisa al médico como hoy.
- [ ] El técnico en imágenes marca "Realizado" en el Rayos X: queda terminado (EX3) y no se queda en "Por informar". Una tomografía sí pasa a "Por informar" y el radiólogo carga el informe.
- [ ] Los urgentes salen primero; los filtros y el buscador funcionan.
- [ ] Ningún usuario de laboratorio o imágenes puede cancelar una orden (también por URL directa); el Téc. Kevin Rivera marca un examen "No se realizó" con motivo "No hay reactivo": la Dra. Herrera recibe el aviso, el examen sigue pendiente y ella puede cancelarlo; "Reintentar" lo devuelve a la bandeja.
- [ ] A 390 px la bandeja se usa con el dedo.

#### DP3 — Pacientes que vienen solo a hacerse exámenes [C]

1. En cada bandeja, un botón **"Paciente ambulatorio"** que abre una ventana con tres pasos:
   - **Paciente**: buscar en la Biblioteca de pacientes (nombre, identidad o expediente) o **"Registrar paciente nuevo"** con el formulario de alta que ya existe (no hagas otro).
   - **Estudios**: la ventana "Ordenar exámenes" mostrando solo la pestaña del departamento (con los campos de CA6 en imágenes). "Rutina | Urgente".
   - **Quién lo solicita**: **"Médico que solicita"** (persona del sistema o nombre escrito, con el buscador de PQ2; opcional, porque algunos vienen por su cuenta) y **"Foto o archivo de la orden"** (opcional, para guardar la orden en papel que trae el paciente).
2. Crea una orden con ubicación **"Ambulatorio"**, autor = quien la registró, y "Solicitado por: [médico]" si se llenó. Entra a la bandeja y sigue el mismo flujo.
3. El examen queda en el **expediente** del paciente (pestaña Exámenes), visible después para cualquier médico de la clínica.
4. **Entrega del resultado**: con "Ver PDF" / "Imprimir" de EX6.
5. **Cobro**: usa el flujo de **Caja** que ya existe. Revisa cómo funciona hoy y escríbelo en el plan: si un examen tiene precio en "Servicios y precios", la atención ambulatoria debe quedar **pendiente de cobro** como cualquier servicio; si eso exige rediseñar Caja, no lo hagas: deja el cobro manual en Caja y repórtalo.
6. **Recepción y Administración también** registran pacientes ambulatorios (A20, confirmado): el mismo botón **"Paciente ambulatorio"** aparece en la pantalla de Recepción (junto a "Paciente sin cita") y en la de Administración, con la misma ventana; en el paso de estudios eligen **Laboratorio** o **Imagen y gabinete**. La orden cae en la bandeja del departamento. Si el paciente paga al llegar, Recepción cobra con el flujo de Caja de siempre (punto 5).

**Criterios de aceptación:**
- [ ] Como técnico de laboratorio registro un paciente nuevo que trae una orden de un médico de afuera, adjunto la foto de la orden y pido un perfil lipídico: aparece en "Por tomar muestra" como "Ambulatorio".
- [ ] Cargo el resultado e imprimo el PDF para entregarlo.
- [ ] Como Dra. Lucía Herrera abro ese paciente después y veo el examen y su resultado en la pestaña Exámenes, con "Solicitado por".
- [ ] Como Sofía Mejía (Recepción) registro otro paciente ambulatorio para un ultrasonido: aparece en la bandeja de imágenes.
- [ ] El reporte explica cómo quedó el cobro.

#### DP4 — Qué ve cada perfil del expediente [C]

**Médico radiólogo:** "El radiólogo sí puede ver el expediente": ve **todo el expediente en solo lectura** (notas, diagnósticos, medicamentos, signos vitales, exámenes de laboratorio e imagen, anexos), igual que lo ve un médico, pero **no** escribe notas, no ordena, no indica medicamentos ni firma documentos clínicos. Lo que sí hace: realizar estudios, **cargar informes** y archivos (DP2), imprimir resultados (EX6) y lo de DP5 y DP6.

**Microbiólogo, Técnico de laboratorio y Técnico en imágenes** (acceso parcial). Lo que **sí** ven de un paciente:
- **Datos generales**: nombre, edad, sexo, expediente, identidad, teléfono, **alergias** (necesarias para contraste) y ubicación (cama/cuarto).
- **Las órdenes de su departamento**: activas, pendientes y el historial de resultados de su tipo, con la indicación clínica y el médico que pidió.
- **Técnico en imágenes**, además: el último resultado de **creatinina** del paciente (valor, fecha y si está fuera de rango), para los estudios con contraste. La lista de exámenes que cuentan como "función renal" para esto va en el archivo de configuración con `VALIDAR: Emil`.
- Las acciones de DP2 y EX6.

Lo que **no** ven estos tres perfiles (A19): notas de evolución y demás notas, **diagnósticos** (ni la línea de diagnóstico ni las etiquetas de enfermedades crónicas del encabezado), medicamentos, signos vitales, notas de enfermería, Anexos, recetas, constancias, Caja, y los exámenes del **otro** departamento (salvo la creatinina para Imágenes).

- Usa la misma página del paciente con solo las pestañas permitidas (o una vista reducida), no una pantalla nueva grande.
- El bloqueo es **en el servidor**: una URL directa a una nota o a medicamentos responde "Sin permiso".
- En "Pacientes" pueden buscar cualquier paciente de la clínica (para DP3), pero al abrirlo ven solo lo de arriba.
- Cada vez que abren un expediente queda en la bitácora.

**Criterios de aceptación:**
- [ ] Como técnico de laboratorio abro un hospitalizado: veo datos generales, alergias, cuarto y los exámenes de laboratorio; no veo diagnósticos, notas, medicamentos, Anexos ni los estudios de imagen.
- [ ] Copio la URL de "Notas de evolución" de ese paciente y la abro como técnico: "Sin permiso".
- [ ] Como Téc. Paola Andino (imágenes) veo los estudios de imagen, las alergias y la última creatinina; no veo otros laboratorios, notas ni diagnósticos.
- [ ] Como Dr. Mario Castellanos (radiólogo) veo todo el expediente, incluidas notas y diagnósticos, pero no aparecen "Nueva nota de evolución", "Ordenar exámenes" ni el formulario de medicamentos, y no puedo crearlos por URL directa; sí puedo cargar un informe.

#### DP5 — Configuración de cada departamento [C]

"Modificar umbrales en los labs, agregar nuevos estudios en el caso de que el catálogo de Clinara no los tenga."

1. Menú **"Configuración de laboratorio"** (rol Laboratorio): reutiliza las tarjetas que ya existen, filtradas:
   - **Catálogo de exámenes · Laboratorio**: agregar, editar (nombre, subgrupo, unidad, **valores de referencia**; A18) y quitar exámenes (CA7); **Perfiles de laboratorio**.
   - **Umbrales críticos de laboratorio** (la tarjeta de UM2).
2. Menú **"Configuración de imágenes"** (rol Imágenes): **Catálogo de exámenes · Imagen y gabinete**: agregar, editar (incluidos los campos que pide al ordenar, CA6) y quitar (CA7).
3. **Quién**: Microbiólogo y Radiólogo editan; los técnicos **solo ven**. Administración sigue pudiendo todo desde Configuración de la clínica.
4. Todo cambio queda en la bitácora (quién, qué valor tenía, qué valor quedó).
5. **Resultados ya cargados**: averigua si hoy un cambio de rango o de umbral recalcula las marcas Alto/Bajo/Crítico de resultados viejos. **No cambies ese comportamiento**; dime en el reporte cuál es.

**Criterios de aceptación:**
- [ ] El microbiólogo agrega un examen nuevo de laboratorio con su rango y lo puede pedir un médico.
- [ ] El microbiólogo cambia un umbral crítico; la bitácora guarda el valor anterior y el nuevo.
- [ ] El radiólogo agrega un estudio de imagen nuevo que pide "¿De qué?", y un médico lo puede ordenar.
- [ ] Los técnicos ven esas pantallas sin botones de edición, y no pueden editar por URL directa.
- [ ] El personal de laboratorio no ve el catálogo de imágenes y viceversa.

#### DP6 — Rol de turnos de Laboratorio y de Imágenes [C]

"A cada departamento se le pueda asignar rol de turnos."

- En Configuración › Rol de turnos, el selector "Médicos | Enfermería" (TU2) pasa a **"Médicos | Enfermería | Laboratorio | Imágenes"**. Mismo calendario, panel, repetición, copiar semana y colores de TU1.
- Turnos **Mañana / Tarde / Noche** con horas propias por departamento en el archivo de configuración (por defecto las de enfermería: 07:00–15:00, 15:00–23:00, 23:00–07:00; `VALIDAR: Emil`). Solo se puede asignar personal con el rol del departamento.
- **Editan**: Administración y, en su propio departamento, Microbiólogo (Laboratorio) y Radiólogo (Imágenes), de hoy en adelante (como la Licenciada en TU2). **Ven**: los técnicos de su departamento. Los demás no lo ven.
- En el menú de Laboratorio e Imágenes, **"Rol de turnos"** abre solo la vista de su departamento.
- Sigue siendo **informativo** (A12 de la ronda 6). Cada cambio queda en la bitácora.

**Criterios de aceptación:**
- [ ] Como microbiólogo asigno al técnico de laboratorio la Mañana de lunes a viernes de este mes en una operación.
- [ ] El técnico ve el rol de su departamento sin poder editar; no ve el de Imágenes.
- [ ] Roberto Aguilar ve y edita los cuatro.
- [ ] Una enfermera no puede asignarse en Laboratorio.
- [ ] A 390 px se usa como el de enfermería.

---

### Grupo DM — Datos demo (al final)

#### DM2 — Un usuario demo por cargo nuevo [C]

"Genera una demo de cada uno de esta misma clínica." En la **Clínica Santa Brígida**, agrega (nombres míos, A22):

| Usuario | Rol | Cargo |
|---|---|---|
| **Lic. Gabriela Ordóñez** | Laboratorio | Microbióloga (con número de colegiación de prueba) |
| **Téc. Kevin Rivera** | Laboratorio | Técnico de laboratorio |
| **Dr. Mario Castellanos** | Imágenes | Médico radiólogo (con número de colegiación de prueba) |
| **Téc. Paola Andino** | Imágenes | Técnica en imágenes |

- **No borres ni cambies** ningún perfil demo existente ni ningún paciente.
- Para que las bandejas no estén vacías, agrega a **pacientes demo que ya existen** unas pocas órdenes pendientes "En la clínica" (por ejemplo 3 de laboratorio y 2 de imagen, al menos una urgente, en hospitalización, observación y consulta externa), creadas con el flujo normal y con un médico demo como autor. Y asigna turnos de ejemplo de la semana actual en DP6.
- Los números de colegiación de prueba deben verse claramente ficticios (ej. "DEMO-0001").

**Criterios de aceptación:**
- [ ] Puedo entrar con los cuatro usuarios y cada uno ve su menú y su bandeja con datos.
- [ ] Los demás perfiles demo y pacientes siguen igual.

---

## 4. Permisos de lo nuevo

✔ puede, ○ solo ve, — no tiene acceso. Lab-M = Microbiólogo, Lab-T = Técnico de laboratorio, Img-R = Radiólogo, Img-T = Técnico en imágenes. En Consultorio, la médica titular tiene los permisos de Médico y de Administración del consultorio (los roles DP no existen allí).

| Función | Recepción | Enfermería | Médico | Administración | Lab-M | Lab-T | Img-R | Img-T |
|---|---|---|---|---|---|---|---|---|
| Ordenar estudios genéricos con sus campos (CA6) | ✔ solo ambulatorios (DP3) | — | ✔ | — | ✔ solo ambulatorios de lab (DP3) | ✔ ídem | ✔ solo ambulatorios de imagen (DP3) | ✔ ídem |
| Limpieza de catálogo y archivados (CA6, CA7; bitácora) | — | — | — | solo equipo técnico | — | — | — | — |
| "Quitar" un examen del catálogo (CA7) | — | — | ✔ en Consultorio | ✔ | ✔ lab | — | ✔ imagen | — |
| "Ver PDF" / "Imprimir" / "Imprimir resultados" (EX6) | — | ✔ | ✔ | ○ (registro) | ✔ lab | ✔ lab | ✔ imagen | ✔ imagen |
| "Agregar al vademécum" desde el aviso (ME11) | — | — | ✔ | ✔ | — | — | — | — |
| Editar o archivar medicamentos del vademécum | — | — | ✔ en Consultorio | ✔ | — | — | — | — |
| "Generar receta" con cualquier medicamento y días (ME12) | — | — | ✔ | — | — | — | — | — |
| Imprimir receta de marcados y reimprimir emitidas (ME12) | — | ✔ | ✔ | ○ (registro) | — | — | — | — |
| Asignar roles y cargos de Laboratorio e Imágenes (DP1) | — | — | — | ✔ | — | — | — | — |
| Bandeja del departamento (DP2) | — | — | — | ○ | ✔ lab | ✔ lab | ✔ imagen | ✔ imagen |
| "Muestra tomada" (DP2; laboratorio y enfermería, los dos) | — | ✔ | según acceso actual | — | ✔ | ✔ | — | — |
| "Realizado" / cargar resultado o informe (DP2) | — | ✔ (como hoy) | según acceso actual | — | ✔ | ✔ | ✔ | ✔ (sin informe) |
| Cancelar órdenes | — | según acceso actual | ✔ | según acceso actual | — | — | — | — |
| "No se realizó" y "Reintentar" (DP2) | — | — | — | — | ✔ | ✔ | ✔ | ✔ |
| Registrar paciente ambulatorio (DP3) | ✔ | — | — | ✔ | ✔ | ✔ | ✔ | ✔ |
| Ver expediente (DP4) | — | — | — | — | ○ parcial | ○ parcial | ○ completo, solo lectura | ○ parcial + creatinina |
| Configuración del departamento: catálogo, rangos, perfiles, umbrales (DP5) | — | — | — | ✔ | ✔ lab | ○ | ✔ imagen | ○ |
| Rol de turnos de Laboratorio / Imágenes (DP6) | — | — | — | ✔ | ✔ lab | ○ lab | ✔ imagen | ○ imagen |
| Pestañas desplazables y tarjeta sin desborde (GE7, GE8) | donde ya tenga acceso | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |

"Cargar informe" de imagen: el Técnico en imágenes marca "Realizado" y puede adjuntar las imágenes; el **informe** lo escribe el Radiólogo (o un Médico, como hoy).

---

## 5. Orden de implementación sugerido

1. **Interfaz, rápido y aislado**: GE8 (tarjeta) → GE7 (componente de pestañas).
2. **Catálogo**: CA7 (archivados) → CA6 (estudios genéricos y campos; migración).
3. **Medicamentos**: ME11 (agregar al vademécum) → ME12 (receta ampliada y Anexos).
4. **Resultados**: EX6 (PDF e impresión; lo usan las bandejas).
5. **Departamentos**: DP1 (roles y cargos) → DP4 (permisos y expediente parcial) → DP2 (bandeja) → DP3 (ambulatorios) → DP5 (configuración) → DP6 (turnos).
6. **Datos demo**: DM2 al final.

---

## 6. Ambigüedades y valores por defecto

Decisiones que tomé porque no las especifiqué. Úsalas y lístalas en el reporte para que las confirme.

| Cód. | Tema | Valor por defecto |
|---|---|---|
| A1 | CA6 cómo se arma el estudio | **Aclarado por Emil.** Un estudio por modalidad; al marcarlo aparecen campos según el estudio. "¿De qué?" es texto libre (no lista); proyección y contraste tienen botones **y** se pueden escribir; en todas las modalidades, no solo Rayos X. |
| A2 | CA6 proyecciones | Botones "AP", "PA", "Lateral", "Oblicua", "Axial" (selección múltiple) más un cuadro para escribir; obligatoria (botón o texto). `VALIDAR: Emil`. |
| A3 | CA6 lado | Botones "Derecho / Izquierdo / Bilateral" **opcionales** (lo mencionaste en tu aclaración); también se puede escribir dentro de "¿De qué?". |
| A4 | CA6 Ultrasonido Doppler | **Confirmado por Emil: se deja como está** (estudios por región de CA5, con lado). |
| A5 | CA6 estudios de Rayos X y ultrasonido que desaparecen | También se borran "Serie de abdomen agudo", "Rayos X de edad ósea" y los ultrasonidos por región (transvaginal ginecológico, mama, tiroides…); se piden con el genérico. |
| A6 | CA6 contraste de tomografía | Botones "Simple" y "Contrastada", como lo escribí, más un cuadro para escribir otro (doble, triple…). Desaparecen los botones de doble y triple contraste de CA5. |
| A7 | CA6 urotomografía y tórax de alta resolución | Se borran; se piden como "Tomografía" con "¿De qué?". |
| A8 | CA6 angiotomografía | Las 4 angiotomografías de CA5 se reemplazan por una sola "Angiotomografía" con "¿De qué?", sin contraste. |
| A9 | CA6 resonancia | Botones "Simple" o "Con contraste" (en vez de "Con gadolinio") más un cuadro para escribir; angiorresonancia magnética cerebral y colangiorresonancia sin campos. |
| A10 | CA6 repetir y sets | "+ Otro…" para pedir el mismo genérico varias veces; los sets guardan lo escrito en los campos. |
| A11 | CA7 archivar | **Confirmado por Emil:** se borran los 6, desaparece "Ver archivados" y también el botón "Archivar" de los exámenes; en su lugar "Quitar" (borra con confirmación). Los perfiles de laboratorio conservan "Archivar". |
| A12 | EX6 alcance | **Confirmado por Emil.** "Ver PDF" e "Imprimir" por examen, más "Imprimir resultados" para varios en un solo PDF. Sin diagnóstico ni indicación clínica. |
| A13 | ME11 quién | **Confirmado por Emil.** El médico puede **agregar** al vademécum (no editar ni archivar). |
| A14 | ME12 datos del médico (enfermería solo reimprime: **confirmado por Emil**) | La receta generada por un médico lleva sus datos; la que imprime enfermería (marcados de ME10), los del médico que indicó. Días y cantidad solo afectan la receta. |
| A15 | DP en Consultorio | **Confirmado por Emil.** No aplica; el consultorio sigue como hoy. |
| A16 | DP1 cargos y prefijos | **Confirmado por Emil.** Microbiólogo(a) "Lic.", Técnico(a) de laboratorio "Téc.", Médico(a) radiólogo(a) "Dr./Dra.", Técnico(a) en imágenes (radiotecnología) "Téc.". Configurables. `VALIDAR: Emil`. |
| A17 | DP quién configura | **Confirmado por Emil.** Microbiólogo y Radiólogo configuran y editan turnos; los técnicos trabajan la bandeja y suben resultados. |
| A18 | DP5 "umbrales" | **Confirmado por Emil.** Incluye umbrales críticos **y** valores de referencia de laboratorio. |
| A19 | DP4 acceso | **Confirmado por Emil:** el radiólogo ve todo el expediente en solo lectura y sube informes, sin escribir notas; los técnicos y el microbiólogo, acceso parcial (solo su departamento, sin diagnósticos); el técnico en imágenes ve además la creatinina. |
| A20 | DP3 quién registra ambulatorios | **Confirmado por Emil:** Laboratorio, Imágenes, Recepción y Administración. Cobro por el flujo de Caja existente. |
| A21 | DP2 cancelar | **Confirmado por Emil.** No cancelan; marcan "No se realizó" con motivo obligatorio, se avisa al médico, y pueden "Reintentar". |
| A22 | DM2 nombres | **Confirmado por Emil.** Lic. Gabriela Ordóñez, Téc. Kevin Rivera, Dr. Mario Castellanos, Téc. Paola Andino; órdenes pendientes nuevas sobre pacientes demo existentes. |
| A23 | DP6 horas | **Confirmado por Emil.** Las mismas tres franjas de enfermería, configurables por departamento. `VALIDAR: Emil`. |
| A24 | EX6 firma del resultado | **Confirmado por Emil.** Laboratorio: aparecen quien procesó y el microbiólogo responsable (el de turno o elegido al cargar), los dos con espacio para firma y sello. Imágenes: el técnico que realizó y el médico que informó. |
| A25 | DP2 informe de imagen | **Confirmado por Emil.** El técnico en imágenes solo realiza el estudio y sube imágenes; el informe lo escribe el radiólogo o un médico. |

---

## 7. Revisión final antes de entregar

**Marca cada casilla antes de decir que terminaste:**

- [ ] Todos los puntos cumplen **todos** sus criterios de aceptación (sección 3).
- [ ] Todo lo de la sección 2 sigue intacto (estudios contrastados, Cardiología/Endoscopia/Otros, vista de resultados, laboratorio, "Ordenar exámenes" y GE6, EX2/EX5, EX3, ME10, nebulización, enfermería en Exámenes, TU1/TU2/PE1, órdenes y recetas emitidas, GE4).
- [ ] Probado a **~390 px**: sin desborde horizontal y con botones de al menos 44 px (pestañas, campos de CA6, "Generar receta", bandejas, "Paciente ambulatorio").
- [ ] Probado en escritorio a **1920, 1366 y 1280 px** y con la **ventana no maximizada** (~1100 y ~1000 px).
- [ ] **Permisos** de la sección 4 comprobados también **por URL directa** (en especial DP4).
- [ ] **Migraciones probadas sobre una copia de la base** (CA6, CA7, DP1), idempotentes y en todas las bases, incluidas una clínica y un consultorio **nuevos**.
- [ ] Toda impresión y descarga nueva (EX6, ME12) queda registrada y bloquea la corrección en GE4.
- [ ] Sin errores de `build`, typecheck, lint, pruebas ni de consola.
- [ ] Textos en español correcto, fechas `dd/mm/aaaa` y hora de 24 horas.
- [ ] Las constantes nuevas están en el archivo de configuración con `VALIDAR: Emil` (botones de proyección y contraste, ejemplos de "¿De qué?", prefijos de cargos, horas de turnos por departamento).

**Flujo de punta a punta con usuarios demo** (haz el recorrido completo y reporta el resultado):

1. **Roberto Aguilar (Administración)**: Catálogo de exámenes sin "Ver archivados" e Imagen y gabinete con los genéricos; Configuración a ~1000 px con las pestañas desplazables; Personal y roles con los cuatro usuarios nuevos y sus cargos; Rol de turnos con los cuatro departamentos.
2. **Dra. Lucía Herrera (médico, hospitalizado)**: nota de evolución: ordena `Rayos X de tórax PA y lateral` y `Rayos X de rodilla AP y lateral · Lado derecho` (con "+ Otro Rayos X"), `Tomografía contrastada de abdomen y pelvis` "En la clínica", un hemograma "En la clínica" y un examen "Externo"; agrega un medicamento escrito a mano y lo agrega al vademécum desde la franja; firma; la tarjeta no se corta. Anexos › "Generar receta" con ese medicamento "por 3 días"; la receta aparece en "Recetas emitidas".
3. **Téc. Kevin Rivera (laboratorio)**: bandeja: el hemograma (no el externo); "Muestra tomada"; carga valores con uno crítico; ve la confirmación del aviso. Abre el expediente y comprueba que no ve notas ni diagnósticos. Registra un **paciente ambulatorio** nuevo con foto de la orden y le pide un examen.
4. **Lic. Gabriela Ordóñez (microbióloga)**: cambia un rango de referencia y un umbral crítico (bitácora); asigna turnos de laboratorio.
5. **Téc. Paola Andino (imágenes)**: marca "Realizado" los dos Rayos X (quedan terminados) y la tomografía (pasa a "Por informar").
6. **Dr. Mario Castellanos (radiólogo)**: abre el expediente completo en solo lectura; carga el informe de la tomografía; imprime el resultado en PDF.
7. **Lic. Carmen Ríos (enfermería)**, con la ventana a ~1000 px: llega a "Anexos" con las flechas; en Exámenes, "Ver PDF" e "Imprimir resultados" del hemograma y la tomografía; imprime la receta de un medicamento marcado "No hay en la clínica" pero no puede elegir otros ni poner días.
8. **Dra. Ana López (Consultorio)**: CA6, ME11, ME12 y EX6 funcionan; no existen los roles nuevos.
9. **Sofía Mejía (recepción)**: registra un paciente ambulatorio para un ultrasonido; no ve bandejas, "Generar receta" ni "Ver PDF" de resultados (también por URL directa).

---

## 8. Reporte final que espero

1. **Tabla por punto** (CA6, CA7, GE7, GE8, EX6, ME11, ME12, DP1, DP2, DP3, DP4, DP5, DP6, DM2): estado (**Hecho / Parcial / No hecho**), archivos cambiados y **cómo lo pruebo yo en 2 o 3 pasos**.
2. **Lo que te pedí averiguar**: qué eran los 6 archivados (CA7); qué significan los dos números de las pestañas (GE7); por qué se cortaba la tarjeta (GE8); qué umbral marcó como críticos el sodio y el potasio de la captura 4 (EX6); por qué no se podía hacer receta del medicamento nuevo (ME12); qué existía ya de laboratorio e imágenes (DP1); cómo funciona el cobro de los ambulatorios (DP3); si un cambio de rango recalcula resultados viejos (DP5).
3. **CA6**: estudios borrados (nombres exactos; si alguno quedó retirado en vez de borrado, por qué), creados y renombrados; cómo conservaste el texto de las órdenes antiguas; sets y perfiles afectados.
4. **Cambios en la base de datos**: tablas y columnas nuevas (campos de los estudios genéricos, instancias repetidas en una orden, recetas emitidas y sus días, roles y cargos nuevos, colegiación, ubicación "Ambulatorio", médico solicitante y archivo de la orden, turnos por departamento), migraciones y lo que se borró.
5. **Valores por defecto usados** (sección 6) y cuáles cambiaste.
6. **Lo que debo validar yo o un abogado**:
   - Los botones de proyección y contraste de CA6.
   - **Firma de resultados de laboratorio**: encontré que en 2021, para las pruebas COVID de viajeros, el Colegio de Microbiólogos y Químicos Clínicos de Honduras exigía que el resultado fuera "firmado y sellado por el microbiólogo responsable" en hoja membretada del colegio. **No encontré** una norma general vigente sobre quién firma un resultado de laboratorio ni si un técnico puede emitirlo solo; por eso el PDF deja espacio para firma y sello (A24).
   - **Alcance del Técnico en imágenes**: el plan de estudios del Técnico Universitario en Radiotecnologías de la UNAH describe funciones de ejecución técnica (equipos, protección radiológica, control de calidad), no de interpretación; por eso el informe lo escribe el radiólogo o un médico. Validar.
   - El acceso parcial al expediente del personal no médico (DP4) y la regla de privacidad.
   - La leyenda de la receta y los medicamentos controlados (pendiente desde la ronda 10).
7. **Hallazgos fuera de la lista** (errores de interfaz, otras tarjetas o filas de pestañas con el mismo problema): repórtalos, **no los implementes** sin preguntarme.
8. **Verificaciones que no pudiste hacer** y por qué.
