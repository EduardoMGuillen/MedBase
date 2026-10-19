# Clinara: plan de producto

> **Clinara** es un nombre temporal. Proyecto personal e independiente.

Plataforma web para clínicas pequeñas y medianas (de 1 a 15 médicos). Cubre la agenda, la llegada a sala de espera, el triaje, la consulta, el diagnóstico y la receta, con acceso según el rol de cada persona.

---

## 1. Qué tomamos de los sistemas que ya funcionan

| Referente | Práctica que adoptamos | Dónde aparece en Clinara |
|---|---|---|
| **Doctoralia / Docplanner** | Agenda por médico, confirmación y recordatorio de citas, estado de cada cita | Agenda por consultorio y estados *Programada, Confirmada, En sala…* |
| **Jane App** | Vista de día por columnas de profesional, colores por profesional, flujo de llegada | Agenda con columnas por médico y línea de "ahora" |
| **SimplePractice** | Plantillas de nota rápidas y un expediente con línea de tiempo | Consulta SOAP y expediente con historial cronológico |
| **athenaOne / DrChrono / Elation** | Banner de alergias siempre visible, lista de problemas activos, cruce de alergias al prescribir | Franja roja de alergias y alerta al recetar un fármaco del grupo alérgico |
| **Practo / Medesk** | Receta imprimible con folio, datos del médico y de la clínica | Hoja de receta con folio y firma |
| **Buenas prácticas de RBAC en historia clínica electrónica** | Mínimo privilegio, roles por función, separación de tareas, bitácora de accesos, doble factor | Matriz de permisos, bitácora y plan de doble factor |

Principios que resultan de esa revisión:

1. **El estado de la cita es el eje.** Cada rol avanza la cita un paso: recepción registra la llegada, enfermería hace el triaje y el médico la atiende y la cierra.
2. **La seguridad clínica va primero en pantalla.** Alergias y signos fuera de rango se ven antes que cualquier otro dato.
3. **Documentar en 3 minutos.** Síntomas con un toque, diagnóstico con autocompletado CIE-10 y vademécum con presentación precargada.
4. **Cada rol ve sólo lo suyo.** Recepción no lee notas clínicas y administración no ve diagnósticos.

---

## 2. Roles y permisos

| Permiso | Admin | Médico | Enfermería | Recepción |
|---|:-:|:-:|:-:|:-:|
| Ver agenda | ✓ | ✓ | ✓ | ✓ |
| Crear y reprogramar citas | ✓ | ✓ | | ✓ |
| Registrar llegada | ✓ | | ✓ | ✓ |
| Ver ficha (datos generales) | ✓ | ✓ | ✓ | ✓ |
| Registrar y editar pacientes | ✓ | | | ✓ |
| Ver expediente clínico | | ✓ | ✓ | |
| Tomar signos vitales y triaje | | ✓ | ✓ | |
| Escribir y firmar consultas | | ✓ | | |
| Emitir recetas | | ✓ | | |
| Ver e imprimir recetas | | ✓ | ✓ | |
| Gestionar personal y roles | ✓ | | | |
| Ver indicadores | ✓ | | | |
| Cobrar y emitir recibos | ✓ | | | ✓ |
| Configurar clínica y servicios | ✓ | | | |
| Ver bitácora | ✓ | | | |

La fuente de verdad está en `src/lib/permissions.ts`.

### Roles previstos para fases siguientes
- **Superadmin de plataforma**: gestiona clínicas (multiempresa), planes y facturación. No accede a datos clínicos.
- **Farmacia**: ve recetas emitidas y marca la dispensación.
- **Laboratorio**: recibe órdenes y sube resultados al expediente.
- **Paciente (portal)**: ve sus citas, recetas y resultados, y reserva en línea.

---

## 3. Flujo de la cita

```
Programada → Confirmada → En sala → Lista para consulta → En consulta → Atendida
     │            │                                                    
     └────────────┴──→ Cancelada / No asistió
```

| Paso | Quién | Acción en Clinara |
|---|---|---|
| Agenda | Recepción, Médico | Nueva cita en Agenda |
| Llegada | Recepción, Enfermería | Sala de espera → *Registrar llegada* |
| Triaje | Enfermería | Sala de espera → *Tomar signos* (con alertas de rango) |
| Consulta | Médico | Inicio o Agenda → *Atender* → nota SOAP |
| Receta | Médico | Sección P de la consulta → *Firmar consulta y receta* |

---

## 4. Modelo de datos

