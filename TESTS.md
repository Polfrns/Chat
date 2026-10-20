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

Los informes antiguos de entregas 0.7.x se han consolidado sin trasladar sus
recuentos como resultados actuales. Al registrar una ejecución nueva, indica
comando, entorno, revisión, resultado y límites. Una comprobación sintáctica no
es una prueba funcional. Las pruebas negativas deben fallar al romper el
invariante que pretenden proteger; consulta [AGENTS.md](AGENTS.md).
