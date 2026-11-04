# Reporte de la ronda 11

Pedido: `docs/ronda11/PEDIDO_RONDA11.md`. Plan: `PLAN_RONDA11.md`. Un commit por punto (`[ronda11][…]`); los seis puntos DP
van juntos en un commit porque comparten roles, permisos y rutas, con dos arreglos chicos después. Esquema: 73 → 79.

Las 6 capturas corresponden a su punto.

**Antes de empezar:** la copia local de `main` no tenía la ronda 10, que solo estaba en GitHub. Se actualizó antes de tocar
nada.

## 1. Estado por punto

| Punto | Estado | Archivos principales | Cómo probarlo |
|---|---|---|---|
| CA6 | Hecho | `src/lib/imagingCatalog.ts`, `src/lib/exams.ts`, `src/lib/clinicalConfig.ts`, `src/components/Exams.tsx`, `src/app/ExamCatalogAdmin.tsx`, `server/ronda11.ts` (`loadImagingCa6`) | 1) Nota › Ordenar exámenes › «rx torax» › marca Rayos X: «¿De qué?», Proyección (botones y cuadro), Lado (opcional). 2) «tórax» + PA + Lateral → `Rayos X de tórax PA y lateral`; «+ Otro Rayos X» para la rodilla. 3) Configuración › Catálogo › Imagen y gabinete: Rayos X 1, Ultrasonido 5, Tomografía 2, Resonancia 3 |
| CA7 | Hecho | `src/app/ExamCatalogAdmin.tsx`, `server/routes/exams.ts` (`DELETE /api/exams/catalog/:id`), `server/ronda11.ts`, `server/catalogLoader.ts` | 1) Catálogo de exámenes: sin «Ver archivados». 2) Cada examen tiene «Quitar» (pide confirmación). 3) Los Perfiles de laboratorio siguen con «Archivar» |
| GE7 | Hecho | `src/components/TabRow.tsx`, `src/clinical.css` | 1) Ventana a ~1000 px, hospitalizado: «‹ ›» y rueda para llegar a «Anexos». 2) Abre `…?tab=examenes`: la fila se mueve sola. 3) Maximizada: sin flechas |
| GE8 | Hecho | `src/clinical.css`, `src/components/NoteColumns.tsx` | 1) Ventana a ~1100 px, nota con exámenes externos: el botón de órdenes se parte en dos líneas y nada se sale. 2) A ~1000 px la columna derecha va abajo |
| EX6 | Hecho | `src/app/ResultSheet.tsx`, `src/app/ExamsTab.tsx` (`ResultPrintButtons`, `PrintResults`), `src/app/PrintJob.tsx`, `server/routes/printJobs.ts` | 1) Exámenes › Electrolitos con resultado › «Ver PDF». 2) «Imprimir resultados» › marca 3 › un solo documento. 3) Corregir ese resultado ya impreso: no deja (GE4) |
| ME11 | Hecho | `src/components/AddToVademecum.tsx`, `Medications.tsx`, `MedExtras.tsx`, `InpatientFile.tsx`, `server/routes/drugs.ts` | 1) Nebulización, componente escrito a mano › «Agregar al vademécum» › Guardar: la franja desaparece. 2) «acetaminofen 500» › «¿Es este?» ofrece Acetaminofén. 3) Como médico de la clínica, editar un medicamento por URL: 403 |
| ME12 | Hecho | `src/components/GenerateRx.tsx`, `src/app/PrintJob.tsx`, `InpatientFile.tsx`, `server/routes/printJobs.ts` | 1) Anexos › «Generar receta»: salen todos los activos. 2) Marca uno, «Días: 3», «9 tabletas», Imprimir: «… por 3 días. Cantidad a comprar: 9 tabletas». 3) Aparece en «Recetas emitidas» |
| DP1 | Hecho | `src/lib/permissions.ts`, `src/lib/positions.ts`, `src/app/Staff.tsx`, `src/app/AppShell.tsx`, `server/app.ts` | 1) Personal y roles › Laboratorio: pide «Cargo» y, para Microbiólogo, «N.º de colegiación». 2) Entra como Téc. Kevin Rivera: solo su menú |
| DP2 | Hecho | `src/app/DeptTray.tsx`, `server/routes/dept.ts`, `server/routes/exams.ts` | 1) Kevin Rivera › Bandeja de laboratorio. 2) Lic. Ríos marca «Muestra tomada» del mismo examen: a Kevin le sale «Muestra tomada por Lic. Carmen Ríos HH:mm». 3) «No se realizó» › «No hay reactivo»: la Dra. Herrera lo ve en «Resultados nuevos» |
| DP3 | Hecho (cobro manual) | `src/app/Ambulatory.tsx`, `server/routes/dept.ts` | 1) Bandeja › «Paciente ambulatorio» › paciente nuevo, Perfil lipídico, foto de la orden. 2) Sale en «Por tomar muestra» como «Ambulatorio». 3) Sofía Mejía: el mismo botón en Consulta externa |
| DP4 | Hecho | `src/app/DeptPages.tsx` (`ChartOrDept`), `server/routes/dept.ts`, `server/routes/files.ts`, `src/App.tsx` | 1) Kevin Rivera abre un hospitalizado: datos, alergias, cuarto y su laboratorio. 2) Pega la URL de Notas: «Sin permiso». 3) Dr. Castellanos: todo el expediente sin botones de escribir |
| DP5 | Hecho | `src/app/DeptPages.tsx` (`DeptConfig`), `ExamCatalogAdmin.tsx`, `server/routes/exams.ts` (`catalogEditor`) | 1) Lic. Ordóñez › Configuración de laboratorio: agrega un examen con rango y cambia un umbral. 2) Kevin Rivera: la misma pantalla sin botones de edición |
| DP6 | Hecho | `src/app/Roster.tsx`, `server/routes/roster.ts`, `server/roster.ts` | 1) Lic. Ordóñez › Rol de turnos › «Repetir turno»: Kevin Rivera, Mañana, lunes a viernes. 2) Roberto Aguilar › Configuración › Rol de turnos: «Médicos \| Enfermería \| Laboratorio \| Imágenes» |
| DM2 | Hecho | `server/demoDept.ts`, `server/demoData.ts`, `server/db.ts` | 1) Entra con gordonez@, krivera@, mcastellanos@ y pandino@demo.clinara (clave de siempre). 2) Cada bandeja tiene órdenes |

