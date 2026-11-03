# Reporte de la ronda 10

Pedido: `docs/ronda10/PEDIDO_RONDA10.md`. Plan: `PLAN_RONDA10.md`. Registro de avance: `docs/ronda10/REGISTRO_RONDA10.md`.
Un commit por punto (`[ronda10][…]`; EX5 y ME10 van juntos porque comparten el registro de impresiones). Esquema: 69 → 73.

## 1. Estado por punto

| Punto | Estado | Archivos principales | Cómo probarlo |
|---|---|---|---|
| CA5 | Hecho | `src/lib/imagingCatalog.ts`, `src/lib/exams.ts`, `src/components/Exams.tsx`, `src/app/ExamCatalogAdmin.tsx`, `server/ronda10.ts` (`loadImagingCatalog`), `server/routes/exams.ts` | 1) Ordenar exámenes › «rx torax» › marca Rayos X de tórax: pide proyección y «Agregar» no deja. 2) Elige PA y Lateral: «Rayos X de tórax PA y lateral». 3) Configuración › Catálogo de exámenes › Imagen y gabinete: 9 subgrupos y ninguna «Radiografía…» |
| UM3 | Hecho (producción sin revisar, ver §2) | `server/ronda10.ts` (`cleanArchivedThresholds`), `server/routes/exams.ts`, `src/app/CriticalThresholds.tsx`, `scripts/um3-diagnose.ts` | 1) `npm run um3:diagnose -- .env.neon.local` (solo lee). 2) Áreas de servicio: sin archivados no aparece «Ver archivados». 3) Archiva un umbral y guarda: «Ver archivados (1)» |
| ME6 | Hecho | `server/lnmeLoader.ts`, `scripts/me5-build.ts`, `scripts/me6-compare.ts`, `src/lib/lnme/*`, `src/lib/drugProvider.ts`, `src/components/DrugForm.tsx` | 1) `npm run me6:compare -- .env.neon.local`: 0 faltantes. 2) Vademécum › busca «Aciclovir»: 3 presentaciones. 3) Abre Ondansetrón: todas las columnas, vía «Intravenosa, intramuscular» |
| ME7 | Hecho | `src/app/Settings.tsx` (Vademécum), `src/app/MyConfig.tsx`, `src/lib/drugProvider.ts` (`DRUG_ORIGIN`) | 1) Vademécum: alfabético, «Mostrando 1–25 de 541» y páginas. 2) Pulsa «Vía» dos veces. 3) Filtro Vía = Intravenosa y busca «cef» |
| ME8 | Hecho | `src/components/DrugSearch.tsx`, `DrugSuggestion.tsx`, `Medications.tsx`, `MedExtras.tsx`, `InpatientFile.tsx`, `OrderSetsPage.tsx` | 1) Toca «Medicamento»: no se abre nada. 2) Escribe «a»: nada; «am»: la lista. 3) «acetaminofen» → Acetaminofén |
| ME9 | Hecho | `src/lib/medExtras.ts`, `src/components/MedExtras.tsx` | 1) Ceftriaxona IV c/12h: aparece la casilla discreta. 2) Márcala, escribe 2 g y cambia a Oral: se oculta y avisa. 3) Vuelve a IV: reaparece «2 g» |
| ME10 | Hecho | `server/routes/printJobs.ts`, `src/app/PrintJob.tsx`, `InpatientFile.tsx`, `Medications.tsx`, `MedExtras.tsx`, `server/medOrders.ts`, `server/correctionLocks.ts` | 1) Nota de evolución › Ceftriaxona con «No hay en la clínica (va a receta)» y «10 viales» › Firmar: se ofrece la receta. 2) Como enfermería, Hoja › «Imprimir receta». 3) La hoja muestra «Receta» en la orden |
| EN4 | Hecho | `InpatientFile.tsx` (`DoseModal`), `src/components/DateTimeField.tsx`, `src/components/ui.tsx` (`Modal steady`), `src/lib/inpatient.ts` | 1) Toca una dosis: pestañas grandes, sin desplazamiento interno. 2) Abre el calendario de «Hora real»: completo, por encima. 3) A 390 px ocupa la pantalla |
| EX4 | Hecho | `src/components/FilePreview.tsx`, `src/app/ExamsTab.tsx` | 1) Carga un hemograma con valores y PDF. 2) Ábrelo: tabla y «hemograma.pdf · PDF · Ver archivo». 3) «Ver archivo»: vista previa con Descargar e Imprimir |
| EX5 | Hecho | `src/app/ExamsTab.tsx`, `src/app/ExamOrder.tsx` (`ExamOrderSheet`), `server/routes/printJobs.ts` | 1) Como enfermería, Exámenes › «Imprimir orden» en Laboratorio: externos marcados. 2) Imprimir: orden del médico que pidió, con la leyenda. 3) Aparece en «Órdenes impresas» con tu nombre |
| GE5 | Hecho | `src/components/Pagination.tsx`, `src/lib/pagination.ts`, pacientes, recetas, caja, bitácora, personal, reportes, seguimientos, mi vademécum, plataforma | 1) Pacientes › página 3 › abre uno › Atrás: página 3. 2) Busca algo: página 1. 3) Recetas y bitácora paginan en el servidor |
| GE6 | Hecho | `src/modules.css`, `src/components/Exams.tsx` | 1) Ordenar exámenes: escribe «proteina c», borra, despliega Laboratorio y marca dos: la ventana no se mueve. 2) Busca «zzzz»: «Ningún examen coincide» |

