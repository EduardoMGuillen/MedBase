# Clinara (MedBase): ronda 16 de correcciones

> Adjunto a este prompt dos archivos:
> - **Correcciones ronda 16.docx** (21 capturas), que muestra cómo se ve hoy cada pantalla. Las capturas también están sueltas en `docs/ronda16/capturas/captura-01.png` … `captura-21.png`, en el mismo orden.
> - **Hoja única · Registro anestésico@2x.png** (`docs/ronda16/hoja_unica_registro_anestesico.png`): el formato de partida para la valoración preanestésica y el registro de anestesia (PQ4).

---

## 0. Contexto

Soy Emil, médico general en Honduras, y me encargo de la parte clínica de **Clinara** (también llamada MedBase), una aplicación web de gestión clínica desplegada en https://medbase-lac.vercel.app. Esta es la **ronda 16**.

**Qué es Clinara.** Sistema para clínicas pequeñas y medianas y consultorios de Honduras. Pocos médicos, una recepcionista, enfermería y a veces laboratorio e imágenes. Soluciones simples, pocas pantallas, pocos clics, español de Honduras.

**Qué se hizo antes (lo que toca esta ronda).**
- Ronda 8: infusión con velocidad en mL/h en la nota de hospitalización (**ME1**).
- Ronda 11: «Muestra tomada» de varios exámenes del mismo paciente a la vez (**DP2**).
- Ronda 12: Laboratorio e Imágenes con áreas Ambulatorio / Observación / Hospitalización.
- Ronda 13: orden de exámenes agrupada como el catálogo (**IM3**).
- Ronda 14: «Aplicar en la clínica» sin ingreso a observación (**ME13**), hoja de anestesia ligada a la nota postquirúrgica (**PQ3**), catálogo de material y registro de uso (**RU1–RU3**).
- Ronda 15: registro de uso de material reorganizado (**RU4–RU9**).

**Esta ronda** tiene cuatro partes:
1. **Recepción y administración**: paciente sin cita desde Inicio (RE1), Consulta externa por médico (RE2), registrar material (RU10), barra de la agenda (AG1).
2. **Enfermería**: las licenciadas editan el rol de turnos de enfermería (EN1); ingestas y excretas (IE1).
3. **Médico**: resultados nuevos en Inicio (MC1), formulario de medicamentos único con infusión y vía escribible (ME16, ME17), ingreso arriba de las indicaciones (NO1), nota de ingreso con el formato estándar (NO2), SOAP con diagnósticos CIE-11 (NO3), ingreso directo con nota y órdenes pendientes (HO2), exámenes agrupados en hospitalización (EX12), viñetas en la orden impresa (IM4), valoración preanestésica antes de la cirugía y registro de anestesia de una hoja (PQ4), recuento quirúrgico (PQ5).
4. **Laboratorio e Imágenes**: bandeja del laboratorio agrupada por paciente (LB8) y «Terminados hoy» del radiólogo (RX1).

**Revisa el estado real del código antes de tocar cada cosa.** Al escribir este prompt ya revisé el código. Las referencias `archivo:línea` que doy son orientativas y pueden haberse movido: confírmalas.

**Reglas generales (valen para todo):**
- **Dos modos**: **Clínica** (ej. «Clínica Santa Brígida») y **Consultorio** de médico independiente. Cada punto dice a cuál aplica.
- **Roles**: recepción, enfermería, médico, administración, laboratorio, imágenes (y asistente en el consultorio). Una persona puede tener varios roles.
- **Datos clínicos**: nada se borra de verdad (se archiva, se oculta o se anula), todo queda con autor, fecha y hora, y no se inventa nada. Lo firmado no se edita: se corrige en el periodo de gracia o con adenda, o se anula y se emite otro.
- **Formatos**: fechas `dd/mm/aaaa`, hora de 24 h, Lempiras (L), identidad `0000-0000-00000`, teléfonos `0000-0000`, impresión **tamaño Carta** con la plantilla de IM1 (ronda 13).
- **Firma**: una firma dibujada en pantalla no es la firma electrónica avanzada de la Ley sobre Firmas Electrónicas de Honduras. Todo documento impreso conserva su espacio para **firma y sello en papel**, y siempre existe la opción de imprimir, firmar en papel y subir el escaneo.
- **Conectividad**: el internet y la luz fallan. Lo que se escriba no se pierde (borrador «Se guarda solo»).
- **Valores clínicos** (abreviaturas de vías, cálculo de ingestas, rubros del recuento) en `src/lib/clinicalConfig.ts` con el comentario `VALIDAR: Emil`.
- **Usuarios demo**: los de las capturas existen en la base demo actual (Ricardo Moncada, administración; Gabriel Yanes, recepción y enfermería; Andrea Quiroz, recepción; Lic. Marta Urbina, enfermería; Aux. Rosa Vallecillo, enfermería; Dr. Joaquín Membreño, medicina general; Dr. Hugo Nolasco, cirugía general; Dra. Silvia Arita, anestesiología; Lic. Paula Suazo, laboratorio; Dr. Rafael Zepeda, imágenes; Dr. Mauricio Villeda, médico y administración). **Los perfiles demo nunca se borran.** Esta ronda **no** pide datos demo nuevos.

**Advertencia sobre las capturas.** El texto dentro de mis capturas (nombres de pacientes, diagnósticos, motivos, medicamentos, dosis, cuántos exámenes pedí) es **relleno** para generar las pantallas. No lo trates como requisito ni como error. Fíjate solo en el diseño, los campos, los botones, las etiquetas y el flujo.

### Mapa de capturas del Word (en orden de aparición)

| N.º | Pantalla | Punto |
|---|---|---|
| 1 | Inicio de administración (Ricardo Moncada) con la ventana «Paciente ambulatorio» abierta | RE1 |
| 2 | Consulta externa como administración: «Paciente sin cita» y «Paciente ambulatorio»; vista «Por hora» | RE1, RE2 |
| 3 | Consulta externa «Por médico», grupos contraídos | RE2 |
| 4 | Registro de uso › Material como administración: sin botón «Registrar material» | RU10 |
| 5 | Agenda, día, todos los médicos (recepción): la barra horizontal solo está abajo | AG1 |
| 6 | Configuración de Lic. Marta Urbina (enfermería): no hay «Rol de turnos» en el menú | EN1 |
| 7 | Inicio del médico, tarjeta «Resultados nuevos»: el texto en una columna angosta y la píldora «Resultado nuevo» estirada | MC1 |
| 8 | Nota de consulta externa: «Indicaciones y plan», «Exámenes», «Medicamentos» | IE1 |
| 9 | Formulario de medicamento en consulta externa: sin «Infusión»; «Vía» es una lista cerrada | ME16, ME17 |
| 10 | Formulario de medicamento en la nota de hospitalización: con «Infusión» y «Velocidad de infusión» | ME16 |
| 11 | Consulta externa: «Ingreso a observación» / «Ingreso a hospitalización» al final, debajo de «Seguimiento»; «Aplicar en la clínica» visible con el ingreso marcado | NO1 |
| 12 | Orden de laboratorio impresa: numeración que vuelve a empezar en 1 en cada grupo | IM4 |
| 13 | Hospitalización › Exámenes: un renglón suelto por examen, sin agrupar | EX12 |
| 14 | Ventana «Ingreso a hospitalización» desde Hospitalizados | HO2 |
| 15 | Autorización de hospitalización tras el ingreso directo | HO2 |
| 16 | Notas de evolución vacías: el paciente quedó ingresado sin nota de ingreso | HO2 |
| 17 | «Nota de ingreso» desde el expediente: solo formato SOAP | NO2 |
| 18 | La misma nota: «A. Análisis — Impresión diagnóstica y evolución», sin buscador CIE-11 | NO3 |
| 19 | Hoja de anestesia (Dra. Silvia Arita), sección «Valoración preanestésica» | PQ4 |
| 20 | Laboratorio (Lic. Paula Suazo), área Hospitalización: una tarjeta por examen del mismo paciente | LB8 |
| 21 | Imágenes (Dr. Rafael Zepeda), área Observación: «Terminados hoy 0» | RX1 |

