# Reporte de las correcciones de Emil

Rama `correcciones-emil`, un commit por punto (el plan está en `PLAN_CORRECCIONES.md`). Cuentas de demo con la contraseña `demo1234`: recepción `smejia@demo.clinara`, enfermería `crios@demo.clinara`, Dra. Herrera `lherrera@demo.clinara`, Dr. Paz `apaz@demo.clinara`, administración `admin@demo.clinara`.

**Verificación al cerrar:**
- `tsc -b` sin errores.
- `npm test`: 61 de 61 pruebas (eran 39; las nuevas están en `server/corrections.test.ts`).
- `npm run build` correcto.
- `oxlint`: 0 errores y 38 advertencias. Al empezar había 42, todas anteriores; no hay ninguna nueva.
- Cada punto se probó en el navegador (Chromium con Playwright) con el rol correspondiente, en escritorio y a 390 px de ancho, sin errores en la consola.

## 1. Estado por punto

| Punto | Estado | Archivos principales | Cómo probarlo |
|---|---|---|---|
| **E1** Preclínica | Hecho | `src/lib/vitals.ts` (rangos en un solo lugar), `src/app/WaitingRoom.tsx`, `src/app/PatientChart.tsx`, `server/app.ts` | 1) Enfermería, Consulta externa, Preclínica de un adulto. 2) Escribe 1, 12, 120 en sistólica: nada en rojo; sal del campo con 120/80: sin alertas. 3) 170 → ámbar; 10 → rojo, "Revise el valor" y confirmación al guardar; 37,5 en temperatura se acepta. |
| **M5** Identidad en la receta | Hecho | `src/app/PatientForms.tsx` (`IdentityPrompt`), `src/lib/format.ts`, `src/pages/Booking.tsx`, `server/routes/public.ts`, `src/app/Prescriptions.tsx` | 1) Consulta de María José (tiene identidad): agrega un medicamento, no la pide. 2) Consulta de alguien sin identidad: la pide una vez, se guarda y aparece en la cabecera. 3) Registra a un menor sin identidad: pide el responsable y la receta lo muestra. |
| **M1** (errores visuales) | Hecho | `src/lib/format.ts` (`age`), `src/app/WaitingRoom.tsx`, `src/index.css` | Consulta externa, Toda la clínica: "con Dr. Andrés Paz · Fiebre", "1 mes" y "En consulta" en blanco sobre azul. |
| **H5** El médico aplica medicamentos | Hecho | `server/routes/inpatient.ts`, `src/app/InpatientFile.tsx` | Dra. Herrera, Hospitalizados, un paciente, Medicamentos: toca una hora y registra. Queda "✓ 10:15 Dra. Herrera, médico". |
| **R1** Por llegar | Hecho | `src/app/Arrivals.tsx`, `src/lib/arrivals.ts`, `src/app/Dashboard.tsx` | Recepción, Inicio: toca la tarjeta "Por llegar". Ves hora, nombre, teléfono (llamar o WhatsApp), médico y "retrasado N min"; "Llegó" lo pasa a sala y el número baja. |
| **R3** Filtros de pacientes | Hecho | `src/app/Patients.tsx`, `GET /api/patients/index` en `server/app.ts` | Biblioteca, Filtros: Femenino + última consulta entre dos fechas. Aparecen los chips, "12 de 76 expedientes" y los filtros quedan en la URL; recarga y se conservan. |
| **R2** Agendar sin registro y por horario | Hecho | `src/lib/schedule.ts`, `src/app/Agenda.tsx`, `src/app/NewPatient.tsx`, `src/app/ScheduleEditor.tsx`, `src/lib/patients.ts`, `server/app.ts`, `server/db.ts` | 1) Agenda, Nueva cita: escribe un nombre que no existe y "agendar como paciente nuevo" (nombre y teléfono). Con el teléfono de otro paciente aparece "¿Es esta persona?". 2) La hora sólo ofrece el horario del médico ("El Dr. Paz no atiende los domingos"); una hora ocupada avisa sin bloquear. 3) Al llegar, "Llegó" abre el registro precargado y le da número de expediente. El horario se edita en Configuración (administración) o en Mi cuenta (cada médico). |
| **M1** Atender al de otro médico | Hecho | `server/app.ts` (`/appointments/:id/take`), `src/app/WaitingRoom.tsx` | 1) Dr. Paz, Consulta externa: la vista por defecto es "Mis pacientes". 2) En "Toda la clínica", "Atender" en un paciente de la Dra. Herrera pide confirmación y abre la consulta. 3) La Dra. Herrera ve "Lo atiende Dr. Andrés Paz". |
| **M2** Plan y manejo | Hecho | `src/components/Medications.tsx`, `src/app/Consultation.tsx`, `src/lib/catalogs.ts`, `src/app/PatientChart.tsx`, `src/app/Prescriptions.tsx` | En una consulta: indicación arriba; "+ Agregar medicamento" abajo precarga la dosis habitual; queda "Acetaminofén 500 mg tableta — 1 g VO cada 8 h por 3 días". Escribir "acetaminofen 1 gr" en indicaciones sugiere pasarlo a medicamento. Se firma con sólo uno de los dos bloques. |
| **M3** Medicamento fuera del vademécum | Hecho | `server/routes/drugs.ts`, `src/components/Medications.tsx` (`NewDrugModal`), `src/app/Settings.tsx` (pestaña Vademécum) | Busca "Dexametasona", "Agregar como nuevo medicamento", llena presentación y concentración. Otro médico ya lo encuentra; administración lo desactiva en Configuración, Vademécum. |
| **M7** Recetas en el menú | Hecho | `src/app/Prescriptions.tsx`, `POST /api/prescriptions`, `src/app/AppShell.tsx` | Médico, Recetas, Nueva receta: paciente, medicamento, indicaciones y Emitir. La hoja dice "Receta sin consulta". En el historial, "Repetir receta" a otro paciente. |
| **M4** Constancias | Hecho | `server/routes/certificates.ts`, `src/lib/certificates.ts`, `src/app/Certificate.tsx`, `src/app/PatientChart.tsx` (pestaña Constancias) | Nota de consulta, Generar constancia, Incapacidad, 3 días: calcula "hasta" y no lleva diagnóstico salvo que se marque. Emitir da el número CM-2026-0001. "Anular" pide motivo. |
| **H2** Nota de procedimiento | Hecho | `server/routes/inpatient.ts` (`/procedure-notes`), `src/app/InpatientFile.tsx` | Hospitalizado, Notas, Procedimiento: nombre, fecha y hora (no acepta una futura) y texto. Sin autorización pide "Urgencia, sin autorización previa" con justificación. En la línea de tiempo: "Procedimiento: 25/10 08:54 · Nota escrita: 25/10 10:54". |
| **H1** Nota en dos columnas y checklist | Hecho | `src/app/InpatientFile.tsx` (`SoapNote`, `OrderChecklist`, `PendingOrdersPanel`), `server/routes/inpatient.ts`, `src/app/Dashboard.tsx`, `src/app/AppShell.tsx` | 1) Médico: nueva nota y pega una lista de 5 líneas en órdenes: crea 5 órdenes. 2) Enfermería: contador rojo en Hospitalizados y "Órdenes nuevas" en Inicio. Marca y queda "✓ Lic. Ríos 21:05"; desmarcar pide motivo. 3) Con todo marcado, la alerta desaparece. |
| **H3** Autorizaciones | Hecho | `src/lib/consent.ts`, `src/app/Authorization.tsx`, `server/routes/inpatient.ts` | Notas, Autorización, "Para un procedimiento", Sonda vesical (precarga riesgos y alternativas), "Generar hoja": hoja carta de una página. Enfermería, "Subir hoja firmada" con la cámara: queda Firmada ✓. La nota de procedimiento la reconoce. |
| **M6** Observación | Hecho | `src/app/Observation.tsx`, `src/app/InpatientFile.tsx` (modo observación), `src/app/Consultation.tsx`, `server/app.ts`, `server/routes/inpatient.ts` | 1) Firma una consulta con "Ingreso a observación": se abre su expediente (Datos generales, Notas, Hoja de medicamentos, Laboratorio, sin enfermería). 2) La primera nota es la de consulta. Menú Observación con contador y tiempo transcurrido. 3) "Pasar a hospitalización" asigna cama y conserva todo ("Vino de observación"); "Egreso" la cierra. |
| **H4** Expediente completo | Hecho | `src/app/FullRecord.tsx`, `src/clinical.css` (`@page expediente`) | Expediente completo, Imprimir. En la vista previa de Chrome: la hoja en una página, una nota por página en dos columnas con las marcas, enfermería de corrido, medicamentos, laboratorios y autorizaciones al final; encabezado en cada hoja y "Página X de Y". |