Pruebas automáticas nuevas: `server/ronda10.test.ts` (20). Se ajustó `server/ronda9_me5.test.ts` a la regla nueva de ME6.

## 2. Lo que pediste averiguar

- **UM3: qué eran los 16 archivados y por qué no había grupos activos.** Una demo nueva tiene exactamente **16 grupos** de
  umbrales: los 7 de antes y los 9 que agregó UM2. «Ver archivados (16)» sin ningún grupo a la vista quiere decir que en
  esa base **los 16 grupos están archivados**, incluidos todos los predeterminados de UM2. No es un error de pantalla: la
  tarjeta solo muestra los grupos activos. El servidor archiva todo grupo que no venga en «Guardar umbrales», así que una
  sola petición con la lista vacía o incompleta los archiva todos de una vez.
  - **No pude leer la base de producción** para confirmarlo: el permiso se me negó. Por eso no hay lista de los 16 con
    nombre. Con `npm run um3:diagnose -- .env.neon.local` (solo lectura) salen grupo por grupo, si es predeterminado y quién
    lo archivó según la bitácora.
  - **Qué hace la limpieza.** Borra lo archivado que agregó la clínica y del que nada depende. Deja retirado (en la base,
    invisible) lo que cite un resultado crítico. **No toca los predeterminados de UM2**, como pediste: los anota en la
    bitácora.
  - **Consecuencia.** Si en producción los 16 son los predeterminados (lo más probable), la limpieza no borra nada y
    Santa Brígida sigue **sin umbrales críticos activos**: ningún resultado se marca crítico. Hay que restaurarlos: botón
    «Restaurar» de cada grupo o, si me lo confirmas, una migración que los restaure.
