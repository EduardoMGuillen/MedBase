# Perfil «Consultorio» (médico independiente): plan de implementación

Rama prevista: `perfil-consultorio`, un commit por punto. Base: `correcciones-emil-2` (80 pruebas, typecheck limpio, 37 advertencias de lint).

## 0. Qué se quiere

Hoy Clinara sirve a una clínica: varios médicos, recepción, enfermería, administración y hospitalización con camas. Se agrega un segundo tipo de cuenta, el **consultorio**: un médico independiente que atiende en su propio consultorio, solo o con una asistente.

El consultorio usa la misma aplicación y la misma base de datos, sin copiar código, pero sólo ve lo que le sirve:
- el médico es también el dueño de la cuenta (configura, cobra, ve sus reportes);
- no hay módulos ni textos que suponen varios médicos o un hospital;
- la receta, las constancias y la reserva en línea salen con su nombre;
- si el consultorio crece y contrata a otro médico, se convierte en clínica sin migrar datos.

## 1. Diagnóstico (cómo está hecho hoy)

| Tema | Hoy en el código | Qué choca con un consultorio |
|---|---|---|
| Tipo de cuenta | `clinics` es la única unidad (multiclínica desde la v6). Sólo «Administración de Clinara» (`superadmin`) crea clínicas, siempre con un usuario `admin` (`server/routes/platform.ts`). | No existe la noción de consultorio. Un médico solo necesitaría dos usuarios (admin y médico) para configurar y atender. |
| Permisos | Fijos por rol en `src/lib/permissions.ts` (`ROLE_PERMISSIONS`). El servidor manda `ROLE_PERMISSIONS[user.role]` en la sesión (`server/app.ts:164`) y valida con `need()` y 16 llamadas a `can(user.role, …)`. | El médico no puede configurar la clínica, ver reportes, personal ni bitácora. Hay que poder dar permisos según el rol **y** el tipo de cuenta. |
| Menú | `src/app/AppShell.tsx` filtra por permiso y tiene reglas por rol (`role === 'doctor'` oculta Caja). | En un consultorio el médico sí cobra. Observación y Hospitalizados aparecen aunque no haya camas. |
| Varios médicos | «Mis pacientes / Toda la clínica» y «Atender» al paciente de otro médico (`WaitingRoom.tsx`); filtro por médico y color por médico en `Agenda.tsx`; «Mías / Toda la clínica» en `Prescriptions.tsx`; «por médico» en `Reports.tsx`; selector de médico en la reserva en línea (`Booking.tsx`). | Con un solo médico estos controles sobran y confunden. |
| Hospitalización | Camas, tablero, ingreso, checklist de enfermería, notas de enfermería, alertas de órdenes. | Un consultorio no tiene camas. Sí puede necesitar **observación corta** (hidratar, aplicar un medicamento): «Aplicar en la clínica» depende de ella. |
| Documentos | Receta, constancias y autorizaciones llevan el nombre y logo de la clínica (`settings.name`) y, aparte, el médico. | En un consultorio el encabezado es el médico («Dra. Ana López, Medicina interna, consultorio …»). |
| Demo | Dos clínicas: Santa Brígida y San Lucas (`src/lib/seed.ts`). | No hay un consultorio para probar ni para mostrar. |

## 2. Diseño

**Una sola idea:** la cuenta tiene un tipo, `clinics.kind` = `clinic` | `office`. Todo lo demás se deriva de ahí, en un solo lugar:
- `permissionsFor(role, kind)` sustituye a `ROLE_PERMISSIONS[role]` en el servidor y en la sesión;
- `features(kind, settings)` dice qué módulos están activos (`hospital`, `observation`, `multiDoctor`).

Las pantallas preguntan por el permiso o por la función, nunca por el tipo de cuenta directamente. Así no se duplican pantallas y una clínica no cambia en nada.

**Roles en un consultorio**

