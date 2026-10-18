# Roko + Bridge + Langfuse: integración de despliegue

### Funcionalidad

- LibreChat utiliza su instrumentación Langfuse nativa para agentes, títulos y otros modelos (incluido LM Studio).
- Bridge utiliza `@langfuse/tracing`, `@langfuse/otel`, y OpenTelemetry para la ejecución de Codex/Claude.
- Las actividades de herramientas internas de Bridge se publican **solo como estados visibles** a través de `reasoning_content` en la API Chat Completions; no son cadenas de pensamiento ni `tool_calls` ejecutables.
- Se conserva el HMAC de identidad, aislamiento por usuario y conversación. Nunca se envían argumentos, rutas, contenidos de archivos ni mensajes completos a la telemetría del Bridge.

### Configurar Roko

Completar `.env` privado (no versionar):

```dotenv
LANGFUSE_BASE_URL=http://DIRECCION_DE_LA_VM:3000
LANGFUSE_PUBLIC_KEY=pk-lf-...
LANGFUSE_SECRET_KEY=sk-lf-...
LANGFUSE_TRACING_ENABLED=true
LANGFUSE_SAMPLE_RATE=1
ROKO_BRIDGE_ACTIVITY_ENABLED=true
```

`docker-compose.override.yml` ya exporta las variables al contenedor `api`. Aplicar con `docker compose config -q && docker compose up -d --build --no-deps api`.

### Configurar Bridge

Configurar las mismas claves de **proyecto Roko** en su `.env` separado y establecer `BRIDGE_ACTIVITY_ENABLED=true`. Construir con `docker compose build bridge`, reiniciar con `docker compose up -d --no-deps bridge`. Sus credenciales de autenticación de Codex/Claude siguen dentro del volumen `logins`.

No publicar el puerto 4000 (debe continuar escuchando en `127.0.0.1`); la comunicación entre contenedores usa la red privada y el HMAC de Roko.

### Pruebas

- Confirmar que `bridge.request` aparece en Langfuse tras una solicitud real.
- Confirmar trazas `agentrun` y `titlerun` en Roko cuando corresponda.
- Desde Roko, pedir a Codex leer/editar un archivo del workspace; debe verse la actividad en el panel de razonamiento. No aparecen argumentos, rutas ni contenido privado.
- Repetir con Claude y su herramienta `mcp__workspace__execute`.
- Probar LM Studio para verificar la instrumentación nativa de LibreChat en modelos alternativos.
- Verificar que desconectar temporalmente Langfuse no interrumpe las respuestas, y que los usuarios permanecen aislados.

**Límites:** El streaming inmediato de actividad está implementado para el endpoint OpenAI Chat Completions. La API Responses conserva estados al terminar, pero su visualización en tiempo real necesita adaptación adicional al parser de Responses. Los eventos de herramientas del Bridge se muestran como líneas de actividad, no como tarjetas MCP nativas. Para obtener tarjetas MCP reales y completamente persistidas se requiere una integración adicional en los callbacks de herramientas de LibreChat.
