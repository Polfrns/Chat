# Historial de Roko

Este historial recoge cambios de la adaptación. La base es LibreChat v0.8.8; las
etiquetas 0.7.x de las entregas anteriores identificaban integraciones y no una
nueva versión del paquete raíz.

## Sin publicar — integración de LibreChat v0.8.8 (2 de noviembre de 2026)

### Fase 0 del plan de mantenibilidad (6 de noviembre de 2026)

- CI: 12 tests de Roko que no se ejecutaban entran en la selección (Nextcloud, salidas de Bridge, Claude
  nativo, propiedad de las generaciones, vistas previas y enlaces de archivos). La lista sale de
  `ci/test.sh` a `ci/roko-tests.txt`. Siguen fuera, con su motivo, los dos que necesitan Mongo en memoria.
- Se registra la base de upstream en `UPSTREAM-BASE`, y `scripts/roko-surface.cjs` genera la lista de
  ficheros propios y de upstream modificados. Sustituye a `MODIFIED-FILES.json`, que se elimina (listaba
  17 ficheros de la 0.7.2; la superficie real son 123 propios y 183 modificados).

- Se retira `packages/roko-server` (prototipo de filestores sin uso en ejecución, 19 ficheros). Desaparecen
  `better-sqlite3` (módulo nativo, causa de que `npm install` fallara sin compilador), `tsx` y `esbuild`;
  el lock pierde 1.111 líneas y no cambia ninguna versión. Salen sus líneas `COPY` de los dos Dockerfile y
  su entrada de `allowScripts`. El compilador (`make g++`) se mantiene en los Dockerfile hasta poder
  verificar una construcción sin él.

### Fase 3 del plan de mantenibilidad (7 de noviembre de 2026)

- `config/observability` pasa a ser el paquete `@roko/observability` (`packages/observability`); desaparecen los
  cuatro `require` con rutas relativas desde `packages/api`. La API **no arranca** si se exportan trazas y el
  parche de privacidad de `@librechat/agents` no está aplicado (si no se exportan, solo avisa).
- Cliente WebDAV y servicio de aprobación de Nextcloud pasan a TypeScript en `packages/api/src/nextcloud`; en
  `api/` quedan el almacén Mongoose, las rutas y la herramienta.
- Nextcloud: la herramienta lee PDF y ofimática (docx, xlsx, xls, odt, ods) de hasta 15 MiB, en páginas de
  50.000 caracteres (`offset` / `next_offset`). Un archivo con nombre inutilizable ya no impide listar la
  carpeta: se omite y el panel indica cuántos.
- El workspace es de mejor esfuerzo: si no responde, el chat sigue sin sus herramientas en lugar de fallar con
  «herramientas MCP no disponibles».
- Con modelos Bridge, la respuesta 429 («ocupado») muestra el texto original del Bridge aunque haya política de
  contenido activa; el resto de errores del proveedor siguen ocultos en ese caso.

### Fase 1 del plan de mantenibilidad (6 de noviembre de 2026)

- Estilo: Prettier sobre los 44 ficheros propios que no cumplían; 7 ternarios anidados sustituidos por tablas
  o funciones; una variable sin uso fuera; las regex con caracteres de control, intencionadas, llevan su
  justificación; `any` fuera de un test.
- Traducciones: los 35 textos fijos de `NextcloudLogin` y `NextcloudPanel` pasan a claves
  `com_roko_nextcloud_*` en español, inglés y catalán (el catalán no tenía ninguna clave de Roko).
- `BRIDGE_OUTPUT_TOOL_CALL_PREFIX` sale de `packages/data-provider` y sustituye al texto repetido en
  4 sitios.
- `sh ci/test.sh lint` pasa Prettier y ESLint sobre los ficheros propios (necesita el historial de git, por
  lo que no corre en la etapa `ci` del Dockerfile).
- Se borra `npm-audit-roko.json` (volcado de 0,3 MB del import inicial).

