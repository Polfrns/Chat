# Pruebas: garantías y alcance

Este documento explica qué protege cada grupo. Describe las pruebas presentes,
no un certificado de que el checkout o la producción estén actualmente en verde.
La revisión documental del 20 de octubre de 2026 no ejecuta suites de aplicación.

## Selección que ejecuta CI

La fuente es [ci/test.sh](ci/test.sh), ejecutada por la etapa `ci` del Dockerfile.
La imagen de producción depende de esa etapa y de la compilación del frontend.

| Grupo seleccionado | Invariante protegida |
| --- | --- |
| `scripts/observability.test.cjs` | Clasificación, identidad de sesión, contexto confiable e instrumentación sin repetir ejecución |
| `scripts/content-privacy.test.cjs` | Redacción/debug en la frontera de exportación, presupuestos, secretos y adjuntos; copia sin mutar datos vivos; uso/coste válido y contabilidad Bridge sin duplicación |
| `scripts/bridge-parameters.test.cjs` | Capacidades por proveedor, defaults, opciones firmadas, cuerpos Chat/Responses, destinos autorizados y replay que conserva llamadas/resultados |
| `scripts/otel-export.test.cjs` | Filtrado en la exportación real hacia un receptor local |
| `scripts/interaction-export.test.cjs` | Contexto de streaming e interacciones reales del grafo de prueba, títulos, errores y cancelación |
| `bridgeToolRecords.test.ts` | Reconocer V1, rechazar campos privados no admitidos, conservar orden intercalado y una tarjeta estable por operación |
| `BridgeToolReasoning.test.tsx` | Presentación de estados, resultados, cancelación, reintentos y tiempo disponible |
| `packages/api/src/utils/rokoBridge.spec.ts` | Adaptación del contexto y comportamiento del cliente Bridge |
| `packages/api/src/telemetry/sdk.spec.ts` | Inicialización y opciones de privacidad de la telemetría |

Los dos tests de exportación activan tracing sobre receptores de prueba; las
otras pruebas Node lo desactivan. No requieren las credenciales de Langfuse de
producción ni una generación pagada del modelo.

Para ejecutar la selección en un entorno con dependencias compiladas y shell POSIX:

```sh
sh ci/test.sh
```

La construcción Docker prepara esas dependencias antes de la etapa de pruebas.
Ejecutar el script en un checkout sin dependencias no equivale a ejecutar la CI.

## Actividad y tiempo general

`activityParts.test.ts` comprueba la separación entre actividad y respuesta:
comentario, THINK y herramientas se agrupan; texto final, errores, handoffs y
adjuntos permanecen visibles. `ResponseActivity.test.tsx` comprueba apertura,
actualizaciones y plegado al finalizar. `ContentParts.integration.test.ts`
protege la integración, los adjuntos de una o varias herramientas y la separación
de columnas y mensajes de usuario.

**Estos grupos adicionales no están todos seleccionados por `ci/test.sh`.** Los
últimos cambios del contador general y de presentación en segundos tuvieron
comprobaciones estáticas, pero no una validación completa de navegador o de
persistencia. El total se mide durante el montaje y no se guarda como dato
histórico. No interpretar una prueba anterior de tarjetas como cobertura completa
del reloj general.

## Descargas y previews

- `messageFileLinks.test.ts`: asociación al adjunto de la respuesta, nombres
  originales y codificados, duplicados, ambigüedad, traversal y enlaces externos.
- `MarkdownFileLinks.test.tsx`: clic mediante descarga autenticada del archivo
  referenciado; enlaces externos conservados.
- `filePreview.test.ts`: elección de formato, HTML como texto, binarios sin
  soporte y rechazo de esquemas URL inseguros.
- `FilePreviewDialog.test.tsx`: HTML Office en sandbox vacío y texto extraído
  nunca inyectado como HTML.
- Los `process.spec.js` de archivos Bridge y Code comprueban el ciclo de preview
  compartido: persistencia previa del descargable, revisiones, timeout y errores
  del conversor/transporte.

Son pruebas de lógica y colaboradores controlados. No certifican la fidelidad de
todos los documentos, los códecs del navegador ni una ejecución de CLI real.
No están seleccionadas todas por la CI reducida.

## Sesiones, datos y autenticación

Las suites de `packages/api/src/sessions`, del cliente de filestore y de
`packages/data-schemas` protegen la propiedad de sesiones, asignación, decisiones
de acceso y contratos de persistencia. Las suites de autenticación del servidor
son distintas de las de integración Bridge. El índice de correo es compuesto
`email + tenantId`; verificarlo en MongoDB forma parte de la revisión de una
instalación existente, no se demuestra solo con un test de React.

El servicio local heredado y el filestore externo no comparten automáticamente
sus garantías: las pruebas de `packages/roko-server` no prueban el servicio externo.
Los experimentos [FerretDB](packages/data-schemas/misc/ferretdb/ferretdb-multitenancy-plan.md)
requieren una instancia separada y no forman parte de CI.

