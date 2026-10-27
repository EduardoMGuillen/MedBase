# Reporte: CIE-11 como única clasificación de diagnósticos

Rama `perfil-consultorio`. El plan está en `PLAN_CIE11.md`. Al cerrar:
- 97 de 97 pruebas pasan (7 son nuevas, en `server/icd.test.ts`);
- `tsc -b` no da errores;
- `oxlint` no tiene advertencias nuevas;
- el buscador se probó en el navegador sin errores en la consola.

## Estado por punto

| Punto | Estado | Archivos | Cómo probarlo |
|---|---|---|---|
| **K1** Conexión con la CIE-11 de la OMS | Hecho | `server/icd.ts`, `server/app.ts` (`/api/icd/search`, `/api/icd/frequent`), `server/http.ts`, `.env.example`, `README.md` | Pon `ICD_CLIENT_ID` e `ICD_CLIENT_SECRET` y busca «faringitis» en una consulta: salen los resultados de la OMS en español (edición 2026-01). |
| **K2** Buscador único | Hecho | `src/components/DiagnosisPicker.tsx`, `Consultation.tsx`, `Inpatients.tsx` | En la consulta, el ingreso o el egreso escribe tres letras: arriba salen los usados en la clínica y abajo los de la OMS. Enter o «sin código» agrega uno sin código. |
| **K3** Diagnósticos de antes y reportes | Hecho | `src/lib/format.ts` (`dxCode`), `PatientChart.tsx`, `InpatientFile.tsx`, `FullRecord.tsx`, `server/routes/reports.ts`, `Reports.tsx` | Abre una consulta vieja de la demo: dice «(E11.9, CIE-10)». En Reportes, cada clasificación se cuenta por separado. |
| **K4** Pruebas | Hecho | `server/icd.test.ts` | `npm test`. |

## La búsqueda funciona sin credenciales

Clinara trae el archivo oficial de la OMS en español, `SimpleTabulation-ICD-11-MMS-es.zip` de la edición 2026-01. Está enlazado desde el buscador de la OMS y tiene 35 664 categorías con código.
- Se convierte con `scripts/build-icd11.ts` en `server/data/icd11-mms-es.json`: 2,4 MB, unos 630 kB comprimido.
- Los códigos y los títulos no se modifican (licencia CC BY-ND 3.0 IGO); sólo se quitan los guiones que marcan el nivel de la jerarquía.
- La búsqueda se hace en el servidor:
  - por palabras, sin importar las tildes, o por código;
  - tarda unos 5 a 15 ms, y unos 140 ms la primera vez que carga el archivo.

**La API de la OMS es opcional.** Con `ICD_CLIENT_ID` e `ICD_CLIENT_SECRET` (o `ICD_API_URL`), la búsqueda se hace en línea y, si falla, se vuelve al archivo.

**Códigos verificados contra el archivo oficial:**
- BA00 Hipertensión esencial
- 5A11 Diabetes mellitus tipo 2
- CA00 Nasofaringitis aguda
- CA02 Faringitis aguda
- 1A40.Z Gastroenteritis o colitis infecciosa sin especificación del agente infeccioso. El título de la demo estaba un poco distinto y lo corregí.

## Decisiones (para confirmar)

1. **Diagnósticos guardados con CIE-10:** no se convierten ni se borran; se muestran marcados «CIE-10». Convertirlos exige una tabla de equivalencias validada, y además una consulta firmada no se modifica.
2. **Datos históricos de la demo de Santa Brígida:** siguen en CIE-10 por la misma razón. El consultorio demo usa CIE-11.
3. **Sin conexión, el archivo oficial:** Clinara no trae ninguna lista escrita a mano. Sin la API, usa el archivo de la OMS sin modificar.
4. **Edición por defecto:** 2026-01, la más reciente con español según la OMS. Se cambia con `ICD_RELEASE`.

## Lo que hay que validar

- **Licencia:** la CIE-11 tiene licencia CC BY-ND 3.0 IGO: se puede usar, también comercialmente, citando a la OMS y sin adaptar los códigos. Los términos de uso de la API (si se usa) se aceptan al registrarse. Conviene que el asesor legal lo confirme; las dudas se consultan a licensing@who.int.
