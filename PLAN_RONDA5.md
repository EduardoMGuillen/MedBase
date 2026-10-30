# Ronda 5: plan

Rama `correcciones-emil-6`, un commit por punto con su código. Orden de la sección 5 del pedido: AD5 → MC1 → MC3 → OB3 → MC6 →
RE1 → OB1 → OB2 → AD2 → AD3 → AD1 → AD4 → MC2 → MC5 → MC4 → DM1.

El Word con las capturas no llegó con el pedido: trabajo con lo que describe el texto de cada punto.

## Lo que encontré

| Tema | Estado actual |
|---|---|
| Menú | `src/app/AppShell.tsx` (`NAV`), permisos en `src/lib/permissions.ts`. «Mi configuración» del médico es `/app/mi-configuracion` con la etiqueta «Configuración» (sólo `doctor`); los demás roles entran a la misma página desde su nombre (`/app/cuenta`, «Mi cuenta»). |
| Crónicos y administración | Administración **nunca** tuvo `followups.view`: el permiso nació en `c4e5e75` sólo para médico, enfermería y recepción, y el menú de antes no tenía crónicos. No hubo un retiro que revertir: se agrega. |
| Selector de vista | `ViewSwitch` en Inicio (`App.tsx`) **y** en el pie del menú (`AppShell.tsx`, `side__views`). |
| Nota de evolución | `NoteEditor` en `InpatientFile.tsx`: Set → Indicaciones → Medicamentos activos → Medicamentos → Exámenes. La consulta externa (`Consultation.tsx`) ya va Indicaciones → Medicamentos → Exámenes (EX1, ronda 4). |
| Datos generales (observación) | Mismo bloque para hospitalización y observación: primero «Ingreso a observación / Hoja de hospitalización», después «Datos del paciente»; en observación agrega `ConsultVitals` (signos de la preclínica). |
| Autorizaciones | Tabla `authorizations` (`pending`, `signed`, `refused`, `revoked`; `file_id` = hoja en papel). No hay forma de quitar una. La de hospitalización se genera sola (una por estancia, `ensureHospitalAuthorization`). |
| Hoja de medicamentos y alertas | `src/lib/alerts.ts` (panel y contadores de pestaña), `MedSheet`/`DoseModal` en `InpatientFile.tsx`. Ya existe «Registrar dosis» desde la alerta (abre la dosis exacta). Estados de dosis: `given`, `skipped` (No aplicada). «Omitido» hoy es sólo el de un medicamento suspendido. |
| Signos vitales | `src/app/VitalsSheet.tsx`: tarjetas, curva térmica con «Pulso sobre la curva», minigráficas de PA/FC/FR/SatO₂/glucometría/dolor y tabla plegable. Rangos en `src/lib/vitals.ts`. |
| Horarios | `Settings.tsx → Schedules`: una tarjeta por médico. `ScheduleEditor` ya calcula si hay cambios. |
| Umbrales críticos | `DEFAULT_CRITICAL` (`src/lib/exams.ts`, lista plana) + `clinics.critical_limits` (JSON). Se usan al cargar un resultado (`server/routes/exams.ts`) y en las alertas del expediente. |
| Catálogo de exámenes | Lista fija `EXAMS` en `src/lib/exams.ts` + `exam_catalog` (lo agregado por la clínica, sin editar ni archivar). Perfiles: `BASE_PROFILES` fijos + `exam_profiles` (del médico). «Mis exámenes frecuentes» = `MyExams.tsx` (estrellas en `staff.prefs.favExams`). Por eso «Perfil hepático» y «Perfil renal» salen dos veces en el diálogo. |
| Sets de órdenes | `order_sets` (O1). **Ya aceptan exámenes** (`{ exam }`, EX1). |
| Dictado | `src/components/Dictate.tsx` + `src/lib/dictation*.ts`: **no usa la Web Speech API**. Graba con `MediaRecorder` y transcribe con Whisper *small* dentro del navegador (transformers.js): la primera vez descarga de Hugging Face un modelo de 240 a 390 MB. |
| Datos demo | `server/demoData.ts` (`seedDemo`) + `npm run seed:demo` + tarea diaria `/api/cron/demo` (`vercel.json`, exige `CRON_SECRET`). Ya borra sólo pacientes de clínicas `is_demo`, con respaldo, y numera desde EXP-00001. |

## Causas raíz

**OB1.** El panel tiene razón: la dosis atrasada es la de **ayer** a las 17:25, y la que se registró fue la de **hoy** a las 09:25. Registrar
una dosis cierra sólo su propio casillero. La hoja abre en el día de hoy, así que el casillero de ayer no se ve. Para cerrarlo había que
volver al día anterior y entrar en «Corregir registros», o usar el botón de la alerta, que además pedía un «motivo del registro tardío».
La diferencia de conteo (1 toma pendiente en el panel y 3 «pend.» en la curva) venía de que el panel sólo miraba las últimas 24 horas y
la curva miraba todo el rango. Eso se corrigió en `main` antes de esta ronda (EN2: los pendientes no caducan). Ahora panel y curva usan
`missedTakes` igual.

**MC4.** Hay tres puntos frágiles:

1. La primera vez, el dictado descarga un modelo de 240 a 390 MB antes de transcribir. Con la conexión de una clínica eso tarda
   minutos, y si la pestaña o el diálogo se cierran se pierde la grabación.
