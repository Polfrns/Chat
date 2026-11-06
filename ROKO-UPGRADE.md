# Actualizar Roko a una versión nueva de LibreChat

Roko es LibreChat con reglas propias metidas dentro del código de upstream: los **enganches**. Casi todas las
averías de una actualización tienen el mismo origen: upstream añade una segunda ruta hacia lo mismo y la regla
de Roko no se aplica en ella. Esta guía dice cómo actualizar y cómo comprobar cada enganche.

Versión actual de la base: `UPSTREAM-BASE` (etiqueta, commit y ancestro registrado).

## Procedimiento

1. **Traer la versión.** `git fetch https://github.com/LibreChat-AI/LibreChat.git tag vX.Y.Z --no-tags`.
2. **Medir la superficie.** `node scripts/roko-surface.cjs` lista los ficheros que Roko ha tocado respecto a la
   base y los agrupa por zona (`--json` para máquinas, `--list` para la lista plana). Es lo que se va a
   resolver a mano.
3. **Ensayar sin tocar nada.** `git merge-tree --write-tree HEAD vX.Y.Z` (o `FETCH_HEAD`) muestra los conflictos
   sin crear el merge. Anota los ficheros en conflicto y contrasta con el paso 2.
4. **Hacer el merge** en una rama: `git switch -c upgrade/vX.Y.Z && git merge vX.Y.Z`.
5. **Orden de resolución:** `packages/data-provider` → `packages/data-schemas` → `packages/api` → `api` →
   `client` → configuración y Docker. Cada capa depende de la anterior; resolver el cliente primero oculta
   errores de tipos en las demás.
6. **Quedarse con upstream por defecto** en los ficheros que Roko no posee. Reaplica el enganche de Roko encima,
   no al revés. Si upstream movió el código, el enganche se mueve con él (ver la tabla).
7. **Tests de enganche primero:** `sh ci/test.sh seams`. Cada fallo lleva el nombre `Roko hook: …` de la regla
   que se ha perdido. Arréglalos antes de seguir.
8. **Estilo:** `sh ci/test.sh lint` (Prettier y ESLint sobre los ficheros propios).
9. **Comprobación completa:** `npm run build:data-provider && npm run build:data-schemas && npm run build:api`,
   tipos de `client` y `api`, y `sh ci/test.sh` entero.
10. **Registrar la base.** En el mismo commit del merge actualiza `UPSTREAM-BASE` (`UPSTREAM_TAG`,
   `UPSTREAM_COMMIT`) y el Changelog.
11. **Desplegar** solo tras confirmarlo: construir en el NAS (la etapa `ci` del Dockerfile vuelve a pasar los
    tests), recrear solo la app de Roko y probar a mano la lista del final. Marcha atrás: `DEPLOY.md`
    (`bash ci/deploy.sh roko rollback`). No borres volúmenes ni rotes `CREDS_KEY`, `CREDS_IV` ni `JWT_*`.

## Enganches

Cada fila: qué hace Roko, dónde vive en upstream, qué se ve cuando se pierde y qué test lo detecta.
`sh ci/test.sh seams` ejecuta todos los tests de la última columna.

