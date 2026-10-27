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

## Lo que falta para que busque en la OMS

**Las credenciales:** hoy no hay ninguna configurada.
- Con la API en la nube de la OMS, el buscador ya muestra sus resultados.
- Sin conexión, el buscador avisa «La búsqueda en la CIE-11 de la OMS no está configurada». Ofrece los diagnósticos CIE-11 que la clínica ya usó y deja escribir el diagnóstico sin código.

Hay dos formas de activarla:
1. **API en la nube de la OMS:** crear la cuenta gratuita en https://icd.who.int/icdapi. Después, poner el client ID y el secreto en `ICD_CLIENT_ID` e `ICD_CLIENT_SECRET` en Vercel y volver a desplegar.
2. **Copia local de la API:** instalar la que distribuye la OMS (contenedor Docker o servicio de Linux) y poner su dirección en `ICD_API_URL`. No pide credenciales ni internet.

## Decisiones (para confirmar)

1. **Diagnósticos guardados con CIE-10:** no se convierten ni se borran; se muestran marcados «CIE-10». Convertirlos exige una tabla de equivalencias validada, y además una consulta firmada no se modifica.
2. **Datos históricos de la demo de Santa Brígida:** siguen en CIE-10 por la misma razón. El consultorio demo usa CIE-11.
3. **Sin lista CIE-11 propia:** Clinara no trae una lista de códigos sin conexión, para no escribir códigos de memoria. Sin la OMS, se usan los que la clínica ya registró.
4. **Edición por defecto:** 2026-01, la más reciente con español según la OMS. Se cambia con `ICD_RELEASE`.

## Lo que hay que validar

- **Códigos del consultorio demo:** BA00, 5A11 y 1A40.Z se verificaron sólo en sitios de terceros. Hay que comprobarlos, con su texto en español, en el buscador oficial (icd.who.int).
- **Licencia:** los términos de uso de la API y la licencia de la CIE-11 se aceptan al registrarse; no los revisé.