Prueba de punta a punta de la sección 7, hecha en el navegador sobre una base nueva:
1. Recepción agenda a Mario Turcios con nombre y teléfono y marca su llegada con el registro precargado.
2. Enfermería hace la preclínica: 120/80 sin alertas y 170 en ámbar.
3. El Dr. Paz lo toma con "Atender".
4. Escribe indicaciones, agrega omeprazol (vademécum) y simeticona (nueva). La receta sale sin pedir identidad. Emite una constancia de incapacidad sin diagnóstico.
5. Ingresa a observación y escribe una nota con 5 órdenes. Genera una autorización y enfermería sube la foto firmada. Escribe la nota de procedimiento con la hora a mano y aplica un medicamento como médico.
6. Lo pasa a hospitalización. Enfermería ve la alerta y marca las órdenes. Se escriben 15 notas y el egreso.
7. El expediente completo sale en 24 páginas.
8. Desde Recetas, el médico repite la receta a otro paciente.

Aparte, revisé página por página un expediente de 29 páginas: 23 notas de evolución (15 nuevas, una de procedimiento y la de egreso), 6 notas de enfermería, 4 medicamentos, 2 laboratorios y 1 autorización.

**Permisos:** con cada rol intenté entrar por URL directa a lo que no le corresponde (observación, recetas, constancias, autorizaciones, configuración, personal, consulta). Todo se bloquea, y el servidor responde 403 a las acciones de otros roles (está en las pruebas).

