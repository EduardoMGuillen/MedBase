# Reporte de la ronda 12

Pedido: `docs/ronda12/PEDIDO_RONDA12.md` (ordenado por punto desde `rev12/correcioens ronda 12.docx`). Plan: `PLAN_RONDA12.md`.
Capturas: `docs/ronda12/capturas/` (12). Esquema: 79 → 80. Valores de referencia: el .md del 04/11/2026.

## 1. Estado por punto

| Punto | Estado | Archivos principales | Cómo probarlo |
|---|---|---|---|
| AN1 | Hecho | `PatientChart.tsx` (`BackgroundView`), `clinical.css` | Consulta de Wilmer Zelaya: cada antecedente en su renglón, a todo el ancho y justificado (ya no tres columnas angostas). Las notas también se justifican |
| AN2 | Hecho | `src/lib/format.ts`, `types.ts`, `PatientForms.tsx`, `Consultation.tsx` | Editar antecedentes: Personales patológicos (enfermedades, medicamentos, transfusionales) · **Hospitalarios, traumáticos y quirúrgicos** · No patológicos (**Toxicomanías**, inmunizaciones) · Heredofamiliares · Gineco-obstétricos. Sin «Actividad física y alimentación» |
| SG1 | Hecho | `Followups.tsx` (`nextControl`) | Seguimiento › Paciente crónico › «Control cada: 6 meses»: el próximo control pasa a hoy + 6 meses (4 nov → 4 may). Se puede cambiar a mano después |
| CE1 | Hecho | `Prescriptions.tsx`, `ExamOrder.tsx` (`ExamBatchSheets`), `PatientChart.tsx` | Firmar una consulta con medicamentos y laboratorios: la receta sale con las órdenes debajo; «Imprimir receta y orden de exámenes» imprime todo (cada orden en su hoja carta). «Solo la receta» si no las quiere. En el expediente, la consulta tiene «Exámenes» y su bloque de exámenes con «Imprimir orden» |
| CE2 | Hecho | `PatientChart.tsx` (`embedded`), `Consultation.tsx` | En la consulta, arriba: «Expediente completo de …» (dice cuántas consultas anteriores tiene). Se abre ahí mismo con todas sus pestañas; la nota sigue abajo, sin perder el borrador |
| HO1 | Hecho | `ui.tsx` (`Modal inline`), `InpatientFile.tsx` (`MedicalNotes`) | Observación › Notas › «Nueva nota de evolución»: se abre al final de las notas, dentro del expediente. Cambia a Signos vitales, Hoja de medicamentos, Exámenes o Anexos: la nota sigue abierta al final de la pestaña («Ir a la nota»). Igual Procedimiento y Nota postquirúrgica. Los botones de firmar quedan fijos abajo |
| LB1 | Hecho | `ExamsTab.tsx` (`ResultModal`), `SourceTag.tsx` | Laboratorio › Urocultivo › «Cargar resultado»: arriba el paciente y quién pidió; una tabla Parámetro · Resultado · Valor de referencia; las fuentes al final, en una línea. La cita de la fuente ya no se sale de la ventana |
| LB2 | Hecho | `data/valores_referencia_laboratorio.md`, `src/lib/labRef/*`, `labReference.ts`, `refLoader.ts` | EGO: 19 casillas (físico, químico y microscópico, con su encabezado), cada una con su valor de referencia. Los cualitativos se escriben como texto (con «Normal» para poner el esperado); leucocitos y eritrocitos son número (<5 y ≤4 por campo). Urocultivo, Coombs, serologías: una casilla «Resultado» con lo esperado |
| LB3 | Hecho | `server/routes/exams.ts`, `server/ronda12.ts`, `ExamsTab`, `ExamPanels`, `ResultSheet`, `Settings`, `DeptPages`, `alerts.ts` | Configuración (y Configuración de laboratorio): ya no está «Umbrales críticos». Un potasio de 7 sale **Alto**, sin «Valor crítico». En el expediente, los resultados por revisar salen como aviso |
| LB4 | Hecho | `ExamCatalogAdmin.tsx` (`ExamForm`, `RefEditor`) | Configuración de laboratorio › EGO › «Editar»: nombre y subgrupo en una fila; abajo una tabla: Parámetro, Mínimo, Máximo (con «<»), Unidad, Resultado esperado, Fuente, Quitar. Un solo botón «Guardar cambios» |
| LB5 | Hecho | `DeptHome.tsx` (nuevo), `DeptTray.tsx`, `AppShell.tsx`, `App.tsx`, `server/routes/dept.ts` | Entra como Lic. Ordóñez o Téc. Rivera: **Inicio** con «Alarmas de hospitalizados y observación» (urgentes o más de 60 min esperando) y una tarjeta por área. Menú: Inicio · Pacientes (Ambulatorio, Observación, Hospitalización, Biblioteca de pacientes) · Departamento. Cada área con su contador (rojo si hay urgentes) |
| LB6 | Hecho | `Ambulatory.tsx` (`QuickPatient`), `server/routes/dept.ts` (`/dept/quick-patient`) | Paciente ambulatorio › «No está registrado: registrarlo»: nombres, apellidos, edad (años o meses), sexo, teléfono **o** correo, identidad. Si la identidad ya existe, usa ese expediente |
| LB7 | Hecho | `DeptPages.tsx` (`DeptPatient`) | Téc. Rivera abre un hospitalizado: pestañas «Datos generales», «Órdenes activas o pendientes (N)» (ahí toma la muestra y carga el resultado) y «Resultados». Entra directo a las pendientes |
| IM1 | Hecho | Lo mismo que LB5 | Dr. Castellanos: Inicio con alarmas; el menú ya no tiene «Pacientes» arriba y otro «Pacientes» desplegable: un solo grupo con sus áreas y la biblioteca al final |
| IM2 | Hecho | `permissions.ts` (`inpatient.notes`), `server/routes/inpatient.ts`, `InpatientFile.tsx`, `hooks.ts`, `alerts.ts` | Dr. Castellanos abre un hospitalizado: entra a Exámenes y la barra de avisos solo trae sus estudios (nada de fiebre, dosis ni órdenes). En Notas: «Nueva nota de evolución», «Procedimiento menor» y «Procedimiento mayor (nota postquirúrgica)», sin la columna de indicaciones y medicamentos |