**Pruebas automáticas:** `server/ronda11.test.ts` (27 pruebas: CA6, CA7, ME11, ME12, EX6 y DP). Se ajustaron las de CA5 de
`server/ronda10.test.ts` que probaban los estudios por región.

## 2. Lo que pediste averiguar

- **CA7: qué eran los 6 archivados.** Eran 6 «paquetes» de laboratorio que la ronda 7 (CA3) archivó al convertirlos en
  perfiles:
  - Amilasa y lipasa
  - Electrolitos
  - Perfil hepático
  - Perfil lipídico
  - Perfil renal
  - Tiempos de coagulación (TP, TPT, INR)

  No vienen de CA5 (esos se borraron, no se archivaron) ni los archivó nadie a mano. Los 6 son de laboratorio y cada uno
  sigue como perfil de laboratorio con el mismo nombre. Se borraron del catálogo con copia y quedaron marcados como
  quitados; las órdenes que los usan (como el «Electrolitos» de la captura 4) no cambian.

  Esto lo confirmé en la base local de la demo. No leí producción: al desplegar, la limpieza deja en la bitácora la lista
  exacta de esa base, en la línea «Catálogo de exámenes (CA7, ronda 11)».
- **GE7: los dos números de las pestañas.**
  - El número entre paréntesis es **cuántos hay**: en Exámenes, los exámenes no cancelados; en Anexos, las autorizaciones,
    referencias y epicrisis.
  - La burbuja es **cuántos avisos piden atención** en esa pestaña.
    - En Exámenes: valores críticos sin revisar, exámenes pendientes de la clínica y, desde ahora, los «No se realizó».
    - En Anexos: autorizaciones pendientes de firma.
  - En la captura 4: 1 examen, con 1 valor crítico sin revisar. En Anexos: 2 documentos, uno pendiente de firma.
  - No lo cambié.