El último párrafo del Word (recuento quirúrgico, PQ5) no trae captura.

---

## 1. Cómo quiero que trabajes

1. **Explora primero** el código de lo que toca esta ronda. No supongas: léelo.
2. **Escribe `PLAN_RONDA16.md`** antes de programar. Por cada punto pon los archivos, los cambios de base de datos, los componentes que reutilizas o creas y las dependencias. Incluye la **tabla de paridad** que pide NO2 (consulta externa / observación / hospitalización). Pídeme confirmación **solo** si algo está bloqueado de verdad; para lo demás usa los valores por defecto de la sección 6.
3. **Un commit por punto**, con el código en el mensaje: `[ronda16][HO2] Ingreso directo con nota de ingreso`.
4. **Migraciones seguras**: sube `SCHEMA_VERSION` (hoy `84`, en `server/db.ts`). Las migraciones son idempotentes, no borran columnas ni registros, sirven en todas las clínicas y consultorios, incluidos los nuevos, y se prueban sobre **una copia de la base**. Las tablas nuevas se agregan a la lista TRUNCATE de `server/api.test.ts` y a `PATIENT_TABLES` de `server/demoData.ts`.
5. **Reutiliza componentes**: `DiagnosisPicker`, `DrugSearch`, `orderGroups` (`src/lib/exams.ts`), `ScanUpload`, `useDraftSync`, `ConsentFlow`, la plantilla de impresión de IM1, `AnesthesiaForm` y `AnesthesiaDoc`, la bitácora. **No copies y pegues** formularios: un solo formulario de medicamentos (ME16) y un solo editor de nota (NO2).
6. **Permisos por rol y auditoría** (quién, qué, cuándo) en toda acción nueva, aplicados **en el servidor**, no solo ocultando botones. Verifícalos también por URL directa.
7. **Verifica cada punto en el navegador** con el rol correcto, en escritorio (1920 y 1366 px) y a ~390 px. Lo impreso se verifica imprimiendo a PDF en tamaño Carta. Corre typecheck, lint, pruebas y `build`.
8. Usa los textos exactos que pongo entre comillas. Si hablo de una etiqueta que ya existe, usa la que tiene hoy el código.

---

## 2. Lo que NO se debe romper

- **ME13 / ME14 / ME15**: sin ingreso, «Aplicar en la clínica» solo permite dosis STAT y no mete al paciente a observación; la receta lleva todos los medicamentos; la pantalla final de la consulta queda igual.
- **El registro de uso de material** de las rondas 14 y 15: me gustó cómo quedó. RU10 solo agrega quién puede registrar.
- **La vista «Por médico»** de Consulta externa (captura 3): me gusta así, contraída y con el conteo por médico.
- **La agenda con todos los médicos desplegados** (captura 5): está bien; AG1 solo agrega la barra arriba.
- **El orden de los medicamentos** en las notas y la receta: está bien.
- **La infusión de la nota de hospitalización** (captura 10, ME1 de la ronda 8): velocidad, unidad, hora de inicio, «Ahora», suspender infusión y «Cambiar» velocidad.
- **El ingreso que vincula la consulta de las últimas 48 h** y jala sus órdenes sin duplicarlas (captura 14).
- **La autorización de hospitalización** con «Firmar ahora», «Imprimir para firmar en papel» y «Firmar después» (captura 15).
- **La hoja de anestesia de PQ3**: subir la foto en papel, reemplazarla con motivo, el pendiente del anestesiólogo en Inicio, la corrección en el periodo de gracia o con adenda. PQ4 la divide en dos, no la tira.
- **DP2**: «Muestra tomada» de varios exámenes del mismo paciente a la vez.
- **Lo que ya funciona de la nota de consulta externa**: set de órdenes, «Guardar estas órdenes como set», frecuencia de signos vitales, dictado por voz y borrador.

---

## 3. Correcciones, una por una

### Recepción y administración

#### RE1. «Paciente sin cita» también desde Inicio, y «Paciente ambulatorio» más claro (capturas 1 y 2) · Clínica

**Cómo está hoy.** En el Inicio de administración solo están «Paciente ambulatorio» y «Ver reportes» (`src/app/Dashboard.tsx`, `AmbulatoryButton`). «Paciente ambulatorio» (`AmbulatoryModal`, `src/app/Ambulatory.tsx`) solo manda al paciente a la bandeja de Laboratorio o de Imagen y gabinete. Al verlo pensé que servía para la consulta, pero no. «Paciente sin cita», que sí mete al paciente a la consulta externa, solo existe dentro de Consulta externa (`src/app/WaitingRoom.tsx`). Administración ya tiene el permiso `checkin.manage` en el servidor.

**Por qué.** En las clínicas pequeñas, administración cubre a recepción. Desde su Inicio debe poder meter a un paciente nuevo a la consulta externa, igual que al laboratorio y a imágenes.

**Qué quiero.**
1. En el Inicio de **administración** y de **recepción**, junto a «Paciente ambulatorio», el botón «Paciente sin cita». Abre **la misma** ventana que el de Consulta externa (reutilízala, no la copies). Al terminar, el paciente queda en Consulta externa › «En sala».
2. Que «Paciente ambulatorio» deje claro que es para estudios sin consulta:
   - El botón dice «Paciente ambulatorio» con una línea debajo o un *tooltip*: «Solo laboratorio o imágenes, sin consulta».
   - La ventana se titula «Paciente ambulatorio · laboratorio o imágenes».
   - Debajo del título va una línea: «Para el paciente que viene solo a hacerse exámenes o estudios. Si viene a consulta, usa «Paciente sin cita».», con «Paciente sin cita» como enlace que cierra esta ventana y abre la otra.
3. En la ventana de la captura 1, el selector «Laboratorio | Imagen y gabinete» no muestra cuál está elegido, y «Elegir estudios» y «Tomar foto o elegir archivo» se ven deshabilitados (texto muy claro). Que el selector marque la opción elegida (o que no haya ninguna elegida, con «Elegir estudios» deshabilitado de forma evidente y un texto «Elige primero Laboratorio o Imagen y gabinete»). Que «Tomar foto o elegir archivo» tenga el contraste normal de un botón activo.

**Criterios de aceptación.**
- [ ] Como Ricardo Moncada (administración), en Inicio veo «Paciente sin cita». Registro a un paciente nuevo y aparece en Consulta externa › «En sala».
- [ ] Lo mismo como Andrea Quiroz (recepción).
- [ ] «Paciente ambulatorio» muestra la aclaración, y el enlace «Paciente sin cita» cambia de ventana sin perder el paciente ya elegido.
- [ ] El selector de la ventana muestra cuál está elegido, y los botones activos tienen contraste normal.
- [ ] En el consultorio no cambia nada de lo que hay hoy.

#### RE2. Consulta externa: «Por médico» y contraído por defecto para administración y recepción; los médicos, por orden de llegada (capturas 2 y 3) · Clínica

**Cómo está hoy.** El selector «Por hora | Por médico» solo aparece para administración (`QUEUE_GROUP_ROLES = ['admin']`, `src/lib/clinicalConfig.ts`). La vista se guarda por usuario en `prefs.queueView` y empieza en «Por hora». Los grupos empiezan todos abiertos.

**Por qué.** Contraído por médico es más cómodo y se lee mejor para quien organiza la sala. El médico necesita ver a quién le toca, por orden de llegada.

**Qué quiero.**
1. **Administración y recepción**: el selector aparece para los dos (agrega `reception` a `QUEUE_GROUP_ROLES`). Por defecto, «Por médico» con **todos los grupos contraídos**. «Expandir todo» y «Contraer todo» siguen funcionando. Si el usuario cambia a «Por hora», se le recuerda (como hoy).
2. **Médicos**: su lista sale **por orden de llegada** (la hora en que se marcó «Llegó» o se registró sin cita), el primero en llegar arriba, sin agrupar. Confirma cómo la ordena hoy el código. Si ya es por llegada, no la toques y dilo en el reporte.
3. Para que administración y recepción vean el nuevo valor por defecto, la migración borra **una sola vez** el `queueView` guardado de los usuarios con esos roles.

