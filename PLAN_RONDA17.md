# Plan de la ronda 17

El pedido está en `docs/ronda17/PEDIDO_RONDA17.md` y sale de `docs/ronda17/Correcciones ronda 17.docx` y sus capturas.

## Ramas de trabajo

Cada rama sale de `main` y vuelve a unirse a `main`. Hoy `SCHEMA_VERSION` está en `88`, y solo la rama `config` lo sube.

| Rama | Puntos | Esquema | Archivos principales |
|---|---|---|---|
| `ronda17-ui` | UI2, UI1, UI3, IE2 | sin cambios | `DateTimeField.tsx`, `TopScrollbar.tsx`, CSS, `Staff.tsx`, `FluidBalance.tsx`, `FullRecord.tsx` |
| `ronda17-lab-notas` | LB9, NO4 | sin cambios | `DeptTray.tsx`, `InpatientFile.tsx` (NoteEditor), documento de la nota |
| `ronda17-perfiles` | PF1, AD1, PF2 | sin cambios | `permissions.ts`, `AppShell.tsx`, `Dashboard.tsx`, `WaitingRoom.tsx`, `Ambulatory.tsx`, página nueva de pacientes ambulatorios, `Observation.tsx`, `src/tours`, `server/app.ts` |
| `ronda17-config` | OB1, CF1 | v90 (main tomó la v89 para el arreglo `disableDemoTotpOnce`) | `Settings.tsx`, `MyConfig.tsx`, `server/db.ts`, `App.tsx` (rutas de las secciones) |

## Tablas que llenan las ramas

- **PF2**: la tabla de perfiles con las diferencias entre clínica y consultorio. La llena `ronda17-perfiles`, abajo.
- **CF1**: la lista de ajustes antes y después. La llena `ronda17-config`, abajo.

## CF1 · Configuración de la clínica: ajustes antes y después

Antes, «Configuración de la clínica» era una sola URL (`/app/configuracion`) con diez pestañas que no cambiaban la dirección, y la pestaña «Clínica» juntaba datos, observación, curva térmica, logo y recordatorio.

Ahora hay siete secciones, cada una con su URL. A la izquierda hay un índice en pantallas anchas; a 860 px o menos, ese índice pasa a ser una fila que se desplaza a lo ancho.

- `/app/configuracion` abre `/app/configuracion/datos`, y una sección que no existe también lleva ahí.
- La ruta sigue protegida con `settings.manage`.
- En el consultorio la página se llama «Configuración del consultorio», como su opción del menú.

