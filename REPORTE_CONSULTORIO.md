# Reporte: perfil «Consultorio» (médico independiente)

Rama `perfil-consultorio`, un commit por punto. El plan está en `PLAN_CONSULTORIO.md`.

Cuentas de demo, todas con la contraseña `demo1234`:

| Cuenta | Correo |
|---|---|
| Médico titular | `alopez@demo.clinara` |
| Asistente | `asistente@demo.clinara` |
| Administración de Clinara | `superadmin@demo.clinara` |

**Verificación al cerrar**
- `tsc -b` sin errores.
- `npm test`: 91 de 91. Eran 80; las nuevas están en `server/consultorio.test.ts`.
- `npm run build` correcto.
- `oxlint` con 37 advertencias, ninguna nueva.
- Recorrido completo en el navegador, en escritorio y a 390 px, sin errores en la consola:
  - la Administración de Clinara crea un consultorio;
  - el médico nuevo entra y pasa por el asistente de primer ingreso;
  - el médico de la demo atiende y su receta sale con él como encabezado;
  - la asistente ve su Inicio con la espera de preclínica;
  - la reserva en línea no pide elegir médico;
  - por URL directa, Hospitalizados y Configuración se bloquean para quien no corresponde.

## 1. Estado por punto

| Punto | Estado | Archivos principales | Cómo probarlo |
|---|---|---|---|
| **C1** Tipo de cuenta y permisos | Hecho | `src/lib/permissions.ts` (`permissionsFor`, `features`, rol `assistant`), `server/app.ts`, `server/db.ts` (v23), `server/routes/inpatient.ts` | Entra como `alopez@demo.clinara`: tienes Reportes, Asistentes y Configuración. Como `asistente@demo.clinara`, no. Santa Brígida no cambia. |
| **C2** Crear un consultorio | Hecho | `server/routes/platform.ts`, `src/app/Platform.tsx` | Como superadmin, *Nueva cuenta, Consultorio*: escribe el médico y la colegiación. El nombre y la dirección de reserva se llenan solos. |
| **C3** Primer ingreso | Hecho | `src/app/Onboarding.tsx`, `src/App.tsx`, `server/routes/settings.ts` | Entra con el médico recién creado: aparece «Hola, Dr. …» con 3 pasos. Termínalos o sáltalos y ya no vuelve a aparecer. |
| **C4** Pantallas de un solo médico | Hecho | `AppShell.tsx`, `WaitingRoom.tsx`, `Agenda.tsx`, `Prescriptions.tsx`, `Reports.tsx`, `Dashboard.tsx`, `Booking.tsx`, `Consultation.tsx`, `Settings.tsx` | En el consultorio no hay «Toda la clínica», filtro de médico, Hospitalizados ni «Ingreso a hospitalización». La Caja va en el menú y el Inicio muestra «Cobrado hoy». |
| **C5** Documentos con el médico | Hecho | `src/components/DocHeader.tsx`, `Prescriptions.tsx`, `Certificate.tsx`, `server/routes/certificates.ts`, `server/authorizations.ts` | Firma una consulta con receta: el encabezado es «Dra. Ana López, Medicina general, colegiación…» y debajo el consultorio. |
| **C6** Asistentes y paso a clínica | Hecho | `src/app/Staff.tsx`, `src/app/Settings.tsx` (`ConvertToClinic`), `server/routes/settings.ts`, `server/app.ts` (`assertRoleFits`) | *Asistentes, Agregar asistente* (máximo 2). En *Configuración, Convertir en clínica* eliges a quién administrará y a qué rol pasa cada asistente. |
| **C7** Observación opcional | Hecho | `Settings.tsx`, `Consultation.tsx`, `server/app.ts` | Con «Uso observación» apagado desaparecen Observación y «Aplicar en la clínica». Encendido, la asistente aplica la dosis. |
| **C8** Demo y documentación | Hecho, salvo la guía en PDF | `src/lib/seed.ts` (`seedOffice`), `server/db.ts` (`insertOffice`, `addDemoOffice`), `README.md` | El login de demo muestra el consultorio. El recorrido está en el README. |

## 2. Cambios en la base (v23, todo aditivo)

**`clinics`**
- `kind`: `clinic` o `office`. Las cuentas que ya existen quedan como clínica.
- `observation_enabled`: si el consultorio usa observación.
- `owner_id`: el médico titular.
- `specialty` y `license`: lo que va en el encabezado de los documentos.
- `max_assistants`: tope de asistentes, 2 por defecto.
- `setup_done_at`: cuándo terminó el primer ingreso.

**`staff`**
- `role` acepta `assistant`.

La migración se probó sobre una copia de la base demo v22: no se perdieron datos y se agregó el consultorio demo.

## 3. Decisiones (para confirmar)

1. **La asistente puede leer el expediente**, como enfermería, para aplicar los medicamentos en observación. No escribe notas ni recetas. El plan decía «sin notas clínicas»; lo dejé en sólo lectura porque la hoja de medicamentos vive dentro del expediente.
2. **Al convertir en clínica, el médico deja de administrar.** Sigue como médico, y se crea un usuario de administración con otro correo (puede ser él mismo con otro correo). Cada asistente pasa a recepción o a enfermería, según lo que elija el médico.
3. **El primer ingreso exige dirección y teléfono** para guardar el primer paso, porque Configuración ya los pide. El paso se puede saltar.
4. **Un consultorio puede tener un solo médico.** El servidor lo impide aunque lo intente la Administración de Clinara; para sumar otro médico, se convierte en clínica.
5. **En el consultorio no hay checklist de órdenes para enfermería**, porque no hay enfermería.

## 4. Errores encontrados en el camino (corregidos)

- **Permisos al recargar:** al recargar la página, la sesión se armaba sin el tipo de cuenta. El médico del consultorio perdía en la interfaz sus permisos de administración. Corregido y con prueba.
- **Rol «asistente» al migrar:** la restricción de roles de la v6 se vuelve a ejecutar con el esquema y no conocía «asistente». En una base con asistentes, la actualización habría fallado.

## 5. Pendiente

- La guía en PDF para médicos (`docs/Guia-para-medicos.pdf`) no tiene la sección del consultorio; está en el README.
- Quedan textos que dicen «clínica» en pantallas menos visibles (por ejemplo, algunos avisos de error del servidor). Los principales ya dicen «consultorio».
