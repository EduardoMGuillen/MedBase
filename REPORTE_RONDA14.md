# Reporte de la ronda 14

Pedido: `docs/ronda14/PEDIDO_RONDA14.md`. Plan: `PLAN_RONDA14.md`. Capturas del pedido: `docs/ronda14/capturas/` (las 14
corresponden a su punto). Evidencias de después: `docs/ronda14/despues/`. Catálogo de material: `data/listado_material_medico_quirurgico.md`.
Esquema: 81 → 82.

## 1. Estado por punto

| Punto | Estado | Archivos principales | Cómo probarlo |
|---|---|---|---|
| GE10 | Hecho | `src/lib/autocap.ts` (nuevo), `main.tsx`; `data-nocap` en dosis, cantidades y buscadores sin «Buscar» | En una consulta escribe «paños con agua» + Enter y «evitar luces» + Enter: las dos empiezan en mayúscula. En la HEA «ácido fólico» → «Ácido fólico». Escribe «PH» y cambia la P por «p»: queda «pH». El buscador CIE-11 no cambia lo que escribes |
| CX6 | Hecho | `Consultation.tsx`, `clinical.css` | Consulta de un paciente con consultas previas › «Ver expediente», baja hasta «Plan y manejo»: la barra sigue fija. Pulsa «Contraer expediente»: «Plan y manejo» se queda en el mismo lugar con lo escrito. Contraído, la barra no está fija |
| EX8 | Hecho | `lib/exams.ts` (`defaultPlace`), `Exams.tsx`, `Consultation.tsx`, `InpatientFile.tsx`, `NoteColumns.tsx` | En consulta externa agrega un hemograma y un Rayos X: vienen en «Externo». En una nota de evolución de observación u hospitalización: «En la clínica». Con «Áreas de servicio» sin laboratorio, o en Consultorio: «Externo». La tarjeta dice «Laboratorio · En la clínica · Ordenado» |
| EX9 | Hecho | `components/Exams.tsx` (`ExamsBlock`), `modules.css` | Agrega 16 exámenes: una fila de ~44 px por examen, agrupados (Hematología, Coagulación, Química en sangre…), encabezado «Laboratorio (16) · 15 externos · 1 en la clínica», «Indicación» abre el campo debajo de la fila; a 390 px, dos renglones |
| EX10 | Hecho | `server/app.ts`, `ExamOrder.tsx` (`ClinicOrderBlock`), `Prescriptions.tsx`, `clinicalConfig.ts` | Termina una consulta con un perfil lipídico «Externo» y un hemograma «En la clínica»: receta, orden del perfil y, al final, la del hemograma con su aviso, su folio y «Imprimir esta orden». El botón principal no la imprime. El técnico la ve en Ambulatorios y tiene el motivo «El paciente se lo hará en otro laboratorio» |
| EX11 | Hecho | `components/ExamPrintModal.tsx` (la ventana de EX5, ahora compartida), `NoteColumns.tsx`, `ExamsTab.tsx`, `PrintJob.tsx`, `server/routes/printJobs.ts` | En la tarjeta de una nota con exámenes pulsa «Órdenes de exámenes»: la misma ventana con casillas, externos marcados, «Laboratorio» e «Imagen y gabinete» por separado; sale un documento por tipo. No hay casilla de diagnóstico en ninguna orden |
| ME13 | Hecho | `server/app.ts`, `server/routes/applications.ts` (nuevo), `Medications.tsx`, `Consultation.tsx`, `components/ApplyMeds.tsx` (nuevo), `WaitingRoom.tsx`, `Dashboard.tsx`, `PatientChart.tsx` | Firma una consulta con Diclofenaco IM «Aplicar en la clínica» y dos orales, sin ingreso: no entra a observación. Como Lic. Ríos, en Atendidos: «Medicamento por aplicar (1)» › «Aplicar» › «Aplicado» con la hora › la tarjeta dice «Medicamento aplicado» y el expediente «Aplicado dd/mm/aaaa HH:mm por Lic. Ríos». Al marcar la casilla la frecuencia queda en «Dosis única (STAT)» |
| ME14 | Hecho | `server/app.ts`, `server/medOrders.ts` (`consultRxRows`), `server/routes/inpatient.ts`, `printJobs.ts`, `GenerateRx.tsx`, `InpatientFile.tsx` | Firma con «Ingreso a observación», dos orales sin «Aplicar en la clínica» y Ceftriaxona marcada: sale la pantalla con la receta de los dos orales y la orden, con «Ir a observación». En la tarjeta de la nota, «Receta» lista los tres con los dos orales marcados; Anexos › «Generar receta» lista los tres |
| RU1 | Hecho | `server/supplies.ts`, `server/routes/supplies.ts`, `scripts/ru1-build.ts`, `src/app/SupplyCatalog.tsx`, `Settings.tsx` | Como Roberto Aguilar: Configuración › «Material médico quirúrgico»: 73 líneas, 15 en la lista de turno, «seda» da 8. Agrega «Nylon 4/0, aguja cortante», archiva «Mascarilla N95», cambia el periodo |
| RU2 | Hecho | `server/routes/usage.ts`, `src/app/Usage.tsx`, `src/app/MaterialForm.tsx`, menú y ruta | Como Lic. Ríos: «Uso de medicamentos y material» › «Medicamentos» (por paciente, con hora, quién y el médico; «Resumen»). «Material» › «Registrar material»: guantes 7.5 × 2 dos veces al mismo paciente = 4; alcohol como «Uso general del servicio» |
| RU3 | Hecho | `src/lib/usageExcel.ts`, `src/app/UsagePrint.tsx`, `POST /api/usage/log` | En cualquiera de las dos pestañas: «Imprimir» (Carta, encabezados repetidos, «Página X de N», firmas de entrega y recepción) y «Exportar a Excel» (`.xlsx` con dos hojas) |
| PQ3 | Hecho | `server/routes/anesthesia.ts`, `src/lib/anesthesia.ts`, `src/components/AnesthesiaSheet.tsx`, `src/app/AnesthesiaForm.tsx`, `src/app/AnesthesiaDoc.tsx` | Como Dra. Zúñiga: «Imprimir hoja de anestesia en blanco» en la autorización quirúrgica o en Anexos. Firma una nota postquirúrgica: «Hoja de anestesia · Sin agregar». Lic. Ríos sube las fotos; con la Dra. Herrera como anestesióloga, ella ve el pendiente en Inicio, llena la hoja (borrador), agrega registros de monitoreo y firma |

