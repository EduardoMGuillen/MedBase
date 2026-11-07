# Reporte de la ronda 17

Pedido: `docs/ronda17/PEDIDO_RONDA17.md`. Plan, tabla de perfiles (PF2) y lista de ajustes antes y después (CF1): `PLAN_RONDA17.md`.

La ronda se hizo en dos partes. La primera (los puntos del pedido) salió a producción el 7 de noviembre de 2026 hasta `fe34eb8`. La segunda junta tres pedidos que no venían en el Word: los pendientes de rondas anteriores que encontré en la auditoría (PE), un mismo estilo en toda la app (ES) y el modo tablet con la revisión en teléfono (TB).

## 1. Estado por punto

### Puntos del pedido

| Punto | Estado | Archivos principales | Cómo lo pruebas |
|---|---|---|---|
| UI1 | Hecho | `Staff.tsx`, `Activity.tsx`, `modules.css` | Personal y roles: el encabezado de la tabla no tapa filas, las columnas son parejas y la tabla baja con la página. Arriba hay filtros por nombre o correo, rol y estado, y «Quitar filtros». |
| UI2 | Hecho | `DateTimeField.tsx`, `clinical.css`, `modules.css` | En cualquier campo de fecha, el calendario queda dentro del campo. En la Agenda, nada se monta sobre la barra de arriba. |
| UI3 | Hecho | `FluidBalance.tsx`, `src/lib/fluids.ts`, `clinical.css` | «Registrar ingreso o egreso»: dos columnas parejas, «Ahora» en la misma línea. La tabla del día tiene una sola columna con el corte de 24 horas. |
| IE2 | Hecho | `FluidBalance.tsx`, `src/lib/fluids.ts` | En Ingestas y excretas solo aparecen los rubros con registros ese día, y Líquidos IV solo si hubo. Un día sin datos dice «Sin registros este día». |
| OB1 | Hecho | `server/db.ts` (v90), `server/routes/settings.ts` | Una clínica nueva trae activado «Enfermería las revisa como checklist». En las existentes se activó una sola vez. |
| AD1 | Hecho | `AppShell.tsx`, `Dashboard.tsx`, `Observation.tsx`, `AmbulatoryPatients.tsx` (nuevo), `DeptPages.tsx`, `routes/inpatient.ts`, `routes/dept.ts` | Como Ricardo Moncada o Andrea Quiroz: Observación en solo lectura, sin abrir el expediente. Administración tiene «Laboratorio e imágenes» con Pacientes ambulatorios y las bandejas en solo lectura. Los botones del Inicio llevan a su lugar. |
| PF1 | Hecho | `permissions.ts`, `src/tours/medico.ts` | Como Dra. Valeria Solórzano (o la Dra. Gálvez, de Dermatología): «Paciente sin cita» en Consulta externa. |
| LB9 | Hecho | `DeptTray.tsx`, `src/lib/exams.ts` | Como Lic. Paula Suazo: Ambulatorio, Observación y Hospitalización con la misma tarjeta y botones por categoría, aunque haya una sola. |
| NO4 | Hecho | `InpatientFile.tsx` (NoteEditor), `NoteColumns.tsx`, `src/lib/inpatient.ts` | En una nota de evolución SOAP, los diagnósticos van antes del SOAP. En la nota de ingreso van debajo de A. |
| PF2 | Hecho | `src/lib/nav.ts` (`sidebarFor`), `AppShell.tsx`, `permissions.ts` | La barra lateral sigue el flujo de trabajo, con los mismos grupos para todos. La tabla por perfil y la revisión por URL están en `PLAN_RONDA17.md`. |
| CF1 | Hecho | `Settings.tsx`, `MyConfig.tsx`, `App.tsx`, `src/tours/*` | `/app/configuracion` abre «Datos de la clínica». Cada sección tiene su URL. «Guardar cambios» está abajo y, si sales con algo sin guardar, te pregunta. |

### Fuera del Word (pedidos de Edu)

| Punto | Estado | Archivos principales | Cómo lo pruebas |
|---|---|---|---|
| IF1 | Hecho | `Medications.tsx`, `src/lib/medForm.ts`, `server/app.ts` | «Infusión continua» aparece en la frecuencia de cualquier paciente, no solo de los internados. |
| Gálvez | Hecho | `server/db.ts` (v89), `server/demoUsers.ts` | La Dra. Gálvez (Dermatología, demo) entra sin código de verificación. |
| PE | Hecho | ver abajo | Pendientes de rondas anteriores encontrados en la auditoría. |
| ES | Hecho | `index.css`, `modules.css`, `clinical.css`, `components/ui.tsx` (`PageHead`, `BackButton`) y ~70 pantallas | Un mismo diseño en toda la app. Abajo está el detalle. |
| TB | Hecho | `src/boards.css`, `src/responsive.css` (nuevos), `BedBoard.tsx` (nuevo), `Inpatients.tsx`, `Observation.tsx`, `AppShell.tsx`, `src/lib/hooks.ts` | Tablet y teléfono. Abajo está el detalle. |

