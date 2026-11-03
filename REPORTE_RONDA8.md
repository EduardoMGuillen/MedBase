# Ronda 8: reporte (pedido completo)

**Fuentes:**
- el pedido pegado: copia en `docs/ronda8/PEDIDO_RONDA8.md`;
- `valores_referencia_laboratorio.md`: copia en `docs/ronda8/`;
- el Word con las 12 capturas.

**Rama** `ronda8-pedido`. Esquema **v61**. **No desplegado todavía** (ver «Lo que falta»).

Una primera versión, hecha solo con el Word, se desplegó el 02/11 (`1fa018c`, v57). Esta ronda la ajustó al pedido detallado.

## Lo que falta: llegó cortado

- **El pedido se corta en el RF1**, en «… ni sin marcar la ca… (Tiempo restante: 31 KB)». Faltan:
  - el resto de los criterios del RF1;
  - **UM1, UM2 y DM1**;
  - las secciones 4 (permisos), 5 y 6 (valores por defecto A1 a A12).

  Lo que el texto cita de la sección 6 se aplicó tal como está citado.
- **El `.md` de valores de referencia se corta** en «Anticuerpos hepatitis A IgM». Faltan:
  - el resto de Enfermedades infecciosas;
  - Marcadores tumorales, COVID-19, Microbiología, Orina, Heces, Biología molecular y PCR;
  - las Notas ⚠️;
  - **la lista de fuentes**: qué es [ABIM-2026], [MSD-TDM], etc., con su enlace.
- **UM1, UM2 y DM1 no se tocaron.** No se completó ningún valor de memoria. Para seguir hace falta el resto de los dos
  textos; lo mejor es mandarlos como archivo, porque pegados se cortan.

## Commits

Un commit por punto. ME1, ME2 y NE5 van juntos porque son el mismo formulario y la misma hoja: separarlos dejaba commits
que no compilaban.

| Punto | Commit | Qué quedó |
|---|---|---|
| CX1 | `34dc179` | Ver abajo. |
| CX2 | `77d80a6` | Ver abajo. |
| GE2 | `949cc3c`, `68067c8` | Ver abajo. |
| NE3 | (ya estaba) | «Evolución» entre Diagnósticos y Signos vitales/Examen físico, solo en Estándar. Crece al escribir, tiene dictado y entra en el borrador. Sale en la tarjeta, en «Ver nota completa» y en la impresión, y no sale si está vacío. |
| NE4 | `4c4e41f` | Ver abajo. |
| ME1, ME2, NE5 | `b47c1d9` | Ver abajo. |
| EX3 | `4a5765b` | Ver abajo. |
| EX1 | `9a1b993` | Ver abajo. |
| EX2 | `107d0db` | Ver abajo. |
| RF1 | `897492e` | Ver abajo. |

### CX1
- **Componente:** el mismo de «Por llegar hoy» (AD1/RE1), ahora en un solo componente compartido, `components/ApptGroups.tsx`.
- **Controles:** «Por hora | Por médico» y «Expandir todo / Contraer todo». El selector aplica a las tres columnas.
- **Grupos:** cada grupo muestra su conteo y su flecha; además hay «Sin cita» y «Sin médico asignado».
- **Preferencia:** se guarda por usuario en el servidor y se conserva entre sesiones.
- **Quién lo ve:** solo Administración en clínica. Para otros roles se activa con `QUEUE_GROUP_ROLES`.

### CX2
- **Bloqueos:** con estancia activa no se puede marcar «Llegó», registrar «Paciente sin cita» ni agendar para hoy. El mensaje
  dice «Este paciente está hospitalizado (Cuarto 103, desde 29/10/2026)…» y ofrece «Ver paciente hospitalizado».
- **Citas a futuro:** se pueden agendar, con un aviso.
- **Citas de hoy:** no entran a «Por llegar hoy». En la Agenda salen como «Hospitalizado: cita en conflicto».
- **Cancelación por el sistema:** queda con motivo, autor «Sistema» y hora, y se puede reprogramar.
- **Tarjeta:** si la cita sigue en la cola, la tarjeta dice «Conflicto: hospitalizado» y «Preclínica» queda desactivada.

