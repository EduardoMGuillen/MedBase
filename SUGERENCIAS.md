# Sugerencias de funciones

Salen de las pruebas de la ronda 18 y de la auditoría de uso como médico (12 de noviembre de 2026). Van de la más útil a la menos
útil para una clínica pequeña o un consultorio. **Ninguna está implementada**: Emil decide cuáles se hacen. Antes de escribir cada
una se buscó en el código que no existiera ya.

| N.º | Función | Tamaño |
|---|---|---|
| 1 | Interconsultas entre médicos | Mediano |
| 2 | Entrega de turno de enfermería | Mediano |
| 3 | Cuenta de la estancia (hospitalización y observación) | Grande |
| 4 | Procedimientos de enfermería sin consulta (inyecciones, curaciones) | Mediano |
| 5 | Recordatorios de cita enviados solos por WhatsApp | Mediano |
| 6 | Existencias de medicamentos y material con mínimo | Grande |
| 7 | Honorarios por médico en Reportes | Pequeño |
| 8 | Comparar fotografías clínicas por fecha | Pequeño |
| 9 | Plantillas de texto del médico para la nota | Pequeño |
| 10 | Entrega de resultados al paciente por enlace | Mediano |
| 11 | Lista de espera de citas | Pequeño |
| 12 | Aviso de «sin conexión» en toda la app | Pequeño |

## 1. Interconsultas entre médicos

- **Problema:** hoy el médico tratante pide la opinión de otro por teléfono o WhatsApp; no queda en el expediente quién la pidió,
  qué respondió el otro ni cuándo. En las pruebas (flujo de cirugía) no hubo dónde pedir la interconsulta a cirugía.
- **Quién:** médicos de la clínica (el que pide y el que responde); enfermería la ve.
- **Cómo:** en el expediente de la estancia y en la consulta externa, «Pedir interconsulta» (a un médico o a una especialidad, con
  el motivo). Al otro médico le sale como pendiente suyo (encaja en la tabla de pendientes de PD1) y responde con una nota corta
  que queda en la línea de tiempo, firmada.
- **Tamaño:** mediano (una tabla, un tipo de nota y un tipo de pendiente).

## 2. Entrega de turno de enfermería

- **Problema:** al cambiar de turno, la enfermera cuenta de memoria o en un cuaderno qué queda pendiente de cada paciente.
- **Quién:** enfermería (licenciada y auxiliares).
- **Cómo:** un botón «Entrega de turno» en Hospitalizados que arma una hoja por paciente con lo que ya sabe el sistema (pendientes
  de enfermería, dosis de las próximas horas, signos fuera de rango del turno, órdenes nuevas) y un cuadro para una nota libre.
  Quien recibe marca «Recibido», con nombre y hora. Se imprime en una hoja Carta.
- **Tamaño:** mediano (casi todo sale de los pendientes de PD1 y de la hoja de medicamentos).

## 3. Cuenta de la estancia

- **Problema:** al egreso, recepción suma a mano los días de cuarto, los medicamentos aplicados y los procedimientos para cobrar.
  El sistema ya tiene esos datos (hoja de medicamentos, registro de material, notas de procedimiento), pero Caja no los junta.
- **Quién:** recepción y administración; en el consultorio, la titular.
- **Cómo:** en Caja, «Cobrar estancia»: propone los renglones (días × tarifa del cuarto, dosis aplicadas, material registrado,
  procedimientos), cada uno editable, y permite abonos (los abonos ya existen). Requiere precios de cuarto y de medicamentos.
- **Tamaño:** grande (precios nuevos, reglas de qué se cobra y revisión con Emil).

## 4. Procedimientos de enfermería sin consulta

- **Problema:** el paciente que llega solo a inyectarse o a una curación no pasa por el médico; hoy hay que abrirle una consulta o
  no queda registro.