| Rol | Quién es | Qué hace |
|---|---|---|
| Médico titular (`doctor`) | El dueño | Todo lo del médico, más lo de administración de su cuenta: configuración, precios, horario, vademécum, reportes, bitácora, personal y caja. |
| Asistente (`assistant`, rol nuevo) | Secretaria o enfermera del consultorio | Lo de recepción (agenda, llegada, pacientes, caja, recordatorios) más la preclínica y, si hay observación, aplicar dosis. Sin notas clínicas ni recetas. |

Un consultorio no tiene `admin`, `nurse` ni `reception`: con dos roles basta. Si contrata a otro médico, se convierte en clínica (punto C6) y recupera todos los roles.

## 3. Esquema (v23, todo aditivo)

- `clinics.kind TEXT NOT NULL DEFAULT 'clinic'` con CHECK (`clinic`, `office`). Todas las cuentas existentes quedan como `clinic`: no cambia nada para ellas.
- `clinics.observation_enabled BOOLEAN NOT NULL DEFAULT TRUE`. Lo puede apagar un consultorio que no aplica medicamentos.
- `clinics.owner_id TEXT` (el médico titular, sólo en consultorios).
- `clinics.specialty TEXT`, `clinics.license TEXT` (lo que va en el encabezado del consultorio; por defecto, lo del médico titular).
- `staff.role` admite `assistant`.
- Sin borrar ni mover datos. Pasar de consultorio a clínica sólo cambia `kind`.

## 4. Puntos, en orden de implementación

Cada punto trae lo que se hace, en qué archivos y cómo se acepta.

### C1. Tipo de cuenta y permisos por tipo (la base)
- `server/db.ts` (v23).
- `src/lib/permissions.ts`: `permissionsFor(role, kind)`, `canFor()`, rol `assistant` con su etiqueta y resumen.
- `server/app.ts`: la sesión carga el `kind` de la clínica; `need()` y las 16 llamadas a `can(user.role, …)` pasan a `can(user, …)`.
- `src/lib/types.ts`: `ClinicSettings.kind` y `features`.
- **Criterios:**
  - En un consultorio, el médico titular tiene los permisos de médico y de administración de la cuenta.
  - La asistente tiene los de la tabla 5.
  - En una clínica los permisos son exactamente los de hoy (prueba que compara rol por rol).
  - Cada permiso se valida en el servidor, no sólo en el menú.

### C2. Crear un consultorio
- `server/routes/platform.ts`: `POST /api/platform/clinics` con `kind: 'office'`. Pide los datos del consultorio y del médico (nombre, correo, colegiación, especialidad) y crea al médico titular con contraseña temporal, en lugar de un `admin`. Servicios iniciales de consultorio (consulta, control, inyección, curación).
- `src/app/Platform.tsx`: selector «Clínica / Consultorio» en «Nueva cuenta». La lista muestra el tipo y el filtro.
- **Criterios:**
  - Administración de Clinara crea un consultorio en un solo paso.
  - El médico entra con su contraseña temporal y la cambia.
  - El slug de reserva sale de su nombre (`/reservar/dra-ana-lopez`).

### C3. Primer ingreso del médico titular
- `src/app/Onboarding.tsx` (nuevo): asistente de 3 pasos que sólo aparece si falta algo.
  1. Datos del consultorio: nombre, dirección, teléfono, logo.
  2. Horario de atención (reusa `ScheduleEditor`).
  3. Precio de la consulta (reusa servicios).
- Cada paso se puede saltar y retomar desde Configuración.
- **Criterios:** al terminar o saltar, llega a su Inicio. No vuelve a aparecer.

### C4. Interfaz de un solo médico
- `AppShell.tsx`: menú por función.
  - Sin Hospitalizados ni Personal si no hay asistente.
  - Observación sólo si está activada.
  - El médico ve Caja.
  - «Administración» se llama «Mi consultorio» (Configuración, Reportes, Bitácora).
