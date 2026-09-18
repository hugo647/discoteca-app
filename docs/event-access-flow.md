# Vinculación de una persona a una fiesta

La regla de producto es: crear un perfil no significa estar apuntado a una fiesta.

## Estados

1. **Cuenta/perfil**: puede existir entre fiestas y permite editar preferencias.
2. **Evento público**: se puede consultar sin mostrar asistentes privados.
3. **Entrada pendiente**: la persona ha iniciado la compra, pero todavía no se abre la zona social.
4. **Asistencia verificada**: existe un registro en `event_attendance` con evento, usuario, referencia de entrada y `ticket_verified_at`.
5. **Acceso social**: solo entonces se permite cargar personas, planes, crews y mensajes de ese evento.

## Cómo verificaremos la entrada

La fuente de verdad debe ser Fourvenues, mediante una integración autorizada:

- webhook de compra/validación, si Fourvenues lo ofrece para la discoteca;
- API oficial de consulta, si la discoteca tiene credenciales;
- importación administrativa firmada como plan provisional.

No debemos aceptar que el usuario marque “tengo entrada” ni usar solo un email como prueba. La referencia se debe guardar de forma protegida y asociada de manera única a `(user_id, event_id)`.

## Regla de lectura

Cada petición de datos sociales debe comprobar en servidor:

```sql
select 1
from event_attendance
where user_id = $1
  and event_id = $2
  and ticket_verified_at is not null
  and (visibility_expires_at is null or visibility_expires_at > now());
```

El frontend no decide el acceso: solo representa la respuesta del servidor. Sin esa fila, la persona puede ver su perfil y eventos, pero no la sala ni los asistentes.

## Privacidad

La asistencia visible para contactos es una decisión independiente (`visible_to_attendees`). La verificación de entrada no publica automáticamente nombre, foto, crew ni contacto.
