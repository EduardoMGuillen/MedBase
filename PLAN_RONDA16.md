# Plan de la ronda 16

Pedido: `docs/ronda16/PEDIDO_RONDA16.md` (escrito a partir de `docs/ronda16/Correcciones ronda 16.docx` y del PNG de la hoja de anestesia).

## Ramas de trabajo

Cada rama sale de `main` y luego se une a `main`. Cada una usa su propio número de `SCHEMA_VERSION` (hoy es `84`). Al unir, queda el más alto y se conservan todas las migraciones.

| Rama | Puntos | Esquema | Archivos principales |
|---|---|---|---|
| `ronda16-ui` | RX1, MC1, IM4, AG1, LB8, EX12 | sin cambios | `DeptTray.tsx`, `server/routes/dept.ts`, `ExamPanels.tsx`, `index.css`/`clinical.css`, `ExamOrder.tsx`, `Agenda.tsx`, `ExamsTab.tsx`, `src/lib/exams.ts` |
| `ronda16-roles` | RU10, RE2, RE1, EN1 | v85 | `permissions.ts`, `routes/usage.ts`, `WaitingRoom.tsx`, `Dashboard.tsx`, `Ambulatory.tsx`, `clinicalConfig.ts`, `routes/roster.ts`, `Roster.tsx`, Personal y roles |
| `ronda16-pq` | PQ4, PQ5 | v86 | `routes/anesthesia.ts`, `lib/anesthesia.ts`, `AnesthesiaForm.tsx`, `AnesthesiaDoc.tsx`, `AnesthesiaSheet.tsx`, ruta y componentes nuevos del recuento, `InpatientFile.tsx` (tarjetas y Anexos) |
| `ronda16-notas` | ME17, ME16, NO1, NO3, NO2 | v87 | `Medications.tsx`, `InpatientFile.tsx` (NoteEditor, MedForm), `Consultation.tsx`, `server/medOrders.ts`, `server/app.ts`, `format.ts` |
| `ronda16-ingreso` (después de `notas`) | HO2, IE1 | v88 | `Inpatients.tsx`, `routes/inpatient.ts`, `alerts.ts`, `Dashboard.tsx`, `VitalsSheet.tsx`, `FullRecord.tsx`, una tabla nueva para los líquidos |

## Dependencias

- ME16 usa la vía de ME17.
- NO1 depende de ME16.
- NO2 es el editor común que usan HO2 (nota de ingreso automática) e IE1 (botón «Ingestas y excretas»).
- EX12 y LB8 comparten la agrupación por categoría (`orderGroups` / `subgroupOf`).
- PQ5 sigue el patrón de documento de PQ4.

## Tabla de paridad (NO2 y ME16)

Rama `ronda16-notas`. Columnas: **CE** = nota de consulta externa (`Consultation.tsx`); **Ingreso** = nota de ingreso escrita desde el expediente (`NoteEditor`, `kind="admission"`); **Evol. obs.** y **Evol. hosp.** = notas de evolución de observación y de hospitalización (`NoteEditor`, `kind="evolution"`; es el mismo editor, solo cambia el lugar). «✔» = igual en todos; «Corregido» = la diferencia se cerró en esta rama; «Justificado» = la diferencia se queda, con su razón.

### Notas (NO2)

