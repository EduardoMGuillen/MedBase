# Pruebas de la auditoría de uso como médico y de la ronda 18

12 de noviembre de 2026, sobre `main`, en una instancia local (`localhost:5173`) con una base nueva y la demo del día
(`PGLITE_DIR=data/pglite-r18`), en un navegador automatizado (Chromium). Las pruebas de servidor corren con una base en memoria.

## Resumen

| Qué | Resultado |
|---|---|
| Pruebas automáticas del servidor (48 archivos) | 567 pasan, 1 falla (ya fallaba antes de esta ronda, ver abajo) |
| Typecheck (`tsc -b`), lint (`oxlint`) y `npm run build` | sin errores |
| Recorrido de todas las entradas del menú con 14 cuentas, a 1366 y 390 px | sin errores de consola, sin respuestas 4xx/5xx, sin pantallas vacías y sin desborde a lo ancho |
| Migración sobre una copia de la base como está desplegada (`7c3a212`) | pasos 1 y 2 aplicados; la segunda corrida no cambia nada; 84 pacientes y 28 personas antes y después |

La prueba que falla es `server/api.test.ts` › «la demo trae casos completos, de la preclínica al egreso» (`fetch failed` al iniciar
sesión). Falla igual en `7c3a212`, sin ningún cambio de esta ronda.

## Qué se probó en el navegador

| Cuenta | Pantalla | Qué se hizo | Resultado |
|---|---|---|---|
| 14 cuentas demo (administración, recepción, auxiliar y licenciada de enfermería, 3 médicos, radiólogo, técnica en imágenes, microbióloga, técnico de laboratorio, titular y asistente del consultorio, plataforma) | cada entrada de su menú | abrirla a 1366 px y a 390 px | carga, sin errores ni desborde |
| Dr. Hugo Nolasco | Nota postquirúrgica (hospitalización) | «Tipo de anestesia»: abrir, escribir «raq», Enter; escribir «xyz» y salir; «Ayudante 2»: escribir un nombre de afuera y «Usar «…»» | «Raquídea» elegida; «xyz» no queda y sale «Elige una opción de la lista»; el nombre queda escrito |
| Dr. Hugo Nolasco | misma nota | medir «Hora de inicio», «Ahora» y «Hora de cierre» | misma altura (40 px) y mismo borde de arriba |
| Dr. Hugo Nolasco | Exámenes de un hospitalizado, a 1366, 1100 y 390 px | estado al entrar, «Expandir todo», «Contraer todo», medir la barra | todo cerrado al entrar; se abren y se cierran grupos y exámenes; los cinco controles miden 40 px y comparten el borde de abajo |
| Dr. Hugo Nolasco | Notas de evolución en observación (1366, 1000, 390 px) y hospitalización (1920, 1366, 1100, 390 px) | contar botones y filas | Observación: 5 botones, una fila, ninguno de cirugía; lo que no cabe va a «Más acciones»; siempre una fila |
| Dr. Hugo Nolasco | «Subir la valoración preanestésica en papel» | abrir «Valoración realizada por» | solo «Dra. Silvia Arita · Anestesiología»; la lista queda dentro de la ventana, con fondo claro; el título no se corta |
| Dra. Valeria Solórzano | Biblioteca › paciente › Archivos | abrir la lista, escribir «refer» | 12 categorías; queda «Referencia o contrarreferencia» |
| Dra. Valeria Solórzano | Biblioteca › paciente | «+ Agregar nota para el equipo», guardar | sale bajo las etiquetas con «Dra. Valeria Solórzano · 12/11/2026» e «Historial (1)» |
| Andrea Quiroz (recepción) | mismo paciente | ver la nota; intentar cambiarla por la API | la ve sin «Cambiar»; el servidor responde 403 |
| Ricardo Moncada | Reportes | 30 días, 7 días, Mes (noviembre y octubre), 390 px | porcentaje en los cuatro cuadros; el mes en curso dice «vs. 1–12 oct»; octubre, 31 barras por gráfica y «vs. mes anterior»; el periodo queda en la dirección; sin desborde |
| Dra. Isabel Pacheco (consultorio) | Inicio y menú, vista Médico y vista Administración | cambiar de vista cuatro veces, pulsar «Llegó» | vista Médico: grupo «Agenda» sin «Cobrar», cuatro cuadros en una fila, sin «Cobrado hoy»; «Llegó» registra la llegada; ninguna respuesta 4xx |
| Lic. Marta Urbina | menú | plegar «Pacientes», recargar, entrar a Hospitalizados | plegado muestra la suma (5); sigue plegado al recargar; se abre solo al entrar a una página del grupo |
| Aux. Rosa Vallecillo, Dra. Solórzano, Dr. Nolasco | Hospitalizados y un expediente | comparar columna «Pendientes», filtro, insignia y recuadro | enfermería: 5 pacientes con pendientes (insignia 5, filtro 5), con «Otros: Médico…»; la tratante: firmas y resultados, lo de enfermería en «Otros»; el cirujano (no tratante): «Sin pendientes para ti · 6 de otros» |
| Aux. Rosa Vallecillo | Hospitalizados | tocar «6 signos atrasados»; ver la lista a 390 px | abre el expediente en Signos vitales; en el teléfono cada tarjeta muestra sus pendientes |
| Dra. Valeria Solórzano | Agenda | vista Día | la cuadrícula empieza a las 02:00 por la cita de las 02:30; el bloque dice «Consulta atendida» y se lee |

