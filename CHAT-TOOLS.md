# Memorias, herramientas y workspace

La configuración usada por Docker es `runtime-config.yaml`, montada por
`docker-compose.override.yml`. Los cambios React necesitan reconstruir la imagen.

## LM Studio

En `.env`, configura `LMSTUDIO_BASE_URL` cuando tengas la URL definitiva,
incluyendo `/v1`. Compose conserva por defecto
`http://host.docker.internal:1234/v1`. La clave sigue siendo `LMSTUDIO_API_KEY`.
El modelo debe admitir llamadas de herramientas y la plantilla de chat adecuada
en LM Studio. La lista de modelos se consulta al servidor existente.

El menú de herramientas permite activar búsqueda web, archivos, código,
artifacts y skills. La selección de MCP aparecerá cuando haya servidores
habilitados con `chatMenu: true`. Cada herramienta se ejecuta en LibreChat o en
su servicio correspondiente; LM Studio recibe sus definiciones y resultados.

## Memorias

El agente configurado usa `Claude Max` / `claude-max-fast`, con las mismas
credenciales del Bridge ya existentes. Cuando el usuario pide recordar, cambiar
u olvidar algo, el agente lo aplica en el mismo turno. Comprueba una
actualización desde un chat y su aparición en la gestión de memorias.
Los controles de personalización del usuario siguen vigentes.

## Skills desde el chat

La herramienta `skill_library` permite pedir al chat que liste, lea, cree o
edite skills. Usa los mismos permisos y validaciones que la pantalla de Skills.
Para eliminar una skill aparece un popup de confirmación: solo se borra si el
usuario pulsa «Eliminar skill»; rechazar, cerrar o esperar 120 s la conserva.

## Búsqueda web

Claude Bridge utiliza su parámetro nativo `web_search`, que activa WebSearch y
WebFetch de Claude. El botón y el panel de parámetros comparten ese valor.
WebFetch rechaza direcciones privadas, locales e internas.

Gemini dispone de búsqueda con Google en su panel de parámetros. El botón de
búsqueda web de la barra usa para Gemini la herramienta de LibreChat, que
necesita las credenciales de Serper/Jina descritas abajo.

LM Studio utiliza la herramienta de LibreChat. Completa `SERPER_API_KEY` y
`JINA_API_KEY` en `.env`, o introduce las credenciales desde la configuración de
búsqueda del menú. Su botón y su parámetro comparten la selección de herramienta;
activarla no habilita la API Responses de LM Studio.

## Entorno de código

Configura `LIBRECHAT_CODE_BASEURL` en `.env` con la URL de un sandbox compatible
con `@librechat/agents`. Esta integración usa sesiones, `/exec`, carga y descarga
de archivos; un contenedor genérico de Python o un servidor MCP no implementa
por sí solo ese contrato. El repositorio ya integra `bash_tool`, lectura,
escritura y recuperación de archivos generados.

La URL se transmite al contenedor API. No se ha creado ni arrancado un sandbox
en esta preparación. Si el servicio requiere JWT gestionado, configura
`CODEAPI_AUTH_PROVIDER=librechat-jwt`, una clave privada mediante
`CODEAPI_JWT_PRIVATE_KEY_BASE64` y los valores de emisor/audiencia que acepte
el verificador del servicio. No se requiere una clave por usuario de ejecución
de código en esta versión.

## Workspace MCP

Roko conecta `roko-workspace` por defecto para modelos que no usan Bridge. El
usuario puede desactivarlo globalmente desde Configuración → Personalización.
Claude Max y ChatGPT Codex se excluyen porque Bridge ya ofrece su propio
workspace. Configura `ROKO_WORKSPACE_URL` como URL base del servicio y
`ROKO_WORKSPACE_KEY` como secreto compartido. La conexión MCP usa
`${ROKO_WORKSPACE_URL}/mcp`; las transferencias REST usan
`${ROKO_WORKSPACE_URL}/v1/workspace/...`. El servicio debe estar en la red Docker
interna compartida con Roko y Bridge, sin publicar su puerto al host.

Los adjuntos solo se copian al workspace cuando el modelo llama explícitamente
`attach_chat_file(file_id)`. Los archivos de salida pasan por la validación del
servicio antes de adjuntarse al chat con `deliver_workspace_file(path)`.

## Aplicar la configuración

Desde la raíz, con Docker disponible:

```powershell
docker compose up -d --build api
```

Este comando también puede ejecutar las comprobaciones de la etapa CI del
Dockerfile. La preparación actual no certifica una compilación ni una conexión
real con los servicios externos.
