# Reporte de la ronda 18

12 de noviembre de 2026. Pedido: `docs/ronda18/PEDIDO_RONDA18.md` (14 puntos) y `docs/ronda18/PEDIDO_AUDITORIA_MEDICO.md` (8
correcciones, pruebas y sugerencias). Plan: `PLAN_RONDA18.md`. Pruebas: `PRUEBAS_AUDITORIA.md`. Sugerencias: `SUGERENCIAS.md`.
Capturas: `docs/ronda18/capturas/captura-NN-*.png`.

Los 14 puntos y las 8 correcciones están hechos. Lo que no se verificó en pantalla está en la sección 9.

## 1. Estado por punto

| Punto | Estado | Archivos principales | Cómo probarlo |
|---|---|---|---|
| RP1 | Hecho | `server/routes/reports.ts`, `src/app/Reports.tsx`, `src/lib/reportDelta.ts` | Como Ricardo Moncada, Reportes › «30 días»: cada cuadro dice «▲/▼ n % vs. 30 días anteriores». Cambia a «7 días»: se recalcula. En el consultorio el subtítulo dice «del consultorio». |
| RP2 | Hecho | los mismos y `src/lib/reportPeriod.ts` | Reportes › «Mes» › «‹» hasta octubre: gráficas del 1 al 31 y «vs. mes anterior». En noviembre dice «vs. 1–12 oct» y «›» está apagado. «Exportar CSV» baja `reporte_2026-10.csv`. |
| NP1 | Hecho | `src/components/TeamNote.tsx`, `PatientHeader.tsx`, `server/routes/teamNote.ts` | Como Dra. Solórzano, en un paciente: «+ Agregar nota para el equipo», guardar. Como otro médico, «Cambiar»: «Historial (2)». Como Andrea Quiroz la ves sin «Cambiar». |
| AR1 | Hecho | `src/app/Attachments.tsx`, `clinicalConfig.ts` (`FILE_CATEGORIES`), `server/routes/files.ts` | Biblioteca › paciente › Archivos: abre la lista, escribe «refer». Sube un PDF como «Receta externa»: sale en su grupo, con conteo. |
| LD1 | Hecho | `src/components/Combo.tsx`, `src/lib/combo.ts`, 46 pantallas, `server/ronda18_ui.test.ts` | Nota postquirúrgica: «Tipo de anestesia», escribe «raq» y Enter; escribe «xyz» y sal del campo. «Ayudante 2»: un nombre de afuera y «Usar «…»». |
| R18-UI1 | Hecho | `src/index.css`, `modules.css`, `responsive.css` | «Nota de procedimiento» a 1366 px: los dos campos empiezan a la misma altura y «Ahora» mide lo mismo que el campo. |
| MN1 | Hecho | `src/lib/nav.ts`, `src/app/AppShell.tsx` | Como Lic. Marta Urbina, pliega «Pacientes»: el encabezado muestra la suma; recarga y sigue plegado; entra a Hospitalizados y se abre. |
| CO1 | Hecho | `src/lib/permissions.ts`, `nav.ts`, `Dashboard.tsx` | Como Dra. Isabel Pacheco, vista Médico: sin «Cobrar» ni «Cobrado hoy», cuatro cuadros en una fila. Vista Administración: «Caja». `/app/caja` en la vista Médico ofrece cambiar de vista. |
| R18-OB1 | Hecho | `src/components/ActionRow.tsx`, `MedicalNotes.tsx`, `Annexes.tsx`, `server/routes/inpatient.ts`, `preanesthesia.ts` | Paciente de Observación: cinco botones en una fila. Pásalo a hospitalización: aparecen los de cirugía. Angosta la ventana: «Más acciones». |
| PX1 | Hecho | `src/app/ExamsTab.tsx`, `src/lib/exams.ts` | Exámenes de un hospitalizado: todo cerrado. «Expandir todo» y «Contraer todo» valen para grupos y exámenes. |
| PX2 | Hecho | `ExamsTab.tsx`, `modules.css` | La barra: cinco controles del mismo alto, «Ordenar por». A 1100 y 390 px, dos renglones. |
| AN1 | Hecho | `permissions.ts`, `clinicalConfig.ts`, `positions.ts`, `Staff.tsx`, `server/staff.ts`, `server/routes/anesthesia.ts`, `migrations.ts` | Como Ricardo Moncada, Personal › agregar con rol «Anestesia». En «Subir la valoración preanestésica», la lista solo ofrece anestesiólogos y técnicos. |
| PD1 | Hecho | `src/lib/pendings.ts`, `alerts.ts`, `src/app/MedAlerts.tsx`, `src/lib/ward.ts` | Como Aux. Rosa Vallecillo abre a Marcos Velásquez (cuarto 203): «Sin pendientes para ti · 1 de otros» y «Médico: revisar 1 resultado de Hemograma». |
| PD2 | Hecho | `Inpatients.tsx`, `Observation.tsx`, `BedBoard.tsx`, `src/components/Pendings.tsx`, `AppShell.tsx` | Hospitalizados: columna «Pendientes»; «Con pendientes para mí (n)» coincide con la insignia del menú; toca «signos atrasados». |