**Criterios de aceptación.**
- [ ] Como Ricardo Moncada y como Andrea Quiroz, Consulta externa abre en «Por médico» con los grupos contraídos.
- [ ] Si cambio a «Por hora», salgo y vuelvo, sigue en «Por hora».
- [ ] Como Dr. Joaquín Membreño, mis pacientes salen por orden de llegada, sin selector.

#### RU10. Administración y recepción también registran material (captura 4) · Clínica

**Cómo está hoy.** «Registrar material» (`src/app/Usage.tsx`) pide `usage.record`, que en la clínica solo tienen enfermería y asistente. Administración y recepción ven el registro, pero no pueden agregar.

**Qué quiero.** Dar `usage.record` a **administración** y **recepción** en la clínica (`src/lib/permissions.ts` y las rutas de `server/routes/usage.ts`). Ven el mismo botón «Registrar material» y el mismo formulario de la ronda 15. Lo que registran queda con su nombre, como lo de enfermería. Anular sigue con su permiso actual (`usage.void`).

**Criterios de aceptación.**
- [ ] Como Ricardo Moncada y como Andrea Quiroz veo «Registrar material», registro material de un paciente y aparece en «Por paciente» con mi nombre.
- [ ] El `POST /api/usage/material` responde 200 con esos roles. Para laboratorio sigue en 403.

#### AG1. Agenda: barra de desplazamiento horizontal también arriba (captura 5) · Clínica y Consultorio

**Cómo está hoy.** La vista Día con todos los médicos (`DayGrid`, `src/app/Agenda.tsx`) se desplaza a lo ancho con `.cal { overflow-x: auto }` (`src/index.css`). La barra solo aparece al final de la cuadrícula, abajo de todo el día.

**Qué quiero.** Una barra horizontal **arriba**, justo encima de los nombres de los médicos, sincronizada con la de abajo: mover una mueve la otra. Que solo aparezca cuando los médicos no caben a lo ancho. Aplica también a la vista Semana si es más ancha que la pantalla.

**Criterios de aceptación.**
- [ ] Con 7 médicos a 1366 px, la barra está arriba, y al moverla los nombres y las columnas se desplazan juntos.
- [ ] Mover con la barra de abajo, con la rueda o con el *trackpad* deja la de arriba en la misma posición.
- [ ] Cuando caben todos los médicos, no aparece la barra de arriba.
- [ ] A ~390 px se puede desplazar con el dedo como hoy.

### Enfermería

#### EN1. Las licenciadas en enfermería editan el rol de turnos de enfermería (captura 6) · Clínica

**Cómo está hoy.** El rol de turnos (`server/routes/roster.ts`, `src/app/Roster.tsx`) solo lo edita administración (`settings.manage`) o el jefe de su departamento con `dept.config`, y eso solo para Laboratorio e Imágenes. Enfermería no ve ni edita el rol de enfermería: Lic. Marta Urbina no tiene «Rol de turnos» en el menú. Además, el sistema no distingue a una licenciada de una auxiliar. Solo cambia el prefijo del nombre («Lic.», «Aux.»). Para Laboratorio e Imágenes sí existe el puesto con `lead` (`DEPT_POSITIONS`).

**Por qué.** Las licenciadas son las jefas de las auxiliares y son quienes arman el rol de turno de enfermería.

**Qué quiero.**
1. **Puesto en enfermería**, igual que `DEPT_POSITIONS`: «Licenciado(a) en enfermería» (`lead: true`, prefijo «Lic.») y «Auxiliar de enfermería» (`lead: false`, prefijo «Aux.»). Se elige en Personal y roles al crear o editar a alguien con rol de enfermería.
2. **Migración**: al personal de enfermería cuyo nombre empieza con «Lic.» se le pone licenciada; con «Aux.», auxiliar; sin prefijo, auxiliar. Administración lo puede cambiar después.
3. **Permisos del rol de enfermería**:
   - Todo el personal de enfermería **ve** el rol de enfermería: entrada «Rol de turnos» en su menú, bajo «Registros».
   - Las **licenciadas lo editan**, desde hoy en adelante, como el jefe de Laboratorio con el suyo.
   - Administración lo edita cualquier día, como hoy.
   - Las auxiliares solo lo ven.
   - Nadie de enfermería edita los roles de Laboratorio ni de Imágenes.
4. Cada cambio queda en la bitácora con quién y cuándo.

**Criterios de aceptación.**
- [ ] Como Lic. Marta Urbina veo «Rol de turnos», asigno a Aux. Rosa Vallecillo al turno de noche de mañana y se guarda.
- [ ] Como Aux. Rosa Vallecillo veo el rol de enfermería sin botones de editar, y el `PUT` por URL directa responde 403.
- [ ] Lic. Marta Urbina no puede cambiar un día pasado (403).
- [ ] En Personal y roles, el puesto aparece al editar a una enfermera, y la migración lo dejó bien puesto en las demo.

#### IE1. Ingestas y excretas (captura 8) · Clínica y Consultorio, donde haya observación u hospitalización

**Cómo está hoy.** No existe. Hoy hay que escribir «Cuantificar ingestas y excretas» como una indicación de texto, y nadie lo puede registrar ni sumar. Lo único parecido es el balance de líquidos de la hoja de anestesia (`fluidBalance`, `src/lib/anesthesia.ts`).

**Por qué.** Al paciente con diarrea que voy a ingresar (y a muchos otros: deshidratación, renales, cardiópatas, posquirúrgicos) le tengo que calcular las ingestas y las excretas.

**Qué quiero.**
1. **Botón «Ingestas y excretas»** en el editor de órdenes, debajo de «Indicaciones» y antes de «Exámenes», en la nota de consulta externa con ingreso, en la nota de ingreso y en las notas de evolución de observación y hospitalización. Al marcarlo:
   - se agrega la indicación «Cuantificar ingestas y excretas» con su frecuencia de corte: «Por turno» (por defecto, los turnos de `VITALS_SHIFT_TIMES`), «Cada 12 horas» o «Cada 24 horas»;
   - se activa el registro para ese paciente durante esa estancia.

   Una nota de evolución lo puede suspender, igual que se suspende una indicación.
2. **Registro en el expediente**, en la pestaña «Signos vitales», **debajo** de los signos vitales y la curva térmica: una tabla «Ingestas y excretas» por turno y por día.
   - **Ingresos**:
     - «Líquidos IV»: se calcula solo (punto 3).
     - «Vía oral»: lo registra enfermería o el médico.
     - «Otros ingresos» (sonda, sangre y hemoderivados): lo registra enfermería o el médico.
   - **Egresos**, todos manuales, en mL:
     - «Diuresis»
     - «Evacuaciones»
     - «Vómitos»
     - «Drenajes»
     - «Sangrado»
     - «Otros egresos»
   - Totales de ingresos y de egresos y «Balance» (ingresos − egresos) por turno y por 24 horas. Si es negativo, se ve en otro color, y siempre lleva el signo.
3. **Cálculo automático de los líquidos IV**:
   - Las **infusiones** (las que tienen `infusionRate`) suman la velocidad × el tiempo que estuvieron corriendo en ese turno, desde la hora de inicio real hasta que se suspenden o se cambian.
   - Las **dosis IV intermitentes** con volumen en mL en la presentación o la dosis (por ejemplo, «Hartmann 1000 ml cada 8 h») suman ese volumen cuando enfermería marca la dosis como aplicada.

   Cada número calculado muestra de qué medicamentos sale (al tocarlo o en un *tooltip*). Si un medicamento IV no tiene volumen reconocible, no se inventa: se lista aparte como «Sin volumen: agrégalo a mano», y enfermería puede agregar ese ingreso manual.
4. **Registro manual**: botón «Registrar ingreso o egreso» con tipo, cantidad en mL, hora (por defecto, ahora) y nota opcional. Lo pueden usar enfermería y médico. Queda con autor y hora, se corrige en el periodo de gracia y después se anula con motivo (tachado y sin sumar), como en el registro de uso.
5. **Expediente completo e impresión**: la tabla sale en el expediente completo, debajo de los signos vitales.
6. Las listas de rubros y la regla de cuándo se cuenta una dosis IV van en `clinicalConfig.ts` con `VALIDAR: Emil`.

