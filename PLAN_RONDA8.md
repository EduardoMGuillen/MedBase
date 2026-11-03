# Plan de la ronda 8 (pedido completo de Emil)

Fuente: `docs/ronda8/PEDIDO_RONDA8.md`, copia del texto que llegó pegado. Rama `ronda8-pedido`, un commit por punto.

## Antes de empezar: lo que no llegó

- **El pedido llegó cortado** en el RF1, en «… ni sin marcar la ca… (Tiempo restante: 31 KB)». Faltan:
  - el resto de los criterios del RF1;
  - **UM1, UM2 y DM1**;
  - las secciones 4 (permisos), 5 y 6 (valores por defecto A1 a A12).

  Lo que el texto cita de la sección 6 (A1, A4, A6, A7, A8, A10, A11 y A12) se aplica tal como está citado.
- **El `.md` de valores de referencia también llegó cortado**, en «Anticuerpos hepatitis A IgM». Faltan:
  - el resto de Enfermedades infecciosas;
  - Marcadores tumorales, COVID-19, Microbiología, Orina, Heces, Biología molecular y PCR;
  - las notas ⚠️;
  - **la lista de fuentes** (qué es [ABIM-2026], [MSD-TDM]…).
- **Bloqueado:** UM1, UM2 y DM1 hasta que lleguen completos. No se completan valores de memoria.

## Punto de partida

El 02/11 se desplegó una primera versión de la ronda 8, hecha con el Word (commit `1fa018c`, esquema v57). Este plan
ajusta esa versión al pedido detallado y no duplica funciones.

| Punto | Ya hecho (1fa018c) | Lo que falta según el pedido |
|---|---|---|
| CX1 | Filtro por médico y orden; para todos los roles; guardado en el navegador | Reutilizar el componente de AD1/RE1 (`ArrivalsPanel`: `FoldHead`, «Por hora · Por médico», Expandir/Contraer). Grupos desplegables por columna, «Sin cita» y «Sin médico asignado». Solo Administración y solo en Clínica, con un valor de configuración para otros roles. Guardado por usuario en el servidor (`prefs.queueView`). |
| CX2 | 409 al marcar llegada o sin cita; al internar se cancelan las citas abiertas | Mensaje con cuarto y fecha, y enlace «Ver paciente hospitalizado». Agendar para hoy bloqueado; a futuro, con aviso. Una cita de hoy con estancia activa no entra a la cola. En la Agenda: «Hospitalizado: cita en conflicto». Motivo y autor «Sistema» en la cancelación (columnas nuevas `cancel_reason` y `cancelled_by` en `appointments`). Tarjeta «Conflicto: hospitalizado» con «Preclínica» desactivado. Script de incongruencias (solo reporte). |
| GE2 | «Configuración» con tuerca arriba del perfil; perfil no navega; «Configuración de la clínica» | Rol sin «Vista de» (`ROLE_VIEW` en `permissions.ts`). Cambio de rol con un control propio dentro de la tarjeta (sustituye a `ViewSwitch`). En Consultorio, nombres distintos. |
| NE3 | Cuadro «Evolución» | Revisar el orden (Diagnósticos → Evolución → Signos vitales → Examen físico), la altura que crece sola, el dictado, el borrador, la impresión y «Ver nota completa». |
| NE4 | Los diagnósticos bajan de la nota anterior | Cadena: cualquier nota firmada de la estancia, hasta el egreso. Bitácora de diagnósticos quitados y agregados. Aviso al firmar si se firmó otra nota mientras tanto (regla del MC7). |
| NE5 | Desborde corregido en parte | Verificar a 1920, 1366, 1280 y 390 px en todos los estados. Selector de fecha y hora propio en dd/mm/aaaa HH:mm, que no dependa del idioma del navegador (componente `DateTimeField`). Revisar el estado del botón «Agregar a la nota». |
| ME1 | «Infusión continua» en ml/h o ml/min | Textos: «Infusión», «Velocidad de infusión», «mL/h»; «Hora de inicio»; sin PRN. Texto de la orden: «… · Infusión a 20 mL/h». Hoja de enfermería: un solo evento de inicio, después «En infusión desde HH:MM · 20 mL/h» y «Suspender infusión» con motivo (columnas `infusion_started_*` y `infusion_stopped_*`). Límites en `clinicalConfig.ts`. |
| ME2 | «La primera dosis es distinta» | Casilla «Primera dosis diferente (STAT)», solo con frecuencia repetitiva. «Dosis inicial», «Hora de la dosis inicial» (Ahora (STAT) o fecha) y «Dosis siguientes». Texto «Ceftriaxona IM · 2 gr STAT y luego 1 gr c/12h». Programación: las siguientes desde la hora inicial más el intervalo. La dosis registrada guarda la cantidad (`hosp_doses.dose`). Cambiar después de administrada la inicial ya no la repite. |
| EX1 | Desplegables, búsqueda, orden | Cerrados por defecto, salvo un crítico sin revisar. Filtros Todos / Pendientes / Con resultado / Críticos con conteo. «Más recientes primero · Más antiguos primero». Acciones usables sin abrir la fila. «Ningún examen coincide». Imagen y gabinete igual. |
| EX2 | `examBatch` al firmar; «Imprimir orden» | Dos documentos: «Orden de laboratorio» y «Orden de imagen y gabinete». Solo los Externo, sin la palabra «Externo» y sin CIE-11. Indicación por estudio, colegiado, «Imprimir» y «Descargar PDF», y registro de cada impresión. Cuadro al firmar: «Órdenes de exámenes: Imprimir / Descargar PDF». También desde la consulta externa. Explicar por qué antes no se generaba. |
| EX3 | Rayos X sin informe obligatorio | «Realizado · sin informe», «Agregar informe (opcional)», «Con informe». Solo con prefijos «Rayos X», «Radiografía» o «Rx» (empieza por), en `clinicalConfig.ts`. |
| RF1 | Hoja de referencia (modal, firma directa); cierra la estancia; contrarreferencia | Según el pedido: Borrador con autoguardado → Firmada → Anulada con motivo; número correlativo por clínica; prioridad «Rutina · Urgente»; alergias; casilla de consentimiento con fecha y hora; pie de confidencialidad en configuración. **No cierra la estancia**: después de firmar se ofrece «¿Registrar el egreso?» con «Referido». **Se quita la contrarreferencia.** Sin WhatsApp. Tarjeta en el expediente con Ver, Imprimir y Descargar PDF, y registro de cada impresión. El botón se llama «Referencia» en la estancia y «Referir a otro centro» en la consulta. |
| UM1, UM2, DM1 | La app trae umbrales con `source` y «Volver al de la app» | **Bloqueados** (ver arriba). |

