# Observabilidad y privacidad

Guía vigente de Roko, consolidada de las notas de integración 0.7.1/0.7.2 y de
verificación Langfuse. Bridge y filestore requieren su propia configuración y
despliegue compatibles; no se actualizan al reconstruir Roko.

## Flujo de trazas

`roko.interaction` engloba el streaming real de agents. Callbacks y generación de
títulos heredan contexto; los IDs de feedback permanecen deterministas. Cada
respuesta genera una traza nueva. Usuario, tenant y conversación producen una
identidad de sesión seudonimizada estable; el conversationId no se sustituye por
un ID de ejecución.

Roko propaga contexto solo a destinos autorizados. La URL fija de Bridge se
considera destino confiable; otros MCP necesitan autorización explícita. La
firma se valida además de la autenticación normal, con una antigüedad máxima
de 60 segundos. Una firma de contexto no concede permisos de archivos.

Los servicios necesitan el mismo proyecto Langfuse y contexto válido para mostrar
un árbol común. Proyectos separados no se fusionan automáticamente aunque
compartan traceId/session.id. La instrumentación no inventa suboperaciones,
reintentos o llamadas a modelos que el SDK no publique.

## Configuración

| Variable | Función |
| --- | --- |
| `LANGFUSE_BASE_URL` | Destino de Langfuse |
| `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY` | Credenciales del proyecto |
| `LANGFUSE_TRACING_ENABLED` | Activación de trazas; override default `true` |
| `LANGFUSE_SAMPLE_RATE` | Muestreo; override default `1` |
| `OBSERVABILITY_TRACE_SECRET` | Secreto compartido de firma de contexto, mínimo 32 caracteres, distinto de credenciales API |
| `OBSERVABILITY_SESSION_SECRET` | Secreto para seudonimizar sesión cuando no se usa la clave Bridge |
| `OBSERVABILITY_TRACE_TARGETS` | Destinos adicionales autorizados explícitamente, sin comodines |
| `OBSERVABILITY_CONTENT_MODE` | `redacted` por defecto, o `debug` |
| `OBSERVABILITY_CONTENT_MAX_CHARS` | Presupuesto debug, default 4000, acotado entre 256 y 16000 |
| `OBSERVABILITY_FILE_NAMES` | Exportar basenames permitidos; default `false` |
| `LANGFUSE_FORCE_FLUSH_ON_DISPOSE` | Control de flush del SDK; revisar `.env.example` |

El override Compose propaga las variables declaradas en
[docker-compose.override.yml](docker-compose.override.yml). Para otro despliegue
hay que transmitirlas de forma equivalente, no basta con definirlas en un archivo
que el contenedor no lea. No incluyas claves reales en ejemplos o diagnósticos.

## Frontera de privacidad

[privacy.cjs](config/observability/privacy.cjs) filtra una **copia para exportación**;
no modifica mensajes, adjuntos ni registros originales usados por el chat.

- `redacted` conserva estados, tipos, métricas y valores técnicos permitidos;
  oculta contenido libre.
- `debug` permite contenido textual acotado y saneado. Sigue ocultando credenciales,
  cabeceras sensibles, bytes de adjuntos, Base64 y rutas privadas reconocidas.
- Se deshabilita la subida automática de medios. Un nombre visible en el chat no
  implica que se exporte a Langfuse.
- Los filtros reducen exposición; no clasifican semánticamente toda información
  confidencial que un usuario pudiera incluir en texto debug.

El chat conserva su propia presentación de actividad. Su explicación no se
activa con debug, ni se suprime con redacted. Actualmente la interfaz usa
resúmenes breves y oculta el panel técnico por diseño.

La exportación preserva contadores de uso/coste con claves numéricas conocidas,
finitas y no negativas. Para los seis alias Bridge, Roko marca contabilidad
`bridge_replica` y evita duplicar mediciones: Bridge es la fuente contable.
Los modelos directos conservan sus medidas. Alias nuevos necesitan integrarse
explícitamente en esa política.

## Instrumentación y mantenimiento

[patch-observability.cjs](scripts/patch-observability.cjs) aplica el parche
idempotente a la versión admitida de agents, en sus distribuciones CJS y ESM.
Incluye una comprobación de versión: actualizar la dependencia exige revisar la
compatibilidad, no retirar el guard sin verificarla.

```sh
npm ci
npm run observability:patch
```

Docker aplica el parche antes de compilar. No se habilita instrumentación HTTP
indiscriminada que capture cabeceras; el contexto se propaga en fronteras
explícitas. Un error de telemetría no debe repetir la herramienta ni ejecutar la
respuesta de nuevo. El envío es asíncrono y de mejor esfuerzo: crash o SIGKILL
pueden impedir cerrar o exportar spans pendientes.

## Verificación después de desplegar

Usa datos de prueba y realiza estas comprobaciones en la instalación objetivo:

1. Genera un archivo y modifícalo en el siguiente turno. Deben seguir llegando
   respuestas y archivos, con una traza distinta por respuesta y la misma sesión.
2. Repite con otra conversación y usuario: deben cambiar las identidades de
   sesión. Comprueba feedback y contexto de los títulos.
3. Observa actividad durante la ejecución y plegado al terminar. Contrasta tiempos
   de operaciones con su procedencia; el tiempo del encabezado es generación total.
4. En Langfuse comprueba la relación entre `roko.interaction`, la petición Bridge
   y las operaciones emitidas. Un padre remoto puede faltar con proyectos separados.
5. Prueba permisos de filestore y una cancelación o timeout controlado. Deben
   reflejar su estado real, sin exponer contenido de un archivo rechazado.
6. Usa un documento de prueba con una cadena reconocible. En redacted no debe
   salir su texto; en debug comprueba presupuesto, secretos y bytes filtrados.
   Inspecciona atributos y exportación, no solo la vista resumida de Langfuse.
7. Con un receptor de prueba no disponible, confirma que una operación se ejecuta
   una sola vez y la respuesta sigue siendo utilizable.

Estas instrucciones no acreditan que se haya accedido a la instancia real. Las
trazas antiguas no se borran al activar el filtro; su retención se administra
aparte. [TESTS.md](TESTS.md) explica las garantías automatizadas y sus límites.
