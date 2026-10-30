# Reporte: ronda 5

Rama `correcciones-emil-6`, integrada a `main`. Un commit por punto, con su código en el mensaje (`git log`). Plan previo en `PLAN_RONDA5.md`.

Verificación final:

- `npx tsc -b` sin errores.
- `oxlint` con los mismos 34 avisos de antes (ninguno nuevo).
- `npm test`: 205 de 205 pruebas.
- `npm run build` correcto.
- Cada punto se revisó en el navegador (Edge) con el rol que corresponde, en escritorio y a 390 px, sin errores en la consola.

El Word con las capturas no llegó con el pedido: trabajé con lo que describe el texto de cada punto.

## 1. Estado por punto

| Punto | Estado | Archivos principales | Cómo probarlo |
|---|---|---|---|
| **AD1** Umbrales por grupos | Hecho | `src/lib/clinicalConfig.ts` (valores por omisión, «VALIDAR POR EMIL»), `src/app/CriticalThresholds.tsx`, `server/routes/exams.ts` (`PUT /api/settings/critical-groups`), migración v47 | Roberto → Configuración → Áreas de servicio → grupo «Hemograma» → «Agregar analito»: Hematocrito, %, 20 y 60 → «Guardar umbrales» y recarga. Un límite vacío dice «No aplica». Archivar y «Ver archivados». En la bitácora: «Hematocrito (%) a «Hemograma»: menor de 20, mayor de 60». |
| **AD2** Un médico a la vez | Hecho | `src/app/Settings.tsx` (`Schedules`), `src/app/ScheduleEditor.tsx` | Configuración → Horarios de médicos: lista con buscador («Pa» encuentra al Dr. Paz) y un solo formulario. Cambia un horario sin guardar y toca otro médico: pregunta Guardar / Descartar / Cancelar. En el consultorio no hay lista. |
| **AD3** Rol de turnos | Hecho | `src/app/Roster.tsx`, `server/routes/roster.ts`, migración v46 | Configuración → «Rol de turnos» (después de Horarios). Toca el día 3 y marca a la Dra. Herrera; el 4, al Dr. Paz; el 5, a la Dra. Zúniga y a otro médico; desmarca uno. Cambia de mes y vuelve. A 390 px es una lista de días. No aparece en el consultorio. |
| **AD4** Catálogo de exámenes | Hecho | `src/app/ExamCatalogAdmin.tsx`, `server/routes/exams.ts`, `server/db.ts` (`ensureExamCatalog`), migración v48 | Configuración → «Catálogo de exámenes»: «Agregar examen» → Dímero D (Laboratorio) → «Editar» a «Dímero D cuantitativo» → «Archivar». Cada paso queda en la bitácora. Ya no se ofrece al ordenar. |
| **AD5** Crónicos para administración | Hecho | `src/lib/permissions.ts` | Roberto ve «Crónicos y seguimientos» en Pacientes, avisa y marca hechos (con su nombre en la bitácora). Programar uno nuevo sigue siendo del médico. |
| **RE1** Mi configuración de recepción | Hecho | `src/app/MyConfig.tsx`, `src/app/AppShell.tsx`, `server/routes/me.ts` | Sofía Mejía → «Mi configuración»: Datos personales, Preferencias («La agenda se abre en»), Seguridad y Mi actividad. Por URL no llega a Mi horario ni a la configuración de la clínica. |
| **OB1** Pendientes que no se limpiaban | Hecho | `src/app/InpatientFile.tsx` (hoja y diálogo de la dosis), `src/lib/alerts.ts`, `server/routes/inpatient.ts`, migración v45 | Carmen Ríos → observación de la paciente con Solución Hartmann → barra: «1 dosis atrasada (… del día anterior)» → «Registrar dosis»: Administrada (con retraso), No aplicada u Omitida → la línea se va sin recargar. La hoja de hoy también muestra la dosis atrasada de ayer. |
| **OB2** Curva térmica y tabla | Hecho | `src/app/VitalsSheet.tsx`, `src/app/FullRecord.tsx`, `src/clinical.css` | Signos vitales: una sola curva (eje en °C, fecha y hora) y la tabla de tomas, la más reciente arriba, con ↑/↓ y las pendientes como filas con «Registrar signos». El filtro cambia las dos. Igual en el expediente impreso. |
| **OB3** Datos generales | Hecho | `src/app/InpatientFile.tsx` | Observación → Datos generales: primero «Datos del paciente», después el ingreso y sin signos vitales. Igual en hospitalización (mismo componente). |
| **MC1** Selector de vista | Hecho | `src/app/AppShell.tsx`, `src/components/ViewSwitch.tsx` | Dra. Ana López: el selector sólo está en Inicio, arriba del saludo. El pie del menú dice «Vista de médico». |
| **MC2** Mis sets de exámenes | Hecho | `src/app/MyExams.tsx`, `src/components/Exams.tsx`, `server/routes/orderSets.ts`, migración v49 | Dra. Herrera → Mi configuración → «Mis sets de exámenes» (los 5 perfiles de antes, suyos) → «Crear set» «Mi control prenatal» con 6 exámenes. El Dr. Paz no lo ve. Editar, duplicar y archivar. |
| **MC3** Orden de la nota de evolución | Hecho (con una salvedad) | `src/app/InpatientFile.tsx` (`NoteEditor`) | Nueva nota de evolución: Indicaciones → Exámenes → Medicamentos, con «Medicamentos activos» dentro. La consulta externa no cambió: ver «Decisiones propias». |
| **MC4** Dictado por voz | Hecho (falta probarlo con voz real) | `src/lib/dictation.ts`, `src/components/Dictate.tsx` | En Chrome o Edge, con micrófono: «Dictar Examen físico» → aviso de privacidad la primera vez → «Escuchando…» → el texto aparece donde estaba el cursor. Micrófono también en la consulta, el procedimiento, la nota de enfermería y el egreso. |
| **MC5** Ordenar exámenes | Hecho | `src/components/Exams.tsx`, `src/app/ExamOrder.tsx`, `server/routes/exams.ts` | «Ordenar examen»: «Mis sets» y el catálogo activo. Busca «Panel de alergias» → «Agregar «Panel de alergias» como examen externo»: queda con la etiqueta «Externo», no llega a la bandeja y sale en la orden impresa. «Guardar selección como set». |
| **MC6** Eliminar autorización sin firmar | Hecho | `src/app/Authorization.tsx`, `server/routes/inpatient.ts` (`DELETE /api/authorizations/:id`), migración v44 | Dra. Herrera → Hospitalizados → Anexos → una autorización quirúrgica «Pendiente de firma» → «Eliminar» → confirma. La firmada, la de «No autoriza» y la que tiene hoja en papel no tienen el botón y el servidor las rechaza. |
| **DM1** Datos demo | Hecho en el código; falta correrlo en la base del sitio | `server/demoData.ts`, `server/seed-demo.ts`, `server/demoData.test.ts` | Ver las secciones 2 y 5. |