**PE · pendientes de rondas anteriores**
- «Volver a los anexos» de la autorización regresa a Observación cuando la estancia es de observación (`Authorization.tsx`).
- Los archivos del expediente aceptan hasta 15 MB, con subida por partes. Los PDF de resultados y adjuntos salen en el expediente completo impreso.
- El teléfono de la clínica se imprime sin «+504».
- En una cuenta de consultorio, los mensajes del servidor dicen «consultorio» (`placeOf`).
- Los exámenes externos no ofrecen «Muestra tomada» ni «Realizado».
- Al ordenar exámenes, no aparece «Agregar como no catalogado» si lo buscado está en el catálogo. El aviso dice quién recibe los pendientes.
- En el registro de anestesia, el fármaco se busca en el vademécum y sigue aceptando texto libre.
- Los sets de órdenes guardan la velocidad de una infusión continua y la vuelven a poner al aplicar el set.
- **Agenda:** los nombres de los médicos (y los días, en Semana) quedan fijos arriba al bajar la página. La agenda sigue bajando con la página, sin alto fijo ni desplazamiento interno, y la barra de arriba sigue sincronizada.
  - Pruébalo: Agenda › Día, baja hasta las 15:00 y los nombres siguen arriba. Mueve la barra de arriba a lo ancho y los nombres se mueven con las columnas.

**ES · un mismo estilo**
- **Menú desplegable:** uno solo, con flecha propia (`.select`, `.select--sm` para filas compactas, `.select--auto`).
- **Menús emergentes:** sugerencias de búsqueda, «⋯» de fila, cambio de rol, ayuda, sets, fuente, calendario y lista de materiales comparten superficie, borde, radio, sombra y renglones de 40 px.
- **Avisos y urgencias:** se acabaron los recuadros con barra de color a la izquierda. El color va en el borde completo, con fondo suave si es urgente. Se quedan los colores de cada médico en la Agenda y en «Por llegar», porque dicen de quién es la cita.
- **`badge` y `chip`:** `badge` marca estados (alergias, «Sin órdenes de ingreso», autorización pendiente, valores alterados, «Corregida») y mide lo que su texto. `chip` queda para filtros y etiquetas.
- **Cabeceras:** las de documentos, formularios de anestesia y recuento, y plataforma usan `PageHead`. Hay un solo «volver» (`BackButton`).
- **Enlaces y alineación:** un solo botón con aspecto de enlace (`.linklike`) y la utilidad `.self-start`.
- **Variables de diseño:** para fondos suaves, bordes de aviso y radios (`--paper-soft`, `--amber-soft`, `--red-soft`, `--warn-line`, `--err-line`, `--r-sm`…`--r-pill`).
- **Estilos sueltos:** unos 300 `style={{}}` pasan a utilidades. Comparé píxel por píxel 33 vistas antes y después, y quedaron iguales.
- Pruébalo:
  - Personal y roles: los filtros «Rol» y «Estado» tienen la misma flecha que cualquier otro desplegable.
  - Inicio de Laboratorio: la alarma urgente tiene el borde rojo completo, sin barra a la izquierda.
  - Abre una receta: «Expediente de …» es el mismo botón «volver» que en una constancia o un recibo.

**TB · tablet y teléfono**
- **Hospitalizados:** una tabla sobria de camas en vez de tarjetas.
  - El cuarto agrupa sus camas.
  - Arriba hay un filtro segmentado «Todas / Ocupadas / Libres» con conteos, que queda en la URL (`?ver=`).
  - Etiquetas «Ocupada» y «Libre», y los avisos al final de la fila.
  - Toda la fila abre el expediente.
  - Sin expediente (administración y recepción) se ve lo mismo que antes: quién, especialidad y médico.
- **Observación:** la misma tabla, con el filtro «Todos / Más de N h». La fila se pone roja pasado el límite.
- **Hasta 1000 px:** la especialidad pasa debajo del paciente.
- **Hasta 760 px:** cada fila es un bloque con el cuarto y su estado arriba.
- **Modo tablet (768 a 1180 px):** la barra lateral es una franja de íconos de 72 px.
  - Los contadores se ven como un punto con su número, y el nombre de cada opción sale al pasar el dedo o el ratón.
  - El botón de arriba abre la barra completa encima del contenido, sin mover la página.
  - Con la tableta en horizontal, desde 1000 px, vuelven las dos columnas.