- `WaitingRoom.tsx`: sin «Mis pacientes / Toda la clínica» ni «Atender» al de otro médico.
- `Agenda.tsx`: sin filtro ni columna por médico; la cita nueva no pregunta el médico.
- `Prescriptions.tsx`: sin «Mías / Toda la clínica».
- `Reports.tsx`: sin «por médico».
- `Dashboard.tsx`: un Inicio de médico titular, que es el Inicio del médico más «Por llegar», el cobro del día y los recordatorios.
- `Booking.tsx`: no pide elegir médico.
- Textos: «la clínica» → «el consultorio» donde se muestre al usuario (`src/lib/format.ts`: `placeLabel(kind)`).
- **Criterios:**
  - Ninguna pantalla del consultorio muestra controles de varios médicos ni de camas.
  - Las pantallas que Emil aprobó de la clínica (Inicio del médico, Agenda, Consulta externa) se ven y funcionan igual en una clínica.

### C5. Documentos con el nombre del médico
- `Prescriptions.tsx` (`PrescriptionSheet`), `Certificate.tsx`, `Authorization.tsx`, `FullRecord.tsx`, recordatorio de WhatsApp (`fillTemplate`).
- En un consultorio, el encabezado es el médico: nombre, especialidad, colegiación, dirección y teléfono del consultorio y logo. El pie no repite el nombre de la clínica.
- **Criterios:**
  - La receta media carta y la constancia de un consultorio salen con el médico como encabezado.
  - Las de una clínica no cambian.

### C6. Asistente del consultorio y paso a clínica
- `src/app/Staff.tsx`: en un consultorio, «Agregar asistente» (sólo el rol `assistant`, máximo configurable, 2 por defecto).
- `server/app.ts` (`POST /api/staff`): en un consultorio sólo acepta `assistant`.
- Configuración, «Convertir en clínica»: lo hace el médico titular, pide confirmación y queda en la bitácora.
  - Cambia `kind` a `clinic`.
  - El médico titular conserva sus permisos de administración por medio de un usuario `admin`, que se crea con su consentimiento, o como médico con permisos de administración.
  - La asistente pasa a recepción con preclínica.
- **Criterios:**
  - La asistente entra y sólo ve agenda, llegada, preclínica, pacientes, caja y recordatorios.
  - Al convertir, no se pierde ni se mueve ningún dato y aparecen los módulos de clínica.

### C7. Observación opcional en el consultorio
- Configuración: «Uso observación (aplicar medicamentos, hidratar)», activada por defecto.
- Si está apagada, desaparece el menú Observación, la casilla «Ingreso a observación» y «Aplicar en la clínica».
- Hospitalización nunca está disponible en un consultorio.
- **Criterios:**
  - Con observación, la hoja de medicamentos funciona igual que en la clínica. Aplican dosis el médico y la asistente.
  - Sin observación, la consulta sólo emite receta.
  - El servidor rechaza crear camas u hospitalizaciones en un consultorio.

### C8. Demo y documentación
- `src/lib/seed.ts`: consultorio de demo «Consultorio Dra. Ana López» (medicina general), con su asistente, agenda de hoy, unos 20 pacientes con historial, recetas y una observación. Usuarios `alopez@demo.clinara` y `asistente@demo.clinara`.
- Se carga también en bases demo existentes, como `addDemoCases`.
- `README.md` (cuentas y recorrido del consultorio) y `docs/Guia-para-medicos.pdf` (sección «Si trabajas en tu propio consultorio»).
- **Criterios:**
  - El login de demo muestra el consultorio.
  - El recorrido del consultorio funciona de punta a punta.

## 5. Permisos por rol

| Función | Médico titular (consultorio) | Asistente (consultorio) | Clínica |
|---|---|---|---|
| Consulta, notas, recetas, constancias | Sí | No | Igual que hoy |
| Agenda, llegada, pacientes, recordatorios | Sí | Sí | Igual que hoy |
| Preclínica (signos vitales) | Sí | Sí | Igual que hoy |
| Caja y recibos | Sí | Sí | Igual que hoy |
| Observación: indicar | Sí | No | Igual que hoy |
| Observación: aplicar dosis | Sí | Sí | Igual que hoy |
| Hospitalización y camas | No existe | No existe | Igual que hoy |
| Configuración, precios, horario, vademécum | Sí | No | Administración |
| Reportes y bitácora | Sí | No | Administración |
| Agregar o desactivar asistentes | Sí | No | Administración (personal) |
| Convertir en clínica | Sí | No | No aplica |
| Crear consultorios | Administración de Clinara | — | Igual que hoy |

