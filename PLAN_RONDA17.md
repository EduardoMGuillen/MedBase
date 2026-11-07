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
