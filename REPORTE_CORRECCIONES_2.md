# Reporte de la segunda ronda de correcciones

Rama `correcciones-emil-2`, un commit por punto (el plan está en `PLAN_CORRECCIONES_2.md`). Cuentas de demo con la contraseña `demo1234`: recepción `smejia@demo.clinara`, enfermería `crios@demo.clinara`, Dra. Herrera `lherrera@demo.clinara`, Dr. Paz `apaz@demo.clinara`, administración `admin@demo.clinara`.

**Verificación al cerrar**
- `tsc -b`: sin errores.
- `npm test`: 80 de 80 pruebas. Eran 61; las 19 nuevas están en `server/corrections2.test.ts`.
- `npm run build`: correcto. Sigue el aviso anterior de que el paquete pesa más de 500 kB.
- `oxlint`: 0 errores y 37 advertencias. Al empezar había 38; no hay ninguna nueva.
- Navegador (Chromium con Playwright), en escritorio y a 390 px, sobre una copia migrada de la base demo. Sin errores en la consola.

## 1. Estado por punto

| Punto | Estado | Archivos principales | Cómo probarlo |
|---|---|---|---|
| **M8** Identidad | Hecho | `src/components/DniInput.tsx` (nuevo), `src/lib/format.ts` (`formatDni`, `normalizeDni`, `dniDigits`), `PatientForms.tsx`, `Agenda.tsx`, `Booking.tsx`, `Authorization.tsx`, `Certificate.tsx`, `Prescriptions.tsx`, `Settings.tsx`, `server/app.ts`, `server/routes/*` | 1) Registra un paciente y escribe `0801199012345`: queda `0801-1990-12345`. 2) Pega la identidad con guiones o bórrala a la mitad: el cursor no salta. 3) Busca al paciente por `08011990` sin guiones. |
| **M3** Días según el tipo de atención | Hecho | `src/components/Medications.tsx`, `src/app/Consultation.tsx`, `src/lib/format.ts` (`autoQuantity`, `missingDays`), `src/lib/inpatient.ts` (`treatmentDay`), `src/app/InpatientFile.tsx` (MedForm, egreso, Suspender) | 1) En una consulta, agrega un medicamento sin días: no deja guardarlo («La receta lleva los días»). 2) Marca «Ingreso a hospitalización»: ya deja. En la hoja sale «Día 1 · Hasta nueva orden». 3) Al dar el egreso, «Continúa en casa» pasa la orden a la receta y pide los días. |
| **M7** Receta para paciente no registrado | Hecho | `src/app/Prescriptions.tsx`, `src/app/Inpatients.tsx` (`PatientPicker`), `server/app.ts` (`POST /api/prescriptions`, `/link`) | 1) Recetas, Nueva receta: busca un nombre que no existe y elige «receta para paciente no registrado». 2) Llena los datos y emite la receta: sale «Paciente no registrado» en el historial. 3) En la receta, «Registrar paciente» abre el registro precargado y vincula la receta. |
| **M1** Medicamentos a la hoja | Hecho | `server/medOrders.ts` (nuevo), `server/app.ts` (firma de consulta), `server/routes/inpatient.ts` (ingreso, corrección, notas, suspender), `src/lib/store.tsx`, `src/app/InpatientFile.tsx` | Son los tres casos reales. 1) Consulta con ondansetrón e «Ingreso a hospitalización»: al firmar, el ondansetrón está en Medicamentos («Indicado en nota de consulta externa, Dra. Herrera…»). 2) Da el egreso y vuelve a ingresar al paciente desde «Ingresar paciente»: el ondansetrón vuelve una sola vez. 3) Consulta a observación con solución salina: enfermería la ve en la hoja y la aplica. |
| **M4** La consulta es la nota de ingreso | Hecho | `src/app/InpatientFile.tsx`, `src/app/Inpatients.tsx` (`AdmitModal` con modo corregir, «Sin cama asignada»), `server/routes/inpatient.ts`, `server/db.ts` (`linkPendingAdmissions`), `src/app/FullRecord.tsx` | 1) Firma una consulta con ingreso: se abre «Completar ingreso: cama y acompañante». 2) En Notas, la primera es «Nota de ingreso · Consulta externa» y el botón dice «Nueva nota de evolución». 3) En la hoja, «Corregir ingreso» cambia la cama o el diagnóstico sin rehacer nada. |
| **M2** Dos columnas | Hecho | `src/lib/inpatient.ts` (`splitOrders`), `src/app/InpatientFile.tsx` (`NoteEditor`, `SoapNote`, `OrderChecklist`), `src/app/FullRecord.tsx` | 1) En observación, «Nueva nota de evolución»: el SOAP y «Medicamentos de esta nota» van a la izquierda y las Indicaciones a la derecha. 2) Guárdala: la nota se ve igual. 3) A 390 px se apila: primero la nota con sus medicamentos y después las indicaciones. |
| **E1** Día/Semana | Hecho | `src/app/InpatientFile.tsx` (`MedSheet`, `WeekGrid`, `CorrectDoseModal`), `src/clinical.css`, `server/routes/inpatient.ts` (`PATCH /api/inpatient/doses/:id`) | 1) Como enfermería, abre Medicamentos: arriba están Día/Semana, las flechas y «Hoy». 2) La flecha atrás muestra el día anterior en lectura; no deja ir antes del ingreso. 3) Con «Corregir registros» se registra tarde o se corrige una dosis pidiendo el motivo. En Semana se ven 7 días; en el celular se desliza de lado. |
| **M6** Procedimiento | Hecho | `src/app/InpatientFile.tsx` (`ProcedureNoteForm`), `src/lib/consent.ts` (`FREQUENT_PROCEDURES`), `src/app/FullRecord.tsx` | 1) Como médico, en Notas, «Procedimiento»: elige de la lista o escribe uno nuevo y cambia la hora. 2) Queda en la línea de tiempo según la hora en que se hizo, con «Procedimiento: … · Nota escrita: …». 3) Enfermería no ve el botón. |
| **M5** Autorizaciones | Hecho | `server/authorizations.ts` (nuevo), `server/routes/inpatient.ts`, `src/lib/consent.ts`, `src/app/Authorization.tsx`, `src/app/InpatientFile.tsx` (pestaña Anexos), `Inpatients.tsx`, `Observation.tsx`, `FullRecord.tsx` | 1) Al ingresar, Anexos ya tiene la «Autorización de hospitalización», pendiente de firma; hay un aviso en el expediente y en el tablero. 2) Enfermería anota al acompañante, imprime la hoja (1 página) y sube la foto: queda «Firmada ✓». 3) «Autorización quirúrgica» en Notas (enfermería o médico) genera la hoja; una vez firmada, el procedimiento la muestra. |

