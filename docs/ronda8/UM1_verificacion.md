# UM1 — Verificación de los valores de referencia contra sus fuentes

**Documento revisado:** `data/valores_referencia_laboratorio.md` · **Fecha:** 2026-11-02
**Método:** cada fila de tabla se cotejó contra la fuente que cita (números, unidades y separación por sexo). Las diferencias solo tipográficas (µ/μ, «%» frente a «%–%», 4000 frente a 4,000, mIU frente a mUI, «IU» frente a «UI») se tomaron como iguales. No se corrigió nada en el documento.

## 1. Resumen

| Fuente | Filas cotejadas | Coinciden | Difieren | No encontradas en la fuente |
|---|---|---|---|---|
| [ABIM-2026] (texto de `docs/ronda8/abim-2026-texto.txt`) | 175 | 175 | 0 | 0 |
| [MSD-TDM] | 5 | 4 | 1 (solo la unidad de digoxina) | 0 |
| [CHI-TDM] | 1 | 1 | 0 | 0 |
| Comprobaciones al azar: [KDIGO], [MLP-TP], [SAMHSA] | 13 | 13 | 0 | 0 |

- **ABIM-2026:** los 175 valores coinciden con el texto de ABIM, también en las unidades y en la separación por sexo. Leucocitos (4000–11,000/μL), plaquetas (150,000–450,000/μL) y los recuentos absolutos se escriben en /μL en ABIM igual que en el .md, así que no hizo falta convertir de ×10³. Hay algunas observaciones que no son diferencias; están al final de la sección 4.
- **MSD-TDM:** los cinco rangos y los cinco valores críticos coinciden en números. La única diferencia es la unidad de la digoxina: MSD escribe «mg/dL» y el .md usa ng/mL. El propio .md ya lo marca con ⚠️ en *Notas*.
- **CHI-TDM:** el litio coincide (0.6–1.2 mmol/L, pánico >2.0 mmol/L, Rev 6/2022).
- **No se pudieron abrir:** ADA-2026 (PMC pide reCAPTCHA y diabetesjournals.org da 403) y MLP-17KS (404). Ver la sección 5.

## 2. Diferencias con la fuente

| Prueba | Valor en el .md | Valor en la fuente | Fuente y enlace |
|---|---|---|---|
| Digoxina (unidad) ⚠️ | 0.8–2.0 ng/mL · crítico ≥2.1 ng/mL | 0.8–2.0 **mg/dL** · crítico ≥2.1 **mg/dL** (números iguales; cambia solo la unidad) | [MSD-TDM] https://www.msdmanuals.com/professional/multimedia/table/laboratory-reference-ranges-therapeutic-drug-monitoring |

No hay ninguna otra diferencia de número, unidad o sexo en las filas cotejadas.

## 3. No encontrado en la fuente citada

| Prueba | Fuente |
|---|---|
| Ninguna | — |

Hay casos límite que sí se encontraron, pero de forma indirecta. Se cuentan como coincidencias:
- **Examen de embarazo en sangre** («Negativo… ver β-hCG») [ABIM-2026]: ABIM no tiene una fila «negativo»; solo da los puntos de corte de la β-hCG sérica, que coinciden.
- **Anticuerpos antitiroideos (panel)**, **Antifosfolípidos IgG/IgM** y **ANCA totales (ELISA)**: son filas que remiten a otras filas, y esas otras filas coinciden.

## 4. Verificados