### GE2
- **Rótulos:** se quitó «Vista de» en todas partes. Venía de `VIEW_LABEL`; ese era el «Vista de médico».
- **Cambio de rol:** una flecha propia dentro de la tarjeta, que nunca abre Configuración.
- **Menús:** «Configuración de la clínica» recupera la tuerca. En el consultorio ya existía «Configuración del consultorio».

### NE4
- **Qué baja:** los diagnósticos vigentes bajan de la última nota firmada, o de la impresión diagnóstica del ingreso, en Estándar y en SOAP.
- **Bitácora:** registra qué se agregó y qué se quitó.
- **Otra nota firmada mientras tanto:** «Entendido» recalcula los diagnósticos, siempre que el médico no los haya tocado.
- **Procedimiento:** la nota de procedimiento no lleva diagnósticos y no corta la cadena.

### ME1, ME2 y NE5
- **ME1, la orden:**
  - nueva frecuencia «Infusión» con «Velocidad de infusión»: mL/h o mL/min, mayor que 0, hasta dos decimales;
  - el límite está en `clinicalConfig.ts`: 1000 mL/h y 20 mL/min, **solo contra errores de dedo**;
  - el rótulo pasa a «Hora de inicio» y desaparece PRN;
  - se lee «… · Infusión a 20 mL/h».
- **ME1, la hoja de enfermería:**
  - muestra un evento de inicio;
  - después dice «En infusión desde HH:MM · 20 mL/h» y quién la inició;
  - «Suspender infusión» pide hora y motivo opcional.
- **ME2, la orden:**
  - casilla «Primera dosis diferente (STAT)», solo con una frecuencia que se repite;
  - campos «Dosis inicial» y «Hora de la dosis inicial» (Ahora (STAT), o fecha y hora);
  - el campo de dosis pasa a «Dosis siguientes»;
  - se lee «Ceftriaxona IM · 2 gr STAT y luego 1 gr c/12h».
- **ME2, la hoja de enfermería:**
  - marca «Dosis inicial · 2 gr»;
  - cada registro guarda la cantidad que le tocaba;
  - «Cambiar» no repite una dosis inicial ya aplicada.
- **NE5, causa de fondo:** las columnas `1fr` de `.form-grid` no se encogen por debajo de su contenido, y la etiqueta del
  vademécum no partía línea. NE1 había arreglado la ventana, no el formulario de adentro. Medido sin desplazamiento horizontal a 1920, 1366, 1280 y 390 px.
- **NE5, fecha y hora:** campo propio dd/mm/aaaa HH:mm, que no depende del idioma del navegador.
- **NE5, botón «Agregar a la nota»:** sigue apagado mientras falta algo, porque es intencional. Ahora dice qué falta.

### EX3
- **Qué cuenta como Rayos X:** el subgrupo «Rayos X», o un nombre que empiece por «Rayos X», «Radiografía» o «Rx».
- **Estados:** «Realizado · sin informe», que ya no cuenta como pendiente, y «Con informe». El botón es «Agregar informe (opcional)».

### EX1
- **Filas:** todas cerradas, salvo los críticos sin revisar. Las acciones se pueden usar sin abrir la fila.
- **Herramientas:** «Buscar examen», orden por fecha con encabezado por día, «Todos | Pendientes | Con resultado | Críticos»
  con conteo, y «Expandir todo / Contraer todo».

### EX2
- **Documentos:** «Orden de laboratorio» y «Orden de imagen y gabinete», con solo los estudios Externo.
- **Contenido:**
  - número OE-AAAA-NNNN, fecha y hora;
  - edad, sexo, expediente e identidad del paciente;
  - indicación clínica de cada estudio;
  - especialidad y colegiación del médico, firma y sello.
- **Privacidad:** no dice «Externo» y no lleva el diagnóstico, salvo que el médico lo marque.
- **Salida:** «Imprimir» y «Descargar PDF», y cada impresión queda en la bitácora. WhatsApp funciona como ya estaba.
- **Al firmar la nota:** aparece el cuadro «Órdenes de exámenes: Imprimir / Descargar PDF».