### Fase 2 del plan de mantenibilidad (6 de noviembre de 2026)

- Tests de enganche nuevos (nombre `Roko hook: ...`): herramientas inyectadas en el agente, usuario seguro
  sin tenant, búsqueda web de Bridge, interruptor del workspace en ajustes, `preserve_original` en subidas,
  workspace en `resolveConfigServers`, lista de modelos Bridge y restauración de salidas de Bridge.
- Los tests de Roko ya existentes se renombran a `Roko hook: ...`. `sh ci/test.sh seams` ejecuta solo los
  enganches. La CI pasa a incluir 14 suites más (upstream con reglas de Roko dentro).
- La inyección de Nextcloud y skills en el agente pasa a `packages/api/src/roko/agentTools.ts`
  (mismo comportamiento, comprobado con 54 combinaciones).
- Nuevo [ROKO-UPGRADE.md](ROKO-UPGRADE.md): procedimiento de actualización y tabla de enganches.

### Corrección tras el primer despliegue (3 de noviembre de 2026)

- Workspace MCP: los chats con modelos sin Bridge fallaban con «The agent is configured
  to use MCP tools, but none are available». v0.8.8 carga las herramientas MCP desde un
  contexto nuevo (`resolveMcpServerContext`) que Roko no conocía; el servidor
  `roko-workspace`, inyectado por petición fuera de `mcpConfig`, no estaba en él. Ahora
  se incorpora a `configServers` y a los nombres de servidor.
- Nextcloud: el botón para elegir archivos de Nextcloud desapareció de la barra de
  texto. v0.8.8 añade un modo de subida unificado (un solo clip) con su propio render,
  y Roko solo pintaba el panel en el menú clásico. Ahora aparece en los dos modos.
- Documentos con Claude por Bridge: un `.docx` (y cualquier tipo que no sea PDF o texto)
  hacía fallar el chat con «The attached documents could not be read or encoded». v0.8.8
  aplica los límites de entrada de documentos de Claude a todo modelo con «claude» en el
  nombre; el Bridge no usa esa API, copia el original al workspace. Los modelos Bridge
  quedan exentos y reciben el archivo original, como antes.

La base real no era v0.8.6 como declaraba el paquete, sino el commit intermedio
`9efe487` (14 de junio de 2026). El historial git ahora lo registra como ancestro y
v0.8.8 se integró como merge de tres vías.

### Cambios de comportamiento

- Actividad: se adoptan las fases de actividad y el plegado de LibreChat v0.8.8 en
  lugar del grupo «Actividad de la respuesta» de Roko. Se conservan el progreso
  Bridge en línea, las salidas Bridge a nivel de mensaje y los enlaces de descarga.
- Tiempo total: lo da `Elapsed` de LibreChat, que se persiste; se retira el
  contador montado de Roko. Los tiempos por herramienta Bridge siguen igual.
- Ajustes: el interruptor del workspace pasa a Configuración → Datos → Workspace
  MCP dentro del registro de ajustes de v0.8.8.
- Envío: se retira el filtro de texto vacío de Roko; upstream valida el envío y
  permite mensajes solo con adjuntos.

### Adaptaciones

- `@librechat/agents` 4.0.1: el parche de observabilidad se porta (marcador
  `ROKO_OBSERVABILITY_V088`) y falla explícitamente si cambia el handler Langfuse.
- Trazas OTEL: el procesador filtrado elige OTLP/HTTP u OTLP/gRPC según las
  variables estándar.
- Zod: se mantiene zod 3 como v0.8.8; se revierten las adaptaciones a zod 4 que
  Roko había adelantado (upstream migra en v0.8.9-rc1).
- Seguridad: `tenantId` vuelve a quedar fuera del usuario seguro que alimenta los
  marcadores MCP; la identidad del workspace toma el tenant del contexto de la
  petición. La exención SSRF del workspace se añade también al resolvedor de
  allowlist por petición. Se mantiene la parada de generación restringida al dueño.
