# Reporte de la auditoría general y el refactor

Fecha: 11 de noviembre de 2026. Commits `e283523` a `cf1d765` en `main` (11 commits sobre `20cb93d`).

La auditoría revisó el proyecto completo (seguridad y aislamiento entre clínicas, esquema y reinicio de la demo, estructura
del servidor y cliente). El veredicto fue: no hace falta reescribir; sí un refactor incremental en zonas concretas y, antes,
varios arreglos urgentes. Este reporte dice qué se hizo, cómo se comprobó y qué quedó pendiente.

## Cómo se comprobó

| Comprobación | Antes | Después |
|---|---|---|
| `npm test` | 502 pruebas; 1 no corría en Windows | 516 pruebas: 515 pasan, 1 omitida (ya lo estaba) |
| `npm run lint` | 1 error (hook condicional en `AppShell.tsx`) | sin errores |
| `npm run build` (el de Vercel) | pasa | pasa |
| Rutas registradas | 256 | 256, las mismas y en el mismo orden donde se solapan |
| Esquema de una base nueva | 56 tablas | idéntico (columnas, restricciones, índices, disparadores) |

Las rutas y el esquema se compararon con una instantánea tomada antes de empezar. Los cambios del cliente pasaron tipos,
lint y build, pero **no se probaron en un navegador** (ver «Para revisar a mano»).

## Arreglos urgentes

- **Migración que podía dejar la aplicación sin servicio.** El esquema completo se volvía a ejecutar en cada cambio de
  versión, y un paso intermedio (v63) volvía a poner la lista corta de tipos de adenda. Con una sola adenda de anestesia,
  valoración preanestésica o recuento quirúrgico, la migración fallaba y con ella toda petición a `/api`, para todas las
  clínicas. Se quitó ese paso y hay una prueba que falla si se reintroduce.
- **`resetDemo` (`npm run db:neon`, `npm run db:reset` con `DATABASE_URL`) borraba todas las clínicas.** Ahora se niega si
  en la base hay cuentas de clínica que no son `@demo.clinara`.
- **El reinicio diario de la demo.**
  - Borra también `record_versions` y `print_log`: los ids de la demo se repiten cada día y una versión vieja chocaba con
    la primera corrección del día siguiente.
  - La lista de tablas a borrar se comprueba contra las llaves foráneas del catálogo de la base: una tabla nueva que
    dependa de pacientes y no esté en `PATIENT_TABLES` hace fallar la prueba (antes fallaba el reinicio en producción).
  - Cerrar las visitas de los internados ya no toca clínicas que no son demo.
- **Aislamiento entre clínicas.** `hospitalizationId` (resultado externo de un examen) y `vitalsId` (firma de la consulta)
  venían del cuerpo de la petición y se guardaban sin comprobar; ahora se validan contra la clínica y el paciente. Las
  lecturas de diagnósticos y de signos vitales llevan la clínica.
- **Escrituras a medias.** Convertir un consultorio en clínica, crear una clínica o un consultorio y cambiar una cuenta
  desde la plataforma ocurren en una sola transacción, con su registro en la bitácora.
- **Formularios que perdían lo escrito.** La constancia médica y la admisión volvían a llenar sus campos con cada
  sincronización de 30 segundos.
- **Docker.** `.dockerignore` excluye `.env*`, `server/.tmp`, `docs` y los reportes (antes `COPY . .` los metía en la imagen).
- **Dependencias.** Parche de `body-parser` (vulnerabilidad alta).

## Migraciones: cómo se hace un cambio de esquema ahora

- `server/schema.ts` tiene el esquema base (versión 90), tal cual estaba. **No se le agregan cambios.**
- `server/migrations.ts` tiene los cambios posteriores como pasos numerados. Cada paso corre una sola vez por base, dentro
  de la transacción de `ensureDb`, y queda anotado en `meta.schema_step`. Un paso ya publicado no se edita ni se reordena.
- Un paso puede ser destructivo o estrechar una restricción: a diferencia del esquema base, no se repite.
- Si el paso crea una tabla con datos de pacientes, hay que agregarla a `PATIENT_TABLES` (`server/demoData.ts`).
- `ensureDb` vuelve a leer la versión con el candado tomado (dos instancias que arrancan a la vez no migran dos veces), no
  confunde un fallo de lectura con «hay que migrar» y no retrocede una base que dejó más adelante otro despliegue.
- La versión base no cambió: una base ya desplegada no vuelve a ejecutar nada. Volver a correr una de las cargas del
  esquema base sobre bases existentes ahora pide un paso nuevo.

## Estructura del servidor

| Archivo | Antes | Después |
|---|---|---|
| `server/app.ts` | 1,680 líneas | 260: middleware, sesión, contexto y registro de rutas |
| `server/db.ts` | 2,200 líneas | 865: inicialización, datos de demo y numeración |