## 2. Cambios en la base de datos

Todos son aditivos: no se borra ninguna columna ni ningún dato. Se aplican solos al subir `SCHEMA_VERSION` (de 9 a 21). Probé la migración con una base v9 creada con el código de `main`: llegó a v21 con los mismos conteos de pacientes, citas, consultas, notas, procedimientos y recetas, y la API respondió bien con los cuatro roles.

| Versión | Cambio |
|---|---|
| v10 | `vitals.glucose` pasa a DOUBLE PRECISION (decimales) |
| v11 | `patients.guardian_name`, `guardian_dni`, `guardian_relation` (menor sin identidad) |
| v12 | `patients.pending`, `patients.merged_into`; `birth_date` y `sex` admiten NULL (paciente nuevo pendiente de registro) |
| v13 | `appointments.reassigned_from`, `reassigned_by`, `reassigned_at` |
| v14 | `consultations.indications` |
| v15 | Tabla `clinic_drugs` (vademécum de la clínica, clave normalizada única por clínica) |
| v16 | `prescriptions.standalone`, `prescriptions.indications` |
| v17 | Tabla `certificates` (número correlativo por clínica, anulación) |
| v18 | `hosp_notes.kind` admite `procedure` |
| v19 | Tabla `order_marks`, de sólo inserción (un trigger impide modificar o borrar) |
| v20 | Tabla `authorizations` |
| v21 | `hospitalizations.kind` (`hospital` u `observation`), `observation_at`, `converted_at`, `converted_by`; `bed_id` admite NULL; `clinics.obs_alert_hours`, `obs_order_checklist` |

El horario del médico sigue en `staff.schedule` (JSON): se agrega `week` (franjas por día) y se conservan `days/start/end/slot` para lo anterior. Permisos nuevos: `schedule.manage` y `drugs.manage` (administración) y `orders.review` (enfermería).

## 3. Decisiones que tomé y valores por defecto (para confirmar)

**Valores por defecto de la sección 6, usados tal cual:**
- La agenda ofrece horas cada 30 min (el intervalo del horario, editable).
- El paciente nuevo que nunca llega queda pendiente de registro, con número provisional `PEND-…`. No aparece en la biblioteca, en los buscadores ni en los conteos.
- Enfermería registra dosis en observación.
- Las autorizaciones van al final del expediente impreso, como anexos.
- La nota de consulta es la primera nota de evolución, en observación y en hospitalización.
- La alerta de observación salta a las 24 h (configurable).
- Desmarcar una orden pide motivo.
- En observación, las órdenes no son checklist ni generan alertas; se puede activar en Configuración.

**Decisiones propias:**
1. No se puede marcar la llegada de un paciente nuevo sin completar su registro (lo exige el servidor). Así nunca entra a consulta un paciente sin expediente.
2. Si al llegar resulta que el paciente nuevo ya tenía expediente, la cita pasa a ese expediente y el pendiente queda marcado como unido (`merged_into`); no se borra.
3. La agenda interna sólo ofrece horas dentro del horario (al reprogramar se conserva la hora original aunque quede fuera). Las urgencias siguen entrando por "Paciente sin cita". La reserva en línea sigue sin ofrecer horas ocupadas; la agenda interna sí permite dos citas a la misma hora, con aviso.
4. Cuando el motivo o el tipo no se indican, el tipo se deduce ("primera vez" si el paciente nunca consultó) y el motivo queda vacío. La preclínica sigue pidiendo el motivo en palabras del paciente.
5. Sólo se puede tomar con "Atender" a un paciente **listo para consulta**, con preclínica. Uno que sigue "en sala" no se puede tomar.
6. **Las órdenes sólo las marca enfermería**; la tabla decía "Opcional" para el médico. Las notas escritas antes de este cambio no piden revisión, para no llenar de alertas viejas.
7. Cada nota nueva vuelve a listar las órdenes vigentes, como ya hacía la app. Por eso enfermería revisa en cada nota todas las órdenes que aparecen en ella, igual que en papel.
8. Autorización para un procedimiento:
   - Cuenta la firmada en las 24 h anteriores a la hora del procedimiento, con 2 minutos de tolerancia porque la hora se escribe al minuto.
   - Sin ella, sólo se acepta como urgencia con justificación.
   - Las notas de procedimiento van en la línea de tiempo según la hora en que se escribieron, y muestran también la hora del procedimiento.
