# Modelo de protección de datos

Este documento acompaña a `db/001_privacy_first_schema.sql`. Es una base técnica
para el cumplimiento del RGPD y la LOPDGDD, no sustituye una revisión jurídica.

## Decisiones de diseño

- La app solo admite personas adultas y debe recibir una señal de verificación de
  edad o entrada; no se almacenan DNI, selfies de verificación ni fecha de
  nacimiento completa.
- Las fotos se guardan en almacenamiento privado. La base de datos solo guarda
  `storage_key`, consentimiento y fecha de borrado.
- La visibilidad ante otras personas está separada de tener una cuenta.
- La asistencia, crews y mensajes están ligados a un evento y caducan.
- Cada finalidad tiene su propio registro de consentimiento y versión de política.
- Las solicitudes de derechos quedan trazadas sin guardar contenido innecesario.

## Política inicial de conservación

| Tratamiento | Regla inicial |
| --- | --- |
| Perfil y foto permanente | Mientras la cuenta esté activa y exista consentimiento; revisar inactividad a los 12 meses y avisar antes de borrar |
| Foto de crew | Hasta borrar la crew o 30 días después del último evento |
| Foto temporal de evento/chat | Borrar entre 24 y 48 horas después del evento |
| Mensajes | Borrar al caducar el evento, salvo bloqueo legal documentado |
| Cuenta eliminada | Ocultar de inmediato y completar el borrado de datos y almacenamiento |
| Copias de seguridad | Eliminar en el ciclo documentado de backups, sin mantener una copia indefinidamente |
| Evidencias de abuso o reclamación | Conservar solo lo necesario, con acceso restringido y finalidad documentada |

Estos plazos son una política de minimización recomendada para este producto,
no plazos legales universales. Deben validarse con el responsable del tratamiento.

## Registro de actividades que falta completar

Antes de producción hay que identificar por escrito:

1. Responsable del tratamiento: discoteca, empresa de la app o corresponsables.
2. Encargados: hosting, almacenamiento, correo, verificación de entradas y soporte.
3. Finalidad y base jurídica de cada tratamiento.
4. Destinatarios y posibles transferencias internacionales.
5. Medidas de seguridad y procedimiento de brechas.
6. Canal para derechos y responsable de responder en un mes.
7. Evaluación de riesgos y, si procede, evaluación de impacto.

## No se debe activar aún

- Recomendaciones basadas en contactos importados sin consentimiento separado.
- Reconocimiento facial o identificación biométrica.
- Uso de fotos o mensajes para entrenar modelos.
- Publicación de fotos de grupo cuando puedan aparecer personas que no las hayan
  autorizado.
- Marketing mezclado con los consentimientos necesarios para usar la app.