## Qué se probó con pruebas automáticas nuevas

- `server/ronda18.test.ts` (9): cobro del consultorio por vista y por dirección directa; «Llegó» en la vista Médico; rechazo de
  autorización quirúrgica, valoración preanestésica y nota postquirúrgica en observación (médico y enfermería) y que en
  hospitalización siguen; alta del técnico en anestesia, sus permisos exactos, lo que no puede (notas, autorizaciones, valoración
  en el sistema, reportes), su pendiente y que solo él puede llenar la hoja.
- `server/ronda18_pendientes.test.ts` (9): responsables de cada tipo, firma del paciente compartida y firma del médico aparte,
  resultados del médico que pidió y del tratante, muestras, Laboratorio e Imágenes, Consultorio con y sin enfermera, y el conteo
  de órdenes nuevas (auditoría, punto 3).
- `server/ronda18_ui.test.ts` (7): ningún `<select>` ni `<datalist>` en la app, filtro de la lista, atributos ARIA, grupos del menú.
- `server/ronda18_reportes.test.ts` (11), `server/ronda18_nota.test.ts` (14), `server/auditoria_agenda.test.ts` (3).

## Lo que se encontró y cómo se arregló

| Hallazgo | Arreglo |
|---|---|
| Dentro de un campo, la lista nueva heredaba el estilo del rótulo (letra gris, pequeña y en negrita), porque `.field > span` vale para cualquier `span` | regla propia para `.field > span.combo` (commit de PX1/PX2) |
| La columna «Paciente» de Hospitalizados repetía la especialidad a cualquier ancho: `.board__who small { display: block }` le ganaba a `.board__spec { display: none }` | selector más específico (commit de PD1/PD2) |
| Cuatro pruebas de rondas anteriores daban por hecho documentos de cirugía en observación, y una el texto «(bajo)» | se ajustaron a las reglas nuevas (dos commits «Pruebas: …») |
| Tres pruebas de migraciones suponían que no había pasos publicados | numeran sus pasos de prueba después de los publicados (commit de NP1) |
| En el expediente, la fila de pestañas sobresale 12 px a 1100 px de ancho | no se tocó: ya pasaba antes y no es de ningún punto; está en «fuera de la lista» del reporte |

No se encontró ningún error funcional nuevo en el recorrido.

## Lo que no se pudo probar y por qué

- **Impresión real** en papel: no hay impresora; las hojas se revisaron solo por sus pruebas automáticas, no en vista previa.
- **Caída de internet a medio escribir** y **dos usuarios con el mismo borrador a la vez**: no se simularon en esta pasada.
- **Cada botón de cada pantalla**: el recorrido abrió todas las entradas del menú de todos los perfiles y los flujos de la tabla
  de arriba; no pulsó todos los botones de todas las pantallas (admisión, egreso, cobro completo y Configuración quedaron
  cubiertos solo por las pruebas de servidor que ya existían).
- **Con el dedo**: los 44 px táctiles dependen de `pointer: coarse`; el navegador automatizado no es táctil. A 390 px se midió el
  desborde, no el toque.
- **Auditoría, punto 1 (carga del Inicio con red lenta)** y **punto 8 (clic real en el buscador CIE-11)**: revisados en el código,
  no en pantalla. En el punto 8 el código no tenía el defecto de cerrar la lista al perder el foco; lo más probable es que fuera
  un artefacto de la prueba automatizada (la lista se reacomoda cuando llega la búsqueda). Sí se corrigió que el foco se perdía al
  elegir con clic (en el teléfono cerraba el teclado).
- **El aviso «Tu rol no tiene permiso para esta acción» al pulsar «Llegó»** (captura 8): no se pudo reproducir; el permiso ya
  existía desde la ronda 17 y ahora hay una prueba que lo fija.
- **Técnico en anestesia en pantalla**: crear la cuenta, entrar y firmar una hoja se probó por la API (pruebas automáticas), no
  haciendo clic. Lo mismo el Consultorio con enfermera activa (la demo no tiene una).
- **Postgres real**: la migración se probó en PGlite (el mismo motor de las pruebas), no contra la base de producción.