**Criterios de aceptación.**
- [ ] En la nota de ingreso marco «Ingestas y excretas», «Por turno». Al firmar aparece la indicación y la tabla en «Signos vitales».
- [ ] Una infusión de 100 mL/h que empieza a las 08:00 da 700 mL en el turno de 07:00 a 15:00. Si la suspendo a las 12:00, da 400 mL.
- [ ] Una dosis «1000 ml IV cada 8 h» suma 1000 mL al marcarse como aplicada, y no antes.
- [ ] Como Lic. Marta Urbina registro una diuresis de 300 mL a las 10:00. El total de egresos y el balance cambian, y el registro muestra mi nombre.
- [ ] Anular un registro lo tacha y deja de sumar.
- [ ] La tabla sale en el expediente completo impreso.
- [ ] Sin la orden, la tabla no aparece (o aparece contraída con «Sin orden de ingestas y excretas»).

### Médico

#### MC1. «Resultados nuevos» del Inicio del médico se ve roto (captura 7) · Clínica y Consultorio

**Cómo está hoy.** En `NewResults` (`src/app/ExamPanels.tsx`), cada fila es `.row`, una cuadrícula de 3 columnas (`64px 1fr auto`, `src/index.css`) pensada para una hora a la izquierda. Esta fila solo tiene dos hijos. Por eso el texto cae en la columna de 64 px y se parte palabra por palabra, y la píldora «Resultado nuevo» se estira a todo lo ancho.

**Qué quiero.** Ordenado y legible:
- **Izquierda**:
  - «Electrolitos · Nelson Omar Bonilla Cáceres» en una línea (examen en negrita y paciente);
  - debajo, «Laboratorio · resultado 5 nov, 09:45 por Lic. Urbina»;
  - debajo, los valores fuera de rango como chips («Sodio bajo», «Potasio bajo»).
- **Derecha**: la píldora «Resultado nuevo» de su tamaño normal, centrada en la altura.

Revisa las otras filas que usan `.row` sin columna de hora (`ExamTray`, `.tray-row`; `AnesthesiaPending`, `.anes-row`) y corrige las que tengan el mismo error.

**Criterios de aceptación.**
- [ ] Como Dr. Joaquín Membreño, cada resultado nuevo ocupa 2 o 3 líneas a lo ancho, con la píldora a la derecha y de su tamaño.
- [ ] A ~390 px se lee bien: la píldora baja debajo del texto si no cabe.
- [ ] Las demás filas afectadas quedan corregidas y se listan en el reporte.

#### ME16. Un solo formulario de medicamentos, con infusión, en consulta externa, observación y hospitalización (capturas 9 y 10) · Clínica y Consultorio

**Cómo está hoy.** Hay **dos** formularios distintos:
- `MedicationForm` (`src/components/Medications.tsx`), en consulta externa y recetas: tiene presentación, cantidad y «Aplicar en la clínica», pero **no tiene «Infusión»**.
- `MedForm`, función local de `src/app/InpatientFile.tsx`, en las notas de observación y hospitalización: tiene «Infusión» con velocidad, unidad y hora de inicio, pero no tiene presentación visible ni cantidad.

Además, al pasar las órdenes de la consulta con ingreso a la estancia (`server/medOrders.ts`), nunca se crea una infusión. En correcciones anteriores ya hubo diferencias de este tipo entre las órdenes de la consulta externa y las de hospitalización.

**Por qué.** No encuentro la infusión para poner mL/h en un IV desde la consulta externa. En el expediente sí sale. Técnicamente es lo mismo: deben tener las mismas funciones.

**Qué quiero.**
1. **Un solo componente** de formulario de medicamento, usado por la consulta externa, las notas de observación y hospitalización y la receta. Las diferencias por contexto son solo de qué se muestra:

   | Campo | Consulta sin ingreso | Consulta con ingreso, observación, hospitalización | Receta suelta |
   |---|---|---|---|
   | Medicamento (vademécum o escrito) | sí | sí | sí |
   | Presentación y concentración | sí | sí | sí |
   | Dosis, Vía (ME17) | sí | sí | sí |
   | Frecuencia | sí, sin «Infusión» | sí, **con «Infusión»** | sí, sin «Infusión» |
   | Velocidad de infusión + unidad + «Hora de inicio» / «Ahora» | no | sí, si es infusión | no |
   | Primera dosis diferente (STAT) / hora de la dosis | como hoy | como hoy en la nota de hospitalización | no |
   | Total de días, Cantidad total | sí | sí (días opcional: «hasta nueva orden») | sí |
   | Indicaciones especiales | sí | sí | sí |
   | «Aplicar en la clínica» | sí (ME13: solo STAT) | **no** (NO1) | no |
   | «No hay en la clínica (va a receta)» | como hoy | sí | no |

   Que la infusión no salga sin ingreso es coherente con ME13: sin ingreso solo se aplican dosis STAT.
2. **De la consulta con ingreso a la estancia**: una infusión ordenada en la consulta llega a la hoja de medicamentos como infusión, con su velocidad, unidad y hora de inicio. Hay que cambiar `server/medOrders.ts` y el modelo de `PrescriptionItem` si hace falta.
3. En la receta impresa, una infusión se escribe legible: «Solución salina 0.9 % 1000 mL IV en infusión a 125 mL/h».
4. **Paridad**: haz la tabla de paridad de NO2 también para los medicamentos y cierra toda diferencia que no esté justificada en la tabla de arriba.

**Criterios de aceptación.**
- [ ] En consulta externa, con «Ingreso a hospitalización» marcado, la frecuencia ofrece «Infusión». Pongo 125 mL/h, firmo, y en la estancia la hoja muestra la infusión con su velocidad.
- [ ] Sin ingreso, «Infusión» no aparece.
- [ ] La nota de evolución de hospitalización sigue haciendo todo lo de la captura 10, y ahora también tiene «Presentación y concentración» y «Cantidad total».
- [ ] No queda `MedForm` local en `InpatientFile.tsx`: todo usa el componente único.
- [ ] Las pruebas de ME1, ME13, ME14 y ME15 siguen pasando.

#### ME17. «Vía»: escribirla o elegirla, con abreviaturas (captura 9) · Clínica y Consultorio

**Cómo está hoy.** «Vía» es un `<select>` con `ROUTES` (`src/lib/format.ts`): Oral, Sublingual, Intramuscular, Intravenosa, Subcutánea, Inhalada, Nebulización, Tópica, Oftálmica, Ótica, Nasal, Rectal, Vaginal. No tiene abreviaturas.

**Qué quiero.** Me gusta que esté la lista, pero quiero poder escribir. Un campo con autocompletado, en el formulario único de ME16:
- Al escribir, filtra la lista por nombre **o** por abreviatura: «iv» → «Intravenosa (IV)», «vo» → «Oral (VO)». Se elige con el ratón, con Enter o con las flechas.
- Cada opción muestra la abreviatura entre paréntesis, con la lista de la sección 6 en `clinicalConfig.ts` y `VALIDAR: Emil`.
- Lo que se guarda es el nombre canónico («Intravenosa»), para que siga funcionando la lógica que depende de la vía (dosis de carga IV, nebulización, ingestas IV de IE1).
- Si escriben una vía que no está en la lista, se acepta como texto libre, con el aviso «No está en la lista».
- La receta y las notas muestran «Intravenosa (IV)».

Reutiliza el patrón de `DrugSearch` o `DiagnosisPicker`. No hagas un tercer buscador desde cero si uno sirve.

**Criterios de aceptación.**
- [ ] Escribo «iv», aparece «Intravenosa (IV)», presiono Enter y queda elegida.
- [ ] Escribo «sc» → «Subcutánea (SC)».
- [ ] Una vía escrita a mano, como «Intraósea», se guarda y sale tal cual en la receta.
- [ ] La dosis de carga sigue apareciendo solo para la vía IV.
- [ ] Funciona en el teléfono.

#### NO1. Consulta externa: «Ingreso» arriba de las indicaciones, como primera orden, y sin «Aplicar en la clínica» (captura 11) · Clínica y Consultorio con observación u hospitalización