## Suites amplias y E2E

Los comandos raíz están en [package.json](package.json):

```sh
npm run test:client
npm run test:api
npm run test:packages:api
npm run test:packages:data-provider
npm run test:packages:data-schemas
npm run test:config
npm run test:all
npm run e2e:mock
```

`test:all` agrupa los cinco comandos de cliente/API/paquetes, no `test:config`,
las pruebas Node de `scripts/` ni E2E. Los perfiles E2E se explican en
[e2e/README.md](e2e/README.md). Los tests de Bridge y del filestore externo se
ejecutan en sus respectivos repositorios; los adaptadores simulados no acreditan
acceso real a las suscripciones ni al servidor de producción.

## Evidencia y mantenimiento

### Ejecución amplia con Docker — 24 de octubre de 2026

Checkout de trabajo sin identificador Git (no se ejecutaron comandos Git).
Windows, Node 24.22.1, npm 11.19.1 y Docker Engine 29.9.2. Se ejecutaron por
separado todos los grupos Jest configurados, incluido `packages/client`, que no
tiene comando en `test:all`, y las integraciones de `packages/api` que el comando
habitual `test:ci` excluye. También se ejecutaron los cinco scripts Node de CI.

Resultados finales por archivo, sin duplicar los reintentos:

| Grupo | Correctas | Fallidas | Omitidas/TODO |
| --- | ---: | ---: | ---: |
| Cliente | 2563 | 66 | 0 |
| Paquete de componentes | 108 | 35 | 0 |
| Data provider | 1212 | 0 | 1 |
| Esquemas de datos | 1632 | 0 | 0 |
| Configuración | 12 | 0 | 0 |
| Backend Express | 2894 | 43 | 19 |
| Paquete API, incluidas integraciones | 6406 | 24 | 41 |
| Scripts Node de CI | 21 | 0 | 0 |
| **Total ejecutado/registrado** | **14848** | **168** | **61** |

Los 168 fallos corresponden a **22 archivos/suites Jest**. Algunos son problemas
de montaje de tests, plataforma o expectativas; no se atribuyen todos a errores
del producto. Entre los hallazgos: `AttachFileMenu` sin el AuthProvider requerido
por Nextcloud, bucle de renderizado en `DataTable`, expectativas de moneda
dependientes del locale, imports default ausentes de `ActivityParts`, montaje
sin RecoilRoot y expectativas MCP/configuración/paths que no coinciden con el
comportamiento observado. Las cuatro suites Nextcloud/autenticación de la
selección anterior no figuran entre las fallidas.

`npm run build:packages` pasó. El chequeo de tipos del frontend conserva siete
errores y su build falla por los exports default de `ActivityParts`. Se intentó
el comando oficial `npm run e2e:mock`: falló en la compilación previa a Playwright.
El inventario identifica **64 E2E mock y 16 generales**, bloqueados y no contados
como aprobados ni entre las 61 omisiones Jest. La selección equivalente a
`ci/test.sh`, después del parche de observabilidad exigido por el Dockerfile,
pasó **54 pruebas** (33 Jest ya incluidas en la tabla y 21 Node).

Preparación y límites:

- Dependencias instaladas anteriormente con `--ignore-scripts`; el servicio
  SQLite heredado no queda validado y no declara una suite propia.
- El primer backend en serie agotó 4 GB antes de terminar. Se repitió completo
  con dos workers y `--workerIdleMemoryLimit=512MB`; el intento abortado no
  contribuye recuentos parciales al total.
- Redis independiente se levantó en 16379 y, para tests con puerto fijo, 6379.
  Un cluster aislado de tres nodos usó 7001–7003. Al preparar esos servicios,
  las cuatro suites Redis afectadas pasaron sus **58 pruebas**.
- MongoDB 8.0.20 se preparó en 27027; las suites que usan MongoMemoryServer
  ejecutaron sus propios procesos temporales. No se usaron bases del producto.
- El paquete API terminó y escribió el JSON, pero retuvo conexiones Redis. Se
  verificó y cerró únicamente ese proceso Jest para continuar la ejecución.
- Los tests S3 que exigen un bucket dedicado y el benchmark Redis explícitamente
  manual no se ejecutaron con recursos externos. No se acredita Nextcloud,
  Bridge, LM Studio ni filestore externos reales.
- Se retiraron los cuatro contenedores temporales creados y sus volúmenes
  anónimos al terminar. No se corrigieron archivos de producto durante esta
  ejecución.

El informe detallado, los JSON Jest y los logs de cada intento se conservan en
`scratchpad/all-tests-2026-10-24/`; `REPORT.md` enumera los fallos por archivo y
`TOTALS.json` contiene los recuentos consolidados. Los ejecutores reutilizables
están en `scratchpad/run-all-tests.cjs` y `scratchpad/summarize-all-tests.cjs`.

### Nextcloud e inicio de sesión persistente