| Enganche | Qué hace Roko | Dónde está en upstream | Síntoma si se pierde | Test |
| --- | --- | --- | --- | --- |
| Lista de modelos Bridge | Una sola función decide qué modelos son Bridge | `packages/data-provider/src` (`isBridgeModel`) | Un modelo Bridge se trata como normal en cliente o servidor | `bridgeModels.spec.ts` |
| Workspace en el contexto MCP | Añade el servidor `roko-workspace` por petición, fuera de `mcpConfig` | `api/server/services/MCP.js` (`resolveConfigServers`, `resolveMcpServerContext`) | El chat falla por «sin herramientas MCP» o el modelo no ve el workspace | `MCP.spec.js` (servidor del workspace) |
| Identidad del workspace | Tenant, usuario y conversación firmados | `MCP.js` (llamada a herramienta) y `packages/api/src/roko/workspace.ts` | El workspace mezcla usuarios o se rechaza | `workspace.spec.ts` |
| Usuario seguro sin tenant | `tenantId` no sale en marcadores ni cabeceras | `packages/api/src/utils/env.ts` (`createSafeUser`) | Se filtra el tenant | `safeUser.spec.ts` |
| Exención SSRF del workspace | El workspace interno se permite por petición | `api/server/services/initializeMCPs.js` | El workspace queda bloqueado como destino interno | `initializeMCPs.spec.js` |
| Herramientas inyectadas | Nextcloud y biblioteca de skills se añaden al agente de cada petición | `api/server/services/Endpoints/agents/initialize.js` | El modelo deja de tener Nextcloud o skills sin error | `agentTools.spec.ts` |
| Subir el original a Bridge | `preserve_original` en la subida; el servidor decide por modelo | `client/src/hooks/Files/useFileHandling.ts` | El Bridge recibe texto extraído en vez del documento | `useFileHandling.test.ts` |
| Bridge exento de reglas de documentos de Claude | Sin límites de la API de Anthropic | `packages/api/src/files/encode/document.ts` | PDF/Office rechazados o troceados | `document.spec.ts` |
| Búsqueda web de Bridge | El interruptor es una opción del modelo, no una herramienta | `client/src/hooks/Chat/useChatWebSearch.ts` | El interruptor no hace nada en Bridge | `useChatWebSearch.spec.tsx` |
| Interruptor del workspace en ajustes | Ajuste global en la pestaña Datos | `client/src/components/Nav/Settings/registry.tsx` | No hay forma de desactivar el workspace | `rokoWorkspaceSetting.spec.ts` |
| Selector de Nextcloud | Botón en el menú de adjuntos, en ambos modos de subida | `client/src/components/Chat/Input/Files/AttachFileMenu.tsx` | Desaparece el botón de Nextcloud | `AttachFileMenu.spec.tsx` |
| Salidas de Bridge | Los ficheros generados se guardan y se muestran a nivel de mensaje | `api/server/controllers/agents/callbacks.js`, `client/.../ContentParts.tsx`, `api/app/clients/prompts` | Los ficheros del Bridge no aparecen o se duplican | `callbacks.spec.js`, `ContentParts.test.tsx`, `restoreBridgeOutputs.spec.js` |
| Propiedad de la parada | Solo el dueño detiene su generación | `api/server/middleware/abortMiddleware.js`, `packages/api/src/stream` | Un usuario puede parar la generación de otro | `abortMiddleware.spec.js`, `ownedGeneration.test.ts` |
| Marca | Pie y portada con la marca de Roko | `client/src/components/Chat/Footer.tsx`, `Landing.tsx` | Vuelve la marca de LibreChat | `Footer.spec.tsx`, `Landing.agent-contact.spec.tsx` |

Borrado de workspaces en cascada al borrar conversaciones (`api/server/routes/convos.js`): lo cubre una
aserción dentro de `convos.spec.js` (se ejecuta con `sh ci/test.sh`, no con `seams`).

## Trampas conocidas

- **Segunda ruta.** Antes de dar un merge por bueno busca si upstream añadió otra vía a lo mismo
  (`grep` del símbolo que Roko engancha). Pasó con el contexto MCP, con el menú de subida unificado y con las
  reglas de documentos.
- **Tests con Mongo en memoria** no corren en la imagen Alpine; están fuera de la CI a propósito (ver el final
  de `ci/roko-tests.txt`). Ejecútalos a mano en un entorno con Mongo antes de desplegar.
- **Parche de observabilidad** de `@librechat/agents`: si cambia esa versión, el parche puede no aplicar y la
  privacidad de las trazas depende de él. Comprueba `OBSERVABILITY.md`.
- **Finales de línea CRLF/LF.** Los ficheros mezclan ambos; edita sin reescribirlos enteros.

## Comprobación manual tras desplegar

1. Un modelo normal (con y sin workspace) responde y puede usar el workspace.
2. Un modelo Bridge (Claude y Codex) responde, recibe un `.docx` o `.pdf` original y devuelve un fichero.
3. El botón de Nextcloud aparece en modo de subida unificado y no unificado.
4. El interruptor del workspace está en Ajustes → Datos.
5. Parar una generación propia funciona; la de otro usuario no.

## Cómo añadir un enganche nuevo

Cada regla de Roko dentro de código de upstream necesita: un test cuyo nombre empiece por `Roko hook:`, una
fila en la tabla de arriba y, si el fichero de test es entero de Roko, la marca `roko` en `ci/roko-tests.txt`.