### Auditoría de uso como médico

| N.º | Estado | Archivos | Cómo probarlo |
|---|---|---|---|
| 1 Inicio: estado de carga | Hecho | `store.tsx` (`loaded`), `Dashboard.tsx` | Con la red en «Slow 3G», entra como médico: «Cargando tu día», nunca «0 citas hoy». |
| 2 Aviso «orden nueva sin revisar» | Hecho (con PD1) | `pendings.ts`, `MedicalNotes.tsx` | Como médico firma una nota con una orden: sin aviso rojo; en Notas, la etiqueta gris «Pendiente de revisión por enfermería (1)» y, en el recuadro, «Enfermería: revisar orden nueva (1)». Como enfermería sí es rojo. |
| 3 Conteo de alertas | Hecho | `src/lib/inpatient.ts`, `server/routes/inpatient.ts` | Una nota con una indicación nueva sube el conteo en 1; solo omitir, en 1; sin cambios, 0. |
| 4 Agenda: cuadrícula | Hecho | `src/lib/schedule.ts`, `Agenda.tsx` | Con una cita a las 05:35, la cuadrícula empieza a las 05:00. |
| 5 Agenda: contraste y estado | Hecho | `Agenda.tsx`, `index.css` | Una cita atendida se lee y dice «Consulta atendida». |
| 6 «Atender» principal | Hecho | `WaitingRoom.tsx` | Como médico, «Atender» azul y «Preclínica» suave; como enfermería, igual que antes. |
| 7 Identidad en teléfono | Hecho | `clinical.css` | A 390 px la identidad se lee completa. |
| 8 Clic en CIE-11 | Hecho | `DiagnosisPicker.tsx` | Elige un diagnóstico con clic: queda elegido y el cursor sigue en el buscador. |

## 2. Lo que se pidió averiguar

- **Rondas 16 y 17 contra esta:** PQ4 (r16) puso «Valoración preanestésica» también en Observación: R18-OB1 la quita. PF2 (r17)
  dejó Inicio, Agenda, Recetas y Caja sueltos y «Registros» como encabezado fijo: MN1 lo cambia. Los códigos UI1 y OB1 ya existían
  en la ronda 17: aquí van como R18-UI1 y R18-OB1. Nada más choca.
- **«Anexos» y las categorías (AR1):** Anexos no tenía otra lista. Había una sola lista en `Attachments.tsx`, con las cuatro
  categorías y tres internas (hoja de anestesia, valoración preanestésica, recuento quirúrgico) que no se eligen al subir. Ahora
  todo sale de `clinicalConfig.ts`: `FILE_CATEGORIES` (las 12) y `SYSTEM_FILE_CATEGORIES` (las tres quirúrgicas).
- **«Valoración realizada por» (LD1, AN1):** usaba un `<datalist>` con todo el personal activo. Ahora es la lista abierta de LD1
  con anestesiólogos y técnicos en anestesia. **Las demás listas de personal:** el equipo quirúrgico de la nota postquirúrgica
  ofrece a todo el personal activo (no filtra por rol); «Médico tratante», la Agenda y «Sin cita» solo médicos; el rol de turnos,
  solo las personas del departamento; la Bitácora, a todos. No se cambiaron.
- **«Llegó» en la vista Médico (CO1):** la médica del consultorio ya tenía el permiso (`checkin.manage`, desde PF1 de la ronda 17) y
  el servidor lo acepta: no se pudo reproducir el aviso rojo de la captura 8. Quedó una prueba que lo fija.