### Recorrido completo de la sección 7

Lo hice en el navegador sobre la base demo migrada:
- Consulta con ondansetrón e ingreso a hospitalización. No pidió otra nota de ingreso: la consulta quedó como primera nota y el ondansetrón llegó a la hoja.
- Autorización de hospitalización con acompañante (Rosa Pérez, 9888-1234). Subí la foto firmada y quedó en Anexos.
- Ingreso repetido del mismo paciente: el ondansetrón no se perdió ni se duplicó.
- Otro paciente pasó de consulta externa a observación con solución salina. En la nota, la solución quedó a la izquierda y las indicaciones a la derecha, y enfermería la vio en la hoja.
- Los días son opcionales con ingreso y obligatorios en ambulatorio.
- Enfermería usó Día, Semana, Hoy y la flecha hacia atrás.
- La autorización quirúrgica la generó enfermería y salió en 1 página. El médico registró el procedimiento con la hora editada y quedó vinculado a esa autorización.
- Receta para Marvin Osorto, no registrado. Escribí la identidad sólo con números y los guiones salieron solos.
- Expediente completo: la nota de ingreso va primero, los procedimientos en su hora y las autorizaciones como anexos al final (12 páginas).

**Permisos.** Probé con recepción, administración y enfermería por URL directa y por la API. Recepción y administración no entran a la estancia, las autorizaciones, los procedimientos, las recetas ni la suspensión de órdenes (403). Enfermería genera autorizaciones y aplica dosis. No puede registrar procedimientos, emitir recetas ni suspender órdenes.

## 2. Causa raíz de los medicamentos que no llegaban a la hoja

La hoja de medicamentos lee la tabla `hosp_meds`, pero sólo un camino escribía en ella: las notas de evolución (`POST /api/inpatient/:id/notes`).

- **Consulta externa con ingreso.** Los medicamentos se guardaban únicamente en la receta (`prescriptions.items`).
- **Consulta a observación.** Al firmar se creaba la estancia, pero sin órdenes.
- **Ingreso a hospitalización.** Se hacía en un segundo paso que tampoco copiaba nada. Si se hacía desde «Ingresar paciente» (como al rehacerlo), ni siquiera se vinculaba a su consulta.

