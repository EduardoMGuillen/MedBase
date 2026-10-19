# Clinara (nombre temporal)

Plataforma web para clínicas: landing page, inicio de sesión por roles, agenda, sala de espera, triaje, consulta SOAP, expediente clínico y recetas. Tiene backend propio con base de datos y no necesita servicios externos ni cuentas en otras plataformas.

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

Abre **http://localhost:5173**. La primera vez se crea la base de datos `data/clinara.db` con una clínica de demo y la agenda del día.

Para detenerlo, presiona `Ctrl + C` en la terminal.

### Cuentas de demo

Contraseña para todas: **`demo1234`**. En la pantalla de login también puedes entrar con un clic.

| Rol | Correo |
|---|---|
| Médico (medicina interna) | lherrera@demo.clinara |
| Médico (pediatría) | apaz@demo.clinara |
| Médico (ginecología) | mzuniga@demo.clinara |
| Enfermería | crios@demo.clinara |
| Recepción | smejia@demo.clinara |
| Administración | admin@demo.clinara |

### Recorrido sugerido

1. **Recepción**: en *Sala de espera*, registra la llegada de Fernando Alvarado.
2. **Enfermería**: toma sus signos vitales. Escribe una presión de 150/95 para ver la alerta de rango.
3. **Dra. Herrera**: en *Inicio*, atiende a María José Castillo. Agrega *Amoxicilina* y verás la alerta por su alergia a la penicilina. Cambia a *Paracetamol*, elige un diagnóstico y firma: se abre la receta lista para imprimir.
4. **Administración**: en *Personal y roles*, crea un usuario (verás su contraseña temporal), cambia roles y revisa la *Bitácora*, donde aparece cada acceso al expediente.
5. Abre la app en dos navegadores con roles distintos: la sala de espera se sincroniza sola cada 30 segundos.

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | Levanta la API (puerto 3001) y la app (puerto 5173) con recarga automática |
| `npm test` | Corre las pruebas de la API: autenticación, permisos, flujo de la cita, bitácora |
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
docker run -p 3001:3001 -v clinara-data:/app/data -e JWT_SECRET=algo-largo-y-aleatorio clinara
```

El volumen `/app/data` guarda la base de datos. Sin él, los datos se pierden al reiniciar el contenedor.

## Seguridad incluida

- Contraseñas con hash bcrypt; sesión en cookie `httpOnly` que expira a las 10 horas.
- Bloqueo de 5 minutos tras 5 intentos fallidos de inicio de sesión.
- Los permisos se validan **en el servidor**: recepción ni siquiera recibe alergias ni diagnósticos, y sólo el médico asignado puede firmar su consulta.
- Al desactivar a un usuario, cambiar su rol o restablecer su contraseña, sus sesiones abiertas se cierran.
- Bitácora de sólo inserción: la base de datos rechaza cambios y borrados.
- Detección de choques de horario en la agenda por médico.

## Estructura

```
server/       API Express + SQLite (app.ts rutas, db.ts esquema y datos de demo, api.test.ts pruebas)
src/pages/    Landing y Login
src/app/      Pantallas internas (Agenda, Sala, Pacientes, Expediente, Consulta, Recetas, Personal)
src/lib/      Tipos, permisos (compartidos con el servidor), catálogos CIE-10 y vademécum, cliente de la API
docs/PLAN.md  Plan de producto
```