- **GE8: por qué se cortaba.** La columna derecha de la tarjeta era una cuadrícula con una columna «auto». El botón
  «Órdenes de exámenes: Imprimir / Descargar PDF» no se parte en dos líneas, así que esa columna tomaba el ancho del botón
  y arrastraba fuera de la tarjeta las líneas punteadas. Pasa con la **ventana no maximizada**: a 1100 y 1000 px el
  contenido llegaba a 1103 y 1043 px, con la tarjeta terminando en 1049 y 949 px. A 1366 px o más cabía. Ahora la
  columna no crece, los botones se parten y, si la tarjeta es angosta, la columna derecha va abajo.
- **EX6: por qué el sodio 133 y el potasio 3.1 salen «críticos».** En la base, los umbrales críticos de UM2 para sodio
  (136–145 mEq/L) y potasio (3.5–5.0 mEq/L), fuente ABIM-2026, son **iguales al rango de referencia normal**. Por eso
  cualquier valor apenas fuera de rango se marca crítico. Parece que la carga de UM2 tomó el rango de referencia en lugar
  del umbral de pánico. No lo cambié; revísalo en Áreas de servicio › Umbrales críticos.
- **ME12: por qué no salía receta del medicamento nuevo.** La receta de ME10 solo se ofrecía para los medicamentos
  marcados «No hay en la clínica (va a receta)». El Ambroxol de la captura no estaba marcado, y que esté o no en el
  vademécum no tenía que ver. Ahora el médico elige cualquier medicamento activo.
  - Encontré además un error: con medicamentos de la demo, la receta de ME10 daba error 500, porque esas órdenes no
    guardan el paciente. Quedó corregido.
- **DP1: qué existía de laboratorio e imágenes.**
  - En Configuración › Áreas de servicio, las casillas «Laboratorio propio» e «Imágenes propias».
  - El área de cada orden (`lab`, `imaging`, `nursing` o `none`).
  - Una bandeja que ya preveía los roles `lab` e `imaging`.
  - Los estados (Ordenado, Muestra tomada o Realizado, Resultado listo, Revisado), cada uno con su autor.

  Todo eso se reutilizó: la bandeja nueva trabaja las mismas órdenes y las acciones del servidor de siempre.
  - **No existían** PE1 (cargos Licenciada/Auxiliar) ni TU2 (turnos de enfermería): el pedido de la ronda 6 llegó cortado.
    El cargo y el rol de turnos por departamento se hicieron aquí; el selector incluye Enfermería, con turnos.
  - Enfermería **sigue recibiendo** las órdenes de laboratorio en su bandeja aunque haya personal de laboratorio.
- **DP3: el cobro.** Caja no tiene «pendiente de cobro» por servicio: hoy solo las citas tienen «pagado/no pagado». Hacerlo
  exigía rediseñar Caja, así que no lo hice. El ambulatorio se cobra a mano en Caja, como cualquier servicio con precio.
- **DP5: ¿un cambio de rango recalcula resultados viejos?** **No.** Las marcas Alto, Bajo y Crítico se calculan y se
  guardan al cargar el resultado. Cambiar un rango o un umbral solo afecta los resultados que se carguen después. No lo
  cambié.

## 3. CA6