**Cómo está hoy.** «Ingreso a observación» e «Ingreso a hospitalización» están al final (`src/app/Consultation.tsx`), después de «Medicamentos» y de «Seguimiento». Con el ingreso marcado, cada medicamento nuevo sigue mostrando «Aplicar en la clínica».

**Por qué.** Lo primero que se ordena al ingresar a un paciente es el ingreso. Y si el paciente queda internado, es obvio que los medicamentos se le aplican ahí.

**Qué quiero.**
1. Mover las dos casillas (con su texto explicativo) **arriba de «Indicaciones y plan»**, dentro de «Plan y manejo». «Referir a otro centro» y «Vigencia de esta receta» se quedan donde están.
2. Al marcar una casilla, la **primera indicación** pasa a ser «Ingreso a hospitalización» u «Ingreso a observación», según la casilla.
   - Va fija en el número 1 y no se mueve con las flechas.
   - Si se desmarca la casilla, desaparece. Si se cambia de una casilla a la otra, cambia el texto.
   - En la nota firmada y en la hoja de hospitalización sale como primera orden.
3. Con cualquiera de las dos marcada, el formulario de medicamentos **no muestra «Aplicar en la clínica»**. Todos los medicamentos pasan a la hoja de medicamentos, como hace hoy el servidor con estancia. El texto del encabezado de «Medicamentos» se ajusta: «Con ingreso, todos pasan a la hoja de medicamentos y a la receta».
4. Si ya había medicamentos agregados con «Aplicar en la clínica» sin marcar y luego se marca el ingreso, el aviso es: «Con el ingreso, todos los medicamentos pasan a la hoja de medicamentos». No hace falta desmarcar nada.

**Criterios de aceptación.**
- [ ] Las casillas de ingreso están arriba de «Indicaciones y plan».
- [ ] Al marcar «Ingreso a hospitalización», la indicación 1 es «Ingreso a hospitalización». Al desmarcar, se va.
- [ ] Con ingreso marcado, agrego un medicamento y no aparece «Aplicar en la clínica». Al firmar, está en la hoja de medicamentos de la estancia.
- [ ] Sin ingreso, todo funciona como en ME13.

#### NO2. Nota de ingreso con el formato estándar, y las mismas funciones en consulta externa, observación y hospitalización (captura 17) · Clínica y Consultorio

**Cómo está hoy.**
- La nota de ingreso que se escribe desde el expediente está forzada a SOAP (`InpatientFile.tsx`, «el formato inicial» y `hasAdmission`).
- El selector «Estándar | SOAP» solo aparece en las notas de evolución.
- La consulta externa usa otro formato: «Motivo de consulta», «Historia de la enfermedad actual», «Examen físico», «Observaciones» e «Impresión diagnóstica · CIE-11».

**Por qué.** Hay varianza entre lugares que técnicamente hacen lo mismo. La nota de ingreso es, en la práctica, una historia clínica como la de la consulta externa.

**Qué quiero.**
1. **Nota de ingreso desde el expediente** (de hospitalización y de observación): por defecto con el **formato estándar de la consulta externa**:
   - Motivo de consulta
   - Historia de la enfermedad actual
   - Signos vitales (opcional, como hoy)
   - Examen físico
   - Observaciones
   - Impresión diagnóstica (CIE-11), con `DiagnosisPicker` y precargada con los diagnósticos del ingreso
   - Plan: indicaciones, ingestas y excretas (IE1), exámenes y medicamentos (ME16)

   El médico puede cambiar a «SOAP» con el mismo selector que las notas de evolución. Su preferencia de formato (`prefs.noteFormat`) **no** cambia el valor por defecto de la nota de ingreso, que siempre es el estándar.
2. **Tabla de paridad** en `PLAN_RONDA16.md`: fila por función, columna por lugar (consulta externa, nota de ingreso, evolución de observación, evolución de hospitalización).
   - Funciones: formatos de nota, signos vitales, CIE-11, set de órdenes, «Guardar como set», frecuencia de signos vitales, indicaciones, ingestas y excretas, exámenes, medicamentos (ME16), dictado y borrador.
   - Cada diferencia se corrige o se justifica en la tabla.
   - La tabla final va en el reporte.

**Criterios de aceptación.**
- [ ] Como Dr. Hugo Nolasco, «Escribir nota de ingreso» abre el formato estándar, con los diagnósticos del ingreso ya puestos.
- [ ] Puedo cambiar a SOAP y volver sin perder lo escrito.
- [ ] La nota firmada se ve en el expediente y en el expediente completo con sus secciones.
- [ ] La tabla de paridad está en el plan y en el reporte, sin diferencias sin justificar.

#### NO3. SOAP: la «A» es «Análisis» y se agregan los diagnósticos CIE-11 (captura 18) · Clínica y Consultorio

**Cómo está hoy.** En SOAP, «A. Análisis» dice «Impresión diagnóstica y evolución», y la nota de ingreso en SOAP no tiene buscador CIE-11: guarda `diagnoses: []`. En las evoluciones SOAP el buscador sí aparece.

**Por qué.** En SOAP la A es el análisis: la evolución, cómo va el paciente. No es el diagnóstico. El diagnóstico va aparte, codificado.

**Qué quiero.**
- «A. Análisis» con la ayuda «Evolución y razonamiento clínico: cómo va el paciente y por qué».
- Un campo aparte, «Diagnósticos (CIE-11)», con `DiagnosisPicker`, en **todas** las notas SOAP (ingreso y evolución, de observación y de hospitalización). Va debajo de A y antes de P.
- Los diagnósticos se guardan con la nota y salen en la nota impresa y en el expediente completo.
- La «A» ya no se precarga con el texto de los diagnósticos del ingreso. Ahora se precargan en el campo CIE-11.

**Criterios de aceptación.**
- [ ] En una nota de ingreso SOAP, el campo «Diagnósticos (CIE-11)» está debajo de A, busca y guarda.
- [ ] La nota firmada muestra los diagnósticos con su código.
- [ ] La ayuda de A ya no dice «Impresión diagnóstica».

#### HO2. Ingreso directo: siempre con nota de ingreso; recepción y administración pueden ingresar con el médico tratante y una alerta de órdenes pendientes (capturas 14, 15 y 16) · Clínica

**Cómo está hoy.**
- «Ingresar paciente» e «Ingresar aquí» (`src/app/Inpatients.tsx`, `AdmitModal`; `POST /api/inpatient`) solo los usa el médico (`inpatient.orders`).
- Después del ingreso se abre la autorización. El paciente queda ingresado **sin nota de ingreso y sin órdenes**, y nada lo avisa.
- La estancia no tiene médico tratante: solo `admitted_by`.

**Por qué.** Puedo ingresar a un paciente, pero no sin órdenes. Si recepción o administración ingresan a una paciente que ya estaba programada (por ejemplo, una cirugía), está bien que puedan, pero el médico la tiene que completar con sus órdenes y le tiene que llegar el aviso.

**Qué quiero.**
1. **Médico tratante** en la estancia (columna nueva). Uno o varios médicos; el primero es el principal.
   - En `AdmitModal`, el campo «Médico tratante» va antes de «Motivo del ingreso».
   - Si ingresa un médico, por defecto es él mismo.
   - Sale en la hoja de hospitalización, en la tarjeta de la cama y en la epicrisis.
2. **Si ingresa un médico** (directo, sin consulta de las últimas 48 h): al terminar el ingreso y la autorización (que sigue como hoy), se abre **solo** el editor de «Nota de ingreso» (NO2), con las mismas funciones que la nota de consulta externa: indicaciones, exámenes y medicamentos. Si la cierra sin firmar, el borrador se queda y aplica el punto 4.
3. **Si ingresa recepción o administración** (permiso nuevo `inpatient.admit`; el médico también lo tiene):
   - Mismo modal, pero «Médico tratante» es **obligatorio** y los diagnósticos CIE-11 son **opcionales**, con el texto «El diagnóstico lo pone el médico en la nota de ingreso».
   - En la autorización, recepción ve «Imprimir para firmar en papel» y «Firmar después». «Firmar ahora» solo aparece si su rol puede firmar consentimientos hoy (no cambies ese permiso).
