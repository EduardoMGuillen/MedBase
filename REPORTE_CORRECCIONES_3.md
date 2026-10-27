# Reporte de la tercera ronda de correcciones

Rama `correcciones-emil-3`, un commit por punto. El plan está en `PLAN_CORRECCIONES_3.md`.

Cuentas de prueba (contraseña `demo1234`):
- **Clínica:** `lherrera@demo.clinara` (médico) y `crios@demo.clinara` (enfermería).
- **Consultorio:** `alopez@demo.clinara` (médico) y `asistente@demo.clinara` (asistente).

**Verificación al cerrar**
- `tsc -b` sin errores.
- `npm test`: 115 de 115. Las nuevas de esta ronda están en `server/corrections3.test.ts`.
- `npm run build` correcto.
- `oxlint` con 37 advertencias, ninguna nueva.

**Navegador** (sin errores en la consola), recorrido de la sección 7 en las dos cuentas, sobre una copia de la base demo v23 actualizada a v24 al arrancar:
- **Clínica:**
  - consulta con acetaminofén «por 3 días» e ingreso a observación;
  - «Pasar a hospitalización»;
  - nota SOAP con 11 indicaciones y 3 medicamentos capturados con «Guardar y agregar otro»;
  - formato 2 (Diagnóstico · Examen físico · Observaciones);
  - «Editar datos generales»;
  - autorización quirúrgica en 1 página;
  - expediente completo de 8 páginas en dos columnas.
- **Consultorio:** consulta con ingreso a observación y Referencia emitida en 1 página.
- **Celular (390 px):** las columnas se apilan y ninguna pantalla se desborda.

## 1. Estado por punto

| Punto | Estado | Archivos principales | Cómo probarlo |
|---|---|---|---|
| **P3** Medicamentos a la hoja | Hecho | `server/medOrders.ts` (`syncStayOrders`, `missingStayOrders`, `backfillMissingOrders`), `server/routes/inpatient.ts`, `server/app.ts`, `server/db.ts` (v24), `src/lib/inpatient.ts` (`courseEnd`), `scripts/med-orders.ts` | 1) Consulta con acetaminofén «por 3 días» e ingreso a observación: está en la hoja. 2) «Pasar a hospitalización»: sigue una sola vez, con su dosis aplicada. 3) José Aguilar: al desplegar, la v24 crea su acetaminofén. |
| **P2** Indicaciones y medicamentos a la derecha | Hecho | `src/components/NoteColumns.tsx` (nuevo), `PatientChart.tsx` (`ConsultationBody`), `InpatientFile.tsx` (`SoapNote`, `NoteEditor`, `MedForm`), `FullRecord.tsx`, `src/lib/format.ts` (`examText`), `clinical.css` | 1) Nota de ingreso de María José: a la derecha «Indicaciones y plan» y debajo «Medicamentos» con guion. 2) Nueva nota: los medicamentos se agregan a la derecha bajo las indicaciones; «Guardar y agregar otro». 3) A 390 px: texto, indicaciones, medicamentos. |
| **P4** Segundo formato de nota | Hecho | `InpatientFile.tsx` (`NoteEditor`), `NoteColumns.tsx` (`NoteText`), `server/routes/inpatient.ts`, `server/mappers.ts`, `staff.prefs` | 1) Nueva nota: escribe en S y cambia a «Diagnóstico · Examen físico · Observaciones»; vuelve a SOAP y lo escrito sigue ahí. 2) Guarda en formato 2: sale con sus encabezados. 3) La próxima nota abre en el formato 2. |
| **P1** Editar datos generales | Hecho | `src/app/GeneralData.tsx` (nuevo), `PatientForms.tsx`, `Inpatients.tsx` (sin modo edición), `server/routes/inpatient.ts` (PATCH sólo datos generales), `server/app.ts` (bitácora por campo), `server/authorizations.ts` | 1) En la hoja de hospitalización: «Editar datos generales»; anota acompañante y teléfono. 2) Anexos: la autorización pendiente ya los tiene. 3) No hay forma de cambiar motivo, diagnósticos ni fecha del ingreso. |
| **P5** Autorización quirúrgica mínima | Hecho | `src/app/Authorization.tsx` (formulario sin pestañas, `SurgicalSheet`), `src/lib/consent.ts` (`SURGICAL_GENERIC`, `FREQUENT_SURGERIES`), `server/routes/inpatient.ts` | Botón «Autorización quirúrgica», escribe el procedimiento y pulsa «Generar»: una página, con el diagnóstico tomado del expediente. |
| **P6** Referencia y observación sin autorización | Hecho | `server/routes/referrals.ts` (nuevo), `src/app/Referral.tsx` (nuevo), `InpatientFile.tsx`, `FullRecord.tsx`, `Patients.tsx`, `server/db.ts` (v24) | 1) Dra. López, observación: «Referencia» en lugar de «Pasar a hospitalización». 2) Revisa la vista previa, escribe el destino y pulsa «Emitir e imprimir». 3) Queda en Anexos, el paciente sale de Observación («Referido a …») y no hay aviso de autorización. |
| **P7** Zona horaria | Hecho | `server/tz.ts` (nuevo), `api/index.ts`, `server/index.ts`, `server/db.ts` (`fixOfficeDemoTimes`) | Ingresa a alguien a observación en el consultorio: «Entró a observación» tiene la fecha y hora de hoy. Gabriela Matamoros se corrige al desplegar. |