```
Clinic ─┬─ Staff (role, specialty, license)
        ├─ Patient (record, allergies[], conditions[], insurance)
        │     ├─ Appointment (doctor, start, minutes, type, status)
        │     ├─ Vitals (PA, FC, T°, SpO₂, peso, talla, dolor)
        │     ├─ Consultation (S: reason, symptoms, history · O: exam, vitals · A: diagnoses[CIE-10] · P: plan)
        │     └─ Prescription (folio, items[drug, presentation, dose, frequency, duration])
        └─ AuditEntry (user, action, at)
```

Los tipos están en `src/lib/types.ts`.

---

## 5. Arquitectura

### Versión actual (este repositorio)
- Frontend: React 19, TypeScript, Vite y React Router.
- Backend: Express 5 sobre Postgres. En producción, Neon (serverless) con la API como función de Vercel; en desarrollo y pruebas, PGlite (Postgres embebido, sin instalación). Todo corre con `npm run dev`.
- Autenticación real: bcrypt, sesión JWT en cookie `httpOnly`, bloqueo por intentos fallidos e invalidación de sesiones al desactivar usuarios o cambiar roles.
- Los permisos de `src/lib/permissions.ts` se aplican en el servidor y en la interfaz.
- Bitácora de sólo inserción, protegida con un trigger de Postgres.
- Bloqueos por intentos fallidos y límites de reserva guardados en la base, compartidos entre instancias serverless.
- Pruebas de API con `node:test` (`npm test`).
- Despliegue en Vercel + Neon (`vercel.json`), o con el `Dockerfile` en cualquier servicio de contenedores.

### Producción propuesta
| Capa | Elección | Motivo |
|---|---|---|
| Frontend | Esta misma app, desplegada en Vercel o Netlify | Ya construida |
| Backend y base de datos | **Supabase** (Postgres, Auth, Storage) o NestJS + Postgres | Row Level Security replica la matriz de roles en la base de datos |
| Autenticación | Supabase Auth con doble factor (TOTP) | Obligatorio para médicos y administración |
| Multiclínica | Columna `clinic_id` en todas las tablas y RLS por clínica | Aislamiento de datos |
| Archivos | Storage privado con URLs firmadas | Resultados de laboratorio e imágenes |
| Notificaciones | WhatsApp Business API y correo | Recordatorio 24 h antes y confirmación |
| Auditoría | Tabla de bitácora de solo inserción, escrita por triggers | Inalterable |
| Respaldo | Backups diarios con retención de 30 días y PITR | Continuidad |

---

## 6. Hoja de ruta

| Fase | Alcance |
|---|---|
| **0. Prototipo** (hecho) | Landing, login, 4 roles, agenda, sala de espera, triaje, consulta SOAP, CIE-10, recetas con cruce de alergias, expediente, personal, bitácora |
| **1. MVP funcional** (hecho) | Backend con base de datos, login real, permisos en servidor, edición de pacientes, reprogramación con detección de choques, alta de usuarios con contraseña temporal, cambio de contraseña, pruebas automáticas |
| **2. Operación** (hecho) | Reserva en línea con horarios por médico, recordatorios por WhatsApp (enlace), caja con recibos y cierre, reportes con exportación, archivos en el expediente, constancias médicas, configuración de clínica y precios, verificación en dos pasos, cierre por inactividad, buscador Ctrl+K |
| **3. Pendiente para producción** | Envío automático de recordatorios (WhatsApp Business API), alta de varias clínicas, respaldos automáticos programados, facturación fiscal (CAI/SAR), adjuntos en almacenamiento de objetos (Vercel Blob o S3) para archivos de más de 3 MB |
| **4. Pacientes** | Portal del paciente con historial, receta digital con código QR verificable, plantillas de nota por especialidad, órdenes de laboratorio |
| **5. Escala** | Multisede, farmacia, integraciones (HL7 FHIR), app móvil para médicos |

---

## 7. Identidad visual

- **Concepto:** *tinta de receta*. El azul `#2335C9` es el del bolígrafo con que se firma una prescripción. El fondo `#EEF2F1` es un gris frío de sala clínica.
- **Logo:** sello redondeado con una línea de pulso y un punto menta `#5CD3A6` que marca el latido.
- **Tipografía:** Bricolage Grotesque para títulos y Public Sans para la interfaz. Public Sans viene de un sistema de diseño gubernamental y prioriza la legibilidad.
- **Firma visual:** en el hero de la landing, un trazo de ECG cuyos picos son las citas del día.
- **Estados:** menta para lista o sana, ámbar para en espera, rojo para alerta, tinta para confirmada.
