# Pedido de la ronda 17

Fuente: `docs/ronda17/Correcciones ronda 17.docx` (Emil, 7 de noviembre de 2026), con 11 capturas en `docs/ronda17/capturas/captura-01..11.png`.

El texto que aparece dentro de las capturas (nombres, datos de pacientes, cifras) es de la demo y no es un requisito.

## 0. Contexto

En la ronda 16 se sumaron muchas pantallas: ingreso directo, ingestas y excretas, valoración preanestésica, recuento quirúrgico, rol de turnos de enfermería y registro de material por administración y recepción.

Emil pide tres cosas de fondo:
- arreglar la interfaz que quedó mal;
- que un mismo perfil funcione igual en una clínica y en un consultorio;
- poner al día la barra lateral y la configuración con todo lo que se agregó.

## 1. Cómo se trabaja

- Es el mismo flujo de siempre:
  - `PLAN_RONDA17.md`;
  - un commit por punto con el formato `[ronda17][CÓDIGO] …`;
  - `REPORTE_RONDA17.md` al final.
- Las migraciones suben `SCHEMA_VERSION` desde 88, deben ser idempotentes y se prueban sobre una copia de la base demo.
- Los permisos se aplican en el servidor con `can()`, no solo escondiendo botones.
- Cada pantalla tocada se revisa a 1366 px, a 1920 px y a 390 px.

## 2. Lo que no se debe romper

- Las rutas actuales. Si una opción cambia de lugar en el menú, la URL vieja sigue funcionando.
- Los recorridos (`src/tours`): cada `data-tour` que se mueva se actualiza en el paso correspondiente.
- El consultorio, con su vista de médico y su vista de administrador (MI1).
- Lo que recepción y administración no pueden ver. Siguen sin acceso al expediente ni a las notas clínicas: administración puede ver la lista de Observación, pero no abre el expediente.
- Todas las pruebas existentes. El fallo de `api.test` «la demo trae casos completos» ya existía y sigue fuera del alcance.

## 3. Puntos

### UI1 · Personal y roles: las pestañas cortan el contenido (captura 01)

En Personal, Permisos por rol y Bitácora:
- el encabezado fijo de la tabla tapa las primeras filas;
- arriba de la tabla queda una barra blanca vacía;
- las columnas se reparten mal: los nombres ocupan cuatro líneas mientras la columna Rol queda casi vacía;
- la página no se desplaza bien.

**Aceptación**
- [ ] En las tres pestañas el contenido se ve completo y se desplaza con la página: no hay tabla con altura fija y desplazamiento interno, salvo que haga falta para el ancho.
- [ ] El encabezado no tapa ninguna fila.
- [ ] No queda ninguna barra vacía.
- [ ] A 1366 px, el nombre con la especialidad ocupa como máximo dos líneas y los botones de cada fila no se salen de la tarjeta.
- [ ] A 390 px se puede usar: la tabla pasa a tarjetas o se desplaza a lo ancho, con la barra visible.

### UI2 · Ícono de calendario fuera de su campo; barra de la Agenda (capturas 04, 05 y 09)

El botón de calendario de `DateTimeField` aparece fuera del campo:
- en la Agenda, encima de la barra de desplazamiento de arriba;
- en «Registrar ingreso o egreso», a la derecha del campo;
- en la bandeja del laboratorio, al lado de la fecha.

**Aceptación**
- [ ] En todas las pantallas que usan `DateTimeField`, el ícono queda dentro del campo, a la derecha, alineado.
- [ ] La barra superior de la Agenda (`TopScrollbar`) no tiene nada encima y se ve como la barra de abajo.
- [ ] Se revisan, como mínimo:
  - la Agenda;
  - las bandejas de Laboratorio e Imágenes;
  - ingestas y excretas;
  - la hoja de medicamentos;
  - la nota de enfermería;
  - la anestesia;
  - el recuento;
  - la nueva cita.

### UI3 · Ventana «Registrar ingreso o egreso» y tabla de ingestas y excretas (capturas 05 y 06)

**Aceptación**
- [ ] La ventana tiene dos columnas parejas:
  - Tipo y Cantidad;
  - Hora (el campo con «Ahora» en la misma línea) y Nota.
- [ ] Los campos tienen la misma altura y están alineados por arriba.
- [ ] La frase de la tarjeta queda bien puntuada: «Cuantificar ingestas y excretas cada 24 horas. Los líquidos IV se calculan de la hoja de medicamentos; toca un número para ver de dónde sale.» (sin el «· Cada 24 horas Los…»).
- [ ] Cuando hay un solo turno de 24 horas, no se repite la columna «07:00–07:00» junto a «24 horas»: queda una sola columna.
- [ ] Las filas tienen un solo fondo de punta a punta: el rubro y los números no se ven con fondos distintos.

### IE2 · Ingestas y excretas: solo los rubros que se usaron (captura 06)

«Que vía oral o diuresis vayan apareciendo acorde a como lo vaya agregando.» Si el paciente sangró y orinó, la tabla muestra Sangrado y Diuresis, y no Evacuaciones, Drenajes ni los demás.

