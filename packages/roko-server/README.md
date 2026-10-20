# roko-server: servicio local heredado

Este workspace implementa el prototipo independiente de filestores: un núcleo
con API REST y MCP, registro SQLite y archivos locales. **No es el servicio
externo leedeo-filestore configurado actualmente en Roko.**

La integración activa usa `ROKO_SERVER_URL` y `ROKO_API_KEY`, UIDs y un bearer de
servicio. Este prototipo utiliza JWT con `sub` y `tenant` firmado con
`ROKO_SHARED_SECRET` y un contrato anterior de identificadores. No apuntes el
cliente actual a este servicio suponiendo que los protocolos son intercambiables.

## Uso local del prototipo

Instala las dependencias desde la raíz del monorepo. Configura las variables en
el entorno del proceso que arranca este workspace:

| Variable | Función / default |
| --- | --- |
| `ROKO_SHARED_SECRET` | Obligatoria, firma y verificación JWT local |
| `ROKO_PORT` | Puerto HTTP, 3100 |
| `ROKO_DATA_DIR` | Directorio base, `data` relativo al directorio de trabajo |
| `ROKO_FILESTORE_ROOT` | Default `<dataDir>/filestores` |
| `ROKO_DB_PATH` | Default `<dataDir>/roko.sqlite` |

```sh
npm run dev --workspace=roko-server
npm run typecheck --workspace=roko-server
npm run token --workspace=roko-server -- dev-user dev-tenant
```

El último comando imprime un bearer de desarrollo con caducidad de 30 días;
trátalo como credencial. `npm run start --workspace=roko-server` arranca sin watch.
Las rutas se componen en [src/index.ts](src/index.ts) y la configuración en
[src/config.ts](src/config.ts).

Conserva SQLite y el árbol de filestores para mantener datos entre arranques.
Los adaptadores futuros o los planes de autenticación no son funciones desplegadas.
La arquitectura del producto actual está en [SPEC.md](../../SPEC.md).
