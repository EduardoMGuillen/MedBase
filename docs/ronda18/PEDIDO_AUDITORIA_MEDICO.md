# Clinara: correcciones de la auditoría de uso como médico, pruebas completas y sugerencias

## Contexto

En una auditoría del proyecto se hizo un recorrido de uso como médico: el 12 de noviembre de 2026, sobre `main`, en una instancia local con base de datos nueva y los pacientes demo del día, entrando como la Dra. Solórzano en un navegador automatizado. No hubo errores de consola ni respuestas fallidas del servidor. Fue una revisión de uso, no de criterio clínico.

**Lo que se recorrió:** inicio de sesión, recorrido de bienvenida e Inicio; abrir al siguiente paciente; una consulta completa (historia, examen físico, diagnóstico CIE-11, dos indicaciones, Losartán, una creatinina y firma); la receta y la orden de laboratorio resultantes; Consulta externa, Agenda, Hospitalizados, Observación, Seguimientos, Recetas y Pacientes; el expediente de un hospitalizado (las siete pestañas) y una nota de evolución firmada; una constancia médica (escribir y esperar 36 segundos, pasa una sincronización); tres pantallas a 390 px y el buscador con Ctrl K.

Quiero tres cosas:

1. Que corrijas lo que encontró la auditoría.
2. Que hagas **muchas más pruebas**: que se pruebe absolutamente todo, no solo lo que recorrió la auditoría.
3. Que, además de probar, **sugieras funciones** que servirían en una clínica o consultorio: funciones nuevas, cosas que hacen falta.

---

## Lo que NO se debe romper (la auditoría lo encontró bien)

- El vademécum completa presentación, dosis, vía y días al elegir el medicamento, y calcula la cantidad a dispensar.
- El buscador CIE-11 acepta texto sin tildes y pone primero lo ya usado en la clínica.
- El botón de firmar dice qué falta («falta la impresión diagnóstica», «falta la dosis»).
- La receta y la orden de laboratorio salen en hojas separadas con un solo botón de impresión; el diagnóstico queda fuera de la receta salvo que se marque.
- La nota de evolución arrastra diagnósticos, indicaciones y medicamentos vigentes con «Cambiar» y «Omitir».
- La hoja de medicamentos muestra quién aplicó cada dosis, a qué hora y qué está programado.
- Las pantallas divididas en el refactor (expediente del hospitalizado, constancia) se comportan bien; la constancia conserva lo escrito después de una sincronización.

---

## Parte 1: correcciones

Cada una en su propio commit.

### 1. Inicio: estado de carga

**Qué pasa:** al entrar, Inicio muestra un instante «0 citas hoy» y «No tienes más citas pendientes» antes de cargar.

**Qué quiero:** mostrar un estado de carga mientras llegan los datos. No mostrar «0» ni «No tienes más citas pendientes» hasta que los datos hayan cargado de verdad.

**Cómo lo verifico:** con la red lenta (herramientas de Chrome), entro como médico y nunca veo «0 citas hoy» antes de que aparezcan las citas.

### 2. Expediente del hospitalizado: el aviso «orden nueva sin revisar»

**Qué pasa:** el aviso rojo «orden nueva sin revisar» le sale al mismo médico que dio la orden, en todas las pestañas.

**Qué quiero:**
- El aviso rojo solo lo ve **enfermería**.
- El médico, en su lugar, ve una etiqueta **gris** pequeña: «Pendiente de revisión por enfermería (n)». Siempre gris, sin rojo y sin cambiar de color con el tiempo.

**Cómo lo verifico:** como médico firmo una nota con una orden nueva y no veo el aviso rojo en ninguna pestaña, solo la etiqueta gris. Como enfermería veo el aviso rojo y, al marcar la orden como revisada, al médico se le quita la etiqueta.

### 3. Notas de evolución: conteo de alertas

**Qué pasa:** tras una nota con una sola indicación nueva, las alertas de la pestaña pasaron de 1 a 6, porque las órdenes que «continúan» vuelven a contar como sin revisar.

**Qué quiero:** contar solo las órdenes **nuevas o cambiadas**. Las **suspendidas (omitidas)** sí cuentan, porque enfermería tiene que enterarse. Las que **continúan** no cuentan.

**Cómo lo verifico:**
- Una nota con una sola indicación nueva sube el conteo en 1.
- Una nota que solo omite un medicamento sube el conteo en 1.
- Una nota sin cambios no genera alerta.