**Aceptación**
- [ ] La tabla muestra solo los rubros que tienen al menos un registro en el día que se ve.
- [ ] «Líquidos IV (calculado)» aparece solo si hay líquidos IV en la hoja ese día.
- [ ] Los encabezados INGRESOS y EGRESOS, sus totales y el Balance se muestran siempre, en 0 si no hay nada.
- [ ] Sin ningún registro se ve un aviso corto («Sin registros este día») y el botón para registrar, no una tabla llena de guiones.
- [ ] En «Registrar ingreso o egreso» siguen todos los rubros para elegir.
- [ ] Lo mismo vale en el expediente completo y en la impresión.

### OB1 · «Enfermería las revisa como checklist» viene marcado (captura 03)

**Aceptación**
- [ ] En las clínicas nuevas, «Órdenes en observación → Enfermería las revisa como checklist» viene activado.
- [ ] La migración lo activa una vez en las clínicas que lo tienen apagado. Default: se activa en todas, porque nadie lo apagó a propósito. Queda en el reporte para que Emil lo valide.
- [ ] Después de la migración, quien lo apague lo sigue teniendo apagado, porque la migración no vuelve a correr.

### AD1 · Barra lateral de administración y recepción; botones del Inicio a su lugar (captura 02)

Emil:
- administración no tiene Observación en la barra lateral;
- el registro de pacientes para Laboratorio clínico e Imágenes («Paciente ambulatorio») no va en Consulta externa;
- los botones del Inicio se quitan y quedan cada uno en su lugar.

**Aceptación**
- [ ] Administración (clínica) ve Observación en «Pacientes», como el tablero de Hospitalizados de HO2: ve quién está, en qué cama y con qué médico, pero no abre el expediente.
- [ ] Administración y recepción tienen en la barra lateral un grupo «Laboratorio e imágenes» con «Pacientes ambulatorios». Esa página:
  - tiene el botón «Paciente ambulatorio», con la misma ventana `AmbulatoryModal`;
  - lista los pacientes ambulatorios del día con el estado de sus exámenes: ordenado, muestra tomada, en proceso o resultado listo;
  - es de solo lectura, sin resultados clínicos: muestra el nombre del examen y su estado, no los valores.
- [ ] «Paciente ambulatorio» se quita de Consulta externa y del Inicio.
- [ ] «Paciente sin cita» queda en Consulta externa y se quita del Inicio.
- [ ] El Inicio de administración y de recepción se queda con lo que resume, como contadores y listas, y cada tarjeta lleva a su página.
- [ ] Laboratorio e Imágenes siguen registrando ambulatorios desde su bandeja «Ambulatorio».

### PF1 · El médico de la clínica también registra pacientes sin cita (capturas 07 y 08)

Hoy el médico del consultorio tiene «Paciente sin cita» y el de la clínica no, porque `checkin.manage` solo lo tiene el médico en `OFFICE_PERMISSIONS`.

**Aceptación**
- [ ] El médico de la clínica ve «Paciente sin cita» en Consulta externa y lo puede usar.
- [ ] El servidor lo permite (`/api/appointments/walk-in`).
- [ ] El paciente queda con ese médico por defecto.
- [ ] Default: se da el permiso de registrar llegadas (`checkin.manage`) al médico de la clínica, igual que en el consultorio.
- [ ] Se revisa que eso no le agregue al médico otros botones que no corresponden; si los agrega, se separa un permiso solo para «sin cita».

### LB9 · Laboratorio: Observación y Hospitalización con el mismo diseño (capturas 09 y 10)

En Observación no aparece el botón «Muestra tomada (n)» de cada categoría, y en Hospitalización sí.

**Aceptación**
- [ ] Las tres áreas (Ambulatorio, Observación y Hospitalización) usan el mismo componente de tarjeta, en Laboratorio y en Imágenes.
- [ ] La regla de los botones por categoría es una sola: se muestran siempre que haya pendientes en esa categoría, aunque haya una sola. Hay un único botón general y uno por categoría.
- [ ] Se revisan las tres áreas con el perfil de Laboratorio y el de Imágenes. No debe quedar ninguna otra diferencia visual entre áreas, como etiquetas, orden, espera o urgente.

### NO4 · SOAP: el diagnóstico va antes del SOAP en las notas de evolución (captura 11)

- En la nota de ingreso con formato SOAP (ingreso directo), los diagnósticos siguen después de A. Análisis, como en NO3.
- En la nota de evolución de un paciente en observación u hospitalizado, el diagnóstico ya se conoce y va primero, arriba de S, O, A y P.

**Aceptación**
- [ ] `NoteEditor` con `kind="evolution"` y formato SOAP muestra «Diagnósticos (CIE-11)» como primer bloque.
- [ ] Con `kind="admission"` y SOAP, el bloque queda debajo de A.
- [ ] El documento firmado y la impresión siguen el mismo orden que el editor en los dos casos.
- [ ] El estándar de evolución ya pone los diagnósticos primero; se comprueba que siga así.

### PF2 · Revisar todos los perfiles y poner al día la barra lateral

Emil: «Quiero que corrobores todos los UI y funciones de los perfiles, que actualices y mejores la barra lateral».

