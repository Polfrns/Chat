# CI de GitHub y despliegue

La fuente ejecutable es [.github/workflows/ci.yml](.github/workflows/ci.yml) y
los scripts de [ci/](ci/). Pushes, pull requests y ejecuciones manuales
construyen y prueban la imagen. Un push a `main` publica la imagen fijada por
digest y, tras completar correctamente el build, solicita al runner propio que
despliegue `api`.

## Flujo

1. `ubuntu-latest` ejecuta `bash ci/cloud-build.sh roko test` en ramas distintas
   de `main`, y `bash ci/cloud-build.sh roko publish` para pushes a `main`.
2. En `main`, `ci-result.json` viaja como artefacto de corta duración con la
   identidad del servicio, commit, ejecución e imagen fijada por digest.
3. El job `production` usa el runner self-hosted con etiquetas
   `self-hosted`, `linux` y `roko.bridge.prod`, y ejecuta
   `bash ci/deploy.sh roko`. El host debe tener Docker, Compose, Bash, Python 3,
   `flock`, acceso al registro y el checkout de este repositorio.

El runner propio debe estar registrado en GitHub con esas etiquetas y tener
configurado `ROKO_DEPLOY_DIR` como variable del entorno `production`. El
directorio apunta a una instalación existente con `.env`, `docker-compose.yml`,
`docker-compose.override.yml` y `runtime-config.yaml`.

## Variables y secretos

| Nombre | Tipo | Uso |
| --- | --- | --- |
| `CI_IMAGE_REPOSITORY` | Variable de repositorio | Ruta `registry/namespace/image`, sin tag ni digest |
| `ROKO_DEPLOY_DIR` | Variable de entorno `production` | Directorio del despliegue en el runner |
| `CI_HEALTH_ATTEMPTS` | Variable opcional | Intentos de salud; default 60 |
| `CI_REGISTRY_PUSH_USER`, `CI_REGISTRY_PUSH_TOKEN` | Secretos | Publicación en otros registros |

`GITHUB_SHA`, `GITHUB_RUN_NUMBER` y `GITHUB_REF_NAME` se convierten a nombres
genéricos `CI_COMMIT_SHA`, `CI_BUILD_NUMBER` y `CI_BRANCH`. Las credenciales de
publicación se guardan en GitHub Actions; nunca en el manifiesto.

## Contrato de despliegue

`ci/deploy.sh` solo despliega desde `main`, verifica commit, servicio, número de
ejecución, digest e identidad de la imagen y evita que una ejecución antigua
sustituya una más reciente. Obtiene una imagen `linux/amd64` ya publicada; no
compila ni repite la suite en producción.

Los snapshots Compose y overrides de imagen se guardan en
`.ci-deploy/releases/`; se conserva el nombre de proyecto durante el bootstrap.
El contexto Docker se fija al daemon local `/var/run/docker.sock`. Solo se
actualiza `api`. La comprobación valida imagen y `/health`; si falla, se intenta
restaurar la versión anterior.

La selección CI es deliberadamente menor que la suite completa; su alcance está
en [TESTS.md](TESTS.md). Un workflow verde no acredita que todos los E2E,
formatos Office o modelos reales se hayan probado. La selección del Dockerfile
puede ejecutarse con `sh ci/test.sh` en un entorno POSIX con dependencias.