2. En el procesador, Whisper *small* tarda varias veces lo que dura el audio.
3. `decodeRecording` crea un `AudioContext` a 16 kHz, que algunos navegadores rechazan.

Visto desde la pantalla, se toca el micrófono y no aparece texto. Emil pide la API del navegador: se cambia a
`SpeechRecognition`/`webkitSpeechRecognition` con resultados en vivo. La arquitectura queda con un «motor» intercambiable
(`src/lib/dictation.ts`), para conectar después un servicio de transcripción sin tocar los campos.

## Puntos

| Punto | Cambios |
|---|---|
| **AD5** | `followups.view` para administración (ve, avisa y marca hecho; programar uno nuevo sigue siendo clínico). |
| **MC1** | Se quita `side__views` del menú; el pie conserva «Vista de …» como texto. El selector queda sólo en Inicio, junto al saludo. |
| **MC3** | `NoteEditor`: Indicaciones → Exámenes → Medicamentos (con «Medicamentos activos» dentro, antes de «Agregar medicamento»). El borrador guarda los datos, no el orden: abre igual. |
| **OB3** | «Datos del paciente» primero y el bloque del ingreso después; sin `ConsultVitals`. Mismo componente en hospitalización: queda igual en las dos. |
| **MC6** | `DELETE /api/inpatient/authorizations/:id`: anulación lógica (`voided_at`, `voided_by`, `void_reason`), sólo si está `pending`, sin hoja en papel y sin firma. Médico y administración. La de hospitalización no se elimina: es obligatoria y se genera sola. |
| **RE1** | Menú «Mi configuración» para todo rol que no es de administración (médico, recepción, asistente). Recepción ve Datos personales, Preferencias, Seguridad y Mi actividad. Recepción no firma documentos: sin pestaña de firma. `PATCH /api/me` acepta nombre en documentos y preferencias de cualquier rol. |
| **OB1** | Diálogo de la dosis (desde el panel, de cualquier día): Administrada (hora real; si es tarde, «administrada con retraso»), No aplicada u Omitida, las dos últimas con motivo. Nuevo estado `omitted` en `hosp_doses`. La hoja muestra en el día de hoy las dosis atrasadas de días anteriores. Al guardar se recargan el expediente, el panel, las pestañas y el menú (`refresh` del store). |
| **OB2** | Una sola gráfica (temperatura) con ejes «°C» y «dd/mm hh:mm», más una tabla con todas las tomas (más reciente primero, encabezado fijo, primera columna fija a 390 px) y las tomas pendientes como filas. Fuera de rango con color y ↑/↓. Se quitan las minigráficas y «Pulso sobre la curva». Igual en el expediente impreso. |
| **AD2** | Selector de médico con buscador (`Nombre · Especialidad`). Un solo formulario; pregunta si hay cambios sin guardar; recuerda el último. El ejemplo del texto pasa a 12 h y «solo» va sin tilde. |
| **AD3** | Tabla `duty_roster (clinic_id, day, staff_id, assigned_by, assigned_at, removed_at, removed_by)`. Pestaña «Rol de turnos» después de «Horarios de médicos», sólo en clínica y para administración. Calendario mensual y, a 390 px, lista por día. Es informativo. |
| **AD1** | Grupos y analitos en `clinics.critical_groups` (JSON, con archivados). Por omisión, los de `src/lib/clinicalConfig.ts` («VALIDAR POR EMIL»). Migración: los valores de `critical_limits` se reparten en grupos sin cambiar números. El servidor calcula el umbral desde los analitos activos. La bitácora guarda el valor anterior y el nuevo. |
| **AD4** | `exam_catalog` pasa a ser la batería completa: la migración copia `EXAMS` a cada clínica (`base_key` conserva analitos, región y lado). Se agregan `archived_at`/`archived_by` y la edición. Pestaña «Catálogo de exámenes» (administración; en el consultorio, el titular en su vista de administrador). |
| **MC2** | `order_sets.kind = 'exams'`: un solo sistema de sets. «Mis sets de exámenes» reemplaza «Mis exámenes frecuentes» (las estrellas quedan guardadas). Los 5 perfiles fijos se entregan una vez como sets editables a cada médico; también los perfiles propios de `exam_profiles`. |
| **MC5** | El diálogo usa el catálogo activo de la clínica y «Mis sets». «Guardar selección como set». «Agregar "…" como examen externo»: texto libre, etiqueta «Externo», no va a ninguna bandeja y sí sale en la orden impresa. |
| **MC4** | Motor `browser` con Web Speech API. Mensajes de error en español, aviso de privacidad la primera vez, texto en el lugar del cursor. Se aplica a todos los campos con micrófono. |
| **DM1** | Se ajusta `seedDemo` a los mínimos del pedido: Fúnez de lunes a domingo, 08:00–12:00 y 13:00–17:00, con turno todo el mes; ≥ 6 citas hoy por médico; casos de OB1, OB2 y MC6; resultado crítico. Se agregan `--confirmar` y una prueba con los conteos. |

## Dependencias

AD4 va antes que MC2 y MC5. MC2 va antes que MC5. AD1 usa el catálogo de AD4 para sugerir nombres. DM1 va al final.