## 6. Ambigüedades y valor por defecto propuesto

Hay que confirmarlas antes de empezar. Las cuatro primeras cambian el alcance.

1. **Alta de nuevos médicos.**
   - Por defecto, el consultorio lo crea Administración de Clinara (como hoy las clínicas).
   - Alternativa: registro propio en `/registro`, con correo y colegiación, que queda pendiente hasta que Clinara lo verifica. Suma verificación, correos y términos de uso: sería un punto más (C9).
2. **Médico que trabaja en una clínica y además tiene su consultorio.**
   - Por defecto, son dos cuentas con correos distintos; el correo es único en todo el sistema.
   - Alternativa: una sola cuenta con selector «Clínica Santa Brígida / Mi consultorio». Cambia la sesión, el login y la unicidad del correo: es grande.
3. **Pacientes compartidos.** Por defecto, cada consultorio tiene su propia biblioteca de pacientes, aislada como hoy entre clínicas. Compartir expedientes entre cuentas tiene implicaciones legales y no se hace.
4. **Cobro de Clinara al médico** (planes, límites, facturación). Por defecto queda fuera de este plan; sólo se deja el tipo de cuenta listo para eso.
5. **Asistentes:** máximo 2 por consultorio, configurable por Administración de Clinara.
6. **Observación en el consultorio:** activada por defecto, con la opción de apagarla.
7. **Al convertir en clínica:** el médico titular conserva la administración por medio de un usuario `admin` nuevo, con otro correo, que él crea en ese momento. La asistente pasa a recepción con preclínica.
8. **Nombre del rol nuevo:** «Asistente» (cubre secretaria y enfermera de consultorio).

## 7. Pruebas automáticas

Van en `server/consultorio.test.ts`.
- Una clínica conserva exactamente los permisos de hoy, rol por rol.
- Médico titular de un consultorio:
  - configura, ve reportes y bitácora y cobra;
  - no puede crear camas ni hospitalizar (403);
  - sólo puede agregar asistentes.
- Asistente:
  - agenda, toma la preclínica, cobra y aplica una dosis en observación;
  - no puede firmar consulta, emitir receta, ver notas ni configurar (403).
- Crear un consultorio desde la plataforma crea al médico titular y los servicios iniciales.
- Con observación apagada, la consulta con «Ingreso a observación» se rechaza.
- Convertir en clínica: no cambia ningún conteo de datos y aparecen los permisos de clínica.
- La receta de un consultorio lleva al médico en el encabezado (`GET /api/prescriptions/:id` trae los datos del consultorio).
- Las 80 pruebas actuales siguen pasando.

## 8. Revisión antes de entregar

- [ ] Cada punto (C1–C8) cumple sus criterios, probado en el navegador con médico titular y asistente, en escritorio y a 390 px.
- [ ] La clínica demo (Santa Brígida) se ve y funciona igual que antes con sus cinco roles.
- [ ] Recorrido de punta a punta del consultorio:
  1. Administración de Clinara crea el consultorio.
  2. El médico entra, hace el asistente de inicio y agrega a su asistente.
  3. Un paciente reserva en línea sin elegir médico.
  4. La asistente marca la llegada, toma la preclínica y cobra.
  5. El médico atiende y emite la receta con su encabezado.
  6. El médico aplica un medicamento en observación.
  7. El médico revisa reportes.
  8. El médico convierte el consultorio en clínica sin perder nada.
- [ ] Permisos: con cada rol, URL directa y API.
- [ ] Migración v23 probada sobre una copia de la base demo.
- [ ] Typecheck, lint, pruebas y build sin errores ni advertencias nuevas.
- [ ] Textos en español, sin «clínica» donde debe decir «consultorio».

## 9. Reporte final

Igual que en las rondas anteriores (`REPORTE_CONSULTORIO.md`):
- tabla por punto, con archivos y cómo probarlo;
- cambios en la base;
- decisiones tomadas;
- lo que debe validar Emil;
- errores encontrados en el camino.