| Función | CE | Ingreso | Evol. obs. | Evol. hosp. | Estado |
|---|---|---|---|---|---|
| Formatos de nota | Estándar de la CE (motivo, HEA, examen físico, observaciones, impresión diagnóstica) | **Estándar de la CE por defecto** + selector «Estándar \| SOAP» (antes: solo SOAP) | Estándar de evolución (diagnósticos, evolución, examen, observaciones) o SOAP; empieza en `prefs.noteFormat` | igual que obs. | Corregido (ingreso). Justificado: la CE no tiene SOAP porque es la historia clínica de primera vez; la evolución estándar cambia «motivo + HEA» por «Evolución» porque sigue a una nota anterior. La preferencia del médico no cambia el ingreso (siempre estándar). |
| Cambiar de formato sin perder lo escrito | — | sí (estándar y SOAP guardan su borrador por separado; los diagnósticos se comparten) | sí | sí | ✔ |
| Signos vitales | de la preclínica (o «Tomar signos») | bloque opcional «Signos vitales» | bloque opcional | bloque opcional | Justificado: en la CE los toma enfermería en preclínica antes de la consulta; en la estancia el médico los anota en la nota y quedan en la hoja de signos. |
| CIE-11 | «Impresión diagnóstica · CIE-11» (`DiagnosisPicker`) | `DiagnosisPicker`, precargado con los diagnósticos del ingreso, en estándar y en SOAP (NO3: debajo de A) | `DiagnosisPicker` en estándar y SOAP (NO3), heredado de la nota anterior | igual | Corregido (antes el ingreso SOAP guardaba `diagnoses: []`). |
| Campos obligatorios | motivo + impresión diagnóstica + una orden | estándar: motivo + impresión diagnóstica (cliente y servidor); SOAP: S, O, A y P | estándar: algo escrito u ordenado; SOAP: S, O, A y P | igual | Corregido: el ingreso estándar pide lo mismo que la CE. |
| «Guía por sistemas» del examen físico | sí | sí | sí (estándar) | sí (estándar) | Corregido (`EXAM_GUIDE` en `clinicalConfig.ts`). |
| Set de órdenes | sí | sí | sí | sí | ✔ |
| «Guardar estas órdenes como set» | sí | sí | sí | sí | ✔ (los sets no guardan la velocidad de una infusión en ningún lugar: es igual en los cuatro). |
| Frecuencia de signos vitales | solo con ingreso marcado | sí | sí | sí | Justificado: sin ingreso no hay hoja de signos. |
| Indicaciones: escribir, Enter, editar, quitar | sí | sí | sí | sí | ✔ |
| Indicaciones: pegar una lista (una por línea) | **sí** (antes no) | sí | sí | sí | Corregido. |
| Indicaciones: subir y bajar | sí | **sí** (antes no) | sí (las nuevas) | sí (las nuevas) | Corregido. Las que bajan de la nota anterior se omiten o cambian (no se reordenan): es el cuadro Continúa/Nueva/Omitida. |
| Indicación fija «Ingreso a …» (NO1) | sí, número 1, con ingreso | — | — | — | Justificado: solo la CE ingresa al paciente. |
| «¿Agregar como examen?» al escribir un examen | sí | sí | sí | sí | ✔ |
| «¿Agregar como medicamento?» al escribir un fármaco | sí | **sí** (antes no) | sí | sí | Corregido. |
| Indicaciones y medicamentos activos (Continúa / OMITIR / Cambiar) | — | — (es la primera nota) | sí | sí | Justificado: solo existe cuando hay una nota anterior. |
| Ingestas y excretas (IE1) | lugar marcado debajo de Indicaciones | `afterIndications` de `NoteEditor` | ídem | ídem | Pendiente de IE1 (rama `ronda16-ingreso`): el lugar ya está en los cuatro. |
| Exámenes | `ExamsBlock` (con ingreso, lugar de la estancia) | `ExamsBlock` | `ExamsBlock` | `ExamsBlock` | ✔ |
| Medicamentos | formulario único (ME16) | formulario único | formulario único | formulario único | ✔ (ver tabla de abajo) |
| Dictado | HEA, examen físico, observaciones | HEA, examen físico, observaciones (estándar); S, O, A, P (SOAP) | cada campo de texto | cada campo de texto | ✔ (el motivo no se dicta en ninguno: es una línea). |
| Borrador «Se guarda solo» | sí (`useDraftSync('consulta')`) | sí (`useDraftSync('evolucion')`) | sí | sí | ✔ |
| Antecedentes del paciente en la nota | paneles a la izquierda | en el expediente («Hoja de hospitalización», «Expediente completo») | ídem | ídem | Justificado: en la estancia ya están en la hoja y no se repiten en cada nota. |

### Medicamentos (ME16)

Un solo componente, `MedicationForm` (`src/components/Medications.tsx`); el borrador y sus conversiones están en `src/lib/medForm.ts`. Ya no hay `MedForm` en `InpatientFile.tsx`.

| Campo | CE sin ingreso | CE con ingreso | Notas de obs./hosp. | Receta suelta / de egreso / corrección | Estado |
|---|---|---|---|---|---|
| Medicamento (vademécum o escrito), «Agregar al vademécum», agregar como nuevo | sí | sí | sí (antes sin «agregar como nuevo») | sí | Corregido |
| Presentación y concentración | sí | sí | **sí** (antes oculta) | sí | Corregido |
| Dosis, Vía escribible (ME17) | sí | sí | sí | sí | ✔ |
| Frecuencia + PRN con condición | sí (PRN con intervalo mínimo opcional) | sí | sí | sí | Corregido (antes la CE tenía PRN sin intervalo y la nota PRN con intervalo; ahora los dos) |
| «Infusión»: velocidad, unidad, «Hora de inicio» / «Ahora» | no | **sí** (llega a la hoja como infusión) | sí | no | Corregido (justificado «no» sin ingreso: ME13) |
| Primera dosis diferente (STAT), solo IV | sí (no con «Aplicar en la clínica») | sí, STAT | sí, «Ahora (STAT)» o fecha y hora | sí | Justificado: en la CE con ingreso la primera dosis es la llegada a la unidad |
| «Hora de la dosis» | no | no (la pone el servidor: llegada a la unidad) | sí | no | Justificado: sin cama todavía no hay horario |
| Nebulización | sí | sí | sí | sí | ✔ |
| Total de días | obligatorio para la receta | opcional («hasta nueva orden») | opcional | obligatorio | Justificado (receta vs. hoja) |
| Cantidad total | sí | sí | **sí** (nuevo, `hosp_meds.quantity`) | sí | Corregido |
| Indicaciones especiales | sí | sí | sí | sí | ✔ |
| «Aplicar en la clínica» | sí (solo STAT) | **no** (NO1: todo a la hoja) | no | no | Corregido |
| «No hay en la clínica (va a receta)» | con «Aplicar» | sí | sí | no | ✔ |
| Alergia y «ya está en la lista» | sí | sí | **sí** (antes solo alergia) | sí | Corregido |
| «Guardar y agregar otro», «Falta …» | sí | sí | sí | sí | Corregido (antes solo en la nota) |
| «Se verá así» | sí | sí | sí (siempre; antes solo infusión, STAT y nebulización) | sí | Corregido |