Eran tres rutas distintas y sólo una llenaba la hoja.

**Cómo quedó:**
- `hosp_meds` es la única fuente de verdad, y `createMedOrders` (`server/medOrders.ts`) es el único lugar que crea órdenes.
- La usan la firma de consulta con ingreso, el ingreso manual o rehecho, la corrección del ingreso, las notas de evolución y observación y la migración.
- Cada orden guarda su origen (`source`, `source_id`, `source_index`). Un índice único sobre ese origen hace que firmar dos veces, volver a jalar la misma consulta o corregir el ingreso no la duplique.
- Al firmar con ingreso, la estancia y sus órdenes se crean en la misma transacción. Si algo falla, falla la firma completa y el médico ve el aviso, nunca un fallo silencioso.
- Al firmar, un aviso dice cuántos medicamentos pasaron a la hoja.
- Suspender o cambiar una orden la marca con motivo, autor y hora; no se borra.
- Las pruebas de `server/corrections2.test.ts` cubren los tres casos reales, la idempotencia, el paso de observación a hospitalización y el reingreso.

## 3. Cambios en la base de datos (v22)

Todo es aditivo y se aplica solo al subir `SCHEMA_VERSION` de 21 a 22.

Probé la migración sobre una base v21 creada con el código anterior, con datos demo más dos casos simulados:
- Una identidad sin guiones: quedó como `0801-1999-12345`.
- Un ingreso «pendiente de nota de ingreso»: se vinculó a su consulta, jaló el ondansetrón y quedó en la bitácora.

Los conteos de pacientes, citas, consultas, recetas, estancias, notas, dosis y procedimientos son iguales antes y después.

| Tabla | Cambio |
|---|---|
| `hosp_meds` | `patient_id`, `source`, `source_id`, `source_index` (con índice único), `days` (vacío = hasta nueva orden), `stop_reason`, `replaces_id`. Las órdenes anteriores reciben su `source` desde `note_id`. |
| `consultations` | `admit_kind` (`hospital` u `observation`) y `meds` (medicamentos con «Aplicar en la clínica»). |
| `hosp_doses` | `corrected_at`, `corrected_by`, `correction_reason`, `previous` (el registro anterior en JSON). |
| `authorizations` | `template` admite `hospital` y `surgical`. Las filas `general` y `procedure` se conservan; `procedure` se muestra como quirúrgica. |
| `prescriptions` | `patient_id` admite NULL; se agregan `guest`, `linked_at` y `linked_by`. |
| `clinics` | `dni_mask` (por defecto `0000-0000-00000`). |
| Datos | `patients.dni` y `guardian_dni` de 13 dígitos pasan a `0000-0000-00000`. Los ingresos sin consulta ni nota de ingreso se vinculan a la consulta del mismo paciente de las 24 h anteriores y, si siguen abiertos, se jalan sus medicamentos sin duplicar (`linkPendingAdmissions`). |

## 4. Decisiones y valores por defecto (para confirmar)

**Valores de la sección 6, usados tal cual:**
1. **Dos columnas:** medicamentos con la nota a la izquierda, indicaciones a la derecha.
   - Gana sobre lo de la ronda anterior, donde todas las órdenes (medicamentos incluidos) iban juntas a la derecha.
   - En la consulta externa no cambié nada (indicaciones arriba y medicamentos abajo, como quedó en la ronda anterior), porque esa pantalla está en la lista de «no rediseñar».
2. **Ambulatorio:** la receta es lo que sale con el paciente. «Aplicar en la clínica» existe en el formulario de medicamento (antes no existía).
3. **Medicamentos sin días:** «Hasta nueva orden», sin vencimiento automático. Con días, la hoja dice «Día N de M» y tampoco se suspende sola.
4. **Autorización de hospitalización:** una por estancia, para hospitalización y observación. Se reutiliza al pasar de observación a hospitalización.
5. **Autorización quirúrgica:** sólo con el botón; una por cirugía.
6. **Procedimiento:** selector con escritura libre. La lista son los 9 procedimientos de la biblioteca de autorizaciones más 10 menores frecuentes.
7. **Receta para no registrado:** no crea expediente.
8. **Identidad:** 13 dígitos `0000-0000-00000`, configurable en Configuración, «Formato del documento de identidad».
9. **Ingresos pendientes:** se vinculan a su consulta de origen.