## 2. Base de datos y migraciones

Todo es aditivo: no se borró ninguna columna ni registro clínico.

| Versión | Cambio |
|---|---|
| v44 (MC6) | `authorizations.archived_by`. «Eliminar» archiva la autorización (`archived_at`, `archived_by` y `archived_reason`). |
| v45 (OB1) | `hosp_doses.status` admite `omitted` (Omitida), además de `given` y `skipped`. |
| v46 (AD3) | Tabla `duty_roster` (clínica, día, médico, quién asignó y quitó). Quitar no borra la fila. |
| v47 (AD1) | `clinics.critical_groups` (grupos y analitos, con archivados). Los umbrales de `critical_limits` pasan a grupos sin cambiar números; esa columna se conserva sin editarse. |
| v48 (AD4) | `exam_catalog`: `base_key`, `archived_at`/`archived_by` y `updated_at`/`updated_by`; `created_by` deja de ser obligatoria. La lista fija se copia a cada clínica. |
| v49 (MC2) | `order_sets.kind` (`orders` o `exams`): un solo sistema de sets. Los sets de exámenes son del médico y no se comparten. |

**Reinicio de datos demo (DM1).** El comando exacto es:

```
npm run seed:demo -- --confirmar
```

En la base del sitio (Neon) es:

```
npm run seed:demo -- .env.neon.local --confirmar
```

También vale `CONFIRMAR_DEMO=si`. Sin la confirmación no hace nada. El script hace esto:

1. Sólo trabaja sobre las clínicas con `clinics.is_demo`.
2. Guarda un respaldo en `demo_backups` y en `data/backups/demo-<fecha>.json`.
3. Borra los pacientes de esas clínicas y todo lo que cuelga de ellos, incluida su bitácora.
4. Genera los nuevos, relativos al día en que se corre.
5. Deja un solo evento «Reinicio de datos demo …» con los conteos de antes y después.

No toca usuarios, roles, firmas, configuración, servicios, formas de pago, camas, vademécum, catálogo de exámenes, umbrales, horarios (salvo el del Dr. Fúnez), rol de turnos ni sets.

La tarea diaria de Vercel (`/api/cron/demo`, 05:00 hora de Honduras) hace lo mismo.

**«Restablecer demo» de la plataforma.** El botón vaciaba **toda** la base, también las clínicas reales. Ya no está, y la ruta sólo regenera los pacientes de las clínicas demo.

## 3. Valores por omisión que usé (sección 6) y decisiones propias

Usé todos los de la sección 6 tal cual (1 a 21).

**Decisiones propias:**