### 4. Agenda: horario de la cuadrícula

**Qué pasa:** la cuadrícula empieza a las 07:00 y la cita de las 05:35 no se ve, aunque el encabezado la cuenta.

**Qué quiero:** extender la cuadrícula hasta la primera cita del día (y hasta la última, si es tarde). Ninguna cita que cuente el encabezado puede quedar sin verse.

**Cómo lo verifico:** con una cita a las 05:35, la cuadrícula empieza antes y la cita se ve. El número del encabezado coincide con las citas visibles.

### 5. Agenda: contraste y estado

**Qué pasa:** las citas atendidas casi no se leen (gris claro sobre lila) y ningún bloque dice su estado.

**Qué quiero:** más contraste y una marca de estado en cada bloque, con texto o icono y no solo con color.

**Cómo lo verifico:** leo sin esfuerzo una cita atendida y cada bloque dice su estado.

### 6. Consulta externa: «Atender» como acción principal

**Qué pasa:** «Preclínica» y «Atender» pesan igual para el médico.

**Qué quiero:** para el médico, «Atender» es la acción principal y «Preclínica» queda como secundaria.

**Cómo lo verifico:** como médico veo «Atender» destacado y «Preclínica» como botón secundario. Como enfermería, sigue como hoy.

### 7. Expediente en teléfono: identidad cortada

**Qué pasa:** la identidad del paciente se corta en el encabezado («ID 08…»).

**Qué quiero:** permitir salto de línea para que la identidad se lea completa.

**Cómo lo verifico:** a 390 px leo la identidad completa en el encabezado del expediente.

### 8. Buscador CIE-11: clic sobre un resultado

**Qué pasa:** en la prueba automatizada, el clic sobre un resultado no lo seleccionó; con el teclado sí.

**Qué quiero:** confirmar a mano, con un clic real del mouse y con el dedo en el teléfono. Si falla, corregirlo para que el clic y el toque siempre seleccionen el resultado. Dime si fallaba con un clic real o solo en la prueba automatizada.

**Cómo lo verifico:** elijo un diagnóstico CIE-11 con un clic y con el dedo a 390 px, y queda elegido.

---

## Parte 2: pruebas de todo

Prueba **absolutamente todo** de la aplicación, no solo lo que recorrió la auditoría. Como mínimo, todo lo que la auditoría no probó:

- Configuración.
- Admisión y egreso.
- Facturación.
- Impresión real.
- Los demás tipos de cuenta: enfermería, recepción, laboratorio y administración.
- Borradores de consulta con dos usuarios a la vez.
- En la constancia: las fechas y el acompañante, además del texto.

Y además:

- Cada pantalla y cada botón de cada tipo de cuenta, en el modo clínica y en el modo consultorio.
- Cada flujo completo de principio a fin, como se usaría en un día normal.
- Cada documento que se imprime.
- Escritorio y teléfono (390 px).
- Que cada tipo de cuenta solo pueda ver y hacer lo que le toca, también entrando por la dirección directa.
- Qué pasa si se cae el internet a medio escribir.
- Datos raros o incompletos.

**Todo lo que encuentres lo arreglas tú, sin preguntarme**, cada arreglo en su propio commit, y lo vuelves a probar.

Deja un reporte de pruebas, `PRUEBAS_AUDITORIA.md`, con:
- qué probaste, con qué cuenta y en qué pantalla;
- el resultado de cada prueba;
- lo que encontraste y cómo lo arreglaste;
- lo que no pudiste probar y por qué.

---

## Parte 3: sugerencias de funciones

Mientras pruebas, piensa en lo que le serviría a una clínica o a un consultorio: **funciones nuevas, cosas que hacen falta**, pasos que obligan a salir de la aplicación o a hacer algo en papel.

Escríbelas en `SUGERENCIAS.md`. Para cada una:
- qué problema resuelve;
- quién la usaría;
- cómo funcionaría;
- qué tan grande es el trabajo.

Ordénalas de la más útil a la menos útil. **No las implementes**: yo decido después cuáles se hacen.

---

## Reporte final que espero

1. Las 8 correcciones: hecho o no, qué archivos cambiaste y cómo lo pruebo yo en 2 o 3 pasos.
2. El resumen de `PRUEBAS_AUDITORIA.md`: cuántas pruebas hiciste, qué encontraste y qué arreglaste.
3. Las sugerencias más importantes de `SUGERENCIAS.md`.
4. Lo que no pudiste verificar y por qué.
