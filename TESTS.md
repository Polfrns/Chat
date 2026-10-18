

## Observabilidad v0.7.1

Observabilidad v0.7.1 protege clasificación, ciclo de vida, agrupación de sesiones, contexto de servicio autenticado y privacidad antes de OTLP. Véanse TEST-RESULTS.md para comandos/resultados y VERIFY-LANGFUSE.md para verificación de despliegue.


## Observabilidad v0.7.2

Raíz activa roko.interaction alrededor del streaming real de agents; callbacks y títulos heredan contexto. Se conservan IDs deterministas para feedback. URL fija del Bridge autorizada sin abrir destinos externos. Exportación redacted/debug saneada, presupuesto de texto y pruebas CI nuevas; variables propagadas por Compose.

Las pruebas nuevas comprueban límites de contenido, filtrado antes de exportar y no mutación de datos. Roko ejecuta processStream real sobre un grafo de prueba y comprueba trazas, títulos, usuarios, errores y cancelación. Bridge verifica por HTTP la firma y el padre remoto con SDK real. Filestore mantiene sus 12 herramientas y pruebas de acceso. Véanse TEST-RESULTS.md y OBSERVABILITY-V072.md.


## Langfuse metering regression (2026-10-16)

Content privacy tests assert SDK JSON usage/cost survives both content modes,
reject secret fields, nesting, malformed JSON and invalid numbers, and verify
export copies never mutate live attributes. Known Roko Bridge aliases suppress
duplicate accounting while direct models retain measurements.