- **Borrados del catálogo.** Se borraron 81 estudios: 28 de Rayos X, 17 ultrasonidos, 19 tomografías y 17 resonancias.
  - Antes de borrar se guardó una copia en `config_backups` (`ca6-imaging-removed`) y una marca en
    `exam_catalog_removed`, para que ninguna carga los reponga.
  - La lista exacta está en `IMAGING_REMOVED_CA6`, en `src/lib/imagingCatalog.ts`. Incluye «Serie de abdomen agudo»,
    «Rayos X de edad ósea», las 4 angiotomografías, la urotomografía y la de tórax de alta resolución.
  - **Ninguno quedó retirado:** las órdenes guardan el nombre del estudio, así que nada clínico depende del catálogo.
- **Creados:** «Rayos X», «Ultrasonido», «Tomografía», «Angiotomografía» y «Resonancia magnética».
  - **Renombrado:** «Angiorresonancia cerebral» → «Angiorresonancia magnética cerebral».
  - **Se quedan:** el ultrasonido obstétrico, el obstétrico transvaginal, el perfil biofísico fetal y el FAST, la
    colangiorresonancia, Ultrasonido Doppler (sin cambios), los Estudios contrastados, Cardiología, Endoscopia y Otros.
- **Órdenes antiguas.** Guardan su nombre y lo que se eligió, así que siguen diciendo «Rayos X de rodilla AP y lateral ·
  Lado derecho» o «Radiografía de tórax». Hay pruebas automáticas de esto.
- **Lo nuevo de la orden.** El texto escrito en «¿De qué?» va en `exam_orders.subject`. Lo escrito en «Escribir
  proyección» se guarda al final de las proyecciones, y el contraste escrito va en `contrast`. Formato:
  `[Estudio] [contraste] de [de qué] [proyecciones] · Lado [lado]`. «de tórax» no repite «de»; «doble contraste» se lee
  «con doble contraste».
- **Sets y perfiles.** Al estudio borrado se le quita del set; la bitácora dice de qué set y de quién. Un set nuevo con un
  genérico guarda lo escrito y lo elegido, y al usarlo vienen llenos.
- **EX3.** «Rayos X» queda terminado al marcarse «Realizado». Las pruebas lo cubren.

## 4. Cambios en la base de datos

Todas las migraciones son idempotentes, se probaron en memoria con la demo y en una copia de la base local, y corren solas
al desplegar en cada clínica y consultorio, incluidos los nuevos (desde `ensureExamCatalog`). **No hace falta ningún paso
manual en producción.**

- **v74 y v75**
  - Tabla `exam_catalog_removed`: lo que se quitó del catálogo, con quién, cuándo y por qué.
  - Columna `exam_orders.subject` («¿De qué?»).
  - Carga `ca6:<clínica>` y limpieza de CA7.
- **v76:** `print_jobs.doctor_id` (el médico que generó la receta) y `print_jobs.data` (días y cantidad por medicamento,
  solo para esa receta).
- **v77:** `print_jobs.kind` admite «results» (EX6). Toda vista, impresión o descarga de un resultado va a `print_log` con
  `exam_result` y bloquea su corrección.
- **v78 y v79**
  - Roles `lab` e `imaging` y la columna `staff.position` (cargo).
  - En `exam_orders`: `location` («ambulatory»), `requested_by_id`, `requested_by_name`, `order_file_id`,
    `not_done_reason`, `not_done_at` y `not_done_by`.
  - En `duty_roster`: `dept` y `shift`.
  - Los usuarios y datos demo de DM2.
- **Lo que se borró:**
  - Los 81 estudios de CA6.
  - Los 6 archivados de CA7, con copia y marca.
  - Ningún registro clínico.

## 5. Valores por defecto

Usé A1 a A25 tal como vienen. Decisiones mías, para confirmar:

- **«¿De qué?» (CA6):** alcanza con una palabra que sea el estudio. Por ejemplo, en «rx torax», «torax» se toma como el de
  qué.
- **Turnos de los departamentos (DP6):** Mañana, Tarde y Noche con las horas de enfermería. La Noche que empieza un día
  cuenta hasta las 07:00 del siguiente.
