# Plan de la ronda 18

El pedido está en `docs/ronda18/PEDIDO_RONDA18.md` (14 puntos) y sale de `docs/ronda18/Correcciones ronda 18.docx` (15 capturas,
copiadas a `docs/ronda18/capturas/pedido-NN.png`). En la misma carpeta llegó `PEDIDO_AUDITORIA_MEDICO.md`: 8 correcciones de la
prueba de uso como médico, pruebas de toda la app y sugerencias; se hace en esta misma ronda, con commits `[auditoria][An]`.
`instrucciones_prueba_QA_clinara.md` son instrucciones para quien prueba la app (no pide cambios de código): no se aplica.

Un commit por punto: `[ronda18][CÓDIGO] …`. Ningún código de esta ronda (RP, NP, AR, LD, UI, MN, CO, OB, PX, AN, PD) choca con
los de las rondas 16 y 17 salvo **UI1** y **OB1**, que ya existen en la ronda 17 (UI1: tablas en una sola línea; OB1: observación
del consultorio en Configuración): en los commits y el reporte van como `R18-UI1` y `R18-OB1`.

## Lo que pidieron las rondas 16 y 17 que toca esta ronda

- **PQ4 (r16)** puso «Valoración preanestésica» en la fila de acciones de observación y hospitalización → R18-OB1 la quita de
  Observación (y el servidor rechaza crearla ahí).
- **PF2 (r17)** ordenó el menú en grupos (`src/lib/nav.ts`): Inicio, Agenda, Recetas y Caja sueltos; «Pacientes»; «Laboratorio e
  imágenes»; «Registros» (encabezado fijo, RU6); «Administración». MN1 cambia esos grupos: «Agenda y cobros», Recetas pasa a
  «Pacientes», «Registros» se pliega. La regla sigue en `nav.ts` (la usan las pruebas).
- **ES (r17)** unificó el estilo del `<select>` nativo y de los menús emergentes (`.suggest__list`, `.row-menu__pop`…). LD1 va más
  lejos: quita el `<select>` nativo y los `<datalist>`; reutiliza esa superficie de menú.
- **TB (r17)** hizo de Hospitalizados y Observación una tabla (`BedBoard`, `boards.css`) → PD2 agrega ahí la columna «Pendientes».
- **HO2 (r16)** «Ingreso con órdenes pendientes» (insignia roja del médico tratante en Hospitalizados) → pasa a ser un tipo más de
  la tabla de PD1 (responsable: médico tratante).
- **AD1 (r17)** administración y recepción ven Observación sin expediente → PD2 no les muestra pendientes clínicos («igual que hoy»).
- **Auditoría (11 nov.)**: migraciones como pasos numerados (`server/migrations.ts`); el esquema base no se toca.

## Puntos

