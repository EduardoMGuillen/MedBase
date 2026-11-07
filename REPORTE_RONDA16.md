# Reporte de la ronda 16

Pedido: `docs/ronda16/PEDIDO_RONDA16.md`. Plan y tabla de paridad: `PLAN_RONDA16.md`.

Esta vez no llegó un prompt escrito: escribí el pedido a partir de tu Word (21 capturas) y del PNG de la hoja de anestesia, revisando el código antes. Los valores por defecto de la sección 6 del pedido se usaron tal cual, salvo lo que se dice abajo.

## 1. Estado por punto

| Punto | Estado | Archivos principales | Cómo lo pruebas |
|---|---|---|---|
| RX1 | Hecho | `DeptTray.tsx`, `src/lib/exams.ts` (`finishedOn`), `server/routes/dept.ts` | Como Dr. Rafael Zepeda, informa un estudio después de las 18:00: sale en «Terminados hoy» de su área. |
| MC1 | Hecho | `ExamPanels.tsx`, `index.css` (`.row--plain`), `Inpatients.tsx` | Como médico, mira «Resultados nuevos» en Inicio: texto a lo ancho, valores fuera de rango como chips, píldora a la derecha. |
| IM4 | Hecho | `ExamOrder.tsx`, `modules.css` | Imprime una orden de laboratorio: viñetas en cada grupo. La receta sigue numerada. |
| AG1 | Hecho | `Agenda.tsx`, `src/components/TopScrollbar.tsx` | Agenda › Día › todos los médicos a 1366 px: hay una barra arriba de los nombres y se mueve junto con la de abajo. |
| LB8 | Hecho | `DeptTray.tsx`, `ExamsTab.tsx` (`TakeAllButton`) | Como Lic. Paula Suazo: una tarjeta por paciente con «N exámenes», agrupados por categoría, con «Muestra tomada (N)» para todos o por categoría. |
| EX12 | Hecho | `ExamsTab.tsx`, `src/components/RowMenu.tsx` | Expediente › Exámenes: por día y categoría, con conteo, contraíble, «Muestra tomada (n)» del grupo y renglones compactos con «⋯». |
| RU10 | Hecho | `permissions.ts` | Como Ricardo Moncada o Andrea Quiroz: «Registrar material» está disponible y el registro queda con tu nombre. |
| RE2 | Hecho | `clinicalConfig.ts`, `ApptGroups.tsx`, `WaitingRoom.tsx`, `src/lib/arrivals.ts` | Como administración o recepción, Consulta externa abre «Por médico» contraída. Como médico, tu lista va por hora de llegada. |
| RE1 | Hecho | `src/app/WalkIn.tsx` (nuevo, compartido), `Ambulatory.tsx`, `Dashboard.tsx` | En Inicio de administración o recepción: «Paciente sin cita». «Paciente ambulatorio» dice «Solo laboratorio o imágenes, sin consulta» y su enlace pasa a «Paciente sin cita» sin perder el paciente. |
| EN1 | Hecho | `clinicalConfig.ts` (`DEPT_POSITIONS.nursing`), `routes/roster.ts`, `App.tsx`, Personal y roles | Como Lic. Marta Urbina: menú «Rol de turnos», editas de hoy en adelante. Como Aux. Rosa Vallecillo solo lo ves. |
| ME17 | Hecho | `src/components/Medications.tsx`, `format.ts`, `clinicalConfig.ts` | En «Vía» escribe «iv» y Enter: queda «Intravenosa (IV)». Una vía que no está en la lista se acepta tal cual. |
| ME16 | Hecho | `Medications.tsx` (formulario único), `src/lib/medForm.ts`, `server/medOrders.ts`, `server/app.ts` | Consulta con «Ingreso a hospitalización»: elige «Infusión» a 125 mL/h y firma; la hoja de la estancia la muestra como infusión. |
| NO1 | Hecho | `Consultation.tsx`, `server/app.ts` | Las casillas de ingreso están arriba de «Indicaciones y plan». Al marcar una, la indicación 1 es «Ingreso a …» y desaparece «Aplicar en la clínica». |
| NO3 | Hecho | `InpatientFile.tsx` (NoteEditor), vistas de nota | En SOAP, la ayuda de A es «Evolución y razonamiento clínico…» y debajo está «Diagnósticos (CIE-11)», también en la nota de ingreso. |
| NO2 | Hecho | `InpatientFile.tsx`, `server/routes/inpatient.ts`, `epicrisis.ts` | «Escribir nota de ingreso» abre el formato de la consulta externa con los diagnósticos del ingreso. Se puede cambiar a SOAP. |
| HO2 | Hecho | `Inpatients.tsx`, `routes/inpatient.ts`, `alerts.ts`, `Dashboard.tsx`, `consent.ts` | Andrea Quiroz ingresa a una paciente con médico tratante Dr. Hugo Nolasco: él ve «Ingreso con órdenes pendientes» y la franja en el expediente. Todo se va al firmar la nota de ingreso. |
| IE1 | Hecho | `src/lib/fluids.ts`, `VitalsSheet.tsx`, `FullRecord.tsx`, `routes/inpatient.ts` | En la nota de ingreso, «Ingestas y excretas» › «Por turno». En «Signos vitales» aparece la tabla: los líquidos IV se calculan solos y enfermería registra los egresos. |
| PQ4 | Hecho | `routes/preanesthesia.ts`, `PreEvalForm.tsx`, `PreEvalDoc.tsx`, `AnesthesiaDoc.tsx`, `AnesthesiaForm.tsx` | Dra. Silvia Arita, sin nota postquirúrgica: «Valoración preanestésica». Después de la nota postquirúrgica, el registro de anestesia la resume. Cada uno se imprime en una hoja Carta. |
| PQ5 | Hecho | `routes/surgicalCount.ts`, `SurgicalCountForm.tsx`, `SurgicalCountDoc.tsx`, `SurgicalCount.tsx` | En la nota postquirúrgica, la tarjeta «Recuento quirúrgico · Sin agregar»: llénalo o imprime en blanco y sube la foto. |

