# Clinara (nombre temporal)

Plataforma web para clínicas: reserva de citas en línea, agenda, sala de espera, triaje, consulta SOAP, recetas, constancias, expediente con archivos, caja con recibos, reportes y administración por roles. Usa Postgres: en tu computadora corre embebido, sin instalar nada, y en producción usa Neon con Vercel.

El plan completo (referentes del mercado, roles, flujo, modelo de datos, arquitectura y hoja de ruta) está en [`docs/PLAN.md`](docs/PLAN.md).

## Requisitos

- **Node.js 20.19 o superior** (Vite 8 y oxlint lo necesitan; con 20.15 npm no instala sus binarios nativos) (recomendado: la versión LTS más reciente desde https://nodejs.org). Comprueba tu versión con `node -v`.
- Git, para clonar el repositorio.

## Probarlo en tu computadora

```bash
git clone https://github.com/EduardoMGuillen/MedBase.git
cd MedBase
npm install
npm run dev
```

Abre **http://localhost:5173**. La primera vez se crea una base Postgres local en `data/pglite` (no hay que instalar nada) con una clínica de demo: la agenda de hoy, 60 días de historial y unos 60 pacientes, para que los reportes tengan datos.

Para detenerlo, presiona `Ctrl + C` en la terminal.

> Si ya lo habías instalado antes: `git pull`, `npm install` y `npm run dev`. Desde la versión 0.4 la base local es Postgres (`data/pglite`); el archivo antiguo `data/clinara.db` ya no se usa y puedes borrarlo.

### Cuentas de demo

Contraseña para todas: **`demo1234`**. En la pantalla de login también puedes entrar con un clic.

| Rol | Correo | Qué ve |
|---|---|---|
| Médico (medicina interna) | lherrera@demo.clinara | Su agenda, consultas, recetas, constancias, expediente |
| Médico (pediatría) | apaz@demo.clinara | Igual, con su propia agenda |
| Médico (ginecología) | mzuniga@demo.clinara | Igual, con su propia agenda |
| Enfermería | crios@demo.clinara | Consulta externa, perfil CE (triaje), hospitalizados: hoja de medicamentos y notas de enfermería |
| Recepción | smejia@demo.clinara | Agenda, pacientes, recordatorios, caja |
| Administración | admin@demo.clinara | Reportes, personal, configuración, bitácora |
| Administración de Clinara | superadmin@demo.clinara | Clínicas y sus usuarios (sin expedientes) |
| Médico de otra clínica (San Lucas) | erosales@demo.clinara | Sólo los pacientes de su clínica |
| Consultorio: médico titular | alopez@demo.clinara | La Dra. Ana López en su propio consultorio: atiende, cobra, configura y ve sus reportes |
| Consultorio: asistente | asistente@demo.clinara | Agenda, llegadas, preclínica, caja y aplicar medicamentos en observación |

## Recorrido sugerido (15 minutos)

1. **Paciente**: en la página de inicio pulsa *Reservar una cita*. Elige médico, día y hora, y completa tus datos.
2. **Recepción**:
   - En *Inicio* verás la reserva en línea y los recordatorios de mañana. El botón de WhatsApp abre el mensaje listo para enviar.
   - En *Sala de espera*, registra la llegada de Fernando Alvarado.
   - En *Caja*, cobra la consulta de Rosa Elena Turcios: agrega un electrocardiograma, aplica un descuento y paga con tarjeta. Se abre el recibo para imprimir.
3. **Enfermería**:
   - Toma los signos de Fernando. Escribe una presión de 150/95 para ver la alerta.
   - En el expediente de María José Castillo, pestaña *Archivos*, arrastra un PDF o una imagen.
4. **Dra. Herrera**:
   - Atiende a María José. Agrega *Amoxicilina* y verás la alerta por su alergia a la penicilina.
   - Recarga la página a mitad de la consulta: el borrador se recupera.
   - Firma la consulta y, en el expediente, emite una *Constancia médica* con días de reposo.
   - En *Mi cuenta* (clic en tu nombre), activa la verificación en dos pasos con Google o Microsoft Authenticator.
   - Prueba `Ctrl + K` para buscar pacientes desde cualquier pantalla.
5. **Hospitalización** (Dra. Herrera y Lic. Ríos):
   - En *Hospitalizados* abre a Marcos Antonio Velásquez, cuarto 203. En *Medicamentos* verás el ondansetrón cada 8 horas, el acetaminofén PRN y el tramadol omitido.
   - Como enfermería, toca una hora pendiente para registrar la dosis.
   - Como médico, escribe una nota de evolución: agrega un medicamento y marca *OMITIR* en otro; la hoja se actualiza sola.
   - En *Egreso*, escribe la nota de egreso con medicamentos para la casa: se cierra el expediente y se emite la receta.
6. **Administración**:
   - Revisa *Reportes* (ingresos, asistencia, diagnósticos frecuentes) y exporta a CSV.
   - En *Configuración*, cambia el nombre de la clínica, los precios y los horarios de cada médico. El horario define qué horas se ofrecen en la reserva en línea.
   - En *Personal y roles*, crea usuarios y revisa la *Bitácora*.

## Consultorio (médico independiente)

Además de clínicas, Clinara tiene cuentas de **consultorio** para un médico que atiende en su propio consultorio, solo o con hasta 2 asistentes. La crea la Administración de Clinara en *Nueva cuenta, Consultorio*; el médico titular entra con su contraseña temporal y un asistente de tres pasos le pide los datos del consultorio, su horario y el precio de la consulta.

- El médico titular atiende y además administra: configuración, precios, horario, vademécum, caja, reportes, bitácora y asistentes.
- No hay hospitalización ni camas. La observación (aplicar un medicamento, hidratar) viene activada y se apaga en Configuración.
- Sin controles de varios médicos: la agenda, la consulta externa, las recetas, los reportes y la reserva en línea no preguntan por médico.
- Recetas y constancias salen con el médico como encabezado.
- Si contrata a otro médico, *Configuración, Convertir en clínica* lo vuelve clínica sin mover datos.

Recorrido: entra como `alopez@demo.clinara`, atiende a Daniela Ordóñez (ya tiene preclínica), emite la receta y revisa a Gabriela Matamoros en Observación. Como `asistente@demo.clinara`, marca la llegada de Héctor Zelaya, toma su preclínica y cobra.

## Diagnósticos CIE-11

Los diagnósticos se buscan en la **CIE-11 de la OMS**, en español (edición 2026-01 por defecto). La conexión la hace el servidor:

1. Crea una cuenta gratuita en https://icd.who.int/icdapi y copia el *client ID* y el *client secret*.
2. Ponlos en `ICD_CLIENT_ID` e `ICD_CLIENT_SECRET` (en `.env` o en las variables de Vercel) y vuelve a desplegar.

También se puede instalar la copia local de la API que distribuye la OMS y poner su dirección en `ICD_API_URL`; así no hacen falta credenciales ni internet. Sin conexión, el buscador ofrece los diagnósticos CIE-11 que la clínica ya usó y permite escribir uno sin código. Los diagnósticos registrados antes con CIE-10 se conservan y se muestran marcados «CIE-10».

## Módulos

| Módulo | Qué hace |
|---|---|
| Reserva en línea (`/reservar`) | El paciente elige médico, día y hora según el horario configurado. Si ya existe, se reutiliza su expediente (mismo teléfono y fecha de nacimiento). Tiene protección contra spam y reservas dobles. |
| Agenda | Vistas de día, semana y mes; salto a cualquier fecha y filtro por médico; detección de choques, reprogramación, reservas en línea y recordatorio por WhatsApp |
| Consulta externa | Pacientes del día con cita y los que llegan sin cita. Enfermería abre el perfil de consulta externa: motivo y signos vitales (PA, FC, FR, T, SpO₂, peso, talla, glucometría) con alertas de rango |
| Nota de consulta externa | Datos generales siempre visibles. A la izquierda: antecedentes patológicos y no patológicos, signos vitales, motivo de consulta, HEA, examen físico, observaciones e impresión diagnóstica (CIE-10). A la derecha: plan y manejo como órdenes médicas numeradas (los medicamentos van a la receta, con cruce de alergias), seguimiento y la casilla de ingreso a hospitalización. Borrador automático |
| Observación | Estancia corta sin cama, desde la nota de consulta ("Ingreso a observación"). Lista con tiempo transcurrido, notas de evolución (la primera es la de consulta), hoja de medicamentos y laboratorio. Egreso o "Pasar a hospitalización" conservando todo el expediente |
| Hospitalización | Tablero de camas por cuarto y especialidad. Expediente del hospitalizado: hoja de hospitalización, hoja de medicamentos con horario automático (enfermería o el médico registran cada dosis), notas de evolución en dos columnas (SOAP y órdenes) con checklist de enfermería y alertas de órdenes nuevas, notas de procedimiento con fecha y hora, autorizaciones (consentimiento informado) para imprimir, firmar y subir, notas de enfermería, laboratorios y nota de egreso con receta. Expediente completo paginado para imprimir |
| Crónicos y seguimientos | Pacientes crónicos con control periódico, recordatorios y procedimientos programados. El mensaje de WhatsApp se ve como le llegaría al paciente; el envío es una simulación hasta conectar WhatsApp Business |
| Recetas y constancias | Receta en media carta con logo, nombre, identidad (o responsable del menor), edad, expediente, medicamentos e indicaciones aparte. "Recetas" en el menú del médico: receta sin consulta, historial y "Repetir receta". Vademécum de la clínica para medicamentos que no están en el catálogo. Constancias de atención, incapacidad, acompañante o libres, con número correlativo, guardadas en el expediente; el diagnóstico sólo si se marca |
| Expediente | Formato de historia clínica: ficha de identificación, alergias, antecedentes (patológicos, quirúrgicos, traumáticos, hospitalarios, transfusionales, medicamentos, no patológicos, heredofamiliares, gineco-obstétricos) y consultas en orden legal con el manejo al final. Nota de consulta imprimible, recetas, archivos y constancias |
| Caja | Por cobrar, cobro con varios servicios, descuento, efectivo con cambio, tarjeta, transferencia o aseguradora, recibos imprimibles, cierre del día y anulación (sólo administración) |
| Reportes | Ingresos, asistencia, reservas en línea, carga por médico, formas de pago y diagnósticos frecuentes, con exportación CSV |
| Configuración | Datos de la clínica, logo, identidad como número de expediente, plantilla del recordatorio, servicios y precios, horario de cada médico y camas por especialidad |
| Seguridad | Roles con permisos validados en el servidor, verificación en dos pasos, cierre de sesión tras 30 minutos sin actividad, bitácora inalterable |

## Varias clínicas

Clinara funciona como plataforma: una sola instalación atiende a varias clínicas y **cada una sólo ve sus propios datos** (personal, pacientes, citas, consultas, recetas, cobros, archivos y bitácora). El servidor valida la clínica en cada consulta a la base de datos.

| Rol | Alcance |
|---|---|
| Administración de Clinara | Crea, edita, desactiva y reactiva clínicas; crea usuarios en cualquier clínica, cambia roles, restablece contraseñas. **No ve expedientes de pacientes.** |
| Administración de una clínica | Personal, configuración, precios, horarios, reportes y bitácora de su clínica |
| Médico, enfermería, recepción | El trabajo diario de su clínica |

- Al crear una clínica se crea también su usuario de administración y se muestra su contraseña temporal una sola vez.
- Cada clínica tiene su reserva en línea en `/reservar/<dirección>`; `/reservar` muestra la lista de clínicas.
- Los expedientes, folios de receta y recibos se numeran por clínica.
- Al desactivar una clínica se cierran las sesiones de su personal y desaparece de la reserva en línea. Los datos se conservan.

### Cuenta de Administración de Clinara

- En la demo: `superadmin@demo.clinara` / `demo1234`.
- Para uso real, crea tu propia cuenta (genera una contraseña temporal):
  ```bash
  npm run superadmin -- tu-correo@dominio.com "Tu Nombre"
  ```
  Si existe `.env.neon.local`, la crea en la base de Neon; si no, en la base local.

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | Levanta la API (puerto 3001) y la app (puerto 5173) con recarga automática |
| `npm test` | Corre las pruebas de la API sobre Postgres: permisos, flujo de la cita, reserva en línea, caja, reportes, dos pasos, archivos, bitácora, hospitalización y las correcciones (`server/corrections.test.ts`) |
| `npm run build` | Compila la app para producción |
| `npm start` | Sirve la app compilada y la API en http://localhost:3001 (ejecuta antes `npm run build`) |
| `npm run db:reset` | Borra la base local y vuelve a cargar la demo con la agenda de hoy (detén antes el servidor) |
| `npm run db:neon` | Crea las tablas y recarga la demo en Neon, usando la cadena de `.env.neon.local` |
| `npm run superadmin -- correo "Nombre"` | Crea o restablece una cuenta de Administración de Clinara |

La agenda de demo se genera con la fecha del día en que se crea la base. Si lo pruebas otro día, usa `npm run db:reset` o, como administración, el botón *Restablecer demo*.

## Configuración

Todo tiene valores por defecto. Para cambiar algo, copia `.env.example` como `.env`:

- `DATABASE_URL` conecta a un Postgres remoto (Neon). Sin ella se usa la base local.
- `DEMO_MODE=false` oculta las cuentas de demo y desactiva *Restablecer demo*. Úsalo para datos reales.
- `JWT_SECRET` es el secreto de sesión. Defínelo en cualquier servidor público.
- `SECURE_COOKIES=true` si la app se sirve por HTTPS.

## Publicar en Vercel + Neon

El repositorio ya trae `vercel.json`: Vercel compila el frontend con Vite y publica la API (`api/index.ts`) como una función. La base de datos es Postgres en Neon.

### 1. Base de datos en Neon

1. En [neon.tech](https://neon.tech), crea un proyecto. Conviene la región **AWS US East 2 (Ohio)**: `vercel.json` fija la función en `cle1` (Cleveland), la más cercana.
2. En *Connection string* elige la versión **Pooled connection** (el host contiene `-pooler`) y cópiala.
3. Para crear las tablas y cargar la demo desde tu computadora, guarda la cadena en un archivo `.env.neon.local` (git lo ignora):
   ```
   DATABASE_URL=postgresql://usuario:contraseña@ep-xxxx-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require
   ```
   y ejecuta `npm run db:neon`. Si te saltas este paso, la app crea las tablas y la demo sola en la primera visita.

### 2. Proyecto en Vercel

1. En [vercel.com/new](https://vercel.com/new), importa el repositorio de GitHub. Vercel detecta Vite; no cambies los ajustes de build.
2. Antes de pulsar *Deploy*, abre **Environment Variables** y agrega:

   | Variable | Valor |
   |---|---|
   | `DATABASE_URL` | La cadena *pooled* de Neon |
   | `JWT_SECRET` | Un texto largo y aleatorio. Genéralo con `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
   | `NODEJS_HELPERS` | `0` (deja que Express lea las peticiones por su cuenta) |
   | `DEMO_MODE` | `true` para mostrar las cuentas de demo; `false` para uso real |

3. Pulsa **Deploy**. En unos dos minutos tendrás la URL `https://tu-proyecto.vercel.app`.

### 3. Comprobar

- Abre `https://tu-proyecto.vercel.app/api/public/clinic`: debe responder con los médicos.
- Entra con una cuenta de demo. La primera petición tras un rato sin uso tarda uno o dos segundos más mientras la función arranca.

### Notas

- **Si cambias la contraseña de Neon**, actualiza `DATABASE_URL` en Vercel (*Settings → Environment Variables*) y vuelve a desplegar (*Deployments → Redeploy*).
- **La demo usa la fecha del día en que se cargó.** Para renovarla, entra como administración y pulsa *Restablecer demo* (en *Personal y roles*), o ejecuta `npm run db:neon`.
- **Los archivos adjuntos tienen un máximo de 3 MB**, por el límite de 4,5 MB por petición de Vercel, y se guardan dentro de Postgres. El plan gratuito de Neon incluye 0,5 GB.
- **Cada cambio que subas a `main` se publica solo.** Las ramas generan URLs de vista previa.

## Publicar con Docker (alternativa)

El `Dockerfile` sirve para cualquier servicio de contenedores (Railway, Fly.io, un VPS). Sin `DATABASE_URL` usa PGlite dentro del volumen; con `DATABASE_URL` usa Postgres:

```bash
docker build -t clinara .
docker run -p 3001:3001 -v clinara-data:/app/data -e JWT_SECRET=algo-largo-y-aleatorio -e DEMO_MODE=false clinara
```

## Estructura

```
api/index.ts      Función de Vercel (envuelve la API)
server/           API Express + Postgres
  app.ts          autenticación, pacientes, citas, triaje, consultas, personal
  sql.ts          conexión: Neon en producción, PGlite en local
  routes/         reserva pública, caja, reportes, archivos, configuración
  db.ts           esquema, inicialización y datos de demo
  totp.ts         verificación en dos pasos (RFC 6238)
  api.test.ts     pruebas
src/pages/        Landing, Login, Reserva en línea, 404
src/app/          Pantallas internas
src/components/   Logo, gráficas, buscador, recordatorio y primitivas de UI
src/lib/          Tipos, permisos (compartidos con el servidor), catálogos, cliente de la API
docs/PLAN.md      Plan de producto
```
