# Roko

Roko es una adaptación de LibreChat con sesiones que agrupan conversaciones y
filestores, acceso a Claude y Codex mediante un Bridge independiente, actividad
progresiva y descarga y previsualización de archivos generados.

Esta documentación describe el código y la configuración del repositorio revisados
el **20 de octubre de 2026**. El paquete raíz conserva la versión de base
`v0.8.6`; las antiguas entregas de integración 0.7.x no son la versión de LibreChat
ni acreditan qué imagen está desplegada en producción.

## Componentes

| Componente | Ubicación y responsabilidad |
| --- | --- |
| Interfaz | `client/`: React, sesiones, parámetros, actividad y archivos |
| Servidor | `api/`: Express, autenticación, conversaciones y rutas de archivos |
| Paquetes compartidos | `packages/`: API TypeScript, tipos, esquemas MongoDB y UI |
| Bridge | Repositorio externo: adapta los SDK de CLI de Claude y Codex |
| leedeo-filestore | Servicio externo: almacenamiento y herramientas MCP |
| Infraestructura | Compose para desarrollo/despliegue y scripts CI genéricos |

El `packages/roko-server` incluido es un servicio local heredado; no es el
leedeo-filestore externo configurado en `runtime-config.yaml`.

## Desarrollo

Usa Node 24 y la versión npm indicada en [package.json](package.json).

```sh
npm ci
npm run observability:patch
npm run frontend
```

Configura `.env` a partir de [.env.example](.env.example) y las conexiones de
[runtime-config.yaml](runtime-config.yaml). MongoDB y los servicios externos deben
estar disponibles. Para desarrollo, ejecuta en terminales separadas:

```sh
npm run backend:dev
npm run frontend:dev
```

La API usa normalmente el puerto 3080 y Vite el 3090. Para construir y ejecutar
con Docker, sigue [DEPLOY.md](DEPLOY.md). Un cambio de frontend o de paquetes
compilados requiere reconstruir la imagen; reiniciar el contenedor no lo compila.

## Documentación

| Documento | Contenido |
| --- | --- |
| [SPEC.md](SPEC.md) | Arquitectura, interfaces e invariantes actuales |
| [DEPLOY.md](DEPLOY.md) | Configuración, persistencia y operación con Compose |
| [CLI-BRIDGE.md](CLI-BRIDGE.md) | Modelos, parámetros, identidad y archivos del Bridge |
| [OBSERVABILITY.md](OBSERVABILITY.md) | Langfuse, contexto distribuido, privacidad y verificación |
| [CI-CLOUD.md](CI-CLOUD.md) | Construcción, publicación y despliegue de imágenes |
| [TESTS.md](TESTS.md) | Qué protege cada grupo y qué ejecuta realmente CI |
| [LIMITATIONS.md](LIMITATIONS.md) | Límites de actividad, tiempos, formatos y aislamiento |
| [CHANGELOG.md](CHANGELOG.md) | Cambios actuales e historia de las integraciones |
| [CONTRIBUTING.md](.github/CONTRIBUTING.md) | Flujo de contribución |
| [AGENTS.md](AGENTS.md), [AGENT-REVIEW.md](AGENT-REVIEW.md) | Instrucciones y criterios de diseño |

### Guías específicas

- [Esquemas de datos](packages/data-schemas/README.md) y [experimentos FerretDB](packages/data-schemas/misc/ferretdb/ferretdb-multitenancy-plan.md).
- [Servicio local heredado](packages/roko-server/README.md).
- [Temas de UI](packages/client/src/theme/README.md) y [traducciones](client/src/locales/README.md).
- [Utilidad de traducción heredada](config/translations/README.md).
- [Skills de despliegue](skill/README.md), [E2E](e2e/README.md) y [Redis de desarrollo](redis-config/README.md).
- [Helm](helm/librechat/readme.md), [DNS](helm/librechat/DNS_CONFIGURATION.md) y [RAG opcional](helm/librechat-rag-api/readme.md).

## Procedencia y políticas

La base es LibreChat; se conserva su [licencia](LICENSE). Las particularidades de
Roko se documentan aquí, junto al código. Véanse la [política de seguridad](.github/SECURITY.md)
y el [código de conducta](.github/CODE_OF_CONDUCT.md).