- **Los dos selectores de rol:** son dos controles distintos que hacen lo mismo. Las pestañas «Administración · Médico» del Inicio
  (`ViewSwitch`) y «Médico ⌄» de la tarjeta de usuario (`RoleMenu`) llaman a la misma acción. «Cobrar» es como se llama `/app/caja`
  en el menú del médico; «Caja», en los demás roles. No se cambió.
- **Por qué el Hemograma abría solo (PX1):** quedaba la regla de EX1 «un crítico sin revisar empieza abierto». Al quitarse los
  valores críticos (UM4) pasó a ser «un resultado con algún valor Alto o Bajo empieza abierto». Se quitó.
- **Regla de color de las insignias (MN1):** rojo solo cuando lo que cuenta es de quien mira y hay algo crítico (orden sin revisar
  por más de 30 minutos, fiebre o hipotermia sin atender, ingreso sin nota de ingreso, o un examen urgente en la bandeja de
  Laboratorio o Imágenes). Todo lo demás, ámbar.
- **Qué cuenta cada insignia:** Consulta externa, pacientes en sala de espera. Crónicos y seguimientos, controles vencidos o de
  hoy. Observación y Hospitalizados, para quien abre el expediente, pacientes con al menos un pendiente suyo; para administración y
  recepción, Observación cuenta los pacientes que hay. Las áreas de Laboratorio e Imágenes, exámenes pendientes de esa área. Un
  grupo plegado muestra la suma de las suyas.

### Tipos de pendiente y responsable (`src/lib/pendings.ts`)

| Tipo | Responsable |
|---|---|
| Alerta de signos (fiebre o hipotermia) | Enfermería |
| Signos vitales que tocan o atrasados | Enfermería |
| Dosis atrasada | Enfermería |
| Orden nueva sin revisar | Enfermería |
| Resultado listo por revisar | Médico: quien pidió el examen y los tratantes |
| Examen que «No se realizó» (no estaba en la propuesta) | Médico: quien lo pidió y los tratantes |
| Toma de muestra pendiente | Laboratorio y Enfermería; sin laboratorio en la clínica, Enfermería |
| Estudio de imagen por realizar | Técnico en imágenes; sin departamento de imágenes, Enfermería |
| Informe de imagen pendiente | Radiólogo |
| Firma del médico pendiente | Médico tratante |
| Firma del paciente, familiar o testigo | Enfermería y médico tratante |
| Ingreso con órdenes pendientes (HO2, no estaba en la propuesta) | Médico tratante |
| Falta asignar la cama (no estaba en la propuesta) | Enfermería y médico tratante |

Fuera del recuadro, como antes: la hoja de anestesia pendiente (solo quien hizo la anestesia, en su Inicio) y el medicamento por
aplicar en consulta externa (ME13, en Consulta externa). La valoración preanestésica no genera pendiente.

## 3. Inventario de listas (LD1) y formularios alineados (UI1)

**Cambiadas (77):** los 71 `<select>` y los 6 `<datalist>` del inventario de `PLAN_RONDA18.md`, en 46 archivos. Listas abiertas
(aceptan un texto escrito): equipo quirúrgico, «Valoración realizada por», «Anestesia realizada por», especialidad del ingreso,
banco, padecimiento crónico y procedimiento de la autorización quirúrgica. Las demás son cerradas.

**Se quedaron, con el motivo:**
- Buscadores de catálogos grandes (pacientes, CIE-11, vademécum, material): siguen desde 2 letras (ME8, RU7) y ya compartían la
  superficie de menú.
- «Vía» (`RouteField`): ya era un combobox propio, con abreviaturas («iv» → Intravenosa).
- Selectores segmentados (Día · Semana · Mes) y el menú «⋯» de fila: no son listas de opciones de un campo.

Dos cambios de comportamiento por pasar a la lista única: en «Ingresos y egresos» las opciones ya no van en dos bloques con título,
sino en una lista con «Ingreso» o «Egreso» a la derecha; en la reserva en línea, «Sexo» ya no usa la validación del navegador (el formulario ya lo comprobaba: «Indica el sexo del paciente»).

**Formularios alineados:** la corrección está en la fila (`.form-grid`) y en el campo (`.field`), así que vale para todos: Nota de
procedimiento, Nota postquirúrgica, Nueva nota de evolución, Egreso, Referencia, Pasar a hospitalización, Ingresar paciente,
Autorización y los de Configuración. Campos y botones pegados a un campo comparten un alto (`--field-h`: 40 px; 44 con el dedo);
antes los campos medían 42 px.