## Archivos y base de datos

- **Esquema v58**, solo columnas nuevas, idempotente, sin borrar nada:
  - `appointments.cancel_reason` y `cancelled_by`;
  - `hosp_meds`: `loading_at`, `infusion_started_at`, `infusion_started_by`, `infusion_stopped_at`, `infusion_stopped_by`, `infusion_stop_note`;
  - `hosp_doses.dose`;
  - `referrals`: `status` (borrador, firmada o anulada), `number`, `signed_at`, `consent_at`, `void_reason`;
  - registro de impresiones (`print_log`, si no existe: se revisa antes en «Órdenes impresas»).
- **Configuración** (`src/lib/clinicalConfig.ts`, con VALIDAR: Emil):
  - roles con la vista agrupada de Consulta externa;
  - límites de la velocidad de infusión;
  - subgrupos y prefijos de Rayos X;
  - pie de confidencialidad de la referencia.
- **Componentes que se reutilizan:**
  - `FoldHead` y la barra de herramientas de `ArrivalsPanel` (CX1): se extrae `GroupTools`;
  - `MedForm` (ME1, ME2);
  - `NoteEditor` (NE3 a NE5);
  - la plantilla de documentos de la epicrisis y la autorización (EX2, RF1);
  - «Órdenes para imprimir» de `ExamsTab` (EX2).
- **Dependencias entre puntos:**
  - NE5 se verifica con ME1 y ME2 terminados;
  - EX2 usa la plantilla que también usa RF1;
  - DM1 va después de CX2.

## Cómo se verifica

Cada punto se verifica así:
- `tsc`, lint, `npm test` y `vite build`;
- una prueba nueva en `server/ronda8.test.ts`;
- revisión en el navegador con el rol del criterio, a 1920, 1366, 1280 y 390 px;
- en las migraciones, una copia de la base PGlite y dos corridas.