### [ABIM-2026] (175)
- Eritrocitos: 4.2–5.9 millones/µL (ABIM no separa por sexo)
- Hemoglobina: M 12–16 · H 14–18 g/dL
- Hematocrito: M 37–47 · H 42–50 %
- VCM: 80–98 fL
- HCM: 28–32 pg
- CHCM: 33–36 g/dL
- ADE/RDW: 9.0–14.5 %
- Leucocitos totales: 4,000–11,000/µL
- Neutrófilos segmentados: 50–70 % · 2,000–8,250/µL
- Bandas: 0–5 %
- Linfocitos: 30–45 % · 1,200–4,950/µL
- Monocitos: 0–6 % · 0–660/µL
- Eosinófilos: 0–3 % · 0–330/µL
- Basófilos: 0–1 % · 0–110/µL
- Plaquetas: 150,000–450,000/µL
- VPM: 7–9 fL
- Crioaglutininas: ≤1:64
- VSG (Westergren): M 0–20 · H 0–15 mm/h
- Reticulocitos: 0.5–1.5 %
- Reticulocitos absolutos: 25,000–100,000/µL
- Eosinófilos (recuento absoluto): 0–330/µL
- Hb A: 96–98 %
- Hb A2: 1.5–3.5 %
- Hb F: <1 %
- dRVVT: 33–44 s
- Dímero-D: <0.5 µg/mL
- Fibrinógeno: 200–400 mg/dL
- Proteína C (actividad): 65–150 %
- Proteína C (antígeno): 70–140 %
- Proteína S (actividad): 57–131 %
- Proteína S antígeno total/libre: 60–140 / 60–130 %
- Antitrombina (actividad): 80–120 %
- TP: 11–13 s
- Tiempo de sangrado: <8 min
- TTPa: 25–35 s
- Glucosa en ayunas (normal): 70–99 mg/dL
- HbA1c (normal): 4.0–5.6 %
- Creatinina: M 0.50–1.10 · H 0.70–1.30 mg/dL
- BUN: 8–20 mg/dL
- Ácido úrico: 3.0–7.0 mg/dL
- Sodio: 136–145 mEq/L
- Potasio: 3.5–5.0 mEq/L
- Cloruro: 98–106 mEq/L
- CO₂ sérico: 23–30 mEq/L
- Calcio: 8.6–10.2 mg/dL
- Fósforo: 3.0–4.5 mg/dL
- Magnesio: 1.6–2.6 mg/dL
- Osmolalidad sérica: 275–295 mOsm/kg H₂O
- AST: 10–40 U/L
- ALT: 10–40 U/L
- Fosfatasa alcalina: 30–120 U/L
- GGT: M 8–40 · H 9–50 U/L
- Bilirrubina total: 0.3–1.0 mg/dL
- Bilirrubina directa: 0.1–0.3 mg/dL
- Bilirrubina indirecta: 0.2–0.7 mg/dL
- LDH: 80–225 U/L
- Amilasa: 25–125 U/L
- Lipasa: 10–140 U/L
- Amonio: 40–70 µg/dL
- Aldolasa: 0.8–3.0 IU/mL
- Colinesterasa: ≥0.5 (sérica) · ≥0.7 (eritrocitos) unidad de pH/h
- CPK total: M 30–135 · H 55–170 U/L
- CPK-MB: <5 % del total
- Proteínas totales: 5.5–9.0 g/dL
- Albúmina: 3.5–5.5 g/dL
- Globulinas: 2.0–3.5 g/dL
- Electroforesis, albúmina: 3.5–5.5 g/dL
- Alfa-1: 0.2–0.4 g/dL
- Alfa-2: 0.5–0.9 g/dL
- Beta: 0.6–1.1 g/dL
- Gamma: 0.7–1.7 g/dL
- Colesterol total: <200 · 200–239 · >239 mg/dL
- HDL bajo: M <50 · H <40 mg/dL
- LDL: <100 · 100–129 · 130–159 · 160–189 · >189 mg/dL
- Triglicéridos: <100 · <150 · 150–199 · 200–499 · >499 mg/dL
- Hierro sérico: 50–150 µg/dL
- TIBC: 250–310 µg/dL
- Saturación de transferrina: 20–50 %
- Homocisteína: 5–15 µmol/L
- PCR: ≤0.8 mg/dL
- PCR ultrasensible: <1.0 · 1.0–3.0 · >3.0 mg/L
- Troponina I convencional: ≤0.04 ng/mL
- Troponina I hs: M ≤15 · H ≤20 ng/L
- 17-hidroxiesteroides (orina 24 h): M 2–8 · H 3–10 mg/24 h
- Ácido úrico (orina 24 h): 250–750 mg/24 h
- VMA (orina 24 h): <9 mg/24 h
- Calcio (orina 24 h): M <250 · H <300 mg/24 h
- Creatinina (orina 24 h): 15–25 mg/kg/24 h
- Depuración de creatinina: 90–140 mL/min/1.73 m²
- Fósforo (orina 24 h): 500–1200 mg/24 h
- Magnesio (orina 24 h): 14–290 mg/24 h
- Proteínas (orina 24 h): <100 mg/24 h
- Índice proteína/creatinina: <0.2 mg/mg
- Cociente albúmina/creatinina (normal): <30 mg/g
- Albúmina en orina de 24 h (normal): <25 mg/24 h
- Cortisol libre urinario: 4–50 µg/24 h
- 17-OH-progesterona: folicular <80 · lútea <285 · posmenopausia <51 · hombre <220 ng/dL
- β-hCG sérica: premenopáusica <1.0 · posmenopáusica <7.0 · hombre <1.4 U/L
- Examen de embarazo en sangre: remite a β-hCG (ver sección 3)
- DHEA-S: M 44–332 · H 89–457 µg/dL
- Estradiol: 10–180 · 100–300 · 40–200 · <10 · hombre 20–50 pg/mL
- FSH: 2–9 · 4–22 · >30 · hombre 1–7 mUI/mL
- LH: 1–12 · 9–80 · >30 · hombre 2–9 mUI/mL
- Progesterona: folicular 0.02–0.9 · lútea 2–30 · hombre 0.12–0.3 ng/mL
- Prolactina: <20 ng/mL
- SHBG: M 18–144 · H 10–57 nmol/L
- Testosterona total: M 18–54 · H 291–1100 ng/dL
- Testosterona libre: H 70–300 pg/mL
- Androstenediona: M 30–200 · H 40–150 ng/dL
- TSH: 0.5–4.0 µU/mL
- T4 libre: 0.8–1.8 ng/dL
- T4 total: 5–12 µg/dL
- T3 libre: 2.3–4.2 pg/mL
- T3 total: 80–180 ng/dL
- Captación de T3 por resina: 25–35 %
- Tiroglobulina: <20 ng/mL
- Anti-TPO: <2.0 U/mL
- Anti-tiroglobulina: <20 U/mL
- Anticuerpos antitiroideos (panel): remite a anti-TPO y anti-TG
- ACTH: 10–60 pg/mL
- Cortisol 8 h: 5–25 µg/dL
- Cortisol 16 h: <10 µg/dL
- Insulina en ayunas: <20 µU/mL
- Hormona del crecimiento: reposo <5 · estímulo >7 ng/mL
- IGF-1: 182–780 · 114–492 · 90–360 · 71–290 ng/mL (por edad)
- PTH intacta: 10–65 pg/mL
- Etanol: <5 · intoxicación ≥80–100 mg/dL
- Ácido fólico sérico: 1.8–9.0 ng/mL
- Anti-CCP: <20 unidades
- C3: 100–233 mg/dL
- C4: 14–48 mg/dL
- Factor reumatoideo (nefelometría): <24 UI/mL
- Ferritina: M 24–307 · H 24–336 ng/mL
- IgA: 90–325 mg/dL
- IgG: 800–1500 mg/dL
- IgM: 45–150 mg/dL
- IgE total: <380 UI/mL
- NT-proBNP (TFG >60): ≤300 · ≥450 / ≥900 / ≥1800 pg/mL
- NT-proBNP (TFG <60): ≥1200 pg/mL
- Procalcitonina: ≤0.10 ng/mL
- Troponina T hs: M ≤10 · H ≤15 ng/L
- Vitamina B12: 200–800 pg/mL
- 25-OH vitamina D: 30–60 ng/mL
- Anti-La/SSB: <20 CU · <1.0 AI
- Anti-músculo liso: ≤1:80
- Anti-RNP: <20 CU · <1.0 AI
- Anti-Ro/SSA: <20 CU · <1.0 AI
- Anti-Scl-70: <1.0 U
- Anti-dsDNA: 0–7 UI/mL
- Anti-MPO: <1.0 U
- ANCA totales (ELISA): remite a anti-MPO y anti-PR3
- ANA (IFI): ≤1:40
- AMA: ≤1:5
- Anticardiolipinas IgG: <20 GPL
- Anticardiolipinas IgM: <20 MPL
- Antifosfolípidos: remite a anticardiolipinas y anti-β2GPI
- Anti-β2GPI IgG: <21 SGU
- Anti-β2GPI IgM: <21 SMU
- Antitransglutaminasa IgA: <20 AU · <4.0 U/mL
- Antitransglutaminasa IgG: <20 AU · <6.0 U/mL
- ASO: <200 unidades Todd
- Linfocitos CD4: 530–1570/µL
- PSA total: «no specific normal or abnormal level»
- AFP: <10 ng/mL
- CEA: <2.5 ng/mL
- CA 19-9: 0–37 U/mL
- CA 125: <35 U/mL
- LCR, leucocitos: 0–5/µL
- LCR, eritrocitos: 0/µL
- LCR, glucosa: 50–75 mg/dL
- LCR, proteínas: 15–45 mg/dL
- LCR, cloruro: 120–130 mEq/L
- LCR, presión de apertura: 70–180 mm H₂O
- Orina, densidad: 1.002–1.030
- Orina, pH: 4.5–8.0