## 4. Base de datos

Dos pasos nuevos en `server/migrations.ts` (corren una vez por base; el esquema base no cambia):

1. `patient_team_notes`: una fila por versión de la nota del paciente (texto, autor, fecha). La vigente es la última; «Quitar
   nota» es una versión vacía.
2. `staff_role_check` admite el rol `anesthesia`.

Sin migración: las categorías de archivos (`attachments.category` es texto; las cuatro de antes conservan su clave), el cargo
`anesthesia_tech` (`staff.position` es texto) y los responsables de los pendientes (configuración en código).

Probado sobre una copia de la base a la versión desplegada: aplica los dos pasos, la segunda corrida no cambia nada y no se pierde
ningún registro. Una base nueva (clínica y consultorio de la demo) los trae desde el arranque.

## 5. Valores por defecto

Se usaron todos los de la sección 6 del pedido, sin cambios. Decisiones propias:

- **AN1:** el cargo vive en un rol nuevo, «Anestesia». Ningún rol existente era «expediente en lectura y nada más».
- **AN1:** «Anestesia realizada por» (hoja en papel) ofrece la misma lista que «Valoración realizada por».
- **LD1:** la lista se abre en un portal pegada al campo; con Tab se acepta la opción resaltada.
- **RP1:** menos de una décima se muestra «= 0 %»; solo la flecha, sin «+/−»; el CSV de 7, 30 y 90 días conserva su nombre.
- **NP1:** quien solo lee no ve nada si la nota está quitada; «Historial (n)» cuenta también la vigente.
- **PD1:** mientras el paciente no firma, salen dos pendientes: «Firma del paciente» (compartido) y «Firma del médico».
- **PD2:** «Sin órdenes de ingreso» y «Autorización pendiente de firma» dejaron de ser etiquetas sueltas en la lista: son
  pendientes, y salen en la columna de quien le tocan.
- **CO1:** quitar el cobro de la vista Médico se hizo como permiso (no solo en el menú), así vale también por dirección directa.

## 6. Para que Emil valide

- Las 12 categorías de archivos (`FILE_CATEGORIES`).
- Los grupos del menú (`src/lib/nav.ts`). El grupo «Agenda» con una sola entrada «Agenda» (vista Médico del consultorio) se ve
  repetido; es lo que pide el punto, pero conviene mirarlo.
- La tabla de pendientes y responsables, en especial los tres tipos que no estaban en la propuesta.
- Que a un médico que no es tratante ni pidió el examen todo le salga en «Pendientes de otros» (de noche, el médico de turno).
- Lo que puede hacer el técnico en anestesia.

## 7. Capturas

`captura-01` Reportes con «Mes» y porcentajes · `02` nota debajo del nombre · `03` lista en la nota postquirúrgica · `04` lista en
la ventana de la valoración preanestésica · `05` y `06` menú de médico y de enfermería · `07` botones de Observación · `08`
Exámenes contraído · `09` recuadro de enfermería con «Pendientes de otros» · `10` columna «Pendientes» · `11` la misma a 390 px.

## 8. Fuera de la lista (no implementado)

- En el expediente, la fila de pestañas sobresale 12 px a unos 1100 px de ancho. Ya pasaba antes.
- El técnico en anestesia ve en lectura el expediente de cualquier paciente de la Biblioteca, no solo los de observación y
  hospitalización (igual que el radiólogo).
- En el consultorio, ni la titular ni la asistente tienen el permiso de marcar órdenes como revisadas; hoy no hace falta porque
  las notas de observación no llevan checklist.
- `server/api.test.ts` › «la demo trae casos completos» falla desde antes de la ronda 11.
- Quedan reglas CSS de `.select` sin uso.

## 9. Verificaciones que no se pudieron hacer

Detalle en `PRUEBAS_AUDITORIA.md`. En corto: impresión real; caída de internet a medio escribir y dos usuarios en el mismo
borrador; todos los botones de todas las pantallas (se abrieron todas las entradas del menú con 14 cuentas y los flujos nuevos);
el toque real con el dedo; los puntos 1 y 8 de la auditoría en pantalla; el técnico en anestesia y el consultorio con enfermera
haciendo clic (están cubiertos por pruebas de servidor); la migración contra Postgres real (se probó en PGlite).