4. **Alerta «Ingreso con órdenes pendientes»** mientras la estancia no tenga nota de ingreso firmada:
   - a cada médico tratante, en su Inicio (como el pendiente de anestesia) y en su campana o alertas (`src/lib/alerts.ts`);
   - a enfermería, en la tarjeta de la cama: «Sin órdenes de ingreso»;
   - en el expediente, una franja arriba: «Ingreso sin nota de ingreso: el médico tratante debe escribir las órdenes», con el botón «Escribir nota de ingreso» si soy médico.

   La alerta desaparece sola al firmarse la nota de ingreso.
5. Se mantiene: si hay una consulta con ingreso de las últimas 48 h, el ingreso se vincula y no pide nota nueva, como hoy.
6. Bitácora: quién ingresó, el médico tratante y cuándo se firmó la nota de ingreso.

**Criterios de aceptación.**
- [ ] Como Dr. Hugo Nolasco ingreso directo a una paciente. Tras la autorización se abre la nota de ingreso en formato estándar.
- [ ] Si la cierro sin firmar, veo la franja y el pendiente en mi Inicio.
- [ ] Como Andrea Quiroz (recepción) ingreso a una paciente con médico tratante Dr. Hugo Nolasco y sin diagnóstico.
- [ ] Él ve «Ingreso con órdenes pendientes» en su Inicio y en sus alertas. Lic. Marta Urbina ve «Sin órdenes de ingreso» en la cama.
- [ ] Al firmar el Dr. Nolasco la nota de ingreso, la alerta y la franja desaparecen.
- [ ] Recepción no puede escribir notas ni órdenes (403 por URL directa).
- [ ] Laboratorio no puede ingresar (403).

#### EX12. Hospitalización › Exámenes agrupados y legibles (captura 13) · Clínica y Consultorio

**Cómo está hoy.** `ExamList` (`src/app/ExamsTab.tsx`) muestra un renglón grande por examen, ordenado por fecha y separado solo por día. Cada renglón lleva sus tres botones. Con 10 exámenes es un relajo y cuesta leer.

**Qué quiero.**
- Dentro de cada día, agrupar por la categoría del catálogo con `orderGroups` (Hematología, Química en sangre, Inmunología, Microbiología, Heces, Imagen…), en el mismo orden que la orden impresa (IM3).
- Cada grupo tiene un encabezado con el nombre y el conteo, se puede contraer y lleva **un** «Muestra tomada» para todo el grupo (reutiliza la lógica de DP2).
- Dentro del grupo, cada examen va en **un renglón compacto**: nombre, estado, quién lo pidió y cuándo (en gris), y a la derecha «Cargar resultado» y el menú «⋯» con «Muestra tomada» (individual) y «Cancelar».
- Lo que tiene resultado muestra el resultado o el valor fuera de rango en el mismo renglón.
- Aplica igual en observación.

**Criterios de aceptación.**
- [ ] Con 10 exámenes de 5 categorías veo 5 grupos con su conteo, sin tener que desplazarme renglón por renglón.
- [ ] «Muestra tomada» del grupo marca todos los exámenes del grupo.
- [ ] Cada acción individual sigue funcionando, y los permisos no cambian.
- [ ] A ~390 px los botones no se salen.

#### IM4. Orden de exámenes impresa con viñetas en vez de números (captura 12) · Clínica y Consultorio

**Cómo está hoy.** En la orden impresa (`ExamOrderSheet`, `src/app/ExamOrder.tsx`), cada grupo es un `<ol>`, así que la numeración vuelve a empezar en 1 en cada grupo y se repite el 1 muchas veces.

**Qué quiero.** Viñetas (•) en lugar de números en la orden de exámenes impresa y en su versión de texto para compartir. Los grupos (IM3) quedan igual. La receta **no** cambia: sus medicamentos siguen numerados (ver sección 6).

**Criterios de aceptación.**
- [ ] La orden de laboratorio impresa muestra viñetas en cada grupo y ningún número repetido.
- [ ] La orden de imágenes, igual.
- [ ] La receta sigue con 1., 2., 3.

#### PQ4. Valoración preanestésica antes de la cirugía y registro de anestesia después, en formato de una hoja (captura 19 y el PNG) · Clínica

**Cómo está hoy (PQ3, ronda 14).**
- Hay una sola «hoja de anestesia» por nota postquirúrgica: `anesthesia_sheets.note_id NOT NULL`, índice único por nota, rutas con `:noteId`, y `noteOf` exige una nota `postop`.
- Trae la valoración preanestésica dentro, pero solo se puede llenar cuando ya existe la nota postquirúrgica. Así no se puede adelantar la valoración.
- Solo la llena el anestesiólogo que figura en el equipo de la nota postquirúrgica.
- Se imprime en 2 hojas Carta.

**Por qué.** La valoración preanestésica se hace **antes** de la cirugía. Si la paciente ya está ingresada, el anestesiólogo la evalúa y deja su nota. Después del procedimiento llena el registro de anestesia como tal.

**Qué quiero.** Dividir en **dos documentos**, tomando el PNG como punto de partida del formato:

1. **«Valoración preanestésica»** (documento nuevo, ligado a la **estancia**, no a la nota postquirúrgica):
   - Se escribe desde el expediente de un paciente ingresado (observación u hospitalización), con un botón «Valoración preanestésica» junto a «Procedimiento» y «Autorización quirúrgica» en Notas de evolución. También desde la tarjeta de la autorización quirúrgica.
   - La puede escribir y firmar **cualquier médico**. Queda firmada como anestesiólogo quien la firma. Puede haber más de una por estancia (por ejemplo, si se reprograma la cirugía); la vigente es la última firmada.
   - Contenido (sección «Valoración preanestésica» del PNG, completa):
     - datos del paciente, peso y talla;
     - cirugía propuesta y diagnóstico preoperatorio (prellenados desde la autorización quirúrgica, si la hay);
     - «Programada» o «Urgencia»;
     - ASA I a V con E;
     - Mallampati I a IV;
     - VAD sí o no;
     - alergias;
     - ayuno de sólidos y de líquidos (h);
     - antecedentes y medicación;
     - Hb, Hto, plaquetas, TP/INR, glucosa, tipo y Rh, prellenados con el último resultado del paciente si existe, y editables;
     - «Técnica propuesta» (las mismas opciones de técnica del PNG);
     - «Plan y recomendaciones» (texto);
     - firma y sello del anestesiólogo.
   - Impresión: **una hoja Carta**, con la plantilla de IM1 (encabezado de la clínica y cuadrícula del paciente) y el diseño de secciones del PNG.
   - Se puede llenar en el sistema o imprimir en blanco y subir la foto firmada, igual que PQ3.
   - Borrador «Se guarda solo», corrección en el periodo de gracia o con adenda.
2. **«Registro de anestesia»** (la hoja de PQ3, después del procedimiento, ligada a la nota postquirúrgica como hoy):
   - Trae la **valoración preanestésica vigente** de la estancia como resumen de solo lectura (ASA, Mallampati, VAD, ayuno, laboratorios), con el enlace «Ver valoración». Si no hay valoración, esa sección se llena ahí mismo, como hoy.
   - Lo demás, como en el PNG: verificación OMS y técnica, tiempos, monitoreo transanestésico cada 5 minutos, fármacos por categoría, vía aérea y ventilación, regional, monitoreo y accesos, balance de líquidos, operación practicada e incidentes, condición al egreso con Aldrete, y firmas (anestesiólogo, instrumentista, circulante).
   - Impresión: **una hoja Carta** («Hoja única»), con la cuadrícula de 0′ a 120′ del PNG. Si la anestesia dura más de 120 minutos, se agrega una hoja de continuación solo con la cuadrícula y las filas de monitoreo. La hoja en blanco para llenar a mano también sale de una hoja.
   - Deja `ANESTHESIA_GRID` en `clinicalConfig.ts` acorde: 120 minutos por hoja.
