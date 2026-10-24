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

El agente configurado usa `ChatGPT Codex` / `gpt-codex-fast`, con las mismas
credenciales del Bridge ya existentes. El Bridge debe poder devolver las
llamadas de herramientas para que LibreChat actualice la memoria. Comprueba una
actualización desde un chat y su aparición en la gestión de memorias.
Los controles de personalización del usuario siguen vigentes.

## Búsqueda web

Codex Bridge utiliza su parámetro nativo `web_search`. El botón y el panel de
parámetros comparten ese valor. Claude Bridge lo muestra deshabilitado conforme
a sus capacidades actuales.

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

## Futuro MCP de edición y workspace

Cuando exista el servidor:

1. Completa `WORKSPACE_MCP_URL` y `WORKSPACE_MCP_TOKEN` en `.env`.
2. Descomenta `mcpServers.editing-workspace` en `runtime-config.yaml`. Si usa
   otro mecanismo de autenticación, adapta `headers` a su contrato real.
3. Para una URL privada, habilita `mcpSettings.allowedAddresses` con el host y
   puerto exactos. El puerto 8080 comentado es únicamente un ejemplo.
4. Reinicia la API y selecciona el servidor desde el menú MCP del chat o agente.

`startup: false` conecta bajo demanda. El servidor deberá aplicar aislamiento
por usuario y workspace, autorización de archivos y límites de ejecución.
No existe todavía un vínculo entre su workspace y los filestores de sesiones
Roko: ese contrato debe definirse al implementar el MCP.

## Aplicar la configuración

Desde la raíz, con Docker disponible:

```powershell
docker compose up -d --build api
```

Este comando también puede ejecutar las comprobaciones de la etapa CI del
Dockerfile. La preparación actual no certifica una compilación ni una conexión
real con los servicios externos.
