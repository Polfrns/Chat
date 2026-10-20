# Chart Helm de LibreChat / Roko

Este chart es una alternativa Kubernetes. El pipeline de este repositorio
despliega Compose y no renderiza ni instala estos charts. No se han certificado
en esta revisión todas las versiones de Kubernetes o configuraciones del cluster.

## Valores y configuración

Consulta [values.yaml](values.yaml), [Chart.yaml](Chart.yaml) y los templates
antes de instalar. Para Roko selecciona su imagen compilada, no la imagen
LibreChat upstream predeterminada.

| Valor | Efecto en los templates actuales |
| --- | --- |
| `image.registry`, `image.repository`, `image.tag` | Imagen del contenedor; tag vacío usa appVersion del chart |
| `global.librechat.existingSecretName` | Secret importado con `envFrom` en el Deployment |
| `librechat.configEnv` | Variables no secretas del ConfigMap |
| `global.librechat.env` | Entradas `env` adicionales, incluido `valueFrom` |
| `librechat.configYamlContent` | Contenido de configuración YAML montado en `/app/librechat.yaml` |
| `librechat.existingConfigYaml` | ConfigMap existente cuya clave es `librechat.yaml` |
| `librechat.adminPanelUrl` | URL externa del panel admin cuando se utiliza |
| `volumes`, `volumeMounts` | Montajes adicionales |
| `dnsPolicy`, `dnsConfig`, `hostAliases` | Red del pod; véase [DNS_CONFIGURATION.md](DNS_CONFIGURATION.md) |

Los valores de ejemplo incluyen secretos de demostración: genera tus propios
`CREDS_KEY`, `CREDS_IV`, `JWT_SECRET` y `JWT_REFRESH_SECRET` y usa un Secret del
cluster. Incluye las credenciales adicionales que requieran los servicios activos,
como Meilisearch. No confundas el valor `librechat.existingSecretName` con el que
lee efectivamente el Deployment: su `envFrom` usa la ruta `global` indicada arriba.

Bridge y filestore necesitan URLs accesibles desde los pods, sus claves y la
misma configuración de identidad y observabilidad que Compose. `host.docker.internal`
no es un nombre de servicio Kubernetes universal. Configura también persistencia
de archivos y datos; un volumen de imágenes no sustituye todos esos almacenes.

## Preparar la instalación

Desde la raíz, con un archivo de valores propio fuera de los ejemplos públicos:

```sh
helm dependency build helm/librechat
helm template roko helm/librechat -f roko-values.yaml
```

Revisa el manifiesto renderizado, imagen, Secrets, ConfigMaps, almacenamiento y
conectividad antes de instalar mediante el procedimiento de tu cluster.
El subchart [RAG](../librechat-rag-api/readme.md) es opcional. La arquitectura y
las instrucciones Compose están en [SPEC.md](../../SPEC.md) y
[DEPLOY.md](../../DEPLOY.md).