- **Con el dedo** (pantalla táctil): botones, campos, pestañas y casillas miden al menos 44 px.
- **Revisión en teléfono:**
  - Reportes no se desplazaba a lo ancho: las etiquetas del eje no se encogían y las dos gráficas iban lado a lado a 360 px. Ya está corregido.
  - Las alarmas de Laboratorio e Imágenes quedaban en una columna angosta. Ya está corregido.
- Pruébalo:
  - Hospitalizados a 1366 px: tabla por cuarto. Toca «Libres» y quedan solo las libres, con «Ingresar aquí».
  - En una tableta (o a 1024 px): la barra es de íconos. Toca el botón de arriba y se abre encima. Elige una opción y se cierra.
  - A 390 px: Hospitalizados y Observación se ven como bloques y ninguna pantalla se desplaza a lo ancho.

Commits: uno por punto (`[ronda17][CODE] …`), en las ramas `ronda17-ui`, `ronda17-lab-notas`, `ronda17-perfiles`, `ronda17-config`, `ronda17-pendientes`, `ronda17-estilo` y `ronda17-tablet`, todas unidas a `main`.

## 2. Base de datos (esquema 88 → 90)

- **v89** (arreglo): `disableDemoTotpOnce`. Una sola vez, quita la verificación en dos pasos a la Dra. Gálvez de la demo.
- **v90** (OB1): activa una sola vez «Enfermería las revisa como checklist» en las clínicas existentes. Las nuevas la traen activada.
- La segunda parte (PE, ES, TB) no cambia la base. Los archivos de 15 MB usan la tabla de archivos que ya existía, subidos por partes.

## 3. Defaults usados

- `checkin.manage` para todo médico de la clínica (PF1). Le agrega también «Registrar llegada» y «No asistió» en la Agenda.
- Administración y recepción ven Observación en solo lectura, sin expediente (AD1).
- Administración ve las bandejas de Laboratorio e Imágenes en solo lectura (AD1).
- El checklist de órdenes en observación queda activado en todas las clínicas (OB1).
- La configuración tiene una sección propia, «Vademécum» (CF1), que no estaba en la lista del pedido.
- **Estilo:** solo se quitaron las barras de color de los avisos. Los colores de cada médico se quedaron porque identifican quién atiende.
- **Tablet:** de 768 a 1180 px. La barra abierta se cierra al elegir una opción. Los 44 px se aplican solo con pantalla táctil, para no agrandar la vista en computadora.

## 4. Para que Emil valide

- **TU1 (ronda 6):** copiar semana, repetir turno para médicos y colores en el rol de turnos.
- **MI1 y MI2 (ronda 6):** el texto nunca llegó.
- **«Química sanguínea»:** qué lleva como perfil.
- **Paciente ambulatorio:** si queda «pendiente de cobro» en Caja.
- **Valoración preanestésica:** la tarjeta de pendientes en el Inicio.
- **Contradicciones entre rondas:** el lugar del diagnóstico, la infusión sin ingreso, las viñetas en la orden y los números en la receta.
- **Los defaults de la sección 3.**
- **Hospitalizados como tabla:** si quiere alguna columna más (por ejemplo, alergias como columna propia en vez de aviso al final).

## 5. Fuera del alcance (encontrado al revisar)

- **Teléfono, cabecera del paciente:** en el expediente, la fila de datos (edad, expediente, identidad, seguro) se desplaza a lo ancho con el dedo y el número de identidad queda medio cortado al borde. Está así a propósito desde las primeras versiones (`.ph__meta`), para que la cabecera no ocupe media pantalla. Si Emil prefiere que baje de línea, es un cambio de una línea.
- **Prueba de api.test:** «la demo trae casos completos» falla con «fetch failed» desde la ronda 11. Pasa igual en `main` antes de esta ronda: no es nuevo.

## 6. Revisión final

- **Pruebas:** corrí los 40 archivos, uno por uno. Todo pasa, salvo la prueba antigua de api.test de la sección 5.
- **Lint y build:** sin errores. Quedan tres avisos `react(purity)` en `InpatientFile.tsx` que ya existían.
- **Desplazamiento a lo ancho:** revisé cada entrada de la barra lateral de los 13 usuarios demo a 360, 390, 768, 1024, 1366 y 1920 px. Después del arreglo de Reportes ninguna pantalla se desplaza a lo ancho.
- **Comparación de píxeles:** las pantallas de computadora quedan iguales antes y después del estilo y del modo tablet, salvo lo que se cambió a propósito.