| Punto | Qué se hace | Archivos | Base de datos |
|---|---|---|---|
| R18-UI1 | La fila de formulario alinea arriba; el texto de ayuda va debajo del campo sin empujar al vecino; «Ahora» mide lo mismo que el campo | `index.css`, `modules.css`, `DateTimeField.tsx`, `MedicalNotes.tsx`, `PostopNote.tsx` | — |
| PX2 | Barra de Exámenes: mismos altos, alineada abajo, «Ordenar por», dos renglones a ≤1100 px | `ExamsTab.tsx`, `modules.css` | — |
| PX1 | Todo cerrado al entrar (grupos y exámenes); «Contraer/Expandir todo» en los dos niveles; acciones siempre en la fila del examen; una sola etiqueta Alto/Bajo | `ExamsTab.tsx`, `lib/exams.ts`, CSS | — |
| CO1 | Consultorio: sin «Cobrar» ni «Cobrado hoy» en la vista Médico si la persona también es Administración; «Llegó» permitido en la vista Médico | `nav.ts`, `Dashboard.tsx`, `permissions.ts`, servidor (llegada) | — |
| R18-OB1 | Observación: 5 botones en una fila, sin los de cirugía; «Más acciones ▾» cuando no caben; el servidor rechaza crear documentos quirúrgicos en observación | `MedicalNotes.tsx`, `Annexes.tsx`, `PreEval.tsx`, `routes/inpatient.ts`, `routes/consent.ts`, `routes/preanesthesia.ts`, `routes/notes.ts` | — |
| LD1 | Un solo componente `Combo` (combobox WAI-ARIA, lista cerrada o abierta) que reemplaza los 71 `<select>` y los 6 `<datalist>`; prueba que falla si vuelve un `<select>` | `components/Combo.tsx` (nuevo), ~45 pantallas, `server/ronda18_ui.test.ts` | — |
| AR1 | 12 categorías de archivo en configuración, lista con `Combo` e icono, archivos agrupados por categoría | `clinicalConfig.ts`, `Attachments.tsx`, `routes/files.ts`, `types.ts` | sin migración: `attachments.category` es texto libre |
| MN1 | Grupos: Inicio · «Agenda y cobros» (o «Agenda») · «Pacientes» (con Recetas) · departamento · «Registros» · «Administración»/«Mi consultorio»; todos plegables con un solo componente; una regla de color de insignias | `nav.ts`, `AppShell.tsx`, CSS, pruebas de `nav` | — |
| AN1 | Rol «Anestesia» con el cargo «Técnico(a) en anestesia» (un rol con cargos, como DP1): expediente en lectura, sube valoración y hoja en papel, llena y firma la hoja en el sistema; «Valoración realizada por» solo anestesiólogos y técnicos | `clinicalConfig.ts`, `permissions.ts`, `positions.ts`, `Staff.tsx`, `routes/anesthesia.ts`, `routes/preanesthesia.ts`, `staff.ts`, `SurgicalDocUpload.tsx`, `PostopNote.tsx` | paso de migración: `staff_role_check` admite `anesthesia` |
| RP2 | Periodo «Mes» con selector de mes, en la URL; CSV del mes | `Reports.tsx`, `routes/reports.ts` | — |
| RP1 | Variación contra el periodo anterior en los cuatro cuadros (cálculo en el servidor) | `Reports.tsx`, `routes/reports.ts`, `lib/reportDelta.ts` | — |
| NP1 | «Nota para el equipo» en `PatientHeader`, con historial de versiones | `PatientHeader.tsx`, ruta nueva, `permissions.ts` | paso de migración: tabla `patient_team_notes` (una fila por versión) |
| PD1 | Cada tipo de pendiente con su responsable en un solo archivo; el recuadro cuenta lo del usuario y lista «Pendientes de otros» | `lib/pendings.ts` (nuevo), `alerts.ts`, `MedAlerts.tsx`, `hooks.ts`, `WardAlerts.tsx` | — (la tabla de responsables es configuración en código, `VALIDAR: Emil`) |
| PD2 | Columna «Pendientes», filtro «Con pendientes para mí (n)» e insignia = pacientes con pendientes del usuario | `Inpatients.tsx`, `Observation.tsx`, `BedBoard.tsx`, `AppShell.tsx`, `boards.css` | — |
| A1–A8 | Auditoría de uso como médico (8 correcciones) | `Dashboard.tsx`, `Agenda.tsx`, `WaitingRoom.tsx`, `PatientHeader`, `DiagnosisPicker.tsx`; A2 y A3 se resuelven con PD1 (`alerts.ts`, `inpatient.ts`) | — |

Orden: R18-UI1 → PX2 → PX1 → CO1 → R18-OB1 → LD1 → AR1 → MN1 → AN1 → RP2 → RP1 → NP1 → PD1 → PD2 → auditoría → pruebas de todo.
RP1/RP2, NP1 y seis correcciones de la auditoría se hacen en ramas aparte (no tocan los mismos archivos) y se unen a `main`.

## LD1 · Inventario de listas desplegables (antes)

71 `<select>` nativos en 43 archivos y 6 `<input list>` con `<datalist>` («Elige o escribe»). Lista cerrada = solo valores de la
lista; abierta = acepta un texto escrito.

| Pantalla (archivo) | Campos | Hoy | Tipo |
|---|---|---|---|
| Nota postquirúrgica (`PostopNote`) | Tipo de anestesia; Autorización quirúrgica firmada | nativa | cerrada |
| Nota postquirúrgica (`PostopNote`) | Equipo quirúrgico (6 cargos) | datalist | abierta |
| Valoración preanestésica y recuento en papel (`SurgicalDocUpload`) | Valoración realizada por | datalist | abierta |
| Hoja de anestesia en papel (`AnesthesiaSheet`) | Anestesia realizada por | datalist | abierta |
| Nota de procedimiento (`MedicalNotes`) | Autorización quirúrgica firmada | nativa | cerrada |
| Archivos (`Attachments`) | Tipo de archivo | nativa | cerrada |
| Exámenes (`ExamsTab`) | Orden; Microbiólogo responsable | nativa | cerrada |
| Ordenar exámenes (`Exams`) | Lado | nativa | cerrada |
| Medicamentos (`Medications`, `MedExtras`, `DrugForm`, `AddToVademecum`, `FluidsOrder`, `VitalsFrequency`, `FluidBalance`) | Frecuencia, unidad de infusión, primera dosis, diluyente, vía, forma, corte de líquidos, frecuencia de signos, tipo de ingreso/egreso | nativa | cerrada |
| Paciente (`PatientForms`, `Prescriptions`, `Ambulatory`, `Booking`) | Sexo, estado civil, escolaridad, tipo de sangre, años/meses, médico | nativa | cerrada |
| Agenda (`Agenda`, `WalkIn`, `ScheduleEditor`, `Schedules`) | Médico, hora, tipo de cita, duración, servicio | nativa | cerrada |
| Hospitalización (`Inpatients`, `BedFields`, `VitalsSheet`) | Médico tratante, cama, frecuencia; Especialidad | nativa; datalist | cerrada; abierta |
| Caja (`Billing`) | Visita; Banco | nativa; datalist | cerrada; abierta |
| Constancia (`Certificate`), Seguimientos (`Followups`) | Reposo, cada cuánto; Condición crónica | nativa; datalist | cerrada; abierta |
| Autorización (`Authorization`) | Cirugía frecuente | datalist | abierta |
| Quirófano (`SurgicalCountForm`, `AnesthesiaForm`) | Resultado, quién se releva, categoría del fármaco, Aldrete | nativa | cerrada |
| Personal y plataforma (`Staff`, `Platform`, `ClinicData`, `Roster`) | Rol, estado, cargo, persona | nativa | cerrada |
| Configuración y catálogos (`ExamCatalogAdmin`, `SupplyCatalog`, `ClinicDrugs`, `Contacts`, `OrderSetsPage`) | Subgrupo, contraste, lado, sexo, categoría, unidad, alcance, vía, tipo de contacto, frecuencia | nativa | cerrada |
| Registros y bandejas (`Usage`, `MaterialForm`, `DeptTray`, `Activity`, `Patients`) | Turno, área, ubicación, persona, rol, tipo de acción, médico, seguimiento | nativa | cerrada |
| Fecha y hora (`DateTimeField`) | Hora, minutos | nativa | cerrada |