9. La constancia guarda los datos tal como se imprimieron (paciente, médico, clínica), para que la reimpresión sea idéntica. La constancia para el acompañante precarga al contacto de emergencia, porque la consulta no registra acompañante.
10. WhatsApp (receta y constancia): se envía el texto con `wa.me`, porque no se puede adjuntar el PDF sin WhatsApp Business. "Imprimir o guardar PDF" usa la impresora de Chrome.
11. Observación vive en la misma tabla que hospitalización (`kind`). Así "Pasar a hospitalización" conserva todo sin copiar datos.
12. Administración no ve la lista ni el expediente de observación, porque no tiene acceso clínico. Sí ve el estado "En observación" en la biblioteca y en el filtro. Enfermería puede ver el historial de Recetas (ya tenía `rx.view`), pero no emitir.
13. El filtro de la biblioteca se calcula sobre la lista completa: la app carga todos los expedientes y no está paginada. La última consulta, la próxima cita y el estado vienen del servidor sobre todo el historial (antes la tabla sólo veía 90 días).
14. "Página X de Y" usa los márgenes de `@page` de Chrome 131 o posterior, sin librerías. En Firefox el número de página no sale.

## 4. Lo que deben validar Emil o un abogado

- **Texto de la autorización** (`src/lib/consent.ts`, hoja en `src/app/Authorization.tsx`):
  - Es una propuesta. El código y la hoja impresa dicen que deben validarlo Emil y el asesor legal de la clínica antes de usarlo con pacientes reales; la clínica puede cambiarlo por su propio formato.
  - Base verificada en el texto original: Código de Ética del Colegio Médico de Honduras, capítulo VIII (arts. 26 y 30 a 33), confirmado también en Rev Med Hondur 2016;84(3-4); Código de la Niñez y de la Adolescencia, art. 1 (menor de 18 años). El Código de Salud, art. 176, sólo aplica a investigación.
  - **No encontré** ninguna norma de la Secretaría de Salud sobre el formato del consentimiento, ni sobre la huella digital de quien no sabe firmar, ni sobre la edad del asentimiento del menor. No cité nada que no haya verificado.
  - Las descripciones, riesgos y alternativas de los 9 procedimientos de la biblioteca también son clínicas y deben revisarse.
- **Rangos de signos vitales** (`src/lib/vitals.ts`): los de adulto son los que propuso Emil. Los **pediátricos** (por grupo de edad) son referencias habituales que puse yo y hay que validarlos.

## 5. Errores o mejoras que encontré y no estaban en la lista

- **Node:** con Node 20.15, `npm install` no instala los binarios nativos de Vite 8 ni de oxlint (piden 20.19 o más), así que `npm run dev`, `build` y `lint` fallan. Actualicé `engines` y el README. Para trabajar aquí los instalé con `npm install --no-save`.
- **Contraste de etiquetas:** la regla `.row__who span` pintaba de gris todas las etiquetas dentro de las tarjetas (era la causa de "En consulta" ilegible). Corregido.
- **Ancho en celular:** la cabecera del paciente y algunas filas ensanchaban la página en el teléfono (hasta 828 px en un expediente de hospitalización). Corregido: todas las pantallas revisadas quedan en 390 px.
- **Bloqueo de PGlite:** durante el trabajo encontré que consultar la base fuera de una transacción abierta bloquea PGlite. Lo evité en todo el código nuevo; una prueba de observación lo cubre.
- **Pruebas intermitentes:**
  - La prueba existente "la demo trae casos completos" falló una vez y no la pude reproducir. Depende de fechas relativas de la demo; no la toqué.
  - Mi prueba de M1 suponía quién ganaba la carrera de "Atender"; ya la corregí. Después corrí la suite completa 20 veces seguidas sin fallas.
- **Fechas en formularios:** los campos de fecha nativos muestran el formato del idioma del navegador (dd/mm/aaaa en un navegador en español). Forzarlo exige un selector de fecha propio.
- **Tamaño del paquete:** el paquete de la app pesa más de 500 kB (aviso anterior). Conviene dividirlo por rutas.
- **Escala:** la app carga todos los pacientes y 90 días de citas al entrar. Para clínicas grandes convendrá paginar en el servidor (la biblioteca y sus filtros ya tienen el endpoint listo para eso).
- **Faltantes que no implementé:** no existe un rol de laboratorio (los resultados los suben médico o enfermería). La reserva en línea no pregunta alergias. Firmar en pantalla con el dedo no se hizo; la vía es papel firmado más foto, como pedía el documento.