| Antes (pestaña › panel) | Ajuste | Después (sección › panel) | URL |
|---|---|---|---|
| Clínica › Datos de la clínica | Nombre, dirección | Datos de la clínica › Nombre y contactos | `/app/configuracion/datos` |
| Clínica › Datos de la clínica | Teléfonos y WhatsApp (número, etiqueta, tipo, principal, WhatsApp de la clínica) | Datos de la clínica › Nombre y contactos | `datos` |
| Clínica › Datos de la clínica | «Poner también el WhatsApp en recetas, constancias y recibos» | Datos de la clínica › Nombre y contactos | `datos` |
| Clínica › Datos de la clínica | Correo | Datos de la clínica › Nombre y contactos | `datos` |
| Clínica › Datos de la clínica | Símbolo de moneda | Datos de la clínica › Recetas, constancias y recibos | `datos` |
| Clínica › Datos de la clínica | Usar el número de identidad como número de expediente | Datos de la clínica › Recetas, constancias y recibos | `datos` |
| Clínica › Datos de la clínica | Formato del documento de identidad | Datos de la clínica › Recetas, constancias y recibos | `datos` |
| Clínica › Datos de la clínica | Logo (subir, cambiar, quitar) | Datos de la clínica › Recetas, constancias y recibos | `datos` |
| Consultorio › Datos del consultorio | Especialidad y número de colegiación (solo consultorio) | Datos del consultorio › Recetas, constancias y recibos | `datos` |
| Consultorio › ¿El consultorio crece? | Convertir en clínica (solo consultorio) | Datos del consultorio › ¿El consultorio crece? | `datos` |
| Horarios de médicos (Mi horario) | Horario de cada médico, «La agenda ofrece horas cada», «Se cobra por defecto» | Agenda y recordatorios | `/app/configuracion/agenda` |
| Rol de turnos (solo clínica) | Qué médico trabaja cada día | Agenda y recordatorios › Rol de turnos | `agenda` |
| Clínica › Recordatorio por WhatsApp | Plantilla del recordatorio, con su ejemplo | Agenda y recordatorios › Recordatorio por WhatsApp | `agenda` |
| Servicios y precios | Servicios: agregar, nombre, precio, ocultar o activar | Cobros › Servicios y precios | `/app/configuracion/cobros` |
| Formas de pago | Efectivo, transferencia, tarjeta, depósito, seguro, otra | Cobros › Formas de pago | `cobros` |
| Consultorio › Datos del consultorio | «Uso observación» (solo consultorio) | Observación › Observación | `/app/configuracion/observacion` |
| Clínica › Datos de la clínica | Observación: resaltar después de (horas) | Hospitalización y observación › Observación | `observacion` |
| Clínica › Datos de la clínica | Órdenes en observación: enfermería las revisa como checklist (solo clínica; OB1) | Hospitalización y observación › Observación | `observacion` |
| Clínica › Datos de la clínica | Curva térmica: temperatura normal desde; fiebre desde | Hospitalización y observación › Curva térmica y fiebre | `observacion` |
| Camas (solo clínica) | Agregar, renombrar, fuera de servicio | Hospitalización y observación › Camas | `observacion` |
| Áreas de servicio | Laboratorio propio, imágenes propias | Exámenes › Áreas de servicio | `/app/configuracion/examenes` |
| Catálogo de exámenes | Catálogo de exámenes y perfiles de laboratorio | Exámenes › Catálogo de exámenes, Perfiles | `examenes` |
| Vademécum | Vademécum (buscar, agregar, editar, importar CSV) | Vademécum | `/app/configuracion/vademecum` |
| Material médico quirúrgico | Materiales, Sets, Periodo de registro (sus tres pestañas) | Material médico quirúrgico | `/app/configuracion/material` |

No se quitó ningún ajuste. Además, siguen igual tres cosas que viven fuera de esta página:

- el catálogo de material para enfermería, en `/app/material-medico-quirurgico`;
- la configuración de Laboratorio e Imágenes, en `/app/configuracion-laboratorio` y `/app/configuracion-imagenes`;
- la vigencia de las recetas, que es de cada médico (`Configuración › Preferencias`).

**Vademécum:** no estaba en la lista de secciones del pedido. Queda como sección propia para no mezclarlo con Material ni con Exámenes.

**Guardar.**
- «Guardar cambios», en una barra fija abajo, guarda todo lo cambiado en la sección que se ve: campos de la clínica, formas de pago, áreas de servicio, precios y nombres de servicios, y el horario abierto.
- «Descartar» deshace lo de la sección.
- Al cambiar de sección con algo sin guardar, se pregunta: «Seguir aquí», «Descartar y cambiar» o «Guardar y cambiar».
- Al cerrar o recargar la pestaña, avisa el navegador.
- No se pregunta al salir por la barra lateral o con el botón Atrás del navegador, porque la app usa `BrowserRouter`, sin `useBlocker`.
- Vademécum, Material, Camas y Catálogo de exámenes guardan cada cambio en el momento, como antes.
- Los botones «Guardar formas de pago» y «Guardar áreas» se reemplazan por «Guardar cambios».
- El horario conserva su botón «Guardar horario» y los servicios su «Guardar» por fila.

**Consultorio.**
- Se ocultan Rol de turnos y Camas.
- La sección se llama «Observación» y trae el interruptor «Uso observación».
- Las horas para resaltar y la curva térmica solo aparecen con observación activada.
- El checklist de órdenes no se muestra, como antes.

**Recorridos.**
- Los pasos de configuración de administración y del consultorio van ahora a la URL de su sección.
- Sus `data-tour` (`contactos`, `tab:servicios`, `tab:pagos`, `tab:horarios`, `tab:camas`, `tab:areas`) quedan en el panel que corresponde.
- Cada opción del índice lleva `cfg:<sección>`.

**«Configuración» de cada persona (`MyConfig.tsx`).** Sigue abajo, sobre el perfil, con sus apartados en `?seccion=` sin cambios. El índice se ordena en tres grupos:

| Antes | Después |
|---|---|
| Datos profesionales o personales, Firma electrónica, Mi horario, Mi vademécum, Mis sets de órdenes, Mis sets de exámenes, Preferencias, Seguridad, Mi actividad | **Mis datos**: Datos profesionales o personales, Firma electrónica. **Para atender**: Mi horario, Preferencias, Mi vademécum, Mis sets de órdenes, Mis sets de exámenes. **Mi cuenta**: Seguridad, Mi actividad |

- Preferencias sube junto a Mi horario, porque las dos dicen cómo empieza tu agenda.
- Los títulos de grupo se ven en pantallas anchas y se ocultan en la fila del teléfono.
- Enfermería, administración, laboratorio e imágenes siguen viendo solo Seguridad y Mi actividad, sin títulos de grupo.

## PF2 · Perfiles y barra lateral (rama `ronda17-perfiles`)

La barra lateral sale de una sola regla, `src/lib/nav.ts` (`sidebarFor`), que usan la pantalla (`AppShell.tsx`) y las pruebas
(`server/ronda17_perfiles.test.ts`). Grupos, en este orden y los mismos para todos los roles:

1. sueltas: Inicio, Agenda, Recetas, Caja (el médico la ve como «Cobrar»);
2. **Pacientes**: Consulta externa, Observación, Hospitalizados, Biblioteca de pacientes, Crónicos y seguimientos (administración y
   recepción ven Observación y Hospitalizados como tablero de solo lectura, sin abrir el expediente);
3. **Laboratorio e imágenes**: Pacientes ambulatorios (administración y recepción) y las bandejas de Laboratorio e Imágenes en solo
   lectura (administración). Para Laboratorio el grupo se llama «Laboratorio» (Ambulatorio, Observación, Hospitalización,
   Configuración de laboratorio) y para Imágenes, «Imágenes» (lo mismo de su tipo). Decisión: su configuración va aquí porque es de su
   departamento; su rol de turnos va en «Registros», junto al de enfermería, para que todos los roles de turnos estén en un solo
   lugar. El grupo «Departamento» desaparece.
4. **Registros**: Uso de medicamentos y material, Rol de turnos (enfermería, Laboratorio e Imágenes);
5. **Administración** (en el consultorio, «Mi consultorio»): Reportes, Personal y roles (o Personal), Configuración de la clínica (o del consultorio).

Las URL no cambian; solo cambia el grupo donde aparecen (`/app/sala` sigue llevando a Consulta externa). Los pasos `nav:/app/...` de
los recorridos usan la ruta, así que siguen funcionando. Pasos nuevos: «Paciente sin cita» en el del médico de la clínica (PF1),
«Pacientes ambulatorios» en el de recepción, y «Observación» y «Laboratorio e imágenes» en el de administración (AD1).

### Tabla por perfil (después de PF1, AD1 y PF2)

«Sin cita» = «Paciente sin cita» (`checkin.manage`). «Ambulatorio» = «Paciente ambulatorio» (`ambulatory.register`). «Ingresar» =
«Ingresar paciente» en Hospitalizados (`inpatient.admit`). «Material» = registrar material (`usage.record`).