Commits: uno por punto (`[ronda16][CODE] …`), hechos en 5 ramas unidas a `main`: `ronda16-ui`, `ronda16-roles`, `ronda16-pq`, `ronda16-notas`, `ronda16-ingreso`.

## 2. Base de datos (esquema 84 → 88)

- **v85** (EN1, RE2):
  - Puesto de enfermería según el prefijo del nombre («Lic.» = licenciada; «Aux.» o sin prefijo = auxiliar).
  - Se borra una sola vez la vista guardada de Consulta externa de administración y recepción.
- **v86** (PQ4, PQ5):
  - Tablas nuevas `preanesthesia_evals` (por estancia, varias) y `surgical_counts` (una vigente por nota postquirúrgica), las dos sin borrado.
  - `anesthesia_sheets.pre_eval_id`.
  - Adendas y adjuntos aceptan los dos documentos nuevos.
- **v87** (ME16): `hosp_meds.quantity`.
- **v88** (HO2, IE1):
  - `hospitalizations.attending_ids`; las estancias que ya existían quedan con quien las ingresó.
  - `hospitalizations.fluids_plan`.
  - Tabla nueva `fluid_entries`.
- **Probado** con una base demo creada con el código de antes de la ronda (esquema 84), migrada dos veces:
  - pacientes, consultas, estancias, notas y medicamentos quedan con los mismos números;
  - las 4 enfermeras quedan con su puesto y ninguna estancia queda sin médico tratante;
  - la segunda vez no cambia nada.

## 3. Tabla de paridad (NO2 y ME16)

Está completa en `PLAN_RONDA16.md`. En resumen:
- **Corregido**:
  - la nota de ingreso es estándar por defecto;
  - CIE-11 en la nota de ingreso SOAP;
  - mismos campos obligatorios que la consulta;
  - en las notas: «Guía por sistemas», subir y bajar indicaciones, «¿Agregar como medicamento?»;
  - en la consulta: pegar varias líneas, «Guardar y agregar otro»;
  - en el formulario de medicamentos: presentación y cantidad en las notas de la estancia, PRN con intervalo en todos lados, infusión con ingreso.
- **Justificado**:
  - la consulta no tiene SOAP (es la historia de primera vez);
  - los signos de la consulta vienen de preclínica;
  - frecuencia de signos e infusión solo con ingreso;
  - días obligatorios solo en la receta.

## 4. Valores por defecto y decisiones

Se usaron los de la sección 6 del pedido. Además:
- **IM4**: viñetas solo en la orden de exámenes; la receta sigue numerada.
- **RE2**: solo los grupos «Por médico» empiezan contraídos; «Por hora» queda abierto.
- **EN1**:
  - En firmas y en el registro de material, la enfermera aparece con su puesto («Licenciado(a) en enfermería»).
  - A quien no tiene prefijo se le pone «Aux.».
  - Quien tiene enfermería y además laboratorio o imágenes conserva el puesto de laboratorio o imágenes.
