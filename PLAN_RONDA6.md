# Ronda 6: plan

Rama `correcciones-emil-7`, un commit por punto: `[ronda6][MC4] Rediseño de Ordenar exámenes`.

## Lo que llegó y lo que falta

El texto del pedido llegó **cortado a mitad de TU1** («Panel del día: al tocar un día se abre un panel lateral… con casillas»),
dos veces. Tampoco llegaron los adjuntos (`Correcciones clinada ronda 6.docx` y `Scanned_20261031_102603.pdf`): no están en el
repositorio ni en la máquina. Por eso:

| Falta | Efecto |
|---|---|
| Resto de TU1, TU2, PE1, GE1, MI1, MI2 | No se programan hasta tener su texto. De TU1 sólo se hace el «Panel del día» (lo único descrito). |
| Sección 6 (A6, A7, A9…) | Se usan los valores por defecto que el propio texto de cada punto ya cita (A9 está descrito en EN3; A7 en CF3). A6 (subgrupo de los 32 exámenes) se propone abajo y se marca para que Emil lo valide. |
| Anexo A (exámenes del PDF y tabla de equivalencias) y Anexo B (perfiles) | CF3 y CF6 se construyen completos (columna, cargador idempotente, pantallas), pero **con la lista de datos vacía**: no se inventan exámenes ni perfiles. Basta pegar el anexo en `server/data/labCatalog.ts` y la carga corre sola en cada base. |
| Capturas | Se trabaja con lo que describe el texto y con el código. |

## Lo que encontré (causas raíz)

| Punto | Estado actual |
|---|---|
| MC1 | `Consultation.tsx`: el bloque «Exámenes» va después de «Medicamentos». `NoteColumns` (tarjetas de nota, «Ver nota completa», expediente impreso) no tiene bloque de exámenes. El ingreso a observación/hospitalización está en `sign-box` dentro de un `check-line` con borde propio: tarjeta dentro de tarjeta. |
| MC2 | El historial **no** muestra un PRN quitado en la consulta externa: `git log -S` sólo encuentra refactorizaciones (`344b9d2`, `259da21`, `0d57cab`, `61f03ee`). La receta nunca tuvo PRN propio, sólo la frecuencia «Según necesidad» sin condición (`FREQUENCIES` en `catalogs.ts`). La nota de evolución sí tiene la casilla «PRN, sin horario fijo» (`MedForm`) y la hoja ya dibuja la fila PRN. Se usa el valor por defecto del pedido, con el nombre que ya existe en la base (`prn`). |
| MC3 | `ExamPicker`: lo no catalogado se agrega como externo con el grupo **Laboratorio por defecto** (`newGroup = 'lab'`), por eso las radiografías cayeron en Laboratorio con «Muestra tomada». El flujo de imagen ya existe (`done` = «Realizado», `FLOW` en `exams.ts`). `insertExams` fuerza a externo todo lo no catalogado (MC5 de la ronda 5). |
| MC4 | `ExamPicker` dibuja chips, sin subgrupos. El catálogo (`exam_catalog`) no tiene subgrupo. |
| MC5 | **Las órdenes sí quedan vinculadas** (las de la consulta por `consultation_id`, las de una nota por `note_id`). La causa es de pantalla: `NoteColumns` nunca tuvo bloque de exámenes, ni en la nota de ingreso (`ConsultationBody`) ni en las notas de evolución. |
| MC6 | La frecuencia vive en `hospitalizations.vitals_every_hours` (selector en la pestaña Signos vitales) o se adivina leyendo el texto de las órdenes (`frequencyFromOrders`). No hay historial: cambiarla recalcula también las tomas pasadas. |
| MC7 | `carriedOrders` ya copia las indicaciones de la última nota de ingreso/evolución como texto editable, pero (a) no incluye las de la consulta que ingresó al paciente, (b) no hay Cambiar/OMITIR ni etiquetas, (c) la nota guarda sólo `orders: string[]`. Los medicamentos sí se guardan completos (`kept + added + OMITIR`). |
| MC8 | `NoteEditor` no tiene signos vitales; el formulario de enfermería es `VitalsFields` + `vitalsForm.ts` + rangos de `vitals.ts`. |
| EN1 | La etiqueta «Urgente» sale de `appointments.type = 'urgent'` (sólo se pone desde la Agenda). El sin cita siempre se guarda como `first`/`followup`. No hay «esperado» en el código actual (todas dicen «min esperando»); se revisa también el inicio de enfermería. |
| EN2 | **Reproducido en `missedTakes`**: una toma sólo cubre la hora esperada si cae a ±1 h de ella. Registrar ahora no cierra las de las 23:00 y las 07:00. Además `when()` omite la fecha si es de hoy. |
| EN3 | `fileAlerts` agrega un aviso `skip-…` por cada dosis no aplicada u omitida hasta la siguiente nota médica. |
| CE1 | `WaitingRoom.tsx` línea 95: «Cobrar» en Atendidos. La etiqueta «Atendida» es `STATUS.done` en `format.ts`. |
| AD1/RE1 | Un solo componente ya: `ArrivalsPanel` (`Arrivals.tsx`), usado por Administración y Recepción en `Dashboard.tsx`. |
| CR1 | Los procedimientos son `followups.kind = 'procedure'` (misma tabla). Se crean desde «Seguimiento» de la consulta y desde «Crónicos y seguimientos». |
| CR2 | `Followups.tsx`, columna «Próximo control». |
| CF1/CF5 | `Settings.tsx`: Servicios (botón al pie de la tabla), Camas (botón «Agregar cama» al pie), Vademécum (ya arriba), Formas de pago y Áreas (sin alta). |

