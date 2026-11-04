# Reporte de la ronda 13

Pedido: `docs/ronda13/PEDIDO_RONDA13.md`. Plan: `PLAN_RONDA13.md`. Capturas del pedido: `docs/ronda13/capturas/` (las 7
corresponden a su punto). Evidencias de después: `docs/ronda13/despues/`. Esquema: 80 → 81.

## 1. Estado por punto

| Punto | Estado | Archivos principales | Cómo probarlo |
|---|---|---|---|
| AP3 | Hecho | `PatientChart.tsx` (`BackgroundView`) | Dra. Herrera › consulta de un hipertenso: en «Personales patológicos» solo sale «Enfermedades». La etiqueta sigue en el encabezado y en «Crónicos y seguimientos». Igual en Expediente completo, Biblioteca, hospitalización y Consultorio (es el mismo componente) |
| AP4 | Hecho | `format.ts`, `PatientForms.tsx`, `clinical.css` | «Antecedentes › Editar»: no está «Transfusionales»; Hospitalarios, Traumáticos y Quirúrgicos van uno debajo del otro, a todo el ancho y del mismo alto; Toxicomanías e Inmunizaciones empiezan a la misma altura. Todos crecen con el texto, sin barra |
| NE8 | Hecho | `InpatientFile.tsx`, `GoToNote.tsx` | Hospitalizado › «Nueva nota de evolución», escribe algo, pasa a Exámenes: arriba «N avisos», los dos avisos azules pegados (6 px), los exámenes y la nota al final. Signos vitales, Medicamentos, Enfermería y Anexos igual. «Ir a la nota» baja a ella |
| CX5 | Hecho | `Consultation.tsx`, `PatientChart.tsx`, `GoToNote.tsx`, `clinical.css` | Consulta de un paciente con varias consultas: «Ver expediente» lo abre; al bajar, la barra «Expediente completo de …» con «Contraer expediente» queda fija bajo el encabezado del paciente. Al contraer, la página queda en la sección y lo escrito sigue. Sin barra propia; «Contraer expediente» también al final; «Ir a la nota» flotante. Sin «Agregar adenda» ni «Generar constancia» |
| IM1 | Hecho | `ClinicalDoc.tsx` (nuevo) y los 10 documentos | Imprime a PDF una receta, una orden, un resultado, una constancia: Carta, el mismo encabezado (logo si lo hay, clínica o consultorio, dirección y teléfono, sin el médico), la misma cuadrícula, fecha `dd/mm/aaaa HH:mm`, firma sin raya con nombre, especialidad y colegiado |
| IM2 | Hecho | `Prescriptions.tsx`, `PrintJob.tsx`, `doseText.ts`, servidor | Termina una consulta con receta: «Incluir diagnóstico» viene apagada. Márcala: aparece «Diagnóstico»; recarga y sigue igual. Como Lic. Ríos la casilla no aparece (y la API responde 403). «2 cápsula» se lee «2 cápsulas» |
| IM3 | Hecho | `exams.ts` (`orderGroups`), `ExamOrder.tsx` | Orden de 14 exámenes: Hematología › 1. Hemograma; Coagulación › 1. TP, 2. TPT; Química en sangre › 1–10; Química en orina › 1. Microalbuminuria; cabe en una hoja Carta. Un examen escrito a mano sale en «Otros exámenes» al final |

Commits: uno por punto (`[ronda13][AP3][AP4]`, `[NE8]`, `[CX5]` y su ajuste a 390 px, `[IM2]`, `[IM3]`, `[IM1]`). IM1 lleva
también la parte de pantalla de IM2 e IM3, porque se dibujan dentro de la plantilla.

## 2. Lo que me pediste averiguar

- **¿Por qué seguía «Transfusionales»?** No había dos ventanas: hay una sola (`BackgroundForm`) y una sola tarjeta. En el
  pedido de la ronda 12 tal como quedó registrado (`docs/ronda12/PEDIDO_RONDA12.md`) no aparecía quitar los transfusionales, y
  `BACKGROUND_GROUPS` los dejó en «Personales patológicos». Ya no se piden. Lo escrito se ve en la tarjeta como
  «Transfusionales (campo retirado)», en solo lectura, al final del apartado patológico. «Actividad física y alimentación»
  ahora cumple la misma regla: antes no se mostraba aunque tuviera texto; ahora sale como «Actividad física y alimentación
  (campo retirado)» al final de «Personales no patológicos».