- **Microbiólogo responsable (EX6):**
  - Si carga el resultado un microbiólogo, es él.
  - Si hay un solo microbiólogo de turno, es ese.
  - Si no hay ninguno o hay varios, se elige al cargar.
  - Sin microbiólogos en la clínica (clínicas donde enfermería hace el laboratorio), no se pide.
  - Esto también vale cuando el resultado lo carga enfermería.
- **Técnico en imágenes (A25):** sube las imágenes a un estudio ya realizado sin cambiar su estado. El informe del
  radiólogo conserva esas imágenes.
- **«Médico que solicita» (DP3):** es una lista de los médicos de la clínica o un nombre escrito. No usé el buscador de
  PQ2.
- **Laboratorio e Imágenes en el expediente:** abren solo los archivos de su tipo. Recepción sube la foto de la orden, pero
  no la abre.
- **Datos demo (DM2):**
  - Activé «Laboratorio propio» e «Imágenes propias» en Santa Brígida.
  - Con eso, los estudios de imagen dejan de llegar a la bandeja de enfermería.
  - Los de laboratorio le siguen llegando.

## 6. Lo que debes validar tú (o un abogado)

- Los botones de proyección (AP, PA, Lateral, Oblicua, Axial), de contraste y los ejemplos de «¿De qué?», en
  `clinicalConfig.ts`.
- Los prefijos de los cargos y los colegios, las horas de los turnos, los motivos de «No se realizó» y qué cuenta como
  función renal (solo «Creatinina»). Todo está en `clinicalConfig.ts` con `VALIDAR: Emil`.
- **Firma de resultados de laboratorio:** el PDF lleva «Procesado por» y «Microbiólogo responsable», con espacio para firma
  y sello, como pediste (A24). No hay norma confirmada.
- **Alcance del Técnico en imágenes:** no escribe informes, solo sube imágenes. Falta validarlo.
- **Acceso parcial al expediente (DP4)** y la regla de privacidad.
- **La leyenda de la receta y los medicamentos controlados:** sigue pendiente desde la ronda 10.
- **Los umbrales críticos de sodio y potasio:** ver §2.

## 7. Hallazgos fuera de la lista (no implementados)

- **Configuración › Vademécum:** con la ventana a ~1000 px, la tabla desborda la página por 18 px.
- **Umbrales críticos iguales al rango normal:** ver §2 (EX6). Revisa si pasa con otros analitos.
- **Laboratorio e Imágenes no tienen recorrido guiado.** Tampoco hay pantalla de «Inicio» para ellos: entran a su bandeja.
- **La bandeja para Administración:** el servidor la deja ver en solo lectura, pero no puse la opción en su menú.
- **La bandeja se actualiza cada 20 s** (consulta periódica, no en tiempo real).
- **«Muestra tomada» en un examen externo** sigue apareciendo en la pestaña Exámenes (hallazgo de la ronda 10).

## 8. Verificaciones que no pude hacer

- **Producción:** no leí la base de producción. Los 6 archivados se confirmaron en la base local de la demo.
- **Anchos de pantalla**, probados en el navegador:
  - GE7: 1920, 1000 y 390 px.
  - GE8: 1920, 1366, 1280, 1100, 1000 y 390 px.
  - Bandejas: 390, 1000 y 1366 px.
  - CA6 y ME11/ME12: 1366 px.
  - No recorrí cada pantalla en los cinco anchos.
- **Impresión real:** se interceptó `window.print`. No imprimí en papel. El «Página X de Y» del PDF depende del navegador:
  Chrome lo muestra.
- **Consultorio de la Dra. López:** CA6, ME11, ME12 y EX6 usan los mismos componentes, y las pruebas automáticas cubren
  sus permisos (ME11, y que DP no existe allí). No lo recorrí a mano.
- **Recorrido completo de la sección 7:** lo cubrí con las pruebas automáticas (por API, con los usuarios demo) y con
  revisiones en el navegador de cada rol. No hice el recorrido de punta a punta en una sola sesión de navegador.
