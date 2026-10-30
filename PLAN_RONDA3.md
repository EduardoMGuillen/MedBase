# Correcciones de Emil, ronda 3: plan

Rama `correcciones-emil-5`, un commit por punto. La ronda 4 (`PLAN_RONDA4.md`) llegó mientras revisaba el código y
**reemplaza MC4 por EX1** («Exámenes»). Para no construir dos secciones que hacen lo mismo, MC4 no se construye como
«Estudios»: se construye directamente como EX1. Las dos rondas van en esta rama, en el orden de la sección final.

## Lo que encontré en el código

| Tema | Estado actual |
|---|---|
| Stack | React 19 + Vite, Express 5, Postgres (PGlite en local, Neon en Vercel), zod. Esquema en `server/db.ts`, versión 31: un SQL idempotente y funciones de datos que corren al cambiar la versión. |
| Roles | Un solo rol por persona (`staff.role` con CHECK). Permisos en `src/lib/permissions.ts` (`permissionsFor(role, kind)`); el servidor usa `can(user, p)` con el usuario de la sesión, que se lee de la base en cada petición. |
| Bitácora | Tabla `audit (at, user_id, action, clinic_id)`, sólo agregar (trigger). No guarda el rol ni el paciente. Sólo administración la ve (`audit.view`), en Personal y roles → Bitácora. |
| Teléfono de la clínica | `clinics.phone`, un solo texto. Lo usan recetas, constancias, recibos, membretes, autorizaciones y la variable `{telefono}` del recordatorio. |
| Vigencia de recetas | `clinics.rx_validity_days`, en Configuración → Clínica. |
| Camas | `beds.specialty` obligatoria, fija por cama. El estado (libre u ocupada) ya se deduce de `hospitalizations` activas; `active` es «desactivada». |
| Vademécum | Catálogo base en el código (`src/lib/catalogs.ts`, `DRUGS`) más `clinic_drugs`. Configuración sólo lista los agregados. |
| Caja | Ya permite cobro sin cita, conceptos libres y varios servicios. «Por cobrar» **no son registros**: se calcula en el navegador con las citas atendidas sin pago (`a.status === 'done' && a.paid === false`). Formas de pago fijas: efectivo, tarjeta, transferencia, aseguradora. Sin abonos. |
| Firma | `staff.signature` (PNG) ya existe desde la ronda 2. Firma en pantalla en `src/app/ConsentSigning.tsx`. |
| Formatos de nota | Ya existen dos: `format: 'soap'` y `format: 'dx'` (Diagnóstico · Examen físico · Observaciones). No hay texto libre. `staff.prefs.noteFormat` recuerda el último. |
| Procedimientos | `ProcedureNoteForm` (`InpatientFile.tsx`) con `FREQUENT_PROCEDURES` (`src/lib/consent.ts`) y siempre el aviso de autorización. |
| Egreso | `Discharge` en `InpatientFile.tsx` (formulario propio) y la vista de la epicrisis en `src/app/Epicrisis.tsx` (otra). |
| CIE-10/CIE-11 | `dxCode()` en `src/lib/format.ts` marca «CIE-10» cuando el diagnóstico no trae `system: 'icd11'`. El egreso usa `DxPicker` de `Inpatients.tsx`, que **no guarda `system` ni `uri`**: por eso un diagnóstico CIE-11 recién elegido se ve como CIE-10. |
| Alertas | `MedAlertBanner` (`src/app/MedAlerts.tsx`): una línea por dosis y por toma, en rojo. |
| Signos vitales | `src/app/VitalsSheet.tsx`, pestaña después de «Notas de evolución». |
| Recorrido | Componente propio `src/components/Tour.tsx` y pasos en `src/lib/tours.ts` (sólo el menú). |
| Demo | `src/lib/seed.ts` + `server/demoScenarios.ts`, cargado al crear la base. No hay indicador «demo» en `clinics`; se reconoce por los correos `@demo.clinara`. |

## Esquema v32 a v4x (todo aditivo)