Se recorren todos los perfiles:
- en la clínica: administración, médico, enfermería (licenciada y auxiliar), recepción, laboratorio (microbiólogo y técnico) e imágenes (radiólogo y técnico);
- en el consultorio: médico, administrador, enfermería y asistente.

**Aceptación**
- [ ] Una tabla en `PLAN_RONDA17.md` con una fila por perfil y estas columnas: opciones de la barra lateral, botones del Inicio, «Paciente sin cita», «Paciente ambulatorio», ingresar, Observación, Hospitalizados y registro de material.
- [ ] Cada diferencia entre clínica y consultorio para el mismo rol queda **corregida** o **justificada** en una línea.
- [ ] La barra lateral queda ordenada por flujo de trabajo, con los mismos grupos para todos los roles:
  1. Inicio, Agenda, Recetas y Caja (o Cobrar);
  2. **Pacientes**: Consulta externa, Observación, Hospitalizados, Biblioteca de pacientes, Crónicos y seguimientos;
  3. **Laboratorio e imágenes**: lo de los departamentos y los pacientes ambulatorios;
  4. **Registros**: uso de medicamentos y material, rol de turnos;
  5. **Administración** (o «Mi consultorio»): reportes, personal y configuración.
- [ ] Cada rol ve en cada grupo solo lo que le corresponde.
- [ ] Ninguna opción del menú lleva a una página que el rol no puede usar: se revisa cada ruta escribiendo la URL directamente con cada perfil.

### CF1 · Reorganizar la configuración

«Reorganices las configuraciones a como sea mejor y más conveniente para un mejor entendimiento y flujo de trabajo».

Hoy «Configuración de la clínica» es una página larga. Mezcla datos de la clínica, contactos, observación, curva térmica, logo, WhatsApp, áreas de servicio, formas de pago, servicios y precios, y médicos y horarios.

**Aceptación**
- [ ] «Configuración de la clínica» se ordena en secciones con pestañas (o un índice a la izquierda en pantallas anchas). Cada sección tiene su propia URL, por ejemplo `/app/configuracion/observacion`. Default de secciones:
  - **Datos de la clínica**: nombre, contactos, correo, moneda, documento de identidad y logo;
  - **Agenda y recordatorios**: médicos y horarios, recordatorio por WhatsApp;
  - **Cobros**: servicios y precios, formas de pago;
  - **Hospitalización y observación**: horas para resaltar, checklist de órdenes, curva térmica y fiebre;
  - **Exámenes**: áreas de servicio, con enlaces al catálogo si existe;
  - **Material**: catálogo, sets y periodo de registro, si hoy están en otro lugar se enlazan.
- [ ] No se pierde ningún ajuste: hay una lista antes y después en el plan.
- [ ] El botón «Guardar cambios» guarda la sección que se ve y avisa si quedó algo sin guardar al cambiar de sección.
- [ ] «Configuración», la de cada persona, sigue abajo sobre el perfil. Se revisa que sus secciones también estén ordenadas.
- [ ] En el consultorio se llama «Configuración del consultorio» y oculta lo que no aplica.

## 4. Permisos

| Cambio | Rol | Clínica | Consultorio |
|---|---|---|---|
| Registrar paciente sin cita | Médico | **sí (nuevo)** | sí |
| Ver la lista de Observación, sin expediente | Administración | **sí (nuevo)** | no aplica (MI1) |
| Pacientes ambulatorios: ver lista y estado | Administración, recepción | **sí (nuevo, sin resultados)** | administración: sí, si el consultorio tiene laboratorio |
| Registrar paciente ambulatorio | Administración, recepción, laboratorio, imágenes | sí (sin cambio, solo cambia de lugar) | sin cambio |

## 5. Orden sugerido

1. UI2 y UI1 (base visual).
2. LB9.
3. UI3, luego IE2.
4. NO4.
5. OB1.
6. PF1.
7. AD1.
8. PF2.
9. CF1.

## 6. Defaults (Emil debe validar)

1. OB1 activa el checklist en todas las clínicas existentes una sola vez.
2. PF1 da `checkin.manage` al médico de la clínica.
3. AD1: administración ve Observación en solo lectura, como Hospitalizados. La página «Pacientes ambulatorios» muestra el estado de los exámenes, nunca los valores.
4. LB9: los botones por categoría aparecen siempre, aunque haya una sola categoría.
5. CF1: las secciones de la lista de arriba.

## 7. Revisión final

- Comprobar a 390 px, 1366 px y 1920 px cada pantalla tocada.
- Escribir directamente cada URL nueva o movida con cada perfil y anotar el resultado.
- Correr la migración sobre una copia de la base del esquema 88 y luego una segunda vez, que no debe cambiar nada.
- Correr las pruebas archivo por archivo, el lint y el build.

## 8. Reporte

`REPORTE_RONDA17.md` debe incluir:
- una tabla por punto (Hecho, Parcial o No hecho), con sus archivos y 2 o 3 pasos para probarlo;
- los cambios de base de datos;
- los defaults usados;
- lo que Emil debe validar;
- lo que se encontró fuera del alcance.