Commits: uno por punto o por grupo (`[ronda14][GE10]`, `[CX6]`, `[EX9][EX8]`, `[EX11]`, `[ME13][EX10][ME14]`, `[RU1]`, `[RU2]`,
`[RU3]`, `[PQ3]` ×3) más dos ajustes (`[GE10]` la siguiente indicación, la prueba de ME14). ME13, EX10 y ME14 van juntos porque
cambian la misma firma de la consulta. RU y PQ3 se hicieron en ramas aparte (`ronda14-ru`, `ronda14-pq`) y se unieron a `main`.

## 2. Lo que me pediste averiguar

- **¿Por qué «Aplicar en la clínica» creaba una observación?** En la firma de la consulta (`server/app.ts`) el tipo de estancia
  era `admit ? hospitalización : observe || algún medicamento «Aplicar en la clínica» ? observación : ninguna`. Bastaba un
  medicamento marcado (es como lo dejó ME3, ronda 9). Ahora solo las dos casillas de ingreso crean la estancia.
- **¿Cuántas estancias se crearon así?** No las conté en producción: no tengo permiso para leer esa base. Dejé un diagnóstico
  de solo lectura: `npm run me13:diagnose -- .env.neon.local`. Las reconoce porque, hasta esta ronda, al marcar «Ingreso a
  observación» el servidor marcaba todos los medicamentos: si la consulta de origen tiene alguno sin la marca, vino del error.
  En una copia de la base de demostración da 0 seguras y 4 dudosas (todas con todos los medicamentos marcados, donde no se
  puede distinguir). No cambié ninguna; el médico les da egreso.
- **¿Por qué «Generar receta» listaba 1 de 3?** La ventana solo lee la hoja de medicamentos. En esa observación (nacida del
  error), a la hoja pasó solo el medicamento marcado (`stayItemsOf`); los dos analgésicos fueron a la receta de la consulta y
  nunca a la hoja. Ahora la ventana suma lo que la consulta de ingreso mandó a la receta y no está en la hoja, sin repetidos.
- **¿Cómo se sabe si la clínica tiene laboratorio o imágenes?** Ya existía: Configuración › «Áreas de servicio» (laboratorio
  propio, imágenes propias; `clinics.has_lab`, `has_imaging`), que solo cambia Administración y que ya decidía la bandeja. Lo
  usé; no creé interruptores nuevos.
- **¿De qué ronda venía «Incluir el diagnóstico en la orden»?** De EX2, ronda 8 (commit `107d0db`). No se guardaba, así que no
  hay órdenes emitidas con diagnóstico que conservar. La quité.
