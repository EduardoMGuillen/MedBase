# Vademécum externo (por ejemplo, VIDAL Vademecum Integrated)

Clinara **no** está conectado hoy a ningún vademécum externo. Este documento explica qué haría falta para conectar uno
(Emil revisó *VIDAL Vademecum Integrated*, un producto comercial de Vidal Vademecum para sistemas hospitalarios y receta
electrónica) sin reescribir las pantallas.

## Cómo está armado hoy

Todas las pantallas que muestran medicamentos (la consulta, las notas de hospitalización, Recetas, Mi configuración y
Configuración → Vademécum) los piden a un **proveedor de medicamentos**:

- La interfaz `DrugProvider` está en `src/lib/drugProvider.ts`.
- El único proveedor que existe hoy es `localDrugProvider`: el catálogo base de Clinara (`src/lib/catalogs.ts`) más lo
  que agrega cada clínica (tabla `clinic_drugs`, rutas en `server/routes/drugs.ts`).
- `drugProvider` es el proveedor activo. Cambiarlo cambia todas las pantallas a la vez.

| Función del proveedor | Qué hace hoy (local) | Qué haría con una API externa |
|---|---|---|
| `catalog(clinicDrugs)` | Devuelve el catálogo base más lo agregado por la clínica | Devolvería sólo lo agregado por la clínica; el resto se busca en línea |
| `search(query, …)` | Busca en el catálogo local | Llamaría a `GET /api/drugs/external/search?q=` (servidor), que consulta la API |
| `checks(items, paciente)` | No existe; las alergias se cruzan por grupo en `allergyConflict` | Interacciones, alergias, dosis máximas, duplicidad terapéutica y sustituciones |

## Qué haría falta para conectarla

1. **Contrato y credenciales.** El acceso se contrata con el área comercial de Vidal Vademecum
   (comercial@vademecum.es). Cubre España y Latinoamérica. Ninguna página pública dice que sea gratis. Hay que confirmar:
   - si incluye el mercado de Honduras (registros sanitarios de la ARSA);
   - el costo por clínica o por consulta;
   - el tipo de credencial (clave de API u OAuth) y los límites de uso;
   - si permite guardar en caché los resultados.
2. **Credenciales en el servidor**, nunca en el navegador: variables de entorno en Vercel, por ejemplo `VIDAL_API_URL`,
   `VIDAL_CLIENT_ID` y `VIDAL_CLIENT_SECRET`.
3. **Rutas del servidor** en `server/routes/drugs.ts` que hagan de puente:
   - `GET /api/drugs/external/search?q=`: busca y devuelve la forma `Drug` de `src/lib/catalogs.ts` (nombre, presentación,
     grupo, dosis habitual).
   - `POST /api/drugs/external/checks`: recibe los medicamentos de la receta y los datos del paciente (alergias, edad,
     peso, embarazo) y devuelve las alertas con su nivel.
   - Igual que la búsqueda CIE-11 de la OMS (`server/icd.ts`): si la API no responde, se vuelve al catálogo local para
     que la consulta nunca se detenga.
4. **Un proveedor nuevo** en `src/lib/drugProvider.ts` (`vidalDrugProvider`) que llame a esas rutas, y cambiar
   `drugProvider` por él (o elegirlo por clínica desde Configuración si sólo algunas clínicas lo contratan).
5. **Mostrar las alertas** de `checks` en el formulario de medicamento (`src/components/Medications.tsx`), donde hoy
   sale la alerta de alergia. Con nivel crítico, pedir confirmación con motivo antes de firmar. El motivo queda en la
   bitácora.

## Lo que se aprovecharía

- **Búsqueda** por principio activo y por nombre comercial con las presentaciones reales del mercado.
- **Interacciones** entre los medicamentos de la receta y los que el paciente ya toma (hoja de medicamentos y crónicos).
- **Alergias**, cruzadas por principio activo y por familia, mejor que el grupo simple de hoy.
- **Dosis**: rangos por edad y peso, lo que sirve en pediatría.
- **Duplicidad terapéutica**: dos AINE, dos IECA.
- **Sustituciones**: genéricos equivalentes cuando la farmacia no tiene el comercial.

## Lo que no cambia

- Lo que la clínica agregó a mano (`clinic_drugs`) se sigue ofreciendo junto con los resultados externos.
- Las recetas ya emitidas guardan el texto del medicamento tal como se imprimió: cambiar de proveedor no las altera.