| Punto | Cambio |
|---|---|
| AD1 | `clinics.contacts` (JSON: número, etiqueta, tipo `call`/`whatsapp`/`both`, `primary`, `whatsapp`). Migración: el teléfono actual es el contacto principal. `clinics.phone` se mantiene igual al principal (lo leen todos los documentos). |
| AD2 | `staff.prefs.rxValidityDays` (30 por defecto). Migración: cada médico recibe el valor actual de su clínica. `prescriptions.validity_days` guarda la de cada receta. `clinics.rx_validity_days` se queda (no se borra) pero ya no se edita. |
| AD3 | `hospitalizations.specialty`. `beds.specialty` deja de ser obligatoria; su valor se copia a `beds.archived_specialty` y ya no se muestra. `beds.out_of_service` y `out_of_service_note`. |
| AD4 | `clinic_drugs.usual_dose`, `usual_use`. Importación con `norm_key` (ya existe el índice único). |
| AD5 | `staff.roles` (JSON). `staff.role` pasa a ser **el rol activo** (la vista elegida, recordada en la base). Migración: `roles = [role]`. Las listas de médicos usan «tiene el rol médico», no el rol activo. |
| AD7 | `audit.role`, `audit.patient_id`, `audit.kind` (tipo de acción). Las filas viejas quedan sin ellos y se clasifican por el texto. |
| AD9 | `clinics.payment_methods` (JSON; efectivo y transferencia por defecto), `payments.bank`, `payments.amount_paid`, tabla `payment_installments` (abonos). `services.created_by`, `created_at`. Los métodos `deposit` y `other` se agregan al CHECK. |
| MC6 | `staff.stamp` (sello, imagen), `staff.doc_name` (nombre en documentos), favoritos en `staff.prefs`. |
| DM1 | `clinics.is_demo`. |

## Puntos

### Rápidos
- **AD2** `Settings.tsx` quita el campo; `Account`/Mi configuración lo agrega; `Prescriptions.tsx` y la receta permiten cambiar la vigencia de esa receta; `server/app.ts` la guarda.
- **AD6** Clase `.sticky-head` (barra de pestañas y `thead` fijos con `position: sticky`) en `src/index.css`/`modules.css`; se aplica a Personal, Biblioteca, Camas, Vademécum, Servicios, Bitácora, Caja y las pestañas del expediente. A 390 px la tabla se desplaza dentro de su contenedor.
- **MC3** `ProcedureNoteForm`: sin `FREQUENT_PROCEDURES`; casilla «Procedimiento mayor (requiere autorización quirúrgica)»; sólo entonces el aviso, el botón y la urgencia. Vincular una quirúrgica firmada en las últimas 24 h. El servidor sólo exige autorización si `major`.
- **MC7** `AppShell.tsx`: orden Inicio → Agenda → Recetas → Cobrar → Pacientes ▾ → Configuración (MC6). «Cobrar» lleva a la caja (AD9).
- **MC5 (CIE)** `DxPicker` guarda `system` y `uri`; la etiqueta sale de la misma función que el resto de la app.
- **MC2 (procedimiento)** La quirúrgica generada desde una nota toma el procedimiento escrito y el diagnóstico actual.

### AD5 multirrol y MC6 Mi configuración
- **Servidor:** `PATCH /api/staff/:id` acepta `roles` (al menos uno; nunca dejar sin administración a la clínica); `POST /api/me/view` cambia el rol activo (sólo a uno de sus roles), deja bitácora. `can()` usa el rol activo. La bitácora guarda el rol de cada acción.
- **Cliente:** `Staff.tsx` con casillas de rol; selector «Vista de …» en Inicio y en el pie del menú; `Guard` ofrece cambiar de vista si la ruta es del otro rol.
- **MC6:** `/app/mi-configuracion` (`src/app/MyConfig.tsx`) con apartados que guardan por separado: datos profesionales, firma (`SignaturePad`), horario (`ScheduleEditor`), mi vademécum (favoritos), sets (enlace a la pantalla de la ronda 2), exámenes frecuentes (EX1), preferencias, seguridad (contraseña, 2FA, cerrar otras sesiones) y Mi actividad. Rutas `PATCH /api/me`, `PUT /api/me/signature`, `POST /api/me/sessions/close`. Recepción, enfermería y administración sólo ven Seguridad y Mi actividad.