**Observaciones sobre ABIM (no son diferencias de valor):**
- *Neutrófilos segmentados, absoluto 2,000–8,250/µL:* en ABIM esa cifra es el recuento absoluto de neutrófilos (ANC), no solo de los segmentados.
- *Amonio:* ABIM dice «plasma» y el .md dice «sérico». El valor es el mismo.
- *Anti-dsDNA (ELISA)* y *ANCA-P anti-MPO (ELISA):* ABIM no indica el método. La etiqueta «ELISA» es del .md.
- *PSA total:* ABIM solo dice que no hay un nivel normal o anormal específico. La frase «se interpreta junto con edad, tacto rectal y % de PSA libre» es del .md.
- *Glucosa en ayunas y HbA1c:* ABIM da solo el intervalo normal. Los cortes de prediabetes y diabetes se atribuyen a ADA-2026, que no se pudo abrir.
- *Albúmina en orina de 24 h:* el normal de ABIM es <25 mg/24 h y la categoría A2 de KDIGO empieza en 30, así que el tramo de 25–29 mg/24 h no queda en ninguna categoría del .md.
- La nota del .md sobre CA 15-3 («ABIM solo incluye CA 27-29 <38 U/mL») es correcta: ABIM dice ˂38.0 U/mL.

### [MSD-TDM] (4 coinciden + la unidad de digoxina en la sección 2)
- Ácido valproico: 50–99 µg/mL · crítico ≥100
- Carbamazepina: 4.0–12.0 µg/mL · crítico ≥15.0
- Fenitoína: 10.0–20.0 µg/mL · crítico ≥25.0
- Fenobarbital: 10.0–30.0 µg/mL · crítico ≥50.0
- Digoxina: los números coinciden (0.8–2.0 · ≥2.1); la unidad no (ver la sección 2)