- **¿Categoría o Subgrupo?** El catálogo agrupa por el **Subgrupo** del examen (`Área › Sección`, p. ej. «Hormonas ›
  Tiroides»). La orden agrupa por el **área** del subgrupo, en el orden del catálogo y, dentro, sección por sección en el orden
  del formulario. Se usa el subgrupo que la clínica tiene guardado en su catálogo.
- **Perfiles (A6)**: se guardan **sueltos**. Al ordenar un perfil se agregan sus exámenes uno por uno; la orden no recuerda el
  perfil. Por eso salen sueltos en sus grupos.
- **«Ir a la nota» en consulta externa**: **no existía** (tampoco el flotante de hospitalización de NE7). Lo agregué como un
  solo componente (`GoToNote`): aparece cuando la nota queda fuera de la vista y baja hasta ella, en consulta, observación y
  hospitalización.
- **El «+504» del teléfono**: **no lo agrega el código**. Viene escrito así en la configuración de la clínica de demostración
  (`src/lib/seed.ts`: «+504 2232-7710»; también San Lucas y el consultorio de la Dra. López). Lo dejé como está; se corrige en
  Configuración › Datos de la clínica.

## 3. Inventario de documentos imprimibles

Usan la plantilla única (`ClinicalDoc`): receta (consulta externa, sin consulta, de egreso), receta de la estancia (ME10 y
ME12), orden de laboratorio, orden de imagen y gabinete, resultados (EX6), constancias (cuatro tipos), hoja de referencia
(nueva y la de antes de la ronda 8), epicrisis, autorizaciones (general, quirúrgica, quirúrgica genérica, hospitalización),
nota de consulta impresa y recibo de caja. `DocHeader` se borró: ya nadie lo usa.

No la usan (te pregunto, no lo cambié):
- **Expediente completo** (`FullRecord.tsx`): es una compilación por secciones con su propio encabezado por hoja, no un
  documento con folio y firma. La epicrisis y las autorizaciones que van dentro sí salen con la plantilla nueva.
- **PDF de la autorización firmada en pantalla** (`server/consentPdf.ts`): se genera en el servidor con la firma y queda con
  su huella (hash). Cambiarle el formato rompería la constancia de que es el mismo documento firmado.
- **Cierre de caja** (lista impresa de la pantalla de Caja): es un reporte de pantalla, no un documento del paciente.

## 4. Base de datos (v81)

- `prescriptions.include_dx` (BOOLEAN): «Incluir diagnóstico» de la receta. Las recetas de antes quedan **sin dato** (NULL) y
  se imprimen como antes, con el diagnóstico de la consulta (A8). Las nuevas empiezan en FALSE.
- `print_jobs.include_dx` (BOOLEAN, FALSE): lo mismo para la receta de la estancia, que antes siempre salía sin diagnóstico.
  Sus diagnósticos son los de la última nota con diagnósticos hasta el momento en que se generó (o los del ingreso): al
  reimprimirla salen iguales.
- `print_log.with_dx` (BOOLEAN): el registro de impresiones guarda si la receta llevaba el diagnóstico; la bitácora lo dice.
- Endpoints nuevos: `POST /api/prescriptions/:id/include-dx` (permiso `rx.write`, médico) y
  `POST /api/print-jobs/:id/include-dx` (permiso `inpatient.orders`). Enfermería recibe 403 también por URL directa.
- **Probado sobre una copia**: creé una base v80 con el código de la ronda 12 (16 recetas) y la migré dos veces con el código
  de esta ronda: queda en 81, las 16 recetas siguen ahí con `include_dx` sin dato, y la segunda vez no cambia nada. Solo agrega
  columnas; corre sola al desplegar en todas las clínicas y consultorios (también las nuevas).

## 5. Valores por defecto usados

Todos los de la sección 6 sin cambios (A1–A14). Además:
- **«Página 1 de 1»**: el número de página sale siempre (también en documentos de una hoja); el navegador no permite ocultarlo
  solo cuando hay una.
- **Varios documentos en una misma impresión** (receta con sus órdenes): el número de página y el encabezado corto cuentan
  toda la impresión («Página 2 de 4»), y la primera hoja de la segunda orden lleva el encabezado corto arriba del completo.
  Cada orden sigue empezando en su hoja. Si la imprimes sola («Abrir solo las órdenes») sale «Página 1 de N».
- **Orden de exámenes**: quité el subtítulo «Exámenes de laboratorio» (ya lo dice «Orden de laboratorio» arriba) para que una
  orden de 14 exámenes quepa con la firma en una hoja.
