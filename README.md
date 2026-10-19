# Clinara (nombre temporal)

Plataforma web para clínicas: reserva de citas en línea, agenda, sala de espera, triaje, consulta SOAP, recetas, constancias, expediente con archivos, caja con recibos, reportes y administración por roles. Tiene backend propio con base de datos y no necesita servicios externos ni cuentas en otras plataformas.

El plan completo (referentes del mercado, roles, flujo, modelo de datos, arquitectura y hoja de ruta) está en [`docs/PLAN.md`](docs/PLAN.md).

## Requisitos

- **Node.js 22.13 o superior** (recomendado: la versión LTS más reciente desde https://nodejs.org). Comprueba tu versión con `node -v`.
- Git, para clonar el repositorio.

## Probarlo en tu computadora

```bash
git clone https://github.com/EduardoMGuillen/MedBase.git
cd MedBase
npm install
npm run dev
```

Abre **http://localhost:5173**. La primera vez se crea la base de datos `data/clinara.db` con una clínica de demo: la agenda de hoy, 60 días de historial y unos 60 pacientes, para que los reportes tengan datos.

Para detenerlo, presiona `Ctrl + C` en la terminal.

> Si ya lo habías instalado antes: `git pull`, `npm install` y `npm run dev`. La base de datos existente se actualiza sola. Para empezar con la demo completa y nueva, ejecuta `npm run db:reset` con el servidor detenido.

### Cuentas de demo

Contraseña para todas: **`demo1234`**. En la pantalla de login también puedes entrar con un clic.

| Rol | Correo | Qué ve |
|---|---|---|
| Médico (medicina interna) | lherrera@demo.clinara | Su agenda, consultas, recetas, constancias, expediente |
| Médico (pediatría) | apaz@demo.clinara | Igual, con su propia agenda |
| Médico (ginecología) | mzuniga@demo.clinara | Igual, con su propia agenda |
| Enfermería | crios@demo.clinara | Sala de espera, triaje, expediente, archivos |
| Recepción | smejia@demo.clinara | Agenda, pacientes, recordatorios, caja |
| Administración | admin@demo.clinara | Reportes, personal, configuración, bitácora |

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
5. **Administración**:
   - Revisa *Reportes* (ingresos, asistencia, diagnósticos frecuentes) y exporta a CSV.
   - En *Configuración*, cambia el nombre de la clínica, los precios y los horarios de cada médico. El horario define qué horas se ofrecen en la reserva en línea.
   - En *Personal y roles*, crea usuarios y revisa la *Bitácora*.

## Módulos

| Módulo | Qué hace |
|---|---|
| Reserva en línea (`/reservar`) | El paciente elige médico, día y hora según el horario configurado. Si ya existe, se reutiliza su expediente (mismo teléfono y fecha de nacimiento). Tiene protección contra spam y reservas dobles. |
| Agenda | Columnas por médico, estados en color, detección de choques, reprogramación, marca de reservas en línea, recordatorio por WhatsApp |
| Sala de espera | Llegada, triaje con alertas de rango y cola de pacientes listos para consulta |
| Consulta | Formato SOAP, síntomas con un toque, CIE-10, receta con cruce de alergias, borrador automático |
| Expediente | Alergias siempre visibles, problemas activos, historial, signos, recetas, archivos (PDF e imágenes) y constancias |
| Caja | Por cobrar, cobro con varios servicios, descuento, efectivo con cambio, tarjeta, transferencia o aseguradora, recibos imprimibles, cierre del día y anulación (sólo administración) |
| Reportes | Ingresos, asistencia, reservas en línea, carga por médico, formas de pago y diagnósticos frecuentes, con exportación CSV |
| Configuración | Datos de la clínica, plantilla del recordatorio, servicios y precios, horario y servicio por defecto de cada médico |
| Seguridad | Roles con permisos validados en el servidor, verificación en dos pasos, cierre de sesión tras 30 minutos sin actividad, bitácora inalterable |

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | Levanta la API (puerto 3001) y la app (puerto 5173) con recarga automática |
| `npm test` | Corre las 19 pruebas de la API: permisos, flujo de la cita, reserva en línea, caja, reportes, dos pasos y archivos |
| `npm run build` | Compila la app para producción |
| `npm start` | Sirve la app compilada y la API en http://localhost:3001 (ejecuta antes `npm run build`) |
| `npm run db:reset` | Borra la base y vuelve a cargar la demo con la agenda de hoy (detén antes el servidor) |

La agenda de demo se genera con la fecha del día en que se crea la base. Si lo pruebas otro día, usa `npm run db:reset` o, como administración, el botón *Restablecer demo*.

## Configuración

Todo tiene valores por defecto. Para cambiar algo, copia `.env.example` como `.env`:

- `DEMO_MODE=false` oculta las cuentas de demo y desactiva *Restablecer demo*. Úsalo para datos reales.
- `JWT_SECRET` es el secreto de sesión. Defínelo en cualquier servidor público.
- `SECURE_COOKIES=true` si la app se sirve por HTTPS.

## Publicarlo en internet

El repositorio incluye un `Dockerfile`. Funciona en cualquier servicio que ejecute contenedores con disco persistente (Railway, Render, Fly.io o un VPS):

```bash
docker build -t clinara .
docker run -p 3001:3001 -v clinara-data:/app/data -e JWT_SECRET=algo-largo-y-aleatorio -e DEMO_MODE=false clinara
```

El volumen `/app/data` guarda la base de datos, archivos adjuntos incluidos. Respaldar ese archivo respalda toda la clínica.

## Estructura

```
server/           API Express + SQLite
  app.ts          autenticación, pacientes, citas, triaje, consultas, personal
  routes/         reserva pública, caja, reportes, archivos, configuración
  db.ts           esquema, migraciones y datos de demo
  totp.ts         verificación en dos pasos (RFC 6238)
  api.test.ts     pruebas
src/pages/        Landing, Login, Reserva en línea, 404
src/app/          Pantallas internas
src/components/   Logo, gráficas, buscador, recordatorio y primitivas de UI
src/lib/          Tipos, permisos (compartidos con el servidor), catálogos, cliente de la API
docs/PLAN.md      Plan de producto
```