## 2. Causa raíz de P3 (José Aguilar)

Se reprodujo con una prueba que fallaba («reproducción (José Aguilar)» en `server/corrections3.test.ts`). Ahora pasa.

Fueron dos causas juntas:
1. **Datos anteriores a la corrección, nunca rellenados.**
   - José se atendió a las 15:11 del 26/10, con la versión anterior a la ronda 2; esa corrección llegó a `main` después de las 18:34.
   - Esa versión, al firmar con «Ingreso a observación», dejaba los medicamentos sólo en la receta y creaba la observación sin órdenes.
   - La corrección de la ronda 2 creaba las órdenes únicamente al firmar la consulta: no rellenó las estancias que ya existían. Sólo vinculaba ingresos sin consulta.
2. **«Pasar a hospitalización» (hipótesis f).** A las 19:23, ya con la versión nueva, esa ruta no pasaba por la función que crea órdenes. No reparó la falta.

**Hipótesis descartadas:**
- (a) No: la hoja lee todas las órdenes.
- (c) No: los «por 3 días» ya pasaban con ingreso.
- (d) No: la casilla no filtraba ingresos.
- (e) No: el filtro de fecha no era la causa.

**Por qué las pruebas de la ronda 2 no lo detectaron:**
- Sólo usaban consultas firmadas con el código nuevo, que creaba las órdenes al firmar.
- La prueba de «Pasar a hospitalización» partía de una observación que ya tenía su orden.
- Ninguna probaba una estancia anterior ni que la conversión completara lo que faltaba.

**Ahora** cubren todas las rutas de la tabla:
- consulta → observación → hospitalización (una sola orden con sus dosis);
- ambulatoria con «Aplicar en la clínica» que luego se hospitaliza;
- consulta → hospitalización;
- nota con 3 medicamentos guardada dos veces;
- consultorio con observación;
- estancia anterior más conversión;
- relleno en simulación y en real;
- vencimiento por días.

## 3. Resultado del relleno

El relleno corre solo al desplegar (v24) y deja una línea en la bitácora por cada orden creada. `scripts/med-orders.ts` sirve para verlo antes (`--dry-run`) y para comprobar después (`--check`).

No tengo acceso a la base de producción (Neon), así que no puedo darte la lista real.

**Probado sobre una copia de la base demo v23** con un caso armado igual que el de José, con el código viejo:

```
--dry-run   FALTA   Dora Alicia Espinoza de Sosa (hospitalización h-jose)  Acetaminofén  · consulta k-jose
--apply     CREADA  Dora Alicia Espinoza de Sosa (hospitalización h-jose)  Acetaminofén  · consulta k-jose
--apply     No falta ninguna orden.
--check     Todo en orden: cada estancia activa tiene en la hoja los medicamentos de su consulta.
```

Al arrancar el servidor sobre otra copia igual, la v24 creó la orden: Acetaminofén por 3 días, cada 8 horas, con origen en la consulta y primera dosis «ahora».

**En producción** se corregirá a toda estancia activa cuya consulta de origen tenga medicamentos que falten en la hoja:
- José Aguilar.
- El ondansetrón y la solución salina de los casos anteriores, si esas estancias siguen activas. Si ya egresaron, no se tocan: el relleno sólo trabaja sobre estancias activas.

**Para ver la lista antes de desplegar:** `DATABASE_URL=… npx tsx scripts/med-orders.ts --dry-run`. Después del despliegue, la lista queda en la bitácora con la palabra «Actualización».

## 4. Cambios en la base (v24, todo aditivo)

- **`staff.prefs`** (JSON): el último formato de nota de cada médico.
- **`authorizations.status`:** admite `not_applicable`. Las autorizaciones de hospitalización **pendientes** de una observación pasan a «No aplica (observación)»; las firmadas no se tocan.
- **`hospitalizations.outcome` y `outcome_note`:** «referred» más el destino.
- **Tabla nueva `referrals`:** número correlativo `REF-AAAA-0000`, datos tal como se emitieron, destino y anulación.
- **Nada de esto se toca:** las notas anteriores (siguen siendo SOAP), las autorizaciones quirúrgicas ya emitidas (se siguen imprimiendo con su contenido) y las órdenes que ya existían.
- **Datos de demostración:** se corrige la hora de las filas de la semilla del consultorio que quedaron desfasadas (P7). Sólo esas filas, por su id; la corrección es idempotente y queda en la bitácora.

