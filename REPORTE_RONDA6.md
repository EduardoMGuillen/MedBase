# Ronda 6: reporte

Rama `correcciones-emil-7` (sin subir al remoto). Un commit por punto con su código (`git log --oneline main..`).

## Antes de leer: lo que no llegó

- **El texto del pedido llegó cortado a mitad de TU1** («Panel del día: al tocar un día se abre un panel lateral… con
  casillas»). Llegó así las dos veces que se pegó. **No se hizo nada de TU2, PE1, GE1, MI1 ni MI2**, y de TU1 solo el
  panel del día. Tampoco llegaron la sección 6 (valores por defecto A6, A7, A9…) ni los anexos A y B.
- **Los adjuntos no llegaron** (`Correcciones clinada ronda 6.docx` y `Scanned_20261031_102603.pdf`): no se vio
  ninguna captura y no se validó nada contra el PDF.
- Para seguir hace falta el resto del texto (desde «Panel del día…») y los dos archivos, por ejemplo en `docs/ronda6/`.

## Puntos

| Punto | Estado | Commit |
|---|---|---|
| MC1 Exámenes arriba de medicamentos | Hecho | `[MC1]` |
| MC2 PRN | Hecho (valor por defecto; ver abajo) | `[MC2]` |
| MC3 No catalogado con tipo | Hecho | `[MC3]` ×2 |
| MC4 Rediseño de «Ordenar exámenes» | Hecho | `[MC4]` |
| MC5 Exámenes en las notas | Hecho | `[MC5]` |
| MC6 Frecuencia de signos desde la nota | Hecho | `[MC6]` |
| MC7 Cadena de indicaciones y medicamentos | Hecho | `[MC7]` |
| MC8 Signos vitales en la nota | Hecho | `[MC8]` |
| EN1 «Urgente» en paciente sin cita | Hecho | `[EN1]` |
| EN2 Una toma limpia las pendientes | Hecho | `[EN2]` |
| EN3 «No aplicada» fuera del aviso | Hecho | `[EN3]` |
| CE1 Sin «Cobrar» en Atendidos | Hecho | `[CE1]` |
| AD1 / RE1 «Por llegar hoy» agrupado | Hecho | `[AD1][RE1]` |
| CR1 Procedimientos → recordatorios | Hecho | `[CR1]` |
| CR2 «En X días · fecha» | Hecho | `[CR2]` |
| CF1 Servicios: botón azul arriba | Hecho | `[CF1]` |
| CF2 Áreas 1/3 – Umbrales 2/3 | Hecho | `[CF2]` |
| CF3 Catálogo del PDF | **Infraestructura hecha; faltan los datos** (Anexo A) | `[CF3]` |
| CF4 Catálogo plegable | Hecho | `[CF4]` |
| CF5 Botón azul en otras pestañas | Hecho | `[CF5]` |
| CF6 Perfiles de laboratorio | **Infraestructura y pantallas hechas; faltan los datos** (Anexo B) | `[CF6]` |
| TU1 Rol de turnos | **Parcial**: solo «Panel del día» | `[TU1]` |
| TU2, PE1, GE1, MI1, MI2 | **No hechos**: su texto no llegó | — |

## Lo que encontré y decidí

**MC2 (PRN).** `git log -S` / `-G` no muestra que se haya quitado un PRN de la receta: los únicos cambios con «PRN» son
refactorizaciones (`344b9d2`, `259da21`, `0d57cab`, `61f03ee`). La receta solo tenía la frecuencia «Según necesidad», sin
condición; la nota de evolución sí tenía la casilla PRN. **Se usó el valor por defecto del pedido**:

- frecuencia «PRN (si es necesario)» con «Condición» obligatoria;
- en la receta se imprime «PRN: si dolor»;
- en la nota y en «Medicamentos activos» se muestra «PRN · si dolor»;
- en la hoja hay una fila PRN con la última dosis y el botón para registrar una.

La receta nueva exige la condición también en el servidor. En la nota de evolución solo la exige la pantalla, porque
clientes y sets anteriores mandan PRN sin condición.

**MC3.** Las radiografías cayeron en Laboratorio porque la ventana ponía «Laboratorio» por defecto al tipo de lo no
catalogado. Ahora el tipo se elige siempre. Lo no catalogado ya no se convierte en externo (como hacía la ronda 5): va a
su sección y a su bandeja con la etiqueta «No catalogado».

**MC5. La causa no era de datos.** Las órdenes de examen sí quedaban vinculadas: las de la consulta de ingreso por
`consultation_id` y las de las notas por `note_id`. El componente de dos columnas de la nota nunca tuvo bloque de
exámenes. Se agregó en la nota de ingreso, en las evoluciones, en «Ver nota completa» y en el expediente impreso.

**MC7.** Cada nota firmada guarda ahora el cuadro completo (`hosp_notes.data.lines`). Cada línea lleva identificador
estable y etiqueta (Continúa, Nueva, Modificada u Omitida) y cada línea es una orden de su checklist. Si otra nota se
firmó mientras se escribía, el servidor responde 409; la pantalla avisa, recalcula y bloquea «Firmar» hasta que el
médico confirme. Las notas de antes se leen igual que siempre.

**MC6.** La frecuencia se guarda por tramos (`hospitalizations.vitals_plan`). Un cambio rige desde la siguiente hora en
punto y las tomas pasadas no se recalculan. Si la estancia es de antes y su frecuencia venía del texto de las órdenes
(«cada 2 horas»), el control la muestra y la etiqueta sale «Modificada» al cambiarla. En la hoja de signos, si ya hay
plan, el selector anterior se reemplaza por el texto vigente y la siguiente toma.