- **AD1**: la tabla de umbrales sigue a la derecha de «Áreas de servicio», como le gustaba a Emil. Un analito no puede estar dos veces (tiene un solo umbral). Los nombres se sugieren de los analitos y exámenes del catálogo.
- **AD4**: el catálogo empieza con la lista exacta de antes. Un examen de la lista renombrado conserva sus valores de referencia. «Perfil hepático» y «Perfil renal» quedan como exámenes; como sets, aparecen aparte en «Mis sets».
- **AD5**: administración ve, avisa y marca hechos los seguimientos, igual que enfermería. Programar uno nuevo sigue siendo clínico.
- **RE1**: la preferencia de recepción es con qué vista se abre la agenda (Día, Semana o Mes); el médico también la tiene. Recepción no firma documentos, así que no tiene la pestaña de firma.
- **OB1**: «Omitida» es la dosis que se decidió no dar y «No aplicada», la que no se pudo dar; las dos piden motivo. Una dosis de hace más de 24 horas sigue pidiendo el motivo del registro tardío (regla de la ronda 2). El aviso de una dosis no aplicada u omitida se va con la siguiente nota del médico.
- **MC3**: en la **consulta externa** el orden sigue siendo Indicaciones → Medicamentos → Exámenes. Es otro componente, y en la ronda 4 Emil pidió explícitamente ese orden. Si lo quiere igual que en la nota de evolución, es un cambio pequeño.
- **MC4**: se retiró el modelo Whisper que corría dentro del navegador (ver la causa en la sección 6). El motor quedó intercambiable en `src/lib/dictation.ts`.
- **MC5**: lo externo **no va a ninguna bandeja**, tampoco en hospitalización. En la ronda 4 enfermería lo coordinaba; ahora manda la regla de esta ronda. Un examen que no está en el catálogo activo, o que se archivó, el servidor lo guarda como externo aunque llegue como «En la clínica».
- **MC6**: la autorización **de hospitalización** no se elimina, porque la app la genera sola con el ingreso. Administración no tiene acceso a Anexos (no ve expedientes): puede eliminar por la API, pero en la práctica lo hace el médico.
- **DM1**:
  - Cada médico tiene al menos 8 citas hoy en todos los estados (atendida, no llegó, en consulta, en preclínica, en sala, confirmada y agendada).
  - Tiene al menos 3 citas cada día que atiende en los próximos 14 días. No se tocó el horario de nadie, salvo el del Dr. Fúnez.
  - En el consultorio hay dos pacientes sin cita en sala.
  - Los estados de hoy se reparten por orden de las citas, no por la hora real (la demo se prepara a las 05:00).

## 4. Lo que debe validar Emil (o un abogado o clínico)

- `src/lib/clinicalConfig.ts` (marcado **VALIDAR POR EMIL**): rangos de signos vitales (adulto, pediátricos e imposibles), banda térmica (36.0 a 38.0 °C) y umbrales críticos por grupo. Los números de los umbrales son los mismos que había; sólo se agruparon y se les puso unidad.
- **Aviso de privacidad del dictado** (`DICTATION_PRIVACY` en `src/lib/dictation.ts`): «El dictado envía el audio al servicio de voz del navegador (Google en Chrome, Microsoft en Edge) para convertirlo en texto. No se guarda en Clinara. Si no lo deseas, no dictes nombres, identidades ni otros datos que identifiquen al paciente.»
- **Orden de exámenes con externos**: el examen externo sale con la etiqueta «EXTERNO» y «Se realiza fuera de la clínica».
- **Datos clínicos de la demo**: casos, dosis y valores de laboratorio. En esta ronda las unidades del hemograma pasaron a ×10³/µL, y el caso de dengue tiene plaquetas de 38 000 como resultado crítico.

## 5. Conteos de DM1

Corrida en una base local de verificación el 30/10/2026. La base del sitio no la toqué: ver la nota al final.

| | Pacientes | Citas | Consultas | Estancias | Seguimientos | Cobros |
|---|---|---|---|---|---|---|
| Antes (base nueva con la demo original) | 81 | 530 | 381 | 11 | 13 | 373 |
| Después | 152 | 3134 | 893 | 14 | 31 | 812 |

**Clínica Santa Brígida**: 120 pacientes, el primero EXP-00001, sin duplicados.

| Médico | Citas hoy | En sala | Pacientes propios |
|---|---|---|---|
| Dr. Daniel Fúnez Castillo | 18 | 4 | 120 (medicina general, todas las edades) |
| Dra. Lucía Herrera | 14 | 3 | 89 |
| Dra. Mariela Zúniga | 14 | 4 | 51 |
| Dr. Andrés Paz | 12 | 3 | 31 |