- Skills: las cadenas CRUD de Roko reutilizan los handlers de upstream.
- Alias Bridge en una sola fuente (`isBridgeModel`); el cliente deja de reconocer
  Bridge por el nombre del endpoint y sigue la misma regla por modelo que el servidor.
- Identidad del workspace: sin tenant y con `TENANT_ISOLATION_STRICT` se rechaza
  explícitamente en lugar de usar `''`; `__SYSTEM__` no se acepta como tenant.
- Disclosures de razonamiento: clave tipada por bloque (`parte:bloque`) en lugar de
  un índice fraccionario para los bloques de progreso Bridge.
- Workspace y Bridge: borrado de workspaces en cascada con los hilos de subagentes,
  restauración de salidas Bridge solo para modelos Bridge (sin bloquear la carga en
  paralelo del resto) y cabeceras de identidad sobre la nueva conexión MCP.

## Sin publicar — estado documental del 20 de octubre de 2026

### Funcionalidad presente en el código

- Registro: error `EMAIL_ALREADY_EXISTS` para correo duplicado dentro del tenant,
  incluida la colisión del índice compuesto, en lugar de confirmar un registro fallido.
- Parámetros Bridge: capacidades según proveedor, defaults válidos, distinción
  Default/Auto del resumen y opciones efectivas firmadas; se retiran controles
  API incompatibles y se preservan llamadas/resultados al filtrar replay Responses.
- Actividad: agrupación de comentario, THINK y herramientas, plegado al finalizar,
  orden estable y explicaciones contextuales breves sin panel técnico.
- Tiempos: presentación en segundos y contador general de generación en el
  encabezado. El total depende del montaje y no se persiste para respuestas antiguas.
- Archivos: enlaces Markdown asociados a descargas autenticadas, basename original
  conservado y preview nativa o conversión Office aislada según soporte.
- Telemetría: privacidad en la copia de exportación, uso/coste numérico validado
  y contabilidad sin duplicación para los seis alias Bridge.
- Entrega: build y selección de pruebas en Docker/GitHub Actions, publicación por digest
  y despliegue con snapshots, salud y rollback.

### Consolidación documental

- `SPEC-old.md` se integra en `SPEC.md`, corrigiendo el modelo de sesión y la
  autenticación del filestore externo.
- `ROKO-LANGFUSE-BRIDGE.md`, `OBSERVABILITY-V072.md` y `VERIFY-LANGFUSE.md` se
  integran en `OBSERVABILITY.md`.
- `TEST-RESULTS.md` deja de funcionar como certificado vigente; garantías y
  alcance se concentran en `TESTS.md`, sin reutilizar recuentos históricos.
- `BRIDGE-ACTIVITY-PROMPT.md` se sustituye por el contrato vigente en `CLI-BRIDGE.md`.
- Se retira `README.zh.md`, duplicado de la presentación upstream sin mantenimiento
  de los cambios Roko. `README.md` concentra navegación y arranque.
- Se actualizan las guías de despliegue, CI, paquetes, Helm, traducción y contribución.
  Las políticas de agentes y la fixture E2E de skill conservan su función propia.

Esta revisión documental no ejecuta pruebas de aplicación ni publica una imagen.

## Entrega de integración 0.7.2 — histórico

Raíz `roko.interaction` alrededor del streaming, contexto heredado por callbacks y
títulos, destinos confiables explícitos y modos redacted/debug saneados. Se
añadieron pruebas de privacidad y exportación y propagación de variables por Compose.

## Entrega de integración 0.7.1 — histórico

Clasificación y ciclo de vida de operaciones, sesiones seudonimizadas, propagación
de contexto firmado entre servicios y protección de adjuntos antes de exportar.
La telemetría conserva límites derivados de los eventos que realmente ofrecen
los SDK. Estas notas históricas no acreditan el estado del despliegue actual.