## Puntos

| Punto | Archivos | Base de datos | Reutiliza / crea |
|---|---|---|---|
| **MC1** | `Consultation.tsx`, `NoteColumns.tsx`, `index.css` | — | Orden Indicaciones → Exámenes → Medicamentos. El borrador guarda datos, no orden: abre igual. Un solo contenedor en el ingreso. |
| **MC2** | `Medications.tsx`, `catalogs.ts`, `format.ts` (`medicationLine`), `orderSets.ts`, `medOrders.ts`, `InpatientFile.tsx` (`MedForm`, `MedSheet`), `alerts.ts` | `PrescriptionItem.prnCondition` (JSON); `hosp_meds.prn` ya existe | Frecuencia «PRN (si es necesario)» + «Condición» obligatoria. Receta «PRN: condición». Hoja: fila PRN con última dosis y «Registrar dosis». |
| **CF3** | `exams.ts`, `server/routes/exams.ts`, `db.ts`, `ExamCatalogAdmin.tsx`, `server/data/labCatalog.ts` (nuevo) | v50: `exam_catalog.subgroup` (nullable) | Cargador idempotente por clave normalizada; A6 para los 32. Lista del Anexo A pendiente. |
| **MC3** | `Exams.tsx`, `server/routes/exams.ts`, `ExamsTab.tsx`, `ExamOrder.tsx` | v50: `exam_orders.uncatalogued` | Tipo obligatorio sin valor por defecto; etiqueta «No catalogado»; ya no se fuerza a externo. |
| **MC4** | `Exams.tsx` (`ExamPicker`), `modules.css` | — | Buscador, pestañas, «Mis sets (N)», «Perfiles (N)», grupos plegables con conteo, filas con casilla en 2 columnas, barra «Seleccionados (N)», «Agregar (N)». |
| **CF4** | `ExamCatalogAdmin.tsx` | — | Mismo componente de grupo plegable que MC4. Concordancia «1 valor». |
| **CF6** | `exams.ts`, `server/routes/exams.ts`, `Exams.tsx`, `ExamCatalogAdmin.tsx`, `labCatalog.ts` | `exam_profiles` ya existe: se usa con `owner_id IS NULL` (de la clínica) + `archived_at` | «Perfiles (N)», «Copiar a Mis sets», sección «Perfiles de laboratorio» en Configuración. Datos del Anexo B pendientes. |
| **MC5** | `NoteColumns.tsx`, `InpatientFile.tsx`, `PatientChart.tsx`, `ConsultNote.tsx`, `FullRecord.tsx` | — | Bloque `NoteExams` (tipo, «Externo», estado vivo). «Sin exámenes.» |
| **MC7** | `InpatientFile.tsx`, `inpatient.ts`, `server/routes/inpatient.ts`, `NoteColumns.tsx`, `FullRecord.tsx` | En `hosp_notes.data` (JSON, inmutable): `lines` con `{ id, kind, text, tag, medId? }` y `basedOn` (última nota firmada) | «Indicaciones activas» con Cambiar / OMITIR (mismo estilo que «Medicamentos activos»). Etiquetas Continúa / Nueva / Modificada / Omitida. Aviso si otra nota se firmó mientras se escribía. |
| **MC6** | `vitalsSheet.ts`, `clinicalConfig.ts`, `InpatientFile.tsx`, `Consultation.tsx`, `server/routes/inpatient.ts`, `server/app.ts` | v50: `hospitalizations.vitals_plan` (JSON: tramos `{ from, mode, hours?, by, noteId? }`) | `VitalsFrequency` (control nuevo). Horarios de turno en `clinicalConfig.ts` («VALIDAR: Emil»). |
| **MC8** | `InpatientFile.tsx`, `server/routes/inpatient.ts` | `vitals.source_note_id` (v50) | `VitalsFields` + `vitalsForm.ts`. Origen «Nota de evolución». |
| **EN2** | `vitalsSheet.ts`, `alerts.ts`, `VitalsSheet.tsx` | — | Una toma cubre todas las pendientes anteriores; «Cubierta por la toma de las HH:MM»; «Registrar tomas anteriores» → «Registro tardío». |
| **EN3** | `alerts.ts`, `inpatient.ts`, `InpatientFile.tsx` | — | Sin aviso por «No aplicada»; atrasada hasta la siguiente dosis; después «No aplicada (sin registro)», «Cerrada automáticamente por el sistema» (calculado, no se escribe). |
| **EN1** | `WaitingRoom.tsx`, `server/app.ts`, `store.tsx` | — | Interruptor «Urgente» → `type = 'urgent'`; bitácora. |
| **CE1** | `WaitingRoom.tsx`, `format.ts` | — | Sin «Cobrar»; «Consulta atendida». |
| **AD1/RE1** | `Arrivals.tsx`, `server/routes/me.ts` | `staff.prefs.arrivalsView` | «Por hora \| Por médico», grupos plegables, «Expandir todo / Contraer todo». |
| **CR1** | `Followups.tsx`, `followups.ts`, `server/routes/followups.ts`, `db.ts`, `Consultation.tsx` | v50: `followups.reminder_type`, `followups.migrated_to` | Copia los procedimientos a recordatorios de tipo Procedimiento y marca el original como migrado. `?tab=procedimientos` → Recordatorios. |
| **CR2** | `Followups.tsx` | — | «En 12 días · 12 nov 2026», «Hoy», «Mañana», «Hace N días» (fecha de Tegucigalpa). |
| **CF1/CF5** | `Settings.tsx`, `components/ui.tsx` | — | `SectionHead` (título, descripción y botón azul arriba). |
| **CF2** | `Settings.tsx`, `CriticalThresholds.tsx` | — | Rejilla 1/3–2/3; «No aplica» completo. |
| **TU1** (parcial) | `Roster.tsx` | — | Panel del día (lateral; hoja inferior en celular) con la lista del personal y casillas. |