- **ME6: por qué 509 y cuáles faltaban.**
  - El lector del `.md` sí leía las 530 filas, incluidas las 174 sin subtítulo `###`. La línea 2 y la anotación de 6.2.12.2
    se manejaban bien.
  - La carga de ME5 **no creaba en la base las 21 filas que emparejaban con un medicamento del catálogo base** (que vive en
    el código). Esas filas se mostraban como «Catálogo base», a veces con «· LNME #N», y sin la vía del `.md`.
  - Faltaban los #26, 27, 49, 78, 88, 90, 91, 96, 105, 117, 125, 297, 302, 398, 399, 401, 433, 435, 524, 539 y 549.
  - Ondansetrón y Tramadol no emparejaban (estaban «en duda»); ahora se unen porque tú los diste como el mismo medicamento.
  - Tus conteos de marcas coinciden con el archivo: 21 filas ✔️ y 10 ⚠️. Dos filas traen las dos marcas (#82 y #245) y ahí
    manda ⚠️, así que quedan 19 confirmadas y 10 por confirmar.
- **EX4: qué cambió.**
  - El código del resultado no cambió. Los hemogramas de la captura (y los de la demo) son archivos de la antigua pestaña de
    laboratorios. La migración v41 (ronda 4, EX1) los convirtió en resultados que **solo tienen archivo**, y eso se veía
    como un botón «Archivo» sin nombre.
  - En la ronda 8 (EX1) las filas además quedaron plegadas.
  - Los resultados cargados con valores siempre mostraron la tabla.
- **EN4: «Día 2 de 1».** Era un error de cálculo del texto.
  - El fin del tratamiento se contaba en periodos de 24 horas desde la primera dosis, pero el número del día se contaba
    por día del calendario.
  - Ejemplo: una orden de 1 día que empezó a las 22:30 seguía vigente a la mañana siguiente y decía «Día 2 de 1».
  - Ahora los dos usan periodos de 24 horas. Sin días («hasta nueva orden») se sigue contando por calendario.
- **GE5: dónde está la paginación.**
  - **Con páginas:**
    - Vademécum de Configuración y Mi vademécum (antes cortaban en 60).
    - Biblioteca de pacientes.
    - Recetas: en el servidor, porque la carga inicial solo traía 500 y las más viejas no se veían.
    - Bitácora: en el servidor, porque antes cortaba en 2000.
    - Caja: el cierre impreso sigue llevando todos los cobros.
    - Personal, Reportes (por médico), Crónicos y seguimientos, y Cuentas de la plataforma.
  - **Sin páginas, por las exclusiones del pedido:**
    - Listas agrupadas en desplegables: Catálogo de exámenes y Ordenar exámenes.
    - Listas de trabajo del día: Consulta externa, Sala de espera y Hoja de medicamentos.
    - Lo de un paciente: notas, y citas y exámenes del expediente.
    - Avisos recientes del Inicio y de la plataforma: son resúmenes, no listas.
- **GE6: ventanas revisadas.**
  - «Ordenar exámenes», que también es la de «Agregar exámenes al set»: corregida.
  - Crear o editar set: no tiene buscador ni desplegables.
  - Nota de evolución: ya tenía tamaño fijo.
  - Buscador de diagnósticos: no va en una ventana propia.
  - La ventana de la dosis (EN4) ahora tampoco se encoge de golpe al cambiar de pestaña.

## 3. CA5

- **Borrados del catálogo** (nombres exactos; ninguno quedó retirado):
  - Rayos X: «Radiografía», «Radiografía de abdomen», «Radiografía de tórax».
  - Ultrasonido: «Ultrasonido abdominal», «Ultrasonido pélvico», «Ultrasonido renal», «Ultrasonido Doppler».
  - Tomografía y resonancia: «Tomografía (TAC)», «Resonancia magnética».
  - La genérica: «Mamografía».
  - Antes de borrar se guarda la exportación en `config_backups` (`ca5-imaging-removed`).
- **Reemplazados por el del Anexo A con el mismo nombre:** «Ultrasonido obstétrico», «Ultrasonido de tiroides» y
  «Ultrasonido de partes blandas». Este último ahora pide la región.
- **Creados:** los 128 estudios del Anexo A, activos y sin precio.
  - En Cardiología y Otros se conservan «Electrocardiograma (EKG)», «Ecocardiograma» y «Espirometría» en lugar de duplicar
    «Electrocardiograma (EKG) de 12 derivaciones», «Ecocardiograma transtorácico» y «Espirometría (con y sin
    broncodilatador)». Revísalo.
- **Órdenes antiguas.** La orden guarda el **nombre** del estudio, no una referencia al catálogo, así que «Radiografía de
  tórax» sigue igual en la nota, la pestaña Exámenes, las órdenes impresas y los resultados. No hizo falta copiar nada.
- **Sets y perfiles afectados.** El estudio borrado se quita, sin reemplazarlo, y cada cambio queda en la bitácora con el
  nombre del set o perfil y de quién es.
  - El perfil base «Preoperatorio» del código llevaba «Radiografía de tórax». Ahora lleva solo el EKG y la radiografía se elige
    al ordenar. Las copias que ya estén en «Mis sets» pierden ese estudio con la carga.
  - En producción, la lista exacta queda en la bitácora con la línea «Catálogo de Imagen y gabinete (CA5…)».
- **EX3.** La lista de prefijos (`Rayos X`, `Radiografía`, `Rx`) y el subgrupo «Rayos X» reconocen los nombres nuevos y los
  de antes (con pruebas). Los «Estudios contrastados» no son Rayos X simples: siguen pidiendo informe.
- **El servidor también exige los detalles.** Pedir «Rayos X de tórax» sin proyección devuelve 400 («falta elegir la
  proyección»).

## 4. Cambios en la base de datos

Todas las migraciones son idempotentes y probadas en una base en memoria con la demo. Corren solas en cada clínica y
consultorio, incluidos los nuevos.

- **v70:** tabla `config_backups` (exportaciones). UM3: limpieza de umbrales, una vez por base (`um3:done`). El grupo o
  analito retirado lleva `retiredAt` en `clinics.critical_groups`.
- **v71 (ME6):**
  - Las 530 filas en `clinic_drugs` por número. `route` toma la vía del `.md` y los alias incluyen el nombre del catálogo
    base.
  - Carga forzada, una vez por base (`me6:done`), con copia previa (`me6-vademecum-before`).
  - Las cargas futuras siguen respetando lo editado por la clínica (`origin = 'clinic'`, regla de ME5).
- **v72 (EX5 y ME10):**
  - `hosp_meds.buy_outside` y `buy_quantity`.
  - Tabla `print_jobs` (qué se imprimió, de qué paciente, quién lo pidió).
  - `print_log` con `exam_item` y `hosp_med` por renglón, para el bloqueo de GE4.
- **v73 (CA5):**
  - `exam_catalog.details` (lo que pide el estudio, si administración lo cambia).
  - `exam_orders.projections`, `contrast` y `detailed`.
  - Carga del catálogo, una vez por clínica (`ca5:<clínica>`).
- **No hace falta ningún paso manual en producción:** al desplegar, el primer pedido corre `ensureDb`.

## 5. Valores por defecto

Usé A1 a A20 como están en la sección 6, con estas decisiones mías:
- La leyenda (A16) también va en las órdenes de EX2.
- Las recetas y órdenes de EX5 y ME10 llevan un número propio (las 8 primeras letras del trabajo de impresión).
- ME10 en consulta externa: con «Aplicar en la clínica» y «No hay en la clínica», la orden pasa a la hoja con la etiqueta, y
  la receta se imprime desde la hoja de la observación. No la agregué a la receta de la consulta.
- ME6: se conservan la dosis y la frecuencia habituales del medicamento del catálogo base como precarga. La vía viene del
  `.md`.

## 6. Lo que debes validar tú (o un abogado)

- El catálogo de imagen del Anexo A, las proyecciones por región, qué estudio pide lado o región, y el significado de doble
  y triple contraste (`clinicalConfig.ts`).
- Los sinónimos de estudios de Cardiología y Otros que no se duplicaron (§3).
- La leyenda «Válida solo con firma y sello del médico».
- **Medicamentos controlados:** no agregué ninguna lógica. Queda por validar si la receta de ME10 sirve para un controlado
  (por ejemplo morfina o midazolam) o si hace falta el recetario especial del Reglamento de Control de Estupefacientes, que
  no revisé.
- Los pares Ondansetrón (#403) y Tramadol (#32), y la duda que queda: Amlodipino 5 mg frente al #338, que es de 10 mg (no lo
  uní).
- Los nombres del `.md` que llevan la vía o la forma («Omeprazol IV», «Aciclovir IV», «Acetaminofén IV», «Salbutamol
  inhalador»). Quedan así porque el archivo los trae así. «Omeprazol IV» no cambia: el `.md` también lo llama así.
- Las 2 columnas sin vía (#390 y #430) quedan sin vía.
- **Fuera del `.md` siguen** con «Catálogo base Clinara»: Ibuprofeno 400 mg, Naproxeno 550 mg, Diclofenaco tableta 50 mg,
  Cetirizina 10 mg, Losartán 50 mg, Amlodipino 5 mg, Atorvastatina 20 mg, Sulfato ferroso 200 mg, Ambroxol jarabe,
  Metamizol 500 mg y Ketorolaco ampolla.

## 7. Hallazgos fuera de la lista (no implementados)

- **«Muestra tomada» en un examen externo:** no tiene sentido (la muestra la toma el laboratorio de afuera). Lo dejé igual,
  como pediste.
- **La bitácora a 390 px** es una tabla ancha con desplazamiento lateral, no tarjetas.
- **El botón «Agregar "…" como estudio no catalogado»** sigue saliendo aunque la búsqueda ya encontró el estudio (pasa
  cuando lo escrito no es el nombre exacto, p. ej. «partes blandas»).
- **Receta suelta sin «Aplicar en la clínica»:** no tiene la marca de ME10, porque todo va a la receta.

## 8. Verificaciones que no pude hacer

- **La base de producción** (UM3 y ME6): la lectura se me negó. Los scripts `um3:diagnose` y `me6:compare` lo hacen en solo
  lectura.
- **Dr. Fúnez.** La base local nueva no lo trae (se agrega con `seed:demo`). Probé la receta de consulta externa con las
  pruebas automáticas y con la Dra. Herrera en la nota; el formulario de receta suelta en el navegador no lo recorrí.
- **Consultorio de la Dra. López:** comprobé que la vista de médico funciona. El vademécum con páginas es la misma pantalla
  de Configuración (vista de administración), que verifiqué con Roberto. Las pantallas de observación del consultorio usan
  los mismos componentes, pero no las recorrí a mano.
- **Anchos de pantalla:** probé 1366 y 390 px en casi todo. 1920 y 1280 solo en GE6.
- **Impresión real:** la interceptó el script (se llama a `window.print`). No imprimí en papel ni revisé el PDF generado por
  el navegador.
- **Suite completa:** 297 de 299 pasan. Las 2 que fallan ya fallaban antes de esta ronda:
  - «DM1»: la Dra. Zúñiga no tiene citas hoy en la demo, depende de la fecha.
  - «GE3 en otra zona horaria»: la prueba llama a `npx` sin shell y en Windows falla con `spawnSync npx ENOENT`.
- typecheck, lint (0 errores) y `build` (con los chequeos de fechas y de imports ESM) pasan.