- Citas: 58 hoy y 14 personas en sala de espera. Los estados de hoy son atendida, no llegó, en consulta, en preclínica, en sala, confirmada y agendada.
- Estancias: 4 en observación con 3 médicos distintos, 6 hospitalizados en camas distintas y 3 egresados con epicrisis.
- Seguimientos: 23 (20 crónicos), 17 sin enviar.
- Casos de prueba:
  - **OB1**: observación con Solución Hartmann c/8h, una dosis atrasada de ayer y una «No aplicada» (paciente fuera del servicio). Otra observación con todas las dosis al día. Las dos tienen tomas pendientes y registradas.
  - **OB2**: hospitalizados con signos de 1 a 6 días; al menos 3 tienen 3 días o más.
  - **Resultado crítico**: el hemograma del dengue, con plaquetas de 38 000.
  - **MC6**: 1 autorización firmada en pantalla (con PDF y huella), 2 quirúrgicas pendientes más 1 de hospitalización pendiente, 1 «No autoriza» y varias con hoja en papel.
- Dr. Fúnez: existe una sola vez, atiende de lunes a domingo de 08:00 a 12:00 y de 13:00 a 17:00, y tiene turno todos los días de octubre.

**Consultorio Dra. Ana López**: 32 pacientes (desde EXP-00001), 16 citas hoy, 5 en sala, 1 en observación, 8 seguimientos (6 crónicos) y sin hospitalización.

**Respaldo**: `data/backups/demo-<fecha y hora>.json` (por ejemplo, `demo-2026-10-30T22-09-17-398Z.json`) y la tabla `demo_backups`, que guarda los tres últimos.

**WhatsApp**: la app no envía mensajes reales. Los recordatorios de la demo sólo se generan, y «Avisar» deja en la bitácora «Simuló el envío por WhatsApp».

**Nota sobre el sitio**: que Emil siga viendo 79 expedientes con nombres de prueba indica que la tarea diaria no está corriendo en Vercel. Exige la variable `CRON_SECRET`; sin ella responde 401 sin avisar. Hay que definirla en Vercel, o correr una vez `npm run seed:demo -- .env.neon.local --confirmar` contra la base del sitio.

## 6. Causas raíz

**OB1.** El panel tenía razón: la dosis atrasada era la de **ayer**, y la que se registró fue la de **hoy**. Registrar una dosis cierra sólo su propio casillero. La hoja abría en el día de hoy, así que el casillero de ayer no se veía. Para cerrarlo había que ir al día anterior y entrar en «Corregir registros», o usar el botón de la alerta, que además pedía un motivo aunque la dosis tuviera menos de 24 horas.

La diferencia entre «1 toma pendiente» en el panel y 3 «pend.» en la curva venía de que el panel sólo miraba las últimas 24 horas. Se corrigió antes de esta ronda, y ahora el panel, la curva y la tabla usan la misma regla.

Ahora:

- La hoja de hoy muestra las dosis atrasadas de días anteriores.
- El diálogo es el de esa dosis exacta, con tres resultados.
- Al guardar se recalculan el panel, las pestañas, el menú y el inicio, sin recargar.

**MC4.** El dictado no usaba la API del navegador. Grababa el audio y lo transcribía con Whisper *small* dentro del navegador, lo que tenía tres problemas:

1. La primera vez descargaba un modelo de 240 a 390 MB.
2. En una computadora sin tarjeta gráfica tardaba más que lo dictado.
3. Si se cerraba la nota durante la descarga, se perdía lo grabado.

Visto desde la pantalla, se tocaba el micrófono y no aparecía nada. Ahora usa `SpeechRecognition`/`webkitSpeechRecognition` con resultados en vivo, `es-HN` (con otras variantes de español de respaldo) y mensajes en español para cada falla.

Lo probé en Edge con un micrófono simulado: aparece «Escuchando…» y, sin soporte, el aviso correspondiente. **El reconocimiento con voz real hay que probarlo en un equipo con micrófono**: el navegador automatizado no puede hablarle.

## 7. Errores o mejoras fuera de la lista (no implementados)

- **Nombre corto del personal**: `shortStaff` toma el **último** apellido, así que el Dr. Daniel Fúnez Castillo aparece como «Dr. Castillo» en alertas y bitácoras. En Honduras se usa el primer apellido. En el rol de turnos ya sale «Dr. Fúnez»; en el resto de la app conviene corregirlo.
- **Insignia «Observación» del menú**: cuenta pacientes en observación, no pendientes. Por eso no baja al registrar una dosis; las que sí bajan son la de la pestaña y la de «Hospitalizados» (órdenes sin revisar).
- **Consulta externa y nota de evolución con distinto orden**: Indicaciones → Medicamentos → Exámenes en una, e Indicaciones → Exámenes → Medicamentos en la otra (ver MC3).
- **Perfil hepático y Perfil renal**: existen como examen y como set inicial con el mismo nombre. Ya no están en la misma fila, pero convendría renombrar los sets (por ejemplo «Función hepática completa»).