## Dependencias y orden

MC1 → MC2 → CF3 (columna de subgrupo) → MC3 → MC4 → CF4 → CF6 → MC5 → MC7 → MC6 → MC8 → EN2 → EN3 → EN1 → CE1 → AD1/RE1 →
CR1 → CR2 → CF1 → CF5 → CF2 → TU1 (parcial).

- MC4 necesita el subgrupo (CF3) y el tipo de lo no catalogado (MC3). CF4 reutiliza el grupo plegable de MC4.
- MC6 guarda la frecuencia en la nota y la arrastra con la cadena de MC7.
- MC8 crea tomas que EN2 cuenta.
- EN3 usa el PRN de MC2.

## A6 propuesto (subgrupo de los 32 exámenes de laboratorio que ya existen) — VALIDAR: Emil

| Subgrupo | Exámenes |
|---|---|
| Hematología | Hemograma, Velocidad de eritrosedimentación, Frotis de sangre periférica, Tipo y Rh |
| Coagulación | Tiempos de coagulación (TP, TPT, INR) |
| Química en sangre | Química sanguínea, Glucosa en ayunas, Glucosa posprandial, Hemoglobina glicosilada (HbA1c), Perfil lipídico, Creatinina, Perfil renal, Perfil hepático, Electrolitos, Gases arteriales, Troponina I, Amilasa y lipasa, Proteína C reactiva |
| Hormonas | TSH, T4 libre, Prueba de embarazo en sangre (β-hCG) |
| Enfermedades infecciosas | VDRL, VIH (prueba rápida), Antígeno de superficie de hepatitis B, Serología para dengue (NS1, IgM, IgG), Gota gruesa |
| Microbiología | Urocultivo, Hemocultivo, Coprocultivo |
| Orina | Examen general de orina (EGO), Prueba de embarazo en orina |
| Heces | Examen general de heces |

Imagen y gabinete: Rayos X (radiografías), Ultrasonido, Tomografía, Resonancia, Cardiología (EKG, ecocardiograma, Holter),
Endoscopia (endoscopia, colonoscopia), Otros (mamografía, espirometría).