### RF1
- **Dónde está:**
  - «Referencia» en observación y hospitalización;
  - «Referir a otro centro» en la consulta, tanto en borrador como firmada.
- **Formulario:**
  - destino, servicio y «Rutina | Urgente»;
  - campos llenados con el expediente y editables;
  - alergias;
  - borrador con autoguardado.
- **Firma:** pide motivo, destino y la casilla de consentimiento, que queda con su fecha y hora.
- **Estancia:** firmar **no** cierra la estancia; aparece «¿Registrar el egreso?», con «Trasladado a otro centro» ya elegido.
- **Corrección:** se anula con motivo y conserva su número.
- **Lo que se quitó:** la contrarreferencia y el cierre automático de la versión anterior.
- **Dónde se ve:** pestaña «Referencias» en el expediente, con Ver, Imprimir y Descargar PDF.

## Lo que pidió el reporte

- **EX2, por qué no se generaba antes:**
  - la orden sí se guardaba (cada nota crea su lote) y salía en «Órdenes impresas» solo con la fecha;
  - al firmar una nota de evolución no se ofrecía: solo la consulta externa llevaba a la orden;
  - la tarjeta de la nota no tenía enlace;
  - el documento mezclaba los de la clínica y los externos, con la palabra «Externo».
- **CX2, incongruencias (solo se reportan):**
  - el script es `server/incongruencias.ts`;
  - sobre una copia de la base local encontró 2:
    - una cita del 01/11 que quedó «En sala» (consultorio, `b102`);
    - una cita «Atendida» sin consulta firmada (`b101`).
  - **No lo corrí contra producción**, porque la sesión no tenía permiso para leer la base de Neon. Para verlo, ejecutar
    `npx tsx server/incongruencias.ts .env.neon.local`; solo lee.
  - «Paciente egresado por fallecimiento» no se puede buscar: el egreso no tiene una condición «Fallecido» (son Mejorado,
    Curado, Estable, Alta voluntaria y Trasladado a otro centro).
- **Migraciones v58 a v61:**
  - solo agregan columnas y son idempotentes: la segunda corrida no cambia nada, y está probado en una copia;
  - corren solas en el primer pedido después del despliegue (`ensureDb`), en todas las clínicas y consultorios;
  - **no hay paso manual**.

## Diferencias con el pedido (para que Emil decida)

- **ME1 y ME2 en la receta:** la receta de consulta externa usa otro formulario (`components/Medications.tsx`), así que
  ME1 y ME2 están en observación y hospitalización, no en la receta.
- **«Descargar PDF»:** abre la ventana de impresión con el aviso «elige Guardar como PDF», que es el mismo mecanismo del
  resto de la app. No hay un generador de PDF aparte.
- **Referencia:** se corrige anulando y emitiendo otra; no tiene adenda.
- **ME1, quién suspende la infusión:** enfermería la registra y la orden sigue activa para el médico, que la omite si corresponde.

## Pruebas y verificación

- `tsc -b`, lint y `vite build`: sin errores. El lint solo da advertencias que ya existían.
- **Arreglo del typecheck:** lo que se corría antes (`tsc --noEmit -p .`) no revisaba nada, porque el `tsconfig` raíz solo
  tiene referencias. Se cambió a `tsc -b`, el mismo del build, y salieron 2 avisos de imports sin usar, ya corregidos.
- **Suite completa:** 250 de 252 pasan.
  - Las que fallan son las de siempre: «fetch failed» en `api.test.ts` y `demoData.test.ts`, por la carga en paralelo; pasan cuando se corren solas.
  - Las pruebas viejas que esperaban que la referencia cerrara la estancia se actualizaron.
- **Revisado en el navegador:**
  - CX1 como Administración, a 1366 y 390 px;
  - GE2 con la Dra. López (dos roles);
  - el formulario de medicamento con ME2 a 1920, 1366, 1280 y 390 px;
  - la orden de EX2;
  - la referencia de RF1, de la firma al aviso de egreso.

  No recorrí cada criterio con cada rol en los cuatro anchos.