- **¿Existían turnos de enfermería?** Sí: el rol de turnos de enfermería (DP6, ronda 11), Mañana 07–15, Tarde 15–23, Noche
  23–07 (`DEPT_SHIFTS.nursing`). RU1 los usa como turnos por defecto (no los de A10) y la clínica los edita.
- **¿Sigue saliendo «+504»?** Sí, en la clínica de demostración: viene escrito en sus datos (`src/lib/seed.ts`), no lo agrega
  el código. Se corrige en Configuración › Datos de la clínica.

## 3. Base de datos (v82)

Todo es `CREATE TABLE IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS`; nada se borra.
- `consult_applications` (ME13): una fila por medicamento «Aplicar en la clínica» de una consulta sin ingreso: estado (por
  aplicar, aplicado, no aplicado), hora, quién lo registró, motivo. La lee el registro de uso.
- La consulta guarda ahora la casilla explícita (`true`/`false`) en `consultations.meds`. Con ingreso, lo que no la trae se
  aplica en la clínica (como antes); lo desmarcado a propósito va a la receta. Las consultas de antes siguen con su regla.
- `supply_items` y `supply_settings` (RU1): catálogo por clínica con la clave de la línea del `.md`, marcas de lo que la clínica
  editó, archivó o cambió en la lista de turno (ninguna carga lo pisa) y el periodo de registro con sus turnos.
- `material_uses` (RU2): registros por paciente o uso general, con periodo, materiales (copia de material, variante y unidad),
  versión de corrección y anulación con motivo.
- `anesthesia_sheets` (PQ3): una hoja vigente por nota postquirúrgica; no se puede borrar (disparador). `attachments.voided_at`
  y `void_reason` para la hoja reemplazada; `addenda.target_kind` acepta `anesthesia`.
- **Probado sobre una copia**: creé una base v81 con el código de la ronda 13 (3 clínicas, 374 consultas, 16 recetas) y la
  migré dos veces con el de esta ronda: queda en 82, no se pierde nada y cada clínica tiene 73 materiales con 15 en la lista
  de turno; la segunda vez no cambia nada. El catálogo nace también en toda clínica o consultorio nuevo.

## 4. Carga del catálogo (RU1)

73 líneas cargadas, 15 en la lista de turno, ninguna fila sin leer; la sección «Cambios respecto al listado original» no se
carga. **El `.md` trae 9 categorías, no 10** como dice el criterio (Agujas y jeringas, Acceso venoso, Curación y vendajes, Hojas
de bisturí, Suturas, Protección personal, Oxígeno y nebulización, Sondas y recolectores, Ginecología y recién nacido). Agujas,
jeringas, catéteres y mariposas solo por calibre: si se escribe una longitud, se quita.

## 5. Valores por defecto usados

Todos los de la sección 6 (A1–A24), salvo:
- **A2**: no hicieron falta interruptores nuevos (ver arriba).
- **A10**: turnos de enfermería existentes (07–15, 15–23, 23–07) en vez de 07–13, 13–19, 19–07.
Además:
- **ME14, qué decide la casilla con ingreso**: «Aplicar en la clínica» se muestra también con ingreso y viene marcada; marcada va
  a la hoja, desmarcada va a la receta (no a la hoja, tampoco al pasar a hospitalización). Si no se toca, todo va a la hoja como
  hoy. La receta sale al firmar y se sigue a la estancia con «Ir a observación» / «Ir a hospitalización».
- **ME13**: lo registrado («Aplicado» o «No aplicado») no se cambia desde la ventana; también aparece en el Inicio de
  enfermería («Medicamentos por aplicar»). La asistente del Consultorio también puede aplicar.
- **EX10**: si solo hay exámenes «En la clínica», la pantalla final muestra esa orden con su aviso. El aviso dice «a
  enfermería» cuando la clínica no tiene laboratorio o imágenes propias.
- **EX11**: los que ya tienen resultado salen sin marcar, pero se pueden marcar e imprimir (antes la API lo rechazaba).
- **RU**: permisos nuevos `supplies.*` y `usage.*`; el registro de material va al periodo en que empieza (la Noche cuenta en el
  día en que empieza); el «Uso general del servicio» solo sale con el área «Todas»; anular: el autor o Administración, con
  motivo; corregir: el autor en el periodo de gracia. ExcelJS **4.4.0, licencia MIT**, cargado solo al exportar.