**Decisiones propias:**
1. **Con ingreso no se emite receta en esa consulta.** Todos los medicamentos van a la hoja y la receta sale en el egreso.
2. **«Aplicar en la clínica» en una consulta ambulatoria deja al paciente en observación**, porque la hoja de medicamentos vive dentro de una estancia. Lo demás sale en la receta. El aviso de firma lo dice antes de firmar.
3. **La hospitalización desde la consulta se crea al firmar, sin cama.** Enseguida se abre «Completar ingreso» para elegirla. Mientras no la tenga, aparece en el tablero en «Sin cama asignada». Así ya no se puede abandonar el ingreso a la mitad.
4. **Ingreso hecho a mano** (rehecho o desde el tablero): se vincula a la consulta con ingreso de las últimas 48 h, o a la de una estancia de ese paciente cerrada en ese tiempo.
5. **Hoja de medicamentos:**
   - Se puede ver hasta 7 días adelante (lo programado).
   - La semana va de lunes a domingo.
   - Una dosis de hace más de 24 h exige motivo también en el servidor.
   - Corregir una dosis exige motivo siempre y guarda el registro anterior.
   - La vista y la fecha quedan en la URL, así que sobreviven a recargar la página.
6. **Procedimiento y autorizaciones:**
   - El procedimiento se puede cubrir con cualquier autorización firmada de la estancia antes de su hora. Primero se propone la quirúrgica con el mismo nombre.
   - La de hospitalización cubre procedimientos menores, con un enlace para generar la quirúrgica si es una cirugía. Ya no se exige que la firma sea de las 24 h anteriores.
   - Una autorización firmada después de la hora del procedimiento no lo cubre.
7. **Si enfermería genera una autorización, el médico que firma es el que ingresó al paciente.** Los campos de la quirúrgica que se dejen vacíos salen como líneas para llenar a mano. Sólo son obligatorios el procedimiento y el diagnóstico (y el representante si es menor).
8. **Las autorizaciones salieron de la línea de tiempo de Notas y pasaron a la pestaña Anexos.** Desde las notas se generan con el botón.
9. **Administración no ve la hoja de medicamentos** («Ver» en la tabla de permisos), para mantener lo que confirmaste en la ronda anterior: administración sin acceso clínico. Si la quieres, conviene una vista de sólo lectura de la hoja, sin notas. Dime y la hago.
10. **La prueba H3 de la ronda anterior** decía que enfermería no crea autorizaciones. La actualicé a la regla nueva.

## 5. Lo que debes validar tú o un abogado

- **Textos de las dos autorizaciones** (`src/lib/consent.ts`; las hojas están en `src/app/Authorization.tsx`):
  - Autorización de hospitalización: lo que se autoriza (ingreso y atención, medicamentos, procedimientos menores) y la declaración.
  - Autorización quirúrgica: los cinco puntos de la declaración, «No autorizo», revocación, asentimiento del menor y testigo.
  - Son borradores. El código y la hoja impresa dicen que deben validarlos tú y el asesor legal de la clínica antes de usarlos con pacientes reales, y la clínica puede cambiarlos por su propio formato.
  - Sólo se menciona el Código de Ética del Colegio Médico de Honduras, cap. VIII, verificado en la ronda anterior. No cité artículos nuevos.
- **Lista de procedimientos frecuentes** y explicaciones de la biblioteca (clínicas).

## 6. Errores o mejoras que encontré en el camino

- **Corregido:** el folio de receta se calculaba ordenando como texto. Después de `RX-AAAA-9999` volvía a `RX-AAAA-10000` y chocaba con el índice único. Ahora se toma el máximo numérico; tiene su prueba.
- **Corregido:** la hoja de hospitalización se genera al ingresar, y el botón de Anexos sólo la abría, sin dejar anotar al acompañante. Ahora, mientras está pendiente, permite completarlo y reabre la misma hoja.
- **Sin corregir:** el enlace «Volver a los anexos» de una autorización lleva a la ruta de hospitalizados aunque la estancia sea de observación. Funciona, pero el menú resalta Hospitalizados.
- **Sin corregir:** la receta de egreso usa su propio formulario y no el selector del vademécum de la consulta. Unificarlo es un cambio mediano.
- **Sin corregir:** sigue el aviso del tamaño del paquete (720 kB); conviene dividirlo por rutas.
- **Entorno:** el Chromium de Playwright que había en `~/.cache/ms-playwright` desapareció a mitad de la sesión. Probé con uno descargado a una carpeta temporal.
