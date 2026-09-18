# Registro en `dev`

En `dev` el acceso comienza en login. La cuenta se registra contra PostgreSQL local y la sesión se firma en una cookie HttpOnly.

## Configuración necesaria

Define estas variables en el entorno de Vercel o local:

- `DATABASE_URL`: conexión PostgreSQL de la aplicación.
- `DATABASE_SSL=false`: solo para PostgreSQL local sin TLS.
- `ACCESS_SECRET`: secreto aleatorio para firmar sesiones.
- `LEGAL_POLICY_VERSION`: versión visible de los avisos aceptados.

Aplica primero `db/001_privacy_first_schema.sql` y después `db/002_registration_and_legal.sql` si la primera migración ya existía.

## Flujo

1. Una persona entra en `/login.html`.
2. Si no tiene cuenta, pulsa `Crear mi perfil` y llega a `/register.html`.
3. El registro exige nombre visible, usuario, contraseña y aceptación expresa de términos y privacidad.
4. La contraseña se guarda con `scrypt`; nunca se guarda en texto plano.
5. El registro crea los consentimientos `account` y `persistent_profile` en la misma transacción.
6. Solo después se crea la sesión y se redirige a la aplicación.
7. La zona social permanece cerrada hasta conectar una asistencia verificada con un evento real.

Los textos legales incluidos son una base de producto, no sustituyen la revisión jurídica ni la identificación del responsable del tratamiento antes de producción.
