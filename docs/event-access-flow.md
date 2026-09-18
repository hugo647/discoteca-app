# Vinculación de una persona a una fiesta

La regla de producto es: crear un perfil no significa estar apuntado a una fiesta.

## Estados

1. **Cuenta/perfil**: puede existir entre fiestas y permite editar preferencias.
2. **Evento público**: se puede consultar sin mostrar asistentes privados.
3. **Entrada pendiente**: la persona ha iniciado la compra, pero todavía no se abre la zona social.
4. **Acceso emitido**: el ticketing integrado crea un registro en `event_accesses` por cada entrada válida. Una compra de varias entradas crea varios accesos.
5. **Acceso reclamado**: cada acceso pertenece a una única cuenta, aunque la misma cuenta pueda tener varios accesos para un evento.
6. **Acceso social**: solo entonces se permite cargar personas, planes, crews y mensajes de ese evento.

## Cómo verificaremos la entrada

La fuente de verdad debe ser Fourvenues, mediante una integración autorizada:

- webhook de compra/validación, si Fourvenues lo ofrece para la discoteca;
- API oficial de consulta, si la discoteca tiene credenciales;
- importación administrativa firmada como plan provisional.

No debemos aceptar que el usuario marque “tengo entrada” ni usar solo un email como prueba. La referencia del proveedor se guarda protegida y asociada de forma única a un acceso, no al perfil de una persona.

## Transferir Jaleo

Jaleo no transfiere la entrada física ni procesa pagos. Solo permite cambiar el titular de su acceso social:

1. La persona titular pulsa **Transferir mi Jaleo** desde Perfil.
2. Su acceso queda suspendido de inmediato y se crea un enlace aleatorio, de un solo uso y válido durante 48 horas.
3. El enlace puede compartirse desde el menú nativo del móvil, por ejemplo por WhatsApp o Instagram.
4. La persona receptora inicia sesión o crea una cuenta y reclama el acceso.
5. El acceso deja de funcionar para la persona anterior y queda asociado a la nueva cuenta.
6. Mientras no se haya reclamado, el remitente puede cancelar la transferencia y recuperar el acceso.

Solo se almacena el hash del token del enlace. La discoteca puede revocar un acceso si el ticketing informa de cancelación, devolución o uso indebido.

## Edad y alcohol

La versión inicial se limita a eventos anunciados como +18. Durante el registro se recoge una declaración de mayoría de edad; no se solicita ni almacena DNI. Esa declaración no equivale a una comprobación documental: la discoteca conserva el control de admisión, documentos y cualquier servicio de alcohol. Jaleo no vende, canjea ni cobra bebidas.

## Regla de lectura

Cada petición de datos sociales debe comprobar en servidor:

```sql
select 1
from event_accesses
where holder_user_id = $1
  and event_id = $2
  and status = 'claimed'
  and (expires_at is null or expires_at > now());
```

El frontend no decide el acceso: solo representa la respuesta del servidor. Sin esa fila, la persona puede ver su perfil y eventos, pero no la sala ni los asistentes.

## Privacidad

La asistencia visible para contactos es una decisión independiente (`visible_to_attendees`). La verificación de entrada no publica automáticamente nombre, foto, crew ni contacto.