## 5. Decisiones y valores por defecto (para confirmar)

**De la sección 6, usados tal cual:**
- Fecha y hora del ingreso no editables.
- Medicamentos con guion, no numerados, al final de la columna derecha.
- Se mantiene «Indicaciones y plan» en la nota de consulta.
- SOAP por defecto, y después se recuerda el último formato.
- Con ingreso, todos los medicamentos van a la hoja; en ambulatorio, sólo los de «Aplicar en la clínica».
- Sin dosis retroactivas.
- Quirúrgica sin pestañas.
- Destino de la referencia libre y opcional.
- Observación sin autorización de hospitalización.
- Hora de Honduras.
- El relleno sólo crea lo que falta.

**Propias:**
1. **Hora de la primera dosis:**
   - Al hospitalizar desde observación, lo que falta empieza a la hora de la conversión.
   - En el relleno, lo creado empieza «ahora», para no mostrar como «Atrasado» dosis que enfermería no pudo ver.
2. **«Guardar dos veces» no duplica de verdad:** el formulario de la nota manda un identificador y, si llega dos veces, el servidor devuelve la misma nota.
3. **Diagnósticos del formato 2 en CIE-11.** Tu documento dice «CIE-10», pero en la ronda anterior decidiste usar sólo CIE-11, así que el formato 2 usa el buscador CIE-11.
4. **Administración no edita datos generales.** Tu tabla dice «Sí», pero administración no tiene acceso al expediente clínico. Sí puede editar los datos del paciente desde la Biblioteca. Si quieres que edite acompañante y cama sin ver lo clínico, se puede agregar.
5. **El medicamento activo aparece en cada nota nueva.** En una nota nueva, «Medicamentos» lista también los que siguen activos de antes (como en papel, donde cada nota repite las órdenes vigentes). Así lo hacía ya la app.
6. **La autorización de hospitalización** sólo se ofrece en Anexos para estancias de hospitalización.
7. **En la Referencia:**
   - El diagnóstico y el examen se toman de la consulta de origen y de la última nota.
   - Los medicamentos aplicados salen de las dosis registradas en la hoja.
   - Si no hay HEA, examen, evolución o laboratorios, quedan en blanco con línea.
8. **Zona horaria única por despliegue:** `CLINIC_TZ`, por defecto America/Tegucigalpa. No hice una zona por clínica: todas las clínicas actuales están en Honduras.

## 6. Lo que debes validar tú o un abogado

- **Texto genérico de la autorización quirúrgica** (`SURGICAL_GENERIC` en `src/lib/consent.ts`).
  - Un consentimiento genérico, sin riesgos ni alternativas por procedimiento, tiene límites legales.
  - Debe aprobarlo el asesor legal de la clínica, que puede reemplazarlo por su propio formato.
  - Sólo se menciona el Código de Ética del Colegio Médico de Honduras, cap. VIII, como en las rondas anteriores.
- **Formato de la hoja de referencia:** si el hospital receptor (por ejemplo, de la Secretaría de Salud) pide un formato oficial, habría que adaptarlo.

## 7. Zona horaria (P7)

Era un error real, no sólo dato de prueba:
- El servidor de Vercel corre en UTC.
- La demo del consultorio se cargó a las 18:3x de Honduras, que son las 00:3x UTC del día siguiente. Para el servidor, «hoy» era el 27.
- Las horas locales («08:30») se leyeron como UTC, que en Honduras son las 02:30.
- Por eso Gabriela Matamoros decía «27 oct, 02:30» mientras el sistema mostraba el lunes 26.

**Ahora:**
- El servidor fija la hora de Honduras al arrancar. Las fechas se siguen guardando en UTC.
- La v24 corrige esas filas de la demo.
- «min en observación», «Día N» y la programación de dosis se calculan en el navegador con la hora real, así que no dependían del servidor.

## 8. Errores encontrados en el camino

**Corregidos:**
- La vista previa de la Referencia borraba lo escrito (destino y condición) cada vez que el expediente se redibujaba.
- Al corregir los datos del paciente, las autorizaciones pendientes no se actualizaban por un error en la consulta: la columna `id` de la autorización quedaba tapada por la de la estancia.

**Actualizadas:** las pruebas de rondas anteriores que esperaban reglas que esta ronda cambió (diagnóstico obligatorio y testigo en la quirúrgica, autorización en observación, corregir el ingreso) se adaptaron a las reglas nuevas.

**Sin corregir (no estaban en la lista):**
- En la hoja de referencia de un menor sin identidad no sale el responsable. Se podría agregar como en la receta.
- El paquete de la app sigue pesando más de 500 kB.