Se quedan como están (no son listas desplegables de opciones): los buscadores de catálogos grandes (`DrugSearch`, `DiagnosisPicker`,
`SupplySearch`, buscador de pacientes, `RouteField` de «Vía» con abreviaturas, que ya es un combobox), los selectores segmentados
y el menú «⋯» de fila. Toman el mismo aspecto (misma superficie y alto de fila).

## PD1 · Tipos de pendiente y responsable (`src/lib/pendings.ts`, `VALIDAR: Emil`)

Tipos que existen hoy en `fileAlerts` (`src/lib/alerts.ts`) y fuera de él, con el responsable que se les asigna:

| Tipo (clave) | De dónde sale hoy | Responsable |
|---|---|---|
| Alerta de signos: fiebre o hipotermia (`vitals-alert`) | última temperatura fuera de la banda | Enfermería |
| Signos vitales que tocan o atrasados (`vitals-due`) | tomas esperadas sin registrar | Enfermería |
| Dosis atrasada (`dose-late`) | hoja de medicamentos | Enfermería |
| Orden nueva sin revisar (`orders-review`) | checklist de la nota | Enfermería |
| Resultado listo por revisar (`result-review`) | examen en «Resultado listo» | Médico: quien lo pidió y los tratantes |
| Examen que «No se realizó» (`exam-notdone`) | el departamento lo marcó | Médico: quien lo pidió y los tratantes (decide si lo cancela) |
| Toma de muestra pendiente (`sample-pending`) | laboratorio pedido | Compartido: Laboratorio y Enfermería (sin laboratorio en la clínica: Enfermería) |
| Estudio de imagen por realizar (`imaging-pending`) | imagen pedida | Imágenes (técnico); con el estudio realizado y sin informe: radiólogo |
| Firma del médico pendiente (`sign-doctor`) | autorización con la firma del paciente ya puesta | Médico tratante |
| Firma del paciente, familiar o testigo (`sign-patient`) | autorización de hospitalización o quirúrgica pendiente | Compartido: Enfermería y médico tratante |
| Ingreso con órdenes pendientes (`admission-orders`, HO2) | ingreso directo sin nota de ingreso | Médico tratante |
| Falta asignar la cama (`bed`) | ingreso desde consulta externa sin cama | Compartido: Enfermería y médico tratante |
| Hoja de anestesia pendiente (PQ3) | nota postquirúrgica sin hoja | Solo quien hizo la anestesia (no entra al recuadro del paciente; sigue en su Inicio) |
| Medicamento por aplicar en consulta externa (ME13) | consulta externa | Compartido: Enfermería y el médico que atendió (está en Consulta externa, no en el recuadro de la estancia) |

Reglas: «médico» es la persona (tratante o quien pidió el examen), no el rol; a otro médico le sale en «Pendientes de otros».
Laboratorio e Imágenes ven solo lo suyo y sin «Pendientes de otros» (DP11). En Consultorio, la titular cuenta lo de enfermería
como suyo mientras no tenga una enfermera activa.

## Defaults

Los de la sección 6 del pedido (A1–A18), sin cambios. Decisiones propias que se listan en el reporte:

- AN1: el cargo vive en un rol nuevo «Anestesia» (no hay otro rol con «expediente en lectura y nada más»).
- LD1: la lista se abre en un portal pegada al campo (como el calendario de GE3): no la recorta ninguna ventana y sube si no cabe.
- MN1, regla de color de las insignias: rojo solo cuando lo que cuenta es del usuario y está atrasado o es urgente; lo demás, ámbar.