**EN2. Reproducido en el código:** una toma solo cumplía la hora esperada si caía a ±1 h de ella. Ahora una toma cubre
todas las pendientes anteriores («Cubierta por la toma de las HH:MM»). Una lectura anotada más de 60 min después de
tomada es «Registro tardío».

**EN3.** El cierre automático («No aplicada (sin registro)», cerrada automáticamente por el sistema al llegar la
siguiente dosis) es un estado **calculado**: no escribe un registro de dosis y enfermería todavía puede registrarla. Por
eso no deja una línea propia en la bitácora; lo que sí registra enfermería queda en ella como siempre. La dosis única no
tiene siguiente y sigue avisando.

**EN1.** La etiqueta «Urgente» sale de `type = 'urgent'`, que antes solo ponía la Agenda (se conserva). En el código no
hay ningún «min esperado»: todas las tarjetas dicen «min esperando». Si la captura venía de producción, puede ser una
versión anterior.

**CE1.** No hay hueco: en Caja, «Nuevo cobro» busca a cualquier paciente y enlaza su visita de hoy. La etiqueta
«Atendida» pasó a «Consulta atendida» en toda la app.

**CR1.** Los procedimientos ya eran seguimientos (`followups.kind = 'procedure'`). Se copian como recordatorios de tipo
Procedimiento y el original queda inactivo con `migrated_to`, sin borrarse. La migración es idempotente. Los
recordatorios de antes no tenían tipo y muestran «Recordatorio»; los nuevos eligen Examen, Procedimiento u Otro.

**CF5.** Cambiada: Camas. Ya tenían el botón arriba: Catálogo de exámenes y Vademécum. Sin alta propia, no se tocaron:
Clínica (sus teléfonos se guardan con el formulario), Formas de pago, Áreas de servicio (los umbrales se guardan con
«Guardar umbrales»), Horarios de médicos y Rol de turnos.

## CF3 y CF6: para cargar el PDF

`server/data/labCatalog.ts` tiene las tres listas (`LAB_CATALOG`, `LAB_EQUIVALENCES` y `LAB_PROFILES`) **vacías a
propósito**, para no inventar exámenes. La tabla de equivalencias solo trae los cuatro ejemplos que da el pedido. Para
cargar el anexo:

1. Pegar los datos en ese archivo.
2. Subir `SCHEMA_VERSION` en `server/db.ts`.
3. Desplegar.

`server/catalogLoader.ts` compara por nombre sin mayúsculas, tildes ni signos y por la tabla de equivalencias. No toca los
existentes, crea los nuevos sin rangos y agrega al catálogo («Otros») el componente de un perfil que no exista. Las
pruebas comprueban que correrlo dos veces no cambia nada. **Agregados: 0. Omitidos: 0. Casos dudosos: ninguno todavía**,
porque no hay datos. Cuando se cargue, el resultado de `loadLabCatalog` da las tres listas para el reporte.

## Para que valide Emil (marcado «VALIDAR: Emil»)

- `src/lib/clinicalConfig.ts`:
  - turnos de signos vitales 07:00, 15:00 y 23:00;
  - frecuencias de 1 a 24 h;
  - «Otra frecuencia…» de 1 a 72 h;
  - 60 min para considerar «Registro tardío».
- `src/lib/exams.ts`:
  - subgrupos;
  - **A6 propuesto** (subgrupo de los 32 exámenes que ya existían, tabla en `PLAN_RONDA6.md`), porque la sección 6 no
    llegó.

## Verificación

- Typecheck, lint (0 errores) y build pasan después de cada punto.
- `npm test`: 225 de 227. Las dos que fallan («fetch failed» en `api.test.ts` y `demoData.test.ts`) **ya fallaban antes
  de esta ronda** y pasan al correrlas solas (29/29 y 6/6). Es inestabilidad del servidor de prueba bajo carga en
  paralelo.
- Pruebas nuevas en `server/ronda6.test.ts` (19). Se actualizaron pruebas de rondas anteriores que describían el
  comportamiento que esta ronda cambia a propósito:
  - lo no catalogado ya no se vuelve externo (MC3);
  - una toma posterior cubre las anteriores (EN2);
  - la dosis atrasada se cierra con la siguiente y la no aplicada no avisa (EN3);
  - la limpieza de la prueba de base v8 incluye las copias de CR1.
- Navegador (base PGlite local, nunca la remota), en escritorio y a 390 px:
  - MC1, MC2, MC4, MC5, MC6, MC7 y MC8 como Dra. Herrera;
  - EN1 como Recepción, Enfermería y Administración;
  - EN2 como Enfermería;
  - CE1 como Administración, Recepción, Enfermería y Consultorio;
  - AD1/RE1 como Roberto Aguilar y Sofía Mejía;
  - CR1 y CR2;
  - CF1, CF2, CF4, CF5, CF6 y TU1 como Administración.
- Permisos por URL directa: probados en el servidor para CF6 (el médico recibe 403) y para la preferencia de vista
  (Administración no guarda datos clínicos).
- **Sin probar en el navegador:** MC6 y MC8 dentro de una observación del Consultorio, y la impresión en papel. Las
  vistas de impresión usan los mismos componentes, pero no se imprimieron.