3. **Modelo y migración**:
   - Tabla nueva para la valoración (o `anesthesia_sheets` con `kind` y `note_id` opcional para la valoración; tú decides y lo justificas en el plan).
   - Las hojas de PQ3 existentes siguen visibles e imprimibles. Su sección de valoración queda dentro de ellas, sin migrar a documento aparte.
   - Pendientes en Inicio: «Valoración preanestésica» para el anestesiólogo cuando hay una autorización quirúrgica firmada sin valoración (opcional, ver sección 6); «Registro de anestesia», como hoy.
4. El pie del PNG cita sus bases (ASA Statement on Documentation of Anesthesia Care, Estándares Internacionales OMS-WFSA 2018, Lista OMS de Verificación de la Seguridad de la Cirugía). Ponlo igual en los dos impresos.

**Criterios de aceptación.**
- [ ] Como Dra. Silvia Arita, con una paciente ingresada y **sin** nota postquirúrgica, escribo y firmo la valoración preanestésica.
- [ ] La valoración se imprime en una hoja Carta.
- [ ] Después el Dr. Hugo Nolasco firma la nota postquirúrgica con la Dra. Arita de anestesióloga. Ella abre el registro de anestesia y ve el resumen de su valoración.
- [ ] Lleno el registro y lo firmo. Se imprime en una hoja Carta, y en dos si duró más de 120 minutos.
- [ ] La hoja en blanco de cada documento sale de una hoja.
- [ ] Una hoja de PQ3 creada antes de esta ronda se sigue viendo e imprimiendo.
- [ ] Subir en papel sigue funcionando en los dos documentos.

#### PQ5. Recuento quirúrgico: checklist del material, en Anexos y en la nota postquirúrgica (sin captura) · Clínica

**Cómo está hoy.** No existe ningún recuento de gasas, compresas, agujas ni instrumental. Lo único de la Lista OMS son las casillas «Entrada / Pausa / Salida» dentro de la hoja de anestesia.

**Por qué.** El recuento evita dejar material dentro del paciente. Es parte de la fase «Salida» de la Lista OMS de Verificación de la Seguridad de la Cirugía: la enfermera confirma en voz alta que los recuentos de instrumental, gasas y agujas están completos. AORN pide documentar los recuentos en el registro intraoperatorio.

**Qué quiero.** Un documento «Recuento quirúrgico», con el mismo patrón que el registro de anestesia: tarjeta «Sin agregar» en la nota postquirúrgica, también en Anexos, llenarlo en el sistema o imprimir en blanco y subir la foto.

- **Encabezado**: paciente, fecha, procedimiento, cirujano, instrumentista y circulante (prellenados desde el equipo de la nota postquirúrgica).
- **Tabla del recuento.**
  - Filas:
    - «Compresas»
    - «Gasas»
    - «Torundas»
    - «Agujas de sutura»
    - «Hojas de bisturí»
    - «Otros cortopunzantes»
    - «Instrumental»
    - «Otros» (texto libre, varias filas)
  - Columnas, según los momentos de recuento de AORN:
    - «Inicial (antes de la incisión)»
    - «Agregados»
    - «Antes de cerrar cavidad»
    - «Antes de cerrar herida»
    - «Final (cierre de piel)»
    - «Resultado» (Correcto / Incorrecto)

  El instrumental se cuenta en «Inicial», «Antes de cerrar herida» y en el cambio de personal. Las demás celdas del instrumental se pueden dejar en blanco.
- **Cambio de personal**: filas para registrar un recuento al relevarse la instrumentista o la circulante, con hora, quién entrega y quién recibe.
- **Si algún resultado es «Incorrecto»**: casillas «Se informó al cirujano», «Se hizo búsqueda», «Se tomó radiografía», «Se encontró» (Sí / No) y nota obligatoria.
- **Confirmación final**: «Recuento completo y correcto, confirmado en voz alta antes de que el paciente salga de sala» (casilla).
- **Firmas**: instrumentista, circulante y cirujano (nombres; la firma en papel en el impreso).
- **Quién**: lo pueden llenar o subir el médico, enfermería y cualquier miembro del equipo que entró a la cirugía y tenga cuenta (permisos de orders o care, como la subida en papel de PQ3). Queda con autor y hora, se corrige en el periodo de gracia o con adenda.
- **Opcional**: no bloquea el egreso ni genera alerta al paciente, igual que la hoja de anestesia.
- **Impresión**: una hoja Carta con la plantilla de IM1.
- Las filas y columnas van en `clinicalConfig.ts` con `VALIDAR: Emil`.

**Criterios de aceptación.**
- [ ] En una nota postquirúrgica aparece la tarjeta «Recuento quirúrgico · Sin agregar».
- [ ] Como Lic. Marta Urbina lo lleno con un resultado «Incorrecto». Me pide la nota y las casillas de búsqueda, y al firmarlo queda en Anexos con mi nombre.
- [ ] La hoja en blanco se imprime en una hoja Carta, y subir la foto funciona.
- [ ] Recepción no lo puede llenar (403).

### Laboratorio e Imágenes

#### LB8. Bandeja del laboratorio agrupada por paciente y por categoría (captura 20) · Clínica

**Cómo está hoy.** `DeptTray.tsx` muestra una tarjeta por examen, cada una con su propio encabezado de paciente, en todas las áreas. DP2 solo agregó un botón en la primera tarjeta del paciente.

**Por qué.** Un paciente con muchos exámenes se ve como un solo choricero. Puede pasar que tomen la muestra sin fijarse que el paciente tiene 3 exámenes, la muestra no alcance y lo tengan que volver a pinchar.

**Qué quiero.**
- En las áreas Ambulatorio, Observación y Hospitalización: **una tarjeta por paciente**.
  - Arriba, el encabezado del paciente una sola vez, con un conteo bien visible: «7 exámenes».
  - Adentro, los exámenes agrupados por categoría (Hematología, Química en sangre, Inmunología, Microbiología, Heces…), con `subgroupOf` o la subcategoría del catálogo de la clínica, en el orden del catálogo.
  - Cada examen en un renglón compacto con su estado y sus acciones («Cargar resultado», «No se realizó»).
  - Un «Muestra tomada (7)» para todos (DP2) y uno por categoría.
- Los urgentes suben arriba y se marcan en la tarjeta.
- La búsqueda, el filtro «Solo urgentes» y las pestañas siguen funcionando.

**Criterios de aceptación.**
- [ ] Como Lic. Paula Suazo, un paciente con 8 exámenes sale en una sola tarjeta con «8 exámenes», agrupados por categoría.
- [ ] «Muestra tomada (8)» los marca todos, y el de una categoría marca solo los de esa categoría.
- [ ] En la pestaña siguiente, el paciente sigue agrupado.
- [ ] A ~390 px se lee bien.

#### RX1. El radiólogo no ve en «Terminados hoy» lo que acaba de informar (captura 21) · Clínica

**Cómo está hoy.** El radiólogo realizó e informó un estudio y no le aparece en «Terminados hoy». Revisé el código y la causa probable es esta:
- `DeptTray.tsx` filtra el día con `(e.result?.at ?? e.statusAt).slice(0,10) === day`.
- Esas fechas están en UTC (`toISOString()`), mientras que `day` es la fecha local de Honduras (UTC−6).
- Por eso, todo lo terminado después de las 18:00 cae en el «día siguiente» y desaparece de «Terminados hoy».
- El filtro del servidor (`server/routes/dept.ts`, `substr(status_at,1,10)`) tiene el mismo problema.

**Qué quiero.**
- **Reproducir primero** con una prueba: un estudio informado a las 19:00 hora de Honduras.
- Corregir el filtro en el cliente y en el servidor para comparar por fecha local (`localISODate` / la zona de `server/tz.ts`), en Imágenes y en Laboratorio, que usan la misma bandeja.
- Revisar dos cosas más:
  - que un estudio informado quede en el **área** donde estaba el paciente, porque en la captura el radiólogo está en «Observación»;
  - que un estudio que no es de rayos X y solo tiene imágenes subidas se quede en «Por informar» (eso es correcto, pero dilo en el reporte).

**Criterios de aceptación.**
- [ ] La prueba del estudio informado a las 19:00 falla antes del cambio y pasa después.
- [ ] Como Dr. Rafael Zepeda informo un estudio y aparece en «Terminados hoy» de su área, a cualquier hora del día.
- [ ] Los conteos de las pestañas coinciden con la lista.

