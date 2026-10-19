# Clinara (nombre temporal)

Plataforma web para clínicas: landing page, inicio de sesión por roles, agenda, sala de espera, triaje, consulta SOAP, expediente clínico y recetas.

El plan completo (referentes del mercado, roles, flujo, modelo de datos, arquitectura y hoja de ruta) está en [`docs/PLAN.md`](docs/PLAN.md).

## Ejecutar

```bash
npm install
npm run dev
```

Abre http://localhost:5173.

## Cuentas de demo

Contraseña para todas: `demo1234`. También puedes entrar con un clic desde la pantalla de login.

| Rol | Correo |
|---|---|
| Médico | lherrera@demo.clinara |
| Médico (pediatría) | apaz@demo.clinara |
| Enfermería | crios@demo.clinara |
| Recepción | smejia@demo.clinara |
| Administración | admin@demo.clinara |

Enlace directo de demo: `/login?as=s-herrera&next=/app/agenda`.

## Recorrido sugerido

1. Entra como **Recepción**, abre *Sala de espera* y registra la llegada de un paciente.
2. Entra como **Enfermería** y toma sus signos vitales. Prueba un valor fuera de rango.
3. Entra como **Dra. Herrera**, atiende a María José Castillo, agrega *Amoxicilina* y observa la alerta por alergia a la penicilina.
4. Firma la consulta y abre la receta imprimible.
5. Entra como **Administración** y revisa la bitácora y la matriz de permisos.

Los datos viven en `localStorage`. *Personal y roles → Restablecer demo* vuelve al estado inicial.

## Estructura

```
src/
  pages/      Landing y Login
  app/        Pantallas internas (Agenda, Sala, Pacientes, Expediente, Consulta, Recetas, Personal)
  components/ Logo y primitivas de UI
  lib/        Tipos, permisos, catálogos (CIE-10, vademécum), datos semilla y store
docs/PLAN.md  Plan de producto
```
