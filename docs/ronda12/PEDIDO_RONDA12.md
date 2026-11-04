# Pedido de la ronda 12

Fuente: `rev12/correcioens ronda 12.docx` (04/11/2026), con 12 capturas (copiadas en `docs/ronda12/capturas/`, en el orden del
documento) y `rev12/valores_referencia_laboratorio.md` (actualización del 04/11/2026, copiada en
`data/valores_referencia_laboratorio.md`). El pedido llegó como texto libre; aquí se ordena por punto con un código, sin
cambiar lo que pide. Entre comillas, las palabras del documento.

> En la carpeta venía también `T1SUV - Production status 04-03-2024.xlsx`. No tiene que ver con Clinara: no se abrió ni se usó.

## Expediente y consulta (médico)

| Punto | Captura | Lo que pide |
|---|---|---|
| **AN1** | 1 | «El texto que se despliega debería de estar justificado, no se puede tener un documento serio con ese relajo de cosas sin margen.» «Se necesita un mejor despliegue de esos antecedentes patológicos.» |
| **AN2** | 2 | Antecedentes: los **patológicos** son unos; «hospitalarios, traumáticos y quirúrgicos son otros, que se pueden poner juntos pero siendo un apartado propio». **No patológicos**: tabaquismo, alcoholismo y otras sustancias «en uno solo que se llame toxicomanías», que se quede inmunizaciones, «bórrame actividad física y alimentación». **Heredofamiliares**, como están. |
| **SG1** | 3 | Seguimiento de un hipertenso: «si yo le doy a cada 6 meses, quiero que ahí en próximo control se me modifique la fecha de un solo». |
| **CE1** | 4 | Al terminar la consulta salió para imprimir la receta, «pero no para los laboratorios que mande»: que salgan «de un solo para imprimir», y poder imprimirlos desde la parte de exámenes de la consulta. |
| **CE2** | 4 | En consulta externa, con cita, «quiero ver todo el expediente» (las consultas de antes) mientras escribo la nota; hoy solo se puede firmando o desde la biblioteca de pacientes. |
| **HO1** | 5 | Las notas de evolución, procedimientos y notas postquirúrgicas no en ventana: «quiero que se me desplieguen abajo como integrado al expediente», y navegar dentro del mismo expediente (últimos signos, curva térmica, anexos, exámenes de laboratorio e imágenes, medicamentos cumplidos). |

## Laboratorio (perfil del microbiólogo y técnicos)

| Punto | Captura | Lo que pide |
|---|---|---|
| **LB1** | 6 | Ventana de resultado (urocultivo): «Este UI pésimo, arréglalo». |
| **LB2** | 7, 8, 10 | EGO: el resultado esperado dice todo, pero solo hay casillas de densidad y pH; «Quiero que absolutamente todos los exámenes que ya te envié sus parámetros tengan sus analitos puestos». «Los valores de referencia de los analitos ya tienen que estar solo para que la clínica coloque los resultados»; «quiero ya poder escribir mi resultado como es». |
| **LB3** | — | «Quitemos la función de umbrales críticos, no me importan, quiero solo los valores de referencia», y todos los análisis (físico, químico…) de todos los exámenes. |
| **LB4** | 11 | «Al editar los exámenes se mira horrible el UI.» |
| **LB5** | 9 | La bandeja de laboratorio se modifica: el microbiólogo y los técnicos tienen **Inicio** con las alarmas o avisos de los hospitalizados y los de observación; después un apartado de **paciente ambulatorio**, otro de **observación** y otro de **hospitalización**. |
| **LB6** | — | Ambulatorio que no está registrado: «no lo podés estar molestando sacándole más información personal»; con lo mínimo: nombre, edad, sexo, número de teléfono o correo para mandar el resultado, identidad. |
| **LB7** | — | Hospitalizados y observación: acceso parcial al expediente, con datos generales y otra pestaña de órdenes activas o pendientes, para tomar la muestra y subir los resultados. |

## Imágenes (perfil del radiólogo)

| Punto | Captura | Lo que pide |
|---|---|---|
| **IM1** | 12 | Agregar el **Inicio** «con alarmas y alertas»; arreglar el menú: «tiene desplegable de pacientes y arriba la biblioteca de pacientes, eso no tiene sentido». |
| **IM2** | — | Al entrar a un expediente, «la notificación que le tiene que salir es solo la de sus imágenes, él no tiene nada que ver con los signos ni con los medicamentos»; que pueda hacer notas de evolución o de procedimiento menor y mayor (radiología intervencionista). «Mejórame eso en ambos perfiles.» |

## Despliegue

«Luego despliega (commit y push a main).»