---

## 4. Permisos de lo nuevo

| Función | Recepción | Enfermería (Lic.) | Enfermería (Aux.) | Médico | Administración | Laboratorio / Imágenes | Asistente (consultorio) |
|---|---|---|---|---|---|---|---|
| «Paciente sin cita» desde Inicio (RE1) | sí | — | — | — | sí | — | como hoy |
| Registrar material (RU10) | **sí** | sí | sí | — | **sí** | — | sí |
| Ver rol de turnos de enfermería (EN1) | — | sí | sí | — | sí | — | — |
| Editar rol de turnos de enfermería (EN1) | — | **sí** (desde hoy) | — | — | sí | — | — |
| Ordenar «Ingestas y excretas» (IE1) | — | — | — | sí | — | — | — |
| Registrar ingreso o egreso de líquidos (IE1) | — | sí | sí | sí | — | — | sí |
| Ingresar paciente a hospitalización (HO2) | **sí** | — | — | sí | **sí** | — | — |
| Nota de ingreso y órdenes (HO2, NO2) | — | — | — | sí | — | — | — |
| Valoración preanestésica (PQ4) | — | — | — | sí | — | — | — |
| Registro de anestesia en el sistema (PQ4) | — | — | — | anestesiólogo del equipo | — | — | — |
| Subir en papel valoración o registro (PQ4) | — | sí | sí | sí | — | — | — |
| Recuento quirúrgico, llenar o subir (PQ5) | — | sí | sí | sí | — | — | — |

Todo se aplica en el servidor. Cada «—» responde 403 por URL directa.

---

## 5. Orden de implementación sugerido

1. **RX1** (corrección de fecha, aislada, con prueba primero).
2. **MC1**, **IM4**, **AG1** (solo interfaz).
3. **RU10**, **RE2**, **RE1** (permisos y botones).
4. **EN1** (puesto de enfermería, migración y permisos del rol).
5. **LB8**, luego **EX12** (comparten la agrupación por categoría).
6. **ME17**, luego **ME16** (el formulario único usa la vía nueva).
7. **NO1** (depende de ME16), **NO3**, luego **NO2** (editor de nota común).
8. **HO2** (depende de NO2: abre la nota de ingreso estándar).
9. **IE1** (depende de ME16 para los líquidos IV y del editor común para el botón).
10. **PQ4**, luego **PQ5** (mismo patrón de documento quirúrgico).

No hay datos demo en esta ronda.

---

## 6. Ambigüedades y valores por defecto (confírmalos, Emil)

1. **IM4**: el Word dice «la orden de los medicamentos está bien, solo quiero que esos números salgan como viñetas», pero la captura 12 es la **orden de laboratorio**. Por defecto: viñetas en la orden de exámenes impresa; la receta se queda numerada, porque en una receta el número de cada medicamento sirve para referirse a él.
2. **RE1**: «Paciente sin cita» también en el Inicio de recepción (no solo de administración). El texto aclaratorio de «Paciente ambulatorio» es mío.
3. **RE2**: se borra una sola vez la vista guardada de administración y recepción para que vean «Por médico». La lista del médico es por hora de llegada, no por hora de cita.
4. **EN1**: a quien no tiene prefijo se le pone «Auxiliar». La licenciada edita desde hoy en adelante, no días pasados. Las auxiliares sí ven el rol.
5. **IE1**:
   - Cortes por turno (07:00, 15:00, 23:00) por defecto.
   - Las dosis IV intermitentes suman su volumen al marcarse aplicadas.
   - **No** se calculan pérdidas insensibles (no lo pediste).
   - Sin la orden, no aparece la tabla.
6. **ME16**: «Infusión» solo con ingreso o en una estancia (sin ingreso, ME13 solo permite STAT).
7. **ME17**: abreviaturas `VALIDAR: Emil`:
   - Oral (VO)
   - Sublingual (SL)
   - Intramuscular (IM)
   - Intravenosa (IV)
   - Subcutánea (SC)
   - Inhalada (INH)
   - Nebulización (NEB)
   - Tópica (TOP)
   - Oftálmica (OFT)
   - Ótica (ÓT)
   - Nasal (NAS)
   - Rectal (VR)
   - Vaginal (VV)

   Se acepta texto libre.
8. **NO1**: la indicación «Ingreso a …» es fija en el número 1 y no se puede borrar mientras la casilla esté marcada.
9. **NO2**: la nota de ingreso siempre empieza en el formato estándar, aunque el médico prefiera SOAP para las evoluciones.
10. **HO2**:
    - Recepción y administración pueden ingresar; el diagnóstico es opcional para ellos.
    - Puede haber varios médicos tratantes; el primero es el principal.
    - La alerta dura hasta que se firme la nota de ingreso.
    - No se agrega ingreso directo a observación (no lo pediste).
11. **PQ4**:
    - La valoración la puede firmar cualquier médico, sin exigir la especialidad de anestesiología.
    - Pueden existir varias valoraciones por estancia.
    - Cuadrícula de 120 minutos por hoja con hoja de continuación.
    - El pendiente de «Valoración preanestésica» en Inicio queda **apagado** por defecto, porque no está claro a qué anestesiólogo se le asigna antes de la nota postquirúrgica.
12. **PQ5**:
    - Columnas según los momentos de AORN.
    - Optativo, sin bloquear el egreso.
    - No incluye las otras preguntas de la Lista OMS (entrada y pausa), porque pediste el recuento del material.
13. **LB8**: solo la bandeja de laboratorio se agrupa por categoría; Imágenes queda como está.

---

## 7. Revisión final antes de entregar

- [ ] Todos los puntos cumplen sus criterios de aceptación.
- [ ] Lo de la sección 2 sigue intacto (prueba ME13, ME15, PQ3, DP2 y el registro de material).
- [ ] **Recorrido de punta a punta**, con los usuarios de la sección 0:
  1. Andrea Quiroz registra un paciente sin cita desde Inicio y luego ingresa a otra paciente con médico tratante Dr. Hugo Nolasco.
  2. El Dr. Nolasco ve la alerta y escribe la nota de ingreso estándar: «Ingestas y excretas», una infusión a 125 mL/h, vía escrita «iv», diagnósticos CIE-11 y exámenes de 4 categorías.
  3. Lic. Paula Suazo ve la tarjeta agrupada y toma todas las muestras de una vez.
  4. Lic. Marta Urbina registra una diuresis y ve el balance, edita el rol de turnos y llena el recuento quirúrgico.
  5. La Dra. Silvia Arita escribe la valoración preanestésica antes de la cirugía.
  6. El Dr. Nolasco firma la nota postquirúrgica, y la Dra. Arita llena el registro de anestesia de una hoja.
  7. El Dr. Rafael Zepeda informa un estudio después de las 18:00 y lo ve en «Terminados hoy».
- [ ] Prueba a ~390 px de todo lo nuevo.
- [ ] Permisos verificados también por URL directa (tabla de la sección 4).
- [ ] Migración probada sobre una copia de la base, dos veces (la segunda no cambia nada).
- [ ] Impresos (valoración, registro de anestesia, recuento, orden con viñetas, ingestas en el expediente completo) revisados en PDF Carta.
- [ ] Sin errores de typecheck, lint, pruebas, `build` ni de consola.
- [ ] Textos en español correcto, sin términos en inglés en la interfaz.

---

## 8. Reporte final que espero (`REPORTE_RONDA16.md`)

1. Tabla por punto: Hecho / Parcial / No hecho, archivos cambiados y cómo lo pruebo yo en 2 o 3 pasos.
2. Cambios en la base de datos (versión del esquema, tablas y columnas nuevas, migraciones de datos) y cómo se probaron.
3. La tabla de paridad de NO2 y ME16, ya cerrada.
4. Los valores por defecto que usaste (sección 6) y los que cambiaste.
5. Lo que debo validar yo (todo lo marcado `VALIDAR: Emil`) y, si aplica, un abogado.
6. La causa confirmada de RX1.
7. Errores o mejoras que encontraste fuera de la lista.
