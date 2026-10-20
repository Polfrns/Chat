# Historial de Roko

Este historial recoge cambios de la adaptación. El paquete raíz declara
`v0.8.6` como base LibreChat; las etiquetas 0.7.x de las entregas anteriores
identificaban integraciones y no una nueva versión del paquete raíz.

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
- Entrega: build y selección de pruebas en Docker/CI, publicación por digest
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