- **Quién:** enfermería; en el consultorio, la asistente.
- **Cómo:** desde Consulta externa, «Atención de enfermería»: paciente, qué se hizo (inyección con la receta que trae, curación,
  toma de presión), material usado (ya existe el registro de material) y cobro. Queda en el expediente como nota de enfermería.
- **Tamaño:** mediano.

## 5. Recordatorios de cita enviados solos

- **Problema:** el recordatorio por WhatsApp se abre uno por uno y lo envía una persona; si no hay tiempo, no se envían.
- **Quién:** recepción y el consultorio.
- **Cómo:** con la API de WhatsApp Business (o SMS), el recordatorio sale solo el día anterior con la plantilla que ya existe;
  la respuesta «1» confirma la cita. Sin diagnóstico en el mensaje, como hoy.
- **Tamaño:** mediano; tiene costo por mensaje y pide una cuenta de WhatsApp Business verificada.

## 6. Existencias de medicamentos y material

- **Problema:** el registro de uso dice cuánto se gastó, pero no cuánto queda: el faltante se descubre cuando ya no hay.
- **Quién:** enfermería y administración.
- **Cómo:** existencia por medicamento y material, entradas (compras) y salidas (las del registro de uso y las dosis aplicadas),
  con un mínimo que avisa en Inicio. Al indicar un medicamento sin existencia, el aviso «No hay en la clínica» (ME10) saldría solo.
- **Tamaño:** grande.

## 7. Honorarios por médico en Reportes

- **Problema:** administración calcula en Excel lo que le toca a cada médico.
- **Quién:** administración.
- **Cómo:** en «Por médico», una columna con el porcentaje o monto acordado por servicio y el total del periodo; exportable.
- **Tamaño:** pequeño (los ingresos por médico ya se calculan; falta el porcentaje por médico en Personal).

## 8. Comparar fotografías clínicas por fecha

- **Problema:** dermatología y heridas se siguen con fotos; hoy cada foto se abre sola.
- **Quién:** médicos y enfermería.
- **Cómo:** en «Archivos», la categoría «Fotografía clínica» (nueva en esta ronda) como galería por fecha y un «Comparar» de dos
  fotos lado a lado.
- **Tamaño:** pequeño.

## 9. Plantillas de texto del médico

- **Problema:** el examen físico normal o las indicaciones de egreso se escriben igual muchas veces. Hay sets de órdenes y
  favoritos del vademécum, pero no texto guardado para la nota.
- **Quién:** médicos.
- **Cómo:** en cada cuadro de texto de la nota, «Mis plantillas»: guardar el texto escrito con un nombre e insertarlo después.
- **Tamaño:** pequeño.

## 10. Entrega de resultados al paciente por enlace

- **Problema:** el paciente ambulatorio vuelve solo a recoger el papel del laboratorio.
- **Quién:** laboratorio, recepción y el paciente.
- **Cómo:** al liberar el resultado, un enlace con código (como la reserva en línea) que el paciente abre con su identidad; solo
  el PDF que ya se genera. Queda en la bitácora quién lo abrió.
- **Tamaño:** mediano (hay que cuidar la privacidad: caducidad del enlace y verificación).

## 11. Lista de espera de citas

- **Problema:** cuando la agenda de un médico está llena, la recepcionista anota en papel a quién llamar si se cancela una cita.
- **Quién:** recepción.
- **Cómo:** en Agenda, «Lista de espera» por médico; al cancelarse una cita, la app sugiere a quién llamar.
- **Tamaño:** pequeño.

## 12. Aviso de «sin conexión» en toda la app

- **Problema:** los borradores se guardan solos y avisan si no hay internet, pero en las pantallas que no son notas (agenda, caja)
  un fallo de red solo se nota cuando la acción falla.
- **Quién:** todos.
- **Cómo:** una franja discreta arriba («Sin conexión: lo que escribas en una nota se guarda en este equipo») que aparece y se
  quita sola.
- **Tamaño:** pequeño.
