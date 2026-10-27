# CIE-11 como única clasificación de diagnósticos: plan

Rama `perfil-consultorio`, a continuación del perfil Consultorio. Un commit por punto.

## Situación

- **Cómo se elige hoy un diagnóstico:**
  - Consulta (`src/app/Consultation.tsx`): busca en una lista local de unos 30 códigos **CIE-10** (`ICD10` en `src/lib/catalogs.ts`).
  - Ingreso y egreso (`DxPicker` en `src/app/Inpatients.tsx`): usan la misma lista.
  - Si el diagnóstico no está en la lista, se agrega como texto libre con código «S/C».
- **Cómo se guarda:** cada diagnóstico se guarda como `{ code, label }` dentro de consultas, estancias y egresos (columnas JSON).
- **La API de la OMS:**
  - Es gratuita. Pide registrarse para obtener un client ID y un secreto (OAuth2, *client credentials*). El token dura alrededor de una hora.
  - La CIE-11 MMS está en español desde la edición 2020-09; la más reciente es la 2026-01.
  - El endpoint de búsqueda es `GET /icd/release/11/{release}/mms/search`. Lleva los encabezados `API-Version: v2` y `Accept-Language: es`, y responde con `destinationEntities[]`, donde cada elemento trae `theCode`, `title`, `id` y `chapter`.
  - La OMS también ofrece la API para instalarla en el propio servidor (Docker o servicio de Linux). Así instalada no pide credenciales ni depende de internet.
- **Lo que no tenemos:** credenciales. La API en la nube responde 401 sin token. Clinara no trae una lista CIE-11 propia: no se escriben códigos de memoria.

## Diseño

- **Un solo lugar habla con la OMS:** `server/icd.ts`.
  - El navegador nunca ve las credenciales: busca en `GET /api/icd/search?q=`.
  - El token y los resultados se guardan un rato en memoria.
  - Cada consulta tiene un tiempo máximo y, si falla, se avisa sin bloquear la consulta.
- **Configuración por variables de entorno:**
  - `ICD_CLIENT_ID` y `ICD_CLIENT_SECRET` para la API en la nube.
  - `ICD_API_URL` para la copia local (por defecto, `https://id.who.int`).
  - `ICD_RELEASE`, por defecto `2026-01`.
- **Sin la API configurada** (o sin conexión), el buscador ofrece dos cosas:
  - los diagnósticos CIE-11 que la clínica ya usó (más frecuentes primero);
  - escribir el diagnóstico sin código.
- **Cada diagnóstico nuevo se guarda como** `{ code, label, system: 'icd11', uri }`.
  - Los diagnósticos anteriores (CIE-10) no se borran ni se convierten: se muestran con la marca «CIE-10».
  - Convertirlos exigiría una tabla de equivalencias validada por la OMS, y Emil decidió usar sólo la CIE-11 de aquí en adelante.

## Puntos

| Punto | Qué | Archivos |
|---|---|---|
| K1 | Servidor: búsqueda CIE-11 con la API de la OMS (nube o copia local), caché, tiempos máximos, estado de la conexión y frecuentes de la clínica. Configuración en `.env.example` y README. | `server/icd.ts` (nuevo), `server/app.ts`, `.env.example`, `README.md` |
| K2 | Buscador de diagnósticos CIE-11 único para la consulta, el ingreso y el egreso: resultados de la OMS, frecuentes de la clínica, «sin código» y aviso si la búsqueda no está conectada. | `src/components/DiagnosisPicker.tsx` (nuevo), `Consultation.tsx`, `Inpatients.tsx` (`DxPicker`), `src/lib/types.ts` |
| K3 | Diagnósticos de antes marcados «CIE-10» donde se muestra el código. Reportes de diagnósticos frecuentes por código y clasificación. Se retira la lista CIE-10 de los buscadores. | `PatientChart.tsx`, `FullRecord.tsx`, `Prescriptions.tsx`, `Certificate.tsx`, `server/routes/reports.ts`, `src/lib/catalogs.ts` |
| K4 | Pruebas: la búsqueda (con una OMS falsa en las pruebas), la conversión de la respuesta, el respaldo sin conexión y el guardado con `system: 'icd11'`. | `server/icd.test.ts` (nuevo) |

## Para confirmar

1. **Registro en la OMS:** la clínica (o Clinara) debe crear la cuenta en https://icd.who.int/icdapi y poner `ICD_CLIENT_ID` e `ICD_CLIENT_SECRET` en Vercel. Otra opción es instalar la copia local de la API en el servidor.
2. **Códigos de la demo:** los usados en los datos de demostración (BA00, 5A11, CA00, CA02, 1A40.Z) se verificaron sólo en fuentes de terceros. Hay que comprobarlos en el buscador oficial.
3. **Licencia:** los términos de uso y la licencia de la CIE-11 se aceptan al registrarse; no los revisé aquí.