| Perfil | Barra lateral | Botones del Inicio | Sin cita | Ambulatorio | Ingresar | Observación | Hospitalizados | Material |
|---|---|---|---|---|---|---|---|---|
| Clínica · Administración | Inicio, Agenda, Caja · **Pacientes**: Consulta externa, Observación, Hospitalizados, Biblioteca, Crónicos · **Laboratorio e imágenes**: Pacientes ambulatorios, Laboratorio, Imágenes · **Registros**: Uso de medicamentos y material · **Administración**: Reportes, Personal y roles, Configuración de la clínica | «Ver reportes»; tarjetas a Agenda, Caja, Reportes, Biblioteca, Pacientes ambulatorios y Observación | Sí, en Consulta externa | Sí, en Pacientes ambulatorios y en las bandejas | Sí (tablero sin expediente) | **Sí, solo lectura (nuevo, AD1)** | Sí, tablero sin expediente | Sí |
| Clínica · Médico (cualquier especialidad) | Inicio, Agenda, Recetas, Cobrar · **Pacientes**: Consulta externa, Observación, Hospitalizados, Biblioteca, Crónicos | «Ir a consulta externa»; tarjetas a Consulta externa | **Sí (nuevo, PF1)** | No | Sí | Sí | Sí | No |
| Clínica · Enfermería licenciada | Inicio · **Pacientes**: Consulta externa, Observación, Hospitalizados, Biblioteca, Crónicos · **Registros**: Uso de medicamentos y material, Rol de turnos (lo edita) | «Abrir consulta externa»; tarjetas a Consulta externa | Sí | No | No | Sí | Sí | Sí |
| Clínica · Enfermería auxiliar | Igual que la licenciada (el rol de turnos solo lo ve) | Igual | Sí | No | No | Sí | Sí | Sí |
| Clínica · Recepción | Inicio, Agenda, Caja · **Pacientes**: Consulta externa, Observación, Hospitalizados, Biblioteca, Crónicos · **Laboratorio e imágenes**: Pacientes ambulatorios · **Registros**: Uso de medicamentos y material | «Abrir sala de espera»; tarjetas a Agenda, Caja, Pacientes ambulatorios y Observación | Sí, en Consulta externa | Sí, en Pacientes ambulatorios | Sí (tablero sin expediente) | **Sí, solo lectura (nuevo, AD1)** | Sí, tablero sin expediente | Sí |
| Clínica · Laboratorio (microbiólogo) | Inicio · **Pacientes**: Biblioteca · **Laboratorio**: Ambulatorio, Observación, Hospitalización, Configuración de laboratorio (edita) · **Registros**: Rol de turnos (edita) | «Paciente ambulatorio» y «Atender» de su Inicio de departamento | No | Sí, en su bandeja Ambulatorio | No | Su área de la bandeja | Su área de la bandeja | No |
| Clínica · Laboratorio (técnico) | Igual que el microbiólogo (configuración y rol de turnos en solo lectura) | Igual | No | Sí | No | Su área | Su área | No |
| Clínica · Imágenes (radiólogo) | Inicio · **Pacientes**: Biblioteca · **Imágenes**: Ambulatorio, Observación, Hospitalización, Configuración de imágenes (edita) · **Registros**: Rol de turnos (edita) | «Paciente ambulatorio» y «Atender» | No | Sí | No | Su área (y el expediente en solo lectura) | Su área | No |
| Clínica · Imágenes (técnico) | Igual que el radiólogo (configuración y rol de turnos en solo lectura) | Igual | No | Sí | No | Su área | Su área | No |
| Consultorio · Médico | Inicio, Agenda, Recetas, Cobrar · **Pacientes**: Consulta externa, Observación, Biblioteca, Crónicos · **Registros**: Uso de medicamentos y material | «Ir a consulta externa»; tarjetas a Consulta externa y Caja; «Llegó» en Por llegar | Sí | No | No aplica (sin camas) | Sí (si la usa) | No aplica | Sí |
| Consultorio · Administrador | Inicio, Agenda, Caja · **Registros**: Uso de medicamentos y material · **Mi consultorio**: Reportes, Personal, Configuración del consultorio | «Ver reportes»; tarjetas a Agenda, Caja, Reportes y Biblioteca; «Llegó» en Por llegar | Sí (permiso; lo clínico está en la vista de médico) | **No (corregido, PF2)** | No | No (MI1) | No aplica | Sí |
| Consultorio · Enfermería | Inicio · **Pacientes**: Consulta externa, Observación, Biblioteca, Crónicos · **Registros**: Uso de medicamentos y material | «Abrir consulta externa» | Sí | No | No | Sí | No aplica | Sí |
| Consultorio · Asistente | Inicio, Agenda, Caja · **Pacientes**: Consulta externa, Observación, Biblioteca, Crónicos · **Registros**: Uso de medicamentos y material | «Abrir sala de espera»; tarjetas a Agenda y Caja | Sí | No | No | Sí (aplica dosis) | No aplica | Sí |

### Diferencias entre clínica y consultorio para el mismo rol