- **Casilla de diagnóstico de las órdenes**: la orden ya tenía desde EX2 su casilla «Incluir el diagnóstico en la orden» (no
  se guarda, apagada). La dejé como estaba; no agregué la nueva. Si quieres que las órdenes no la tengan, es quitarla.
- **Fecha aproximada (DP9)**: en este código no existe la marca de fecha de nacimiento aproximada, así que la edad no puede
  decir «aprox.». La edad sale en años, en meses si es menor de 2 años y en días si es menor de un mes.
- **Identidad**: «No tiene» cuando no hay; si es un menor con responsable, va una fila «Responsable del menor» debajo de la
  cuadrícula (antes iba dentro de la casilla de identidad).
- **Consultorio**: el encabezado dice el nombre del consultorio (antes iba el médico arriba).
- **Recibo**: no lleva firma (nunca la tuvo); conserva «Atendió», «Gracias por su preferencia» y «Comprobante interno de pago».
- **Firma ficticia**: la receta y la nota de consulta escribían el nombre del médico en letra cursiva cuando no había firma
  dibujada. Ahora queda el espacio en blanco para firmar y sellar.

## 6. Lo que debes validar tú

En `src/lib/clinicalConfig.ts` (con `VALIDAR: Emil`): tamaño y márgenes (`PRINT_PAGE`: Carta, 2 cm), el espacio para firma y
sello (`SIGN_SPACE_CM`: 3.5 cm) y el de las firmas de paciente o testigo en las autorizaciones (`OTHER_SIGN_SPACE_CM`: 1.6
cm), la leyenda fija «Emitida con Clinara» (`DOC_BRAND_LEGEND`). Las demás leyendas son las de siempre. La lista de formas
con su plural está en `src/lib/doseText.ts` (`DOSE_FORMS`: tableta, cápsula, sobre, ampolla, vial, gota, supositorio, puff,
óvulo, parche, gragea).

## 7. Capturas y PDF (después)

`docs/ronda13/despues/`: la receta con sus órdenes en pantalla, el PDF de la receta con diagnóstico y sus órdenes, la orden de
laboratorio de 14 exámenes (una hoja), un resultado de laboratorio, la pestaña Exámenes con la nota abierta (NE8) y el
expediente abierto en la consulta con la barra fija, a 1366 y a 390 px (CX5). Las de antes son las de tu Word
(`docs/ronda13/capturas/`).

## 8. Hallazgos fuera de la lista (no los implementé)

- Dentro de la consulta, las otras pestañas del expediente desplegado (Historia clínica, etc.) todavía tienen «Editar» en
  alergias, antecedentes y ficha. Solo quité «Agregar adenda» y «Generar constancia», como pediste para las consultas.
- `data/pglite` (la base local de desarrollo) no abre con la versión de PGlite instalada; no la toqué. `npm run db:reset` la
  vuelve a crear.

## 9. Verificaciones

- `tsc`, `oxlint` (sin errores; las advertencias de siempre) y `npm run build`: bien.
- Pruebas, cada archivo por separado: todas pasan menos la de siempre de `ronda9.test.ts` («sin corrimientos…»), que en mi
  equipo no encuentra `npx` (`spawnSync npx ENOENT`); no tiene que ver con esta ronda. `server/ronda13.test.ts`: 9 pruebas
  (antecedentes, hoja Carta, plural, orden agrupada, columnas e idempotencia, casilla y permisos de la receta y de la receta
  de la estancia, registro de impresiones).
- En el navegador (Edge, el mismo motor que Chrome), sobre la copia migrada: receta y órdenes a 1366 y 390 px sin desborde;
  la casilla se guarda y sobrevive a recargar; los PDF salen en Carta con «Página X de Y» y el encabezado corto desde la
  segunda hoja; NE8 (orden, avisos a 6 px, «Ir a la nota»); CX5 (barra fija, contraer sin perder lo escrito, sin barra propia,
  sin adenda ni constancia, «Ir a la nota» flotante, 390 px sin desborde, que tuve que corregir); AP4 (medidas de los campos).
- **No hice**: el recorrido completo con los cinco usuarios ni todos los anchos (1920, 1280, ~1100, ~1000) en cada pantalla;
  la constancia, la referencia, la epicrisis, las autorizaciones y el recibo solo los revisé con el compilador, no impresos;
  no probé cortar el internet. Conviene mirarlos en producción.
