# Política de seguridad

## Alcance

Este checkout es una adaptación de LibreChat. Las integraciones Roko, Bridge y
filestore pueden tener responsables y despliegues distintos. No debe asumirse
que los canales o plazos del proyecto upstream cubran una instalación privada.

## Comunicar una vulnerabilidad

Para una instalación Roko, contacta de forma privada con su administrador o el
responsable del repositorio. Si no conoces el canal, solicita uno sin publicar
detalles de explotación. Este repositorio no define un buzón propio ni un plazo
garantizado de respuesta.

Incluye revisión o imagen afectada, componente, pasos reproducibles, impacto y
un ejemplo mínimo con datos ficticios. Evita enviar `.env`, tokens CLI, API keys,
cabeceras Authorization, documentos de usuarios o exportaciones sin sanear.

Para fallos de la base LibreChat, consulta su
[política de seguridad upstream](https://github.com/danny-avila/LibreChat/security/policy).
Los fallos específicos del Bridge o del filestore deben remitirse también a los
responsables de esos servicios.

## Controles relevantes del código

- Índices y consultas de identidad/tenant, autenticación de rutas y propiedad
  de sesiones y archivos.
- Contexto firmado y destinos fijos del Bridge; la firma no sustituye autorización.
- Validación de enlaces y descarga autenticada; preview Office aislada.
- Filtrado de la copia de telemetría antes de exportar.

Estos controles tienen límites descritos en [SPEC.md](../SPEC.md),
[LIMITATIONS.md](../LIMITATIONS.md) y [OBSERVABILITY.md](../OBSERVABILITY.md).
No activan por sí solos aislamiento de sistema por usuario ni eliminan trazas
históricas. La operación y rotación de secretos corresponden a cada despliegue.