### [CHI-TDM] (1)
- Litio: 0.6–1.2 mmol/L · pánico >2.0 mmol/L (Rev 6/2022)

Dato aparte (estas filas no citan CHI): el mismo PDF de CHI trae otros rangos para algunos fármacos de MSD. Fenobarbital: 15–40 µg/mL. Digoxina: 0.9–2.0 ng/mL, pánico >3.0 ng/mL. Ácido valproico: 50–100. Carbamazepina: 4–12. Fenitoína: 10–20.

### Comprobaciones al azar
- [KDIGO] G1 ≥90 · G2 60–89 · G3a 45–59 · G3b 30–44 · G4 15–29 · G5 <15: coinciden, con los mismos términos descriptivos.
- [KDIGO] Albuminuria A2 30–300 · A3 >300 (mg/g y mg/24 h): coinciden.
- [KDIGO] La nota «G1 y G2 no cumplen criterios de ERC sin otro marcador de daño» coincide.
- [MLP-TP] INR sin anticoagulante 0.8–1.1 y meta con warfarina 2.0–3.0: coinciden. MedlinePlus da TP 11–13.5 s, pero el .md toma el TP de ABIM (11–13 s).
- [SAMHSA] Anfetaminas 500 · cocaína (benzoilecgonina) 150 · THCA 50 ng/mL: coinciden.

## 5. Fuentes que no se pudieron abrir

| Fuente | Motivo |
|---|---|
| [ADA-2026] https://pmc.ncbi.nlm.nih.gov/articles/12690183 | PMC devolvió una página de verificación reCAPTCHA. Se probó también diabetesjournals.org, que dio HTTP 403. Quedan sin verificar los cortes de prediabetes y diabetes, la CTOG de 2 h y las curvas de diabetes gestacional de 75 g y 100 g. |
| [MLP-17KS] https://medlineplus.gov/ency/article/003460.htm | HTTP 404: la página ya no existe en esa URL. |
| Resto de fuentes (MLP-*, CDC-*, Mayo-*, ARUP-*, etc.) | No se intentaron por tiempo; la prioridad eran ABIM, MSD y CHI. |