## 2. Decisiones que tomé (revísalas)

- **Analito «Resultado»**: un examen con una sola fila de resultado esperado (urocultivo, Coombs, cultivos, serologías,
  PCR) tiene una sola casilla llamada «Resultado». En el formulario se ve con el nombre del examen.
- **Ambulatorio = consulta externa + los que vienen solo a exámenes**: los dos son pacientes que no están internados. Si
  quieres la consulta externa aparte, es un cambio chico.
- **Alarmas del Inicio**: urgente sin muestra (o sin realizar), o más de **60 minutos** esperando, solo de hospitalización y
  observación. El número está en `DeptHome.tsx` (`LATE_MIN`).
- **El radiólogo** escribe la nota (SOAP, estándar o postquirúrgica) y el procedimiento menor, pero **sin indicaciones,
  medicamentos ni exámenes**: esos los ordena el médico tratante. No escribe la nota de ingreso. El servidor lo exige igual.
  El técnico en imágenes sigue sin escribir notas.
- **Toxicomanías**: lo que ya estaba en tabaquismo, alcoholismo y otras sustancias se muestra junto («Tabaquismo: Negado.
  Alcoholismo: Ocasional.») hasta que alguien edite los antecedentes; al guardar queda en un solo campo. **Actividad física
  y alimentación** ya no se pide ni se muestra; lo que estaba escrito no se borró de la base.
- **Umbrales críticos**: se quitaron de las pantallas y el servidor ya no marca «crítico». Los umbrales guardados de cada
  clínica no se borraron (no se usan). Las órdenes que estaban marcadas críticas dejan de estarlo (v80).
- **Fecha de nacimiento del ambulatorio**: se guarda aproximada (hoy menos la edad). Si después pasa a consulta, se
  corrige en su ficha.

## 3. Valores de referencia del 04/11/2026

- Se agregaron reglas para todo lo nuevo: **gases arteriales** (pH, pCO₂ por sexo, pO₂, HCO₃⁻, exceso de base −2 a +3,
  SatO₂), **volumen de orina de 24 h** (como parámetro de los 12 exámenes de orina de 24 horas), **nicotina y cotinina**,
  **CA 15-3** (<30, ahora numérico), **anti-MBG**, **dengue IgG**, **herpes IgG e IgM**, **avidez de Toxoplasma**, el
  título de **RPR/VDRL** (como nota de los dos) y las **cargas virales** con su nueva redacción. EGO: aspecto, cristales,
  bacterias, levaduras y moco nuevos; urobilinógeno «hasta 1 mg/dL» y leucocitos «<5 por campo» ahora numéricos.
- La tabla «Cambios del 04/11/2026» del final del .md no se lee como valores (es el resumen).
- `npm run um1:build`: 464 valores en 317 exámenes, 76 fuentes, ninguna fila sin regla. Siguen sin valor: Microalbuminuria
  (sin 24 h), Otros líquidos, Hemocultivo y VIH (prueba rápida): el .md no los trae.
- En cada clínica, la carga archiva lo que el .md ya no trae así: el «resultado esperado» del EGO entero y de los líquidos
  (sin analito) y los rangos iniciales de los gases (pO₂ 80–100 → 83–108). Lo editado por la clínica no se toca.

## 4. Pruebas

`server/ronda12.test.ts`: 13 pruebas (EGO con sus 19 parámetros, ningún valor sin analito, lo nuevo del .md, la migración
de la base, cargar un EGO con texto y números, sin críticos, antecedentes, el radiólogo y sus avisos, el conteo por área y
el paciente ambulatorio con lo mínimo).

Ajusté las pruebas de rondas anteriores que probaban lo que cambió a propósito:
- `ronda3`: la hemoglobina baja ya no es «crítica», solo Baja;
- `demoData`: la demo tiene resultados sin revisar, ninguno crítico;
- `ronda5`: la prueba de la pantalla de umbrales críticos (AD1) quedó **omitida** (`test.skip`), porque la pantalla ya no existe;
- `ronda8`: 76 fuentes (antes 59);
- `ronda11`: el radiólogo ahora sí escribe su nota; el técnico no.

**Resultado** (cada archivo por separado, como en la ronda 11): pasan todos menos una prueba de `ronda9.test.ts`, «sin
corrimientos…», que falla en mi equipo antes de probar nada: lanza `npx` desde la prueba y Windows no lo encuentra
(`spawnSync npx ENOENT`). No tiene que ver con esta ronda. `npm run build` y `oxlint` sin errores (solo las advertencias de
siempre).

**No lo vi en el navegador.** Lo probé con las pruebas y el build; las pantallas nuevas (Inicio de Laboratorio e
Imágenes, el formulario del EGO, la nota dentro del expediente) conviene mirarlas en producción.