### AD1, AD3, AD4, AD7, AD8
- **AD1** `ContactsEditor` en Configuración; membretes (`DocHeader`, recibo, receta, constancia) con «Tel. … · WhatsApp …»; la página de reserva muestra botones de llamar y de WhatsApp.
- **AD3** Tabla de camas con estado calculado (Libre / Ocupada con paciente y especialidad / Fuera de servicio). Al ingresar, sólo camas libres y especialidad = la del médico (editable). Hospitalizados y expediente muestran la especialidad del ingreso.
- **AD4** `src/lib/drugProvider.ts` (capa intermedia: `searchDrugs`, `getDrug`; hoy el proveedor local, mañana una API). Configuración → Vademécum con todos los medicamentos, buscador, filtro, «+ Agregar medicamento» e importación CSV con plantilla. `docs/VADEMECUM_EXTERNO.md`.
- **AD7** `GET /api/audit/mine` y `GET /api/audit` con filtros; exportación a Excel (CSV con BOM, se abre en Excel). «Mi actividad» en Mi configuración.
- **AD8** `Patients.tsx`: filtros agrupados como frases, atajos, fechas rápidas, frase resumen.

### AD9 cobros
`Billing.tsx`: sin «Por cobrar» automático; «Nuevo cobro» con «+ Servicio nuevo» (guardar en la lista), formas de pago habilitadas, banco y referencia, abono y saldo pendiente. Configuración → Formas de pago. `server/routes/billing.ts`. Reportes por día, forma de pago y servicio con el nuevo modelo.

### MC1 y MC2 firma inmediata
`src/app/ConsentFlow.tsx`: tras elegir cama (consulta con ingreso o «Pasar a hospitalización»), abre la autorización ya llena en `ConsentSigning` con «Firmar ahora», «Imprimir para firmar en papel» y «Firmar después»; las tres terminan en el expediente. La quirúrgica (generada desde una nota o desde Anexos) usa las mismas tres salidas.

### MC4 → EX1 y EN2
Ver `PLAN_RONDA4.md` (EX1). EN2: `src/lib/alerts.ts` agrupa por tipo y elemento, con nivel (crítico, pendiente, informativo) y acción; `AlertBar` compacta arriba del expediente; contadores por pestaña; «No aplicada» con motivo (ya existe `skipped`, se le agrega el motivo obligatorio); lista de pendientes en el inicio de enfermería.

### EN1 y MC5
- **EN1** Orden de pestañas (también en el expediente impreso). Rediseño de `VitalsSheet`: franja del último registro, curva con más aire, minigráficas en cuadrícula con la misma escala, tabla plegable y botón fijo.
- **MC5** `src/app/DischargeWriter.tsx`: el egreso se escribe en la vista de la epicrisis, en el orden pedido (HEA primero). Al guardar se cierra la estancia, se libera la cama, se emite la receta y se genera la epicrisis con el mismo contenido.

### MI1 consultorio
Roles Asistente y Enfermería en el consultorio, multirrol, selector de vista, menú de MC7, todo lo anterior sin hospitalización si no tiene camas.

### DM1 datos demo
`server/demo/` con el generador relativo a hoy; `npm run seed:demo` (respaldo en JSON, borra sólo pacientes demo y lo que cuelga de ellos en las clínicas con `is_demo`); `GET /api/cron/demo-day` para Vercel Cron a las 05:00 de Honduras (11:00 UTC); Dr. Daniel Fúnez Castillo.

## Permisos (sección 4)
| Función | Permiso |
|---|---|
| Contactos | `settings.manage` edita; todos ven. |
| Camas | `settings.manage` edita; `inpatient.orders` asigna al ingresar. |
| Agregar al vademécum | `rx.write` o `drugs.manage`. |
| Roles | `staff.manage`. |
| Bitácora propia | todos (`/api/audit/mine`); la de todos, `audit.view`. |
| Cobros y servicios nuevos | `billing.manage` (recepción, médico, administración). Enfermería ya no cobra en clínica (la tabla dice «No»). |
| Formas de pago | `settings.manage`. |
| Exámenes | ver `PLAN_RONDA4.md`. |
| Horario | el suyo el médico; todos `schedule.manage`. |
| Mi configuración | el médico todo; los demás Seguridad y Mi actividad. |

## Orden de trabajo (las dos rondas)
1. AD2, AD6, MC3, MC7, MC5 (CIE), MC2 (procedimiento).
2. AD5, MC6.
3. AD1, AD3, AD4, AD7, AD8.
4. AD9.
5. MC1, MC2.
6. AN1 (ronda 4), EX1 (= MC4), EN2.
7. EN1, MC5.
8. MI1.
9. DM1.
10. RG1 (ronda 4), al final, sobre las pantallas terminadas y los datos demo nuevos.