- **PQ3**: la hoja impresa ocupa 2 hojas Carta (no cabe en una con la plantilla y una cuadrícula que se pueda llenar a mano);
  la técnica se marca sola según el tipo de anestesia de la nota; se puede subir o llenar después del egreso; una hoja llenada
  en el sistema se corrige en el periodo de gracia o con adenda (no se reemplaza con una en papel); la asistente del
  Consultorio puede ver y subir.

## 6. Lo que debes validar tú (todo en `src/lib/clinicalConfig.ts` con `VALIDAR: Emil`, salvo el `.md`)

- El catálogo de material: `data/listado_material_medico_quirurgico.md` (`npm run ru1:build` lo regenera) y las unidades.
- Los turnos y periodos del registro (`SUPPLY_DEFAULT_SHIFTS`, `SUPPLY_PERIODS`).
- Los motivos de «No aplicado» (`NOT_APPLIED_REASONS`) y el motivo nuevo de «No se realizó» (`NOT_DONE_ELSEWHERE`).
- Las listas de la hoja de anestesia (`ANESTHESIA_SHEET`, `ANESTHESIA_TECHNIQUE_OF`, `ANESTHESIA_GRID`).

## 7. Capturas

`docs/ronda14/despues/`: lista compacta (`ex9-*`), pantalla final con la orden «En la clínica» y sus PDF (`ex10-*`), la
ventana desde la nota (`ex11-*`), formulario STAT, Atendidos, ventana «Aplicar» y tarjeta (`me13-*`), receta con ingreso y
desde la nota (`me14-*`), barra fija (`cx6-*`), mayúscula (`ge10-*`), catálogo, registro y PDF del registro (`ru1-*`, `ru2-*`,
`ru3-*`) y hoja de anestesia (`pq3-*`).

## 8. Hallazgos fuera de la lista (no los implementé)

- `Attachments.tsx` todavía tiene «Eliminar», que borra de verdad los archivos del expediente (choca con «nada se borra»).
- En la nota postquirúrgica el cargo se llama «Circular»; en el Anexo B, «Circulante».
- Cada página de la hoja de anestesia repite la leyenda de IM1 «Sin la firma y el sello… no vale».
- Las versiones anteriores de un registro de material no se pueden ver en pantalla (`/api/versions` pide `chart.view`, que
  Recepción y Administración no tienen); solo sale «Corregido · vN».
- Una recarga dura en una ruta interna (p. ej. `/app/consulta/…`) manda a Inicio mientras carga la sesión.
- No encontré otros lugares donde un medicamento cree una estancia ni otros botones que impriman órdenes sin dejar elegir
  (el cuadro que se ofrece al firmar una nota de evolución con externos imprime ese lote; la ventana sigue en la tarjeta).

## 9. Verificaciones

- `tsc`, `oxlint` (sin errores) y `npm run build`: bien.
- Pruebas: 382; pasan 379. Las 3 que fallan: `ronda9` GE3 («sin corrimientos», `spawnSync npx ENOENT` en este equipo, de
  siempre) y `demoData` «Dra. Mariela Zúñiga: 0 citas hoy», que **también falla con el código de la ronda 13** (depende de la
  hora de la demo). Nuevas: `server/ronda14.test.ts` (6), `ronda14_ru.test.ts` (25), `ronda14_pq.test.ts` (9). Ajusté pruebas de
  rondas anteriores que describían lo que esta ronda cambia (ME3/ronda 9: la observación por «Aplicar en la clínica»; EX5:
  imprimir uno con resultado; EX1: un solo lote en consulta externa).
- En el navegador (Edge, el motor de Chrome) a 1366 y 390 px, sin desborde: GE10, CX6, EX9, EX10 (y sus PDF en Carta: la
  principal sale con receta + órdenes externas; «Imprimir esta orden», solo la de la clínica), EX11, ME13 (formulario, Atendidos,
  ventana, tarjeta), ME14 (pantalla final con ingreso, «Receta» en la nota, Anexos), RU1–RU3 y PQ3. Recorrido unido: una
  aplicación de ME13 registrada por enfermería aparece en el registro de uso con hora, quién y el médico.
- **No hice**: leer producción para ME13 (sin permiso); el recorrido completo con los ocho usuarios ni los anchos 1920, 1280,
  ~1100 y ~1000; abrir el Excel en Microsoft Excel (se revisó con ExcelJS); imprimir desde el diálogo de Chrome (se usó el PDF
  de Playwright); cortar el internet con el formulario de material abierto (se probó el borrador sin conexión en el navegador);
  al Dr. Fúnez en el navegador (la base nueva no lo trae; está en las pruebas de la API).