- **ME17**: las líneas de medicamento usan la abreviatura («1000 mL IV…»); el nombre completo con abreviatura sale en el campo «Vía».
- **NO1**: reemplaza la regla de ME14. Con ingreso, todo va a la hoja y a la receta. Se ajustaron pruebas de rondas 14, 15 y de correcciones 2 y 3 que esperaban lo de antes.
- **HO2**:
  - Recepción ve la autorización sin «Firmar ahora» (hoy no puede firmar).
  - Recepción y administración ven un tablero de camas con paciente, especialidad y médico tratante, pero no el expediente.
  - No hay campana en la app: el aviso es la tarjeta en Inicio, el número rojo en Hospitalizados y la alerta del expediente.
- **IE1**:
  - La orden se guarda por tramos, como la frecuencia de signos, y cada nota la muestra como Nueva, Modificada, Continúa u Omitida.
  - Registrar pide orden activa.
  - Una infusión sin hora de inicio real no se cuenta y se lista aparte.
  - Un volumen tipo «40 mg/10 mL» (concentración) no se toma como volumen.
- **PQ4**:
  - El registro de anestesia se imprime con márgenes de 0.9 cm para que el formato del PNG quepa en una hoja; la valoración y el recuento mantienen 2 cm.
  - El Aldrete va como tabla horizontal.
  - La valoración pide ASA para firmar.
  - El pendiente de «Valoración preanestésica» en Inicio no se hizo (apagado por defecto).
- **LB8**: el «Muestra tomada» individual está en el menú «⋯».

## 5. Lo que debes validar tú (`VALIDAR: Emil` en `src/lib/clinicalConfig.ts`)

- Abreviaturas de las vías (ME17).
- Rubros de ingestas y excretas y la regla de cuándo cuenta una dosis IV (IE1).
- Filas y columnas del recuento quirúrgico, y cuántas filas en blanco trae la hoja impresa (PQ5).
- Los nombres de análisis que se usan para prellenar los laboratorios de la valoración (`PREANESTHESIA_LABS`, PQ4).
- Puestos de enfermería (EN1).
- Nada para un abogado en esta ronda.

## 6. Causa confirmada de RX1

`DeptTray` comparaba la fecha UTC del estudio (`…slice(0,10)`) con la fecha local de Honduras. Todo lo terminado después de las 18:00 caía en el «día siguiente» y no salía en «Terminados hoy». La prueba de un estudio informado a las 19:00 falla con el código anterior y pasa con el nuevo.

Además:
- El estudio se queda en el área donde estaba el paciente.
- Un estudio que no es de rayos X y solo tiene imágenes subidas se queda en «Por informar», que es lo correcto.

## 7. Pruebas

- Archivos nuevos: `ronda16_ui` (4), `ronda16_roles` (11), `ronda16_pq` (10), `ronda16_notas` (13), `ronda16_ingreso` (13).
- Todas las pruebas de rondas anteriores pasan, corriendo cada archivo por separado.
- Única excepción: `api.test` «la demo trae casos completos» («fetch failed»), que **ya fallaba antes de esta ronda** (confirmado en el commit de la ronda 11).
- Typecheck, lint (sin errores) y build: OK.
- Impresos revisados en PDF Carta: valoración, registro de anestesia (1 hoja; 2 si dura más de 120 min), hoja de PQ3 antigua, recuento, cada uno también en blanco.
- Revisado en el navegador a 1366 px: LB8, EX12, MC1, AG1, RE1, ME17, ME16, NO1, NO2, HO2 e IE1.
- A 390 px: LB8, y los formularios nuevos de PQ4 y PQ5.
- No se revisó a 1920 px ni la orden con viñetas en PDF.

## 8. Fuera de la lista

- En la base de pruebas en memoria siguen los usuarios demo viejos, y el login `jmembreno@demo.clinara` responde 401 en esa base. Conviene revisarlo en producción.
- Con el catálogo base, «Sodio (Na)», «Potasio (K)», «Urea nitrogenada (BUN)» y «Procalcitonina» caen en «Otros exámenes». El catálogo de la clínica normalmente los cubre, pero vale revisar los nombres.
- Los sets de órdenes no guardan la velocidad de una infusión (pasa en los cuatro lugares).
- En el primer ingreso de un usuario, el recorrido de bienvenida manda cualquier enlace directo a Inicio.
- En la agenda, los nombres de los médicos no se quedan fijos al bajar (sugerido, no hecho).
- El `package-lock.json` no trae los módulos nativos de Linux de oxlint y rolldown. En esta máquina hubo que instalarlos a mano para correr el lint y el build. Vercel instala sus propias dependencias al construir.