- Rutas nuevas en `server/routes/`: `auth`, `audit`, `bootstrap`, `patients`, `appointments`, `triage`, `icd`,
  `consultations`, `staff` y `demo`. Se movieron sin cambiar su contenido ni las URL.
- `server/staff.ts`: alta de personal, roles, cargos y horarios, sin Express. `routes/platform.ts` y `routes/settings.ts`
  ya no importan de `app.ts` (había un import circular).
- `ronda10.ts`, `ronda11.ts` y `ronda12.ts` se repartieron por lo que hacen: `server/examCatalog.ts` (lo que usa el
  programa en marcha) y `server/baselineLoads.ts` (cargas de una vez del esquema base).
- Los filtros por fecha de la bitácora y de las recetas usaban `-06:00` fijo; ahora salen de `CLINIC_TZ`.
- Se quitó `assertFree`, que no tenía llamadas.

## Pruebas

- `npm test` corre `server/*.test.ts` con un patrón, en vez de una lista de 40 archivos mantenida a mano.
- `server/test/helpers.ts`: un solo arranque (`bootApp`) y un solo cliente con sesión; 36 archivos dejaron de repetirlos.
  La preparación propia de cada archivo va dentro de `bootApp(...)`: los `before` de un mismo nivel no se esperan entre sí.
- Pruebas nuevas: `aislamiento.test.ts` (ids ajenos, alcance del mantenimiento de la demo, `resetDemo`),
  `migraciones.test.ts` (base al día sin DDL, pasos una vez y en orden, paso fallido revertido, adendas) y tres más en
  `demoData.test.ts` (lista de borrado contra el catálogo).
- La prueba de zona horaria de `ronda9.test.ts` ya corre en Windows.

## Cliente

- **Sincronización (`src/lib/store.tsx`).** Cada apartado (citas, pacientes…) conserva su identidad si llegó igual; una
  respuesta vieja de `/bootstrap`, o una que llega después de cerrar sesión, se descarta; con la pestaña oculta no se
  sincroniza y al volver a verla sí.
- **Borradores locales.** Llevan de quién son: en un equipo compartido no se le cargan a otra persona.
- **Archivos por sección** (solo se movió código):
  - `src/app/InpatientFile.tsx`, de 1,895 a 229 líneas; sus secciones están en `src/app/inpatient/`.
  - `src/app/Settings.tsx`, de 761 a 147 líneas; sus formularios están en `src/app/settings/`.

## Para revisar a mano

Estas pantallas cambiaron y solo pasaron tipos, lint y build:

1. Constancia médica y admisión: escribir, esperar más de 30 segundos y confirmar que no se pisa lo escrito.
2. Expediente del hospitalizado: las pestañas, firmar una nota, registrar una dosis, corregir una nota.
3. Configuración: cada apartado y el aviso de cambios sin guardar.
4. Agenda y ficha del paciente: guardar algo y ver que la pantalla se actualiza.
5. Borradores: entrar con otro usuario en el mismo equipo y confirmar que no carga el borrador ajeno.

Cambio de comportamiento conocido: en la Agenda, un rango de más de 90 días atrás ya no se vuelve a consultar solo cada
30 segundos.

## Pendiente

**Decisión del producto**

- La cuenta de administración de la plataforma que se siembra con la demo. Mientras la base solo tenga datos demo es por
  diseño; hay que resolverlo antes de que una clínica real comparta instancia con la demo.

**Seguridad**

- Límite de intentos de inicio de sesión también por IP (hoy es solo por correo).
- Protección de la reserva pública contra abuso y validación de fechas.
- Los archivos de un consentimiento firmado se pueden borrar.
- Cookies `Secure` apagadas por defecto fuera de Vercel (`SECURE_COOKIES=true` en Docker o servidor propio).

**Cliente**

- Paginación de pacientes y recarga parcial después de cada acción (`/bootstrap` sigue trayendo todo).
- Una sola forma de calcular «hoy» y los límites del día (hoy se mezcla la hora del dispositivo con la de la clínica; solo
  falla fuera de UTC−6).
- Carga diferida de pantallas (el archivo principal pesa 1.7 MB).
- Dividir `ExamsTab.tsx`; refresco automático del expediente abierto.
- Restricción por tipo de cuenta en las rutas `hospitalizados/:id` y los expedientes.

**Servidor y repositorio**

- Escrituras no atómicas que quedan en `routes/me.ts` y `routes/exams.ts`.
- Código muerto y scripts de diagnóstico de rondas cerradas.
- Los correos e ids de la demo siguen escritos en cada archivo de prueba.
- `uuid` vía `exceljs` (vulnerabilidad moderada): pide un cambio mayor de `exceljs`.
- La imagen de Docker no se construyó ni se probó.
