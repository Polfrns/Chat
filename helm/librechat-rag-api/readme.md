# Chart opcional de RAG API

Este chart despliega el servicio RAG y, si se habilita, PostgreSQL con pgvector.
Puede usarse junto al [chart LibreChat](../librechat/readme.md); el Compose y la
integración de workspace son rutas distintas. RAG no es un requisito para usar
roko-workspace.

Consulta [values.yaml](values.yaml) y [Chart.yaml](Chart.yaml) para dependencias,
imagen y versión. Los valores actuales exponen:

- `rag.enabled`, `rag.configEnv`, `rag.existingSecret` para servicio y configuración.
- `image.registry`, `image.repository`, `image.tag` para la imagen RAG.
- `postgresql.enabled` y `postgresql.auth` para el subchart de base de datos.
- `enableServiceLinks`, `resources`, volúmenes y montajes para el pod.

Configura proveedor de embeddings, credenciales y base persistente según el
servicio elegido. Los Secrets deben existir con las claves que esperan los
templates y el subchart; los valores de ejemplo no son credenciales de producción.

Desde la raíz, prepara dependencias y revisa el render antes de instalar:

```sh
helm dependency build helm/librechat-rag-api
helm template roko-rag helm/librechat-rag-api -f rag-values.yaml
```

Estos comandos son instrucciones, no comprobaciones ejecutadas en esta revisión.
Configura la URL de RAG en la aplicación si vas a utilizarlo. No presupongas que
habilitar el subchart configura automáticamente Bridge ni roko-workspace.