- `api/server/services/Nextcloud/webdav.spec.js`: transporte simulado para rutas
  bajo el UID del usuario, traversal, DAV con namespaces y entidades XML básicas,
  rechazo de entidades declaradas y de entradas ajenas, límites de descarga,
  rechazo de redirecciones y precondiciones atómicas para crear/reemplazar.
- `api/server/services/Nextcloud/service.spec.js`: adaptador DAV programado y
  repositorios simulados. Protege la ausencia de escritura antes de aprobación,
  consultas vinculadas a propietario/tenant, caducidad/consumo de propuestas,
  invalidación tras volver a vincular y errores ETag sin sobrescritura silenciosa.
- `api/server/routes/nextcloudAuth.spec.js`: flujo de navegador con cookie,
  comprobación de origen y tenant, secretos fuera de las respuestas, creación
  de USER y reutilización de una cuenta vinculada sin registro duplicado.
- `AuthService.spec.js`: casos adicionales para creación y renovación de la
  sesión persistente conservando el mecanismo existente de JWT de acceso.

La cobertura existente no prueba la detección de carpetas DAV por barra final,
el límite de descarga ampliado, el fallback MIME genérico ni el bloqueo de
escrituras en `/backups`.

Ejecución del 24 de octubre de 2026 sobre el checkout de trabajo, sin identificar
revisión Git porque no se han ejecutado comandos Git: Windows, Node 24.22.1,
npm 11.19.1. `npm run build:packages` pasó. La selección siguiente pasó con
**4 suites y 84 pruebas**:

```powershell
npm.cmd test --workspace=@librechat/backend -- --runInBand --coverage=false server/services/Nextcloud/webdav.spec.js server/services/Nextcloud/service.spec.js server/routes/nextcloudAuth.spec.js server/services/AuthService.spec.js
```

Se corrigió una expectativa nueva que rechazaba indebidamente un balance
opcional `undefined`; no fue necesario cambiar la lógica de producción por ese
fallo. Cuatro mutaciones controladas produjeron el fallo esperado de una prueba
cada una: seguir redirecciones, omitir propietario/tenant al reclamar aprobación,
ignorar el tenant del login y desactivar la sesión persistente. Se restauraron
los archivos y se volvió a ejecutar la selección completa con éxito.

La instalación normal falló al compilar `better-sqlite3` (sin binario precompilado
para Windows/Node 24.22.1 ni Visual C++ instalado). Se completó mediante
`npm ci --ignore-scripts --no-audit --no-fund` usando una caché en scratchpad.
Esta preparación basta para los paquetes y simulaciones citados; no acredita
el funcionamiento del servicio SQLite heredado ni de otros scripts de instalación.

`npm run typecheck --workspace=@librechat/frontend` terminó con siete errores:
firma asíncrona de envío en `ChatForm.tsx` y `useSubmitMessage.spec.ts`, tipo del
fixture SUMMARY en `activityParts.test.ts`, imports sin default de `ActivityParts`
en `ContentParts.integration.test.tsx`, `ContentParts.tsx` y `ParallelContent.tsx`,
y un booleano opcional en `Parts/Reasoning.tsx`. Ningún diagnóstico señala los
módulos nuevos de Nextcloud. No se modificaron esos archivos ajenos al cambio.

En esa primera ejecución Docker CLI estaba instalado, pero el motor aún no
estaba arrancado. La ejecución amplia posterior sí utilizó contenedores de
pruebas. No se acredita login, ACL, concurrencia entre instancias ni escritura
contra un Nextcloud real, ni una compilación completa del frontend. El
procedimiento con dos usuarios figura en [NEXTCLOUD.md](NEXTCLOUD.md).

### Preparación de memorias y herramientas (24 de octubre de 2026)

En la implementación inicial, los cambios de configuración, controles readonly
y sincronización de Web Search se revisaron mediante lectura del código. La
compilación posterior de los paquetes compartidos pasó; aún no se han ejecutado
pruebas funcionales específicas del botón y su sincronización con parámetros.
No se acredita conectividad con LM Studio, Bridge, sandbox ni MCP de edición.

La validación pendiente debe comprobar que cambiar Web Search desde el botón,
menú o parámetro actualiza los otros controles; que Codex envía la opción nativa
sin solicitar claves Serper/Jina; que LM Studio recibe la herramienta sin activar
Responses; que Claude mantiene búsqueda deshabilitada; y que el reset de
parámetros también desactiva la búsqueda de herramientas de endpoints custom.
Los parámetros readonly deben rechazar ratón y teclado, incluidos controles
con portales. La memoria debe crear, actualizar y borrar datos del usuario
autenticado respetando sus controles de personalización.

Los informes antiguos de entregas 0.7.x se han consolidado sin trasladar sus
recuentos como resultados actuales. Al registrar una ejecución nueva, indica
comando, entorno, revisión, resultado y límites. Una comprobación sintáctica no
es una prueba funcional. Las pruebas negativas deben fallar al romper el
invariante que pretenden proteger; consulta [AGENTS.md](AGENTS.md).