| Rol | Diferencia | Estado |
|---|---|---|
| Médico | «Paciente sin cita»: el del consultorio lo tenía y el de la clínica no. | **Corregido** (PF1): `checkin.manage` para todo médico de la clínica. Le agrega también «Registrar llegada» y «Marcar que no asistió» en la Agenda; se dejan porque ya cancela y reprograma citas (`agenda.manage`) y el del consultorio también los tiene, así que no se separó otro permiso. |
| Médico | El del consultorio aplica dosis en observación y registra material (Registros); el de la clínica no. | **Justificado**: el consultorio puede no tener personal (MI1, RU1–RU3); en la clínica lo hace enfermería. |
| Médico | En el Inicio del consultorio: «Cobrado hoy», bandeja de exámenes, «Llamar hoy» y «Llegó» en Por llegar. | **Justificado**: en la clínica eso es de recepción, enfermería y los departamentos; el médico de la clínica registra llegadas desde la Agenda y «sin cita» desde Consulta externa. |
| Médico | Hospitalizados e «Ingresar». | **Justificado**: un consultorio no tiene camas (`features().hospital`). |
| Administración | En el consultorio no ve el grupo Pacientes (ni Observación). | **Justificado** (MI1): el titular ve lo clínico en su vista de médico. |
| Administración | En el consultorio no tiene «Laboratorio e imágenes» (ni ambulatorios ni bandejas). | **Corregido**: tenía `ambulatory.register` sin poder usarlo (el servidor ya rechazaba ambulatorios en un consultorio, DP3); se le quita. El resto, **justificado**: un consultorio no tiene departamentos de Laboratorio ni Imágenes. |
| Administración | En el consultorio no ingresa ni ve Hospitalizados. | **Justificado**: sin camas (HO2). |
| Administración | Nombres: «Mi consultorio», «Personal», «Configuración del consultorio». | **Justificado**: solo cambia el nombre. |
| Enfermería | En el consultorio no tiene Rol de turnos. | **Justificado** (EN1): un consultorio no tiene rol de turnos. |
| Enfermería | En el consultorio no ve Hospitalizados. | **Justificado**: sin camas. |
| Recepción / Asistente | Son roles distintos (recepción solo en clínica, asistente solo en consultorio); la asistente además hace preclínica y aplica dosis. | **Justificado**: la asistente cubre recepción y enfermería en un consultorio (ROLE_SUMMARY). |
| Laboratorio / Imágenes | Solo existen en la clínica. | **Justificado**: un consultorio no tiene departamentos. |

### Revisión por URL (escribiendo cada dirección del menú con cada perfil)

Hecha en el navegador (build de producción, base demo nueva, 1366 px) el 7 de noviembre de 2026. Para cada perfil se abrió cada
entrada de su barra lateral escribiendo la URL: **ninguna** dio «Sin permiso», «Esta pantalla es de…» ni redirigió.

| Perfil (usuario demo) | Entradas revisadas | Resultado |
|---|---|---|
| Administración (rmoncada) | 15 | todas abren; Observación en solo lectura; Laboratorio e Imágenes con el aviso «Solo lectura» |
| Médico (vsolorzano, tgalvez, mvilleda en vista de médico) | 9 cada uno | todas abren; «Paciente sin cita» visible (tgalvez: el médico por defecto es ella y está «Registrar paciente nuevo») |
| Enfermería licenciada (murbina) y auxiliar (rvallecillo) | 8 | todas abren |
| Recepción (aquiroz) | 10 | todas abren; Observación en solo lectura |
| Laboratorio microbiólogo (psuazo) y técnico (berazo) | 7 | todas abren |
| Imágenes radiólogo (rzepeda) y técnico (echinchilla) | 7 | todas abren |
| Consultorio médico (ipacheco, vista de médico) | 9 | todas abren |
| Consultorio administrador (ipacheco, vista de administrador) | 7 | todas abren |
| Consultorio asistente (arodas) | 8 | todas abren |
| Médico y administración en vista de administrador (mvilleda) | 15 | todas abren |

Direcciones fuera del menú (lo que no debe abrir): administración → `/app/observacion/:id` «Sin permiso» (no abre el expediente) y
`/app/configuracion-laboratorio` «Sin permiso»; recepción → `/app/observacion/:id` y `/app/laboratorio` «Sin permiso»; médico →
`/app/pacientes-ambulatorios` y `/app/laboratorio` «Sin permiso»; administrador del consultorio → `/app/pacientes-ambulatorios`
«Sin permiso» y `/app/observacion` ofrece cambiar a la vista de médico; laboratorio → `/app/imagenes/ambulatorio` «Esta pantalla es
de Imágenes». Laboratorio sí abre `/app/pacientes-ambulatorios` por URL (tiene `ambulatory.register` y ve solo lo de su tipo); no está
en su menú porque ya tiene su bandeja Ambulatorio. Enfermería del consultorio: no hay usuario demo; se revisó con la regla
(`sidebarFor`) en las pruebas, no en el navegador.
