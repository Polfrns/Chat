# Despliegue y operación de Roko

## Configuración

La configuración de este checkout usa [docker-compose.yml](docker-compose.yml)
más [docker-compose.override.yml](docker-compose.override.yml). El override
construye `roko-librechat:local`, monta `.env` y `runtime-config.yaml` y define
`CONFIG_PATH=/app/runtime-config.yaml`.

| Configuración | Uso |
| --- | --- |
| `.env` | Secretos y variables del host; no incluir en commits |
| `runtime-config.yaml` | Endpoints, modelos, MCP e interfaz |
| `ROKO_SERVER_URL`, `ROKO_API_KEY` | REST/MCP del filestore externo |
| `ROKO_BRIDGE_BASE_URL` | Destino fijo autorizado para Bridge; default `http://host.docker.internal:4000/v1` |
| `CLAUDE_BRIDGE_KEY` | Debe coincidir con `BRIDGE_API_KEY` del Bridge, mínimo 32 caracteres |
| `ROKO_BRIDGE_ACTIVITY_ENABLED` | Solicita actividad pública; default `true` |
| `ROKO_BRIDGE_REQUEST_TIMEOUT_MS` | Timeout de Roko; default `620000` ms |
| `OBSERVABILITY_*`, `LANGFUSE_*` | Véase [OBSERVABILITY.md](OBSERVABILITY.md) |

Los `baseURL` de los endpoints personalizados deben coincidir con el destino
autorizado. La red externa `roko-cli-bridge` tiene que existir antes de arrancar
el Compose que la referencia. Comprueba la resolución de Bridge desde el
contenedor: `host.docker.internal` necesita una configuración de host compatible
en Linux o una URL de servicio accesible por la red compartida.

## Construcción local con Compose

Desde la raíz del repositorio, con Docker y Compose disponibles:

```sh
docker compose -f docker-compose.yml -f docker-compose.override.yml config -q
docker compose -f docker-compose.yml -f docker-compose.override.yml build api
docker compose -f docker-compose.yml -f docker-compose.override.yml up -d
docker compose -f docker-compose.yml -f docker-compose.override.yml ps
docker compose -f docker-compose.yml -f docker-compose.override.yml logs --tail=100 api
```

El arranque completo incluye MongoDB, Meilisearch, vectordb y rag_api. Con las
dependencias ya funcionando, una actualización local de la aplicación puede usar
`up -d --no-deps api` después de construir. El Dockerfile ejecuta las comprobaciones
de [ci/test.sh](ci/test.sh) antes de producir la imagen final.

Un reinicio aplica cambios que el proceso lea al arrancar, pero no recompila
JavaScript/TypeScript ni el frontend. Los cambios de variables del contenedor
requieren recrearlo; `restart` conserva el entorno anterior.

## Despliegue gestionado por CI

En producción gestionada por CI, usa el flujo de
[CI-CLOUD.md](CI-CLOUD.md). El host ejecuta la imagen probada y publicada, sin
reconstruir código. Los snapshots están bajo `.ci-deploy/` del directorio de
despliegue; no los edites para cambiar manualmente la imagen activa.

Con `ROKO_DEPLOY_DIR` configurado en el entorno del operador:

```sh
bash ci/compose.sh roko ps
bash ci/compose.sh roko logs --tail=100 api
bash ci/deploy.sh roko rollback
```

`ci/compose.sh` requiere un despliegue CI inicial y utiliza su snapshot activo.
No mezcles su gestión con un `docker compose up` genérico que vuelva a seleccionar
una imagen o configuración del checkout.

## Persistencia y servicios externos

Conserva `.env`, `runtime-config.yaml`, los datos y volúmenes de MongoDB,
Meilisearch, vectordb, archivos e imágenes, y el estado de despliegue. Actualizar
una imagen no es una migración ni una copia de seguridad de esos datos.

Bridge se construye y despliega desde su propio repositorio. Sus credenciales de
CLI se autentican allí y deben sobrevivir a la recreación del contenedor. El
workspace efímero del Bridge no es almacenamiento permanente de documentos.
Filestore conserva su propio almacenamiento y ciclo de despliegue.

El timeout de Roko deja margen sobre el del Bridge (habitualmente `600000` ms en
su configuración actual). Verifica los valores privados del host: cambiar el
default del código no sustituye un `REQUEST_TIMEOUT_MS` ya definido en su `.env`.

## Comprobaciones posteriores

Comprueba `/health`, inicio de sesión, registro duplicado, una conversación con
cada proveedor, streaming de actividad, descarga y preview de un archivo de
prueba y permisos de filestore. Una respuesta HTTP saludable no verifica esos
flujos. La comprobación de trazas y privacidad está en
[OBSERVABILITY.md](OBSERVABILITY.md). Los charts [Helm](helm/librechat/readme.md)
son una alternativa; no forman parte del despliegue Compose de este pipeline.
