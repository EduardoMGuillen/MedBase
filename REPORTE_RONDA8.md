# Ronda 8: reporte

Fuente: `~/Downloads/clinara correcciones ronda 8.docx` (13 puntos con 12 capturas). Rama `correcciones-emil-9`. Esquema v57.

## Lo que no llegó

- **El `.md` de umbrales críticos con sus fuentes no estaba en la máquina.** El mecanismo ya está listo:
  - la app trae los umbrales;
  - cada analito tiene su campo `source`;
  - la clínica los cambia y puede volver al de la app;
  - los umbrales nuevos de la app llegan solos a cada clínica.

  Falta cargar la lista en `DEFAULT_CRITICAL_GROUPS` (`src/lib/clinicalConfig.ts`). Mientras tanto, cada umbral dice
  «fuente pendiente de la lista de Emil».
- **El cuadro de la nota Estándar no tenía nombre.** Lo llamé **«Evolución»**: cómo ha seguido el paciente desde la nota
  anterior y lo que refiere. Si Emil quiere otro nombre, se cambia en `NoteEditor` y en `NoteText`.

## Puntos

| Punto | Qué se hizo | Dónde |
|---|---|---|
| Consulta externa (administración) | Filtro por médico y orden por hora de la cita, tiempo de espera o médico (con encabezado por médico). Se recuerda en el navegador. | `WaitingRoom.tsx` |
| Umbrales ya establecidos | La app trae los suyos; lo guardado por la clínica manda; se marca «Cambiado por la clínica», con «Volver al de la app» y la fuente. | `clinicalConfig.ts` (`mergeCriticalGroups`), `CriticalThresholds.tsx`, `routes/exams.ts` |
| Menú | «Configuración» con tuerca, encima del perfil, para todos los roles. El perfil ya no es botón. La de administración pasa a «Configuración de la clínica». | `AppShell.tsx`, `MyConfig.tsx`, tours |
| Incongruencia (hospitalizado en sala) | Un paciente internado no puede registrar llegada, pasar a consulta ni entrar sin cita (409). Al internarlo se cancelan sus otras citas abiertas de ese día. La migración v57 corrige lo que ya estaba mal y la demo también lo aplica. | `server/stayVisits.ts`, `app.ts`, `routes/inpatient.ts`, `db.ts`, `demoData.ts`, `WaitingRoom.tsx` |
| Rayos X sin informe obligatorio | En Rayos X, «Realizado» saca el estudio de pendientes y de la bandeja, y el médico lo puede marcar revisado. El informe se agrega si llega (opcional). | `lib/exams.ts` (`reportOptional`, `canReview`), `routes/exams.ts`, `ExamsTab.tsx` |
| Nota de evolución Estándar | Cuadro «Evolución» entre diagnósticos y examen físico. Los diagnósticos bajan de la nota anterior (o del ingreso) y se editan. | `InpatientFile.tsx`, `NoteColumns.tsx`, `routes/inpatient.ts`, `mappers.ts` |
| Medicamentos | El formulario ya no se corta a la derecha. La frecuencia tiene «Infusión continua», que pide la velocidad del goteo en ml/h o ml/min. | `InpatientFile.tsx` (`MedForm`), `clinical.css`, `medOrders.ts`, `lib/inpatient.ts` |
| Primera dosis distinta | Casilla «La primera dosis es distinta». Se lee «Ceftriaxona 2 g IM STAT y luego 1 g IM c/12h». Es una sola orden; en la hoja, enfermería ve cuál dosis toca. Sin marcar la casilla, todo funciona como antes. | ídem (`loadingDose`, `doseAt`) |
| Laboratorios desplegables | Cada examen se abre y se cierra (abiertos por omisión: pendientes y críticos sin revisar). Hay búsqueda, orden por fecha (con el día como encabezado) o pendientes primero, y «Expandir/Contraer todo». | `ExamsTab.tsx`, `modules.css` |
| Orden de exámenes externos | Si la nota pide exámenes externos, al firmarla se abre la orden para imprimir o mandar por WhatsApp. Cada nota firmada tiene «Imprimir orden» y la pestaña Exámenes, «Órdenes para imprimir». | `routes/inpatient.ts` (`examBatch`), `NoteColumns.tsx`, `ExamsTab.tsx` |
| Referencia a otro centro | Desde observación, hospitalización y consulta externa (ver abajo). | `routes/referrals.ts`, `Referral.tsx`, `ConsultNote.tsx`, `InpatientFile.tsx` |

## Referencia a otro centro

Contenido de la hoja:
- **Como la epicrisis:** diagnóstico de ingreso, diagnóstico de egreso (el vigente), HEA y tratamiento recibido (cada
  medicamento con las dosis aplicadas, más las indicaciones).
- **Nuevo:** motivo de la referencia. El formulario lo exige.
- **Datos de traslado:**
  - a dónde y a qué servicio;
  - tipo (emergencia, urgente o programada);
  - signos vitales y condición al referir;
  - acompañante, transporte y con quién se coordinó;
  - constancia de que se informó al paciente, con su firma.
- **Contrarreferencia:** sección «Respuesta» en blanco, para el establecimiento que recibe.

Al emitirla desde una estancia:
- Si el paciente sale de la clínica, la estancia se cierra como «Referido». Es lo que viene marcado.
- Si sigue internado (por ejemplo, va a un estudio), se desmarca y la estancia queda abierta.

Las referencias de antes se siguen imprimiendo como entonces.

**Apartado legal (verificado):**
- **Sistema Nacional de Referencia y Respuesta (SINARR):** los Lineamientos de Referencia y Respuesta de la SESAL son
  de 2016. Según OPS/OMS, son obligatorios para prestadores públicos y no públicos.
- **Código de Ética del Colegio Médico de Honduras:**
  - arts. 14 a 18: secreto médico, y confidencialidad también en los sistemas informáticos;
  - art. 31: informar al paciente o a su responsable.

**No verificado:** no encontré el texto oficial del formato de la SESAL (solo una copia no oficial). Los campos siguen las
fuentes anteriores y la NOM-004 de México, numeral 6.4. Conviene que Emil o el Colegio confirmen el formato oficial.

## Pruebas

- `server/ronda8.test.ts`: 8 pruebas nuevas, todas pasan.
- Suite completa: 246 de 248 pasan. Las 2 que fallan (`demoData.test.ts` y `api.test.ts`, «fetch failed») ya fallaban
  igual en `main` antes de esta ronda, y pasan cuando se corren solas: fallan por la carga de la suite en paralelo.
- `tsc` y `vite build` sin errores. El lint solo da advertencias que ya existían.
- Revisado en el navegador, sobre la demo local regenerada:
  - menú;
  - consulta externa ordenada por médico;
  - nota Estándar con los diagnósticos de la nota anterior y el cuadro de Evolución;
  - infusión y primera dosis distinta, sin desborde;
  - exámenes desplegables;
  - formulario de la referencia.
