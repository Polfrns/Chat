

## Observabilidad v0.7.1

Observabilidad v0.7.1: exportación privada, contexto HMAC por servicio y operaciones basadas en eventos reales. Véanse CHANGELOG.md y LIMITATIONS.md. Los permisos y datos enviados al modelo no cambian.


## Observabilidad v0.7.2

Raíz activa roko.interaction alrededor del streaming real de agents; callbacks y títulos heredan contexto. Se conservan IDs deterministas para feedback. URL fija del Bridge autorizada sin abrir destinos externos. Exportación redacted/debug saneada, presupuesto de texto y pruebas CI nuevas; variables propagadas por Compose.

Las pruebas nuevas comprueban límites de contenido, filtrado antes de exportar y no mutación de datos. Roko ejecuta processStream real sobre un grafo de prueba y comprueba trazas, títulos, usuarios, errores y cancelación. Bridge verifica por HTTP la firma y el padre remoto con SDK real. Filestore mantiene sus 12 herramientas y pruebas de acceso. Véanse TEST-RESULTS.md y OBSERVABILITY-V072.md.


## Langfuse metering hotfix (2026-10-16)

At the export boundary, usage_details and cost_details retain only recognized
nonnegative finite numeric metrics. Exported content remains sanitized; live
model input and output are unchanged. Roko generations for the six known Bridge
aliases export zero usage/cost and usageAccounting=bridge_replica so Bridge is
the sole accounting source. Direct Roko model measurements remain intact. New
aliases and cache/reasoning detail normalization require separate integration.
