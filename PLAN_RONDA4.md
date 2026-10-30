# Ronda 4 (ideas de la comparación): plan

Misma rama que la ronda 3 (`correcciones-emil-5`). Va intercalada: AN1 antes de EX1, EX1 en lugar de MC4 y RG1 al final.

## Lo que encontré

- **MC4 («Estudios»)**: no existía. Los exámenes se pedían como texto en las indicaciones, y los resultados se suben
  como archivos (`attachments.category = 'lab'` o `'imaging'`) en la pestaña «Laboratorios» de la estancia. No hay
  nada que fusionar: EX1 se construye directo y **no** habrá sección «Estudios».
- **Firma de notas**: la consulta y las notas (ingreso, evolución, procedimiento, egreso y enfermería) se crean
  firmadas: no hay ruta para editarlas. El borrador de la consulta vive sólo en el navegador (`localStorage`); las
  notas de evolución no tienen borrador.
- **Recorrido**: existe uno propio (`src/components/Tour.tsx`, `src/lib/tours.ts`) que sólo señala el menú y se ve
  una vez (`staff.prefs.tourDoneAt`). Se amplía ese mismo componente en lugar de agregar driver.js: ya resalta el
  elemento, oscurece el resto y se acomoda a 390 px, y así no se suma una dependencia.

## AN1. Borrador, nota firmada inmutable y adenda

- **Esquema**: tabla `note_drafts (id, clinic_id, user_id, scope, ref_id, data, updated_at)` única por
  `(user_id, scope, ref_id)`. Tabla `addenda (id, clinic_id, target_kind, target_id, kind, corrects, text, author_id,
  author_role, at)`, sólo agregar (trigger). Triggers `BEFORE UPDATE OR DELETE` en `consultations` y `hosp_notes` que
  rechazan cambios a los campos clínicos (los vínculos técnicos, como `prescription_id`, siguen permitidos).
- **Rutas**: `GET/PUT/DELETE /api/drafts/:scope/:ref`; `POST /api/addenda`; `GET` dentro de cada expediente;
  `PATCH /api/consultations/:id` y `PATCH /api/inpatient/notes/:id` responden 409 («La nota está firmada…») y dejan
  la bitácora del intento.
- **Cliente**: `useServerDraft` (guarda cada 3 s en el servidor y al instante en el navegador); etiqueta «Borrador ·
  Guardado hace un momento» y «Firmada por … el …». `Addenda` debajo de cada nota (consulta, evolución, procedimiento,
  egreso y enfermería) con «Agregar adenda»; «Con adenda» en las listas. Si corrige un medicamento, sugiere anular la
  receta y emitir otra.
- **Permisos**: médicos a notas médicas; enfermería (y asistente) a notas de enfermería; médicos a notas de
  enfermería sólo «Información adicional».
- **Impresión**: `FullRecord.tsx` pone las adendas debajo de su nota. La epicrisis copia las adendas de la nota de
  egreso al emitirse.

## EX1. Exámenes

- **Catálogo**: `src/lib/exams.ts` con Laboratorio e Imagen y gabinete (EKG en gabinete), perfiles base, áreas
  destino. Tabla `exam_catalog` (agregados por la clínica) y `exam_profiles` (perfiles de la clínica y de cada médico).
- **Pedidos**: tabla `exam_orders (id, clinic_id, patient_id, consultation_id, hospitalization_id, note_id, group
  ('lab'|'imaging'), name, region, side, indication, priority, place ('clinic'|'external'), area ('lab'|'imaging'|
  'nursing'|'none'), status, ordered_by, ordered_at, …)` y `exam_events` (cada cambio de estado con quién y cuándo).
  Resultados: `exam_results (exam_id, values JSON, report, file_ids, at, by)`; `reviewed_at/by` en el pedido.
- **Estados**: Laboratorio: ordenado → muestra tomada → resultado listo → revisado. Imagen y gabinete: ordenado →
  realizado → informe listo → revisado. Cancelado con motivo.
- **Áreas de servicio**: `clinics.has_lab`, `clinics.has_imaging` (no por defecto). El área se guarda al pedir. Las
  alertas van al rol del área si existe y está asignado; si no, a enfermería.
- **Dónde**: consulta externa (Indicaciones → Medicamentos → Exámenes), notas de evolución (Estándar y SOAP), sets de
  órdenes (`{ exam }`), nota de egreso («Exámenes pendientes al alta»).
- **Órdenes impresas**: `src/app/ExamOrder.tsx`, una por grupo, con membrete, paciente, indicación, firma y sello.
- **Bandeja**: inicio de enfermería, separada por grupo, urgentes primero.
- **Resultados**: analitos con unidad y rango (alto/bajo), o archivo; umbral crítico configurable → alerta crítica.
  «Resultado nuevo» al médico que lo pidió.
- **Expediente**: «Laboratorios» pasa a «Exámenes» (Laboratorio / Imagen y gabinete), también en la impresión y en el
  historial del paciente.
- **Migración**: cada archivo `lab`/`imaging` de una estancia pasa a ser un examen con su resultado (el archivo no se
  mueve ni se borra; el examen lo referencia).

## RG1. Recorridos

- `src/tours/` con un archivo por rol (`recepcion.ts`, `enfermeria.ts`, `medico.ts`, `administracion.ts`,
  `consultorio.ts`) y uno de mini-recorridos por pantalla (`pantallas.ts`). Sólo texto y `data-tour`.
- `Tour` ampliado: navega entre pantallas (`route` en el paso), espera a que el elemento aparezca y lo salta si no
  existe, «Paso 4 de 12», Anterior, Siguiente, Saltar; recuerda en `staff.prefs.tours` si se terminó o en qué paso
  iba («¿Continuar donde lo dejaste?»).
- Botón «?» en la barra superior («Ver el recorrido») y «?» en nota de consulta, expediente de hospitalización, signos
  vitales y cobro.

## Permisos (sección 4)
| Función | Permiso |
|---|---|
| Ordenar exámenes | `exams.order` (médico). |
| Estados y resultados | `exams.process` (médico, enfermería, asistente; y en el futuro laboratorio e imágenes). |
| Revisar resultado | `exams.order`. |
| Perfiles | el médico los suyos; administración los de la clínica (`settings.manage`). |
| Áreas de servicio | `settings.manage`. |
| Adenda | médico a notas médicas; enfermería a notas de enfermería. |
| Recorrido | todos. |
