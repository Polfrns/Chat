# Roko — actualización de archivos para bridge 0.6.0

Una cuenta de Codex y una cuenta de Claude Code pueden atender a los usuarios de
Roko. Cada petición recibe identidad firmada, configuración propia y directorios
privados de estado. LibreChat conserva el historial y los documentos.

## Actualizar a 0.6.0

Sigue **FORMATOS-0.6.0.md** para extensiones y pasos completos. Aplica el ZIP
`main/...` sobre la carpeta que contiene `main`, conserva `.env` y datos y
reconstruye `api` con `docker compose up -d --build api`. El bridge se actualiza
por separado: hay nuevas dependencias Python y conversores externos.
Docker los instala al reconstruir; el modo nativo requiere `npm run setup:files`
y LibreOffice/FFmpeg/Tesseract según los formatos usados.

## Referencia histórica: actualización a 0.5.5

Actualiza **Roko y el bridge juntos**. Un Roko antiguo no manda la firma requerida
por el bridge 0.5 y recibirá un error de identidad.

1. Copia los archivos de actualización de `Roko/main/` sobre tu carpeta `main` de
   Roko, y los de `ai-librechat-bridge/` sobre el bridge. Conserva `.env`, las bases
   de datos, los directorios de archivos y `runtime-tools/`.
2. En Roko, `CLAUDE_BRIDGE_KEY` debe seguir siendo exactamente el mismo secreto
   que `BRIDGE_API_KEY` en el bridge. No hace falta generar otro.
3. Desde `main` de Roko reconstruye la imagen, porque hay cambios en los paquetes
   internos TypeScript y en los controles de parámetros:

   ```powershell
   docker compose up -d --build api
   ```

4. Detén el bridge anterior y, desde su carpeta, ejecuta `npm start`.
   `http://localhost:4000/health` debe indicar versión `0.5.5`.

No hay dependencias nuevas. Para una instalación limpia usa `npm ci` y Node 24.
Si ya tienes el entorno de edición instalado, conserva `runtime-tools/`; si no,
instala Python 3.10+ y ejecuta `npm run setup:files`.

La URL actual es `http://host.docker.internal:4000/v1`. Si la cambias, actualiza
ambos `baseURL` de `runtime-config.yaml` y `ROKO_BRIDGE_BASE_URL` en el `.env` de
Roko. El servidor solamente firma peticiones destinadas a esa URL fija.
Se conserva el despliegue actual de CLI en Windows; no se introduce otro compose.

## Modelos y parámetros reales

| Variante | Modelo real | Esfuerzo inicial |
|---|---|---|
| Codex | `CODEX_MODEL` o predeterminado del CLI | medium |
| Codex Fast | `CODEX_FAST_MODEL`, en su defecto `CODEX_MODEL`/CLI | low |
| Codex Deep | `CODEX_DEEP_MODEL`, en su defecto `CODEX_MODEL`/CLI | high |
| Claude | `CLAUDE_MODEL` o predeterminado de Claude | medium |
| Claude Fast | `CLAUDE_FAST_MODEL` o `sonnet` | low |
| Claude Deep | `CLAUDE_DEEP_MODEL` o `opus` | high |

Todos usan el mismo bridge y la misma cuenta por proveedor. Cambiar el esfuerzo
con el control de Roko modifica la invocación real, con prioridad sobre el preset.
En Auto se conserva el preset. Cada proceso recibe su configuración; no se
modifican `process.env` ni los archivos globales de configuración por petición.
Los modelos/esfuerzos disponibles dependen de la cuenta y del modelo elegido:
el bridge valida las opciones del SDK, pero el proveedor puede rechazar una
combinación que tu cuenta no soporte.

Codex recibe `model`, `modelReasoningEffort`, `model_verbosity` y
`model_reasoning_summary`. Claude recibe `model`, `effort` y
`persistSession: false`. Claude conserva Read/Write/Edit, con hasta 12 turnos
internos para completar una edición; no tiene shell ni herramientas de Office.
Para modificar DOCX/XLSX/PPTX/PDF/imágenes mediante Python, usa Codex.

Los paneles de conversación, presets y agentes conservan todos los controles
OpenAI de LibreChat aplicables a estos endpoints. El nombre, prefijo de
instrucciones, contexto, tokens de archivos y reenvío los gestiona LibreChat.
Temperatura, top-p, penalizaciones, stop, detalle de imagen y máximo de tokens de
salida se muestran deshabilitados con explicación: el SDK de suscripción instalado
no expone esos controles. Mostrar un control no añade soporte al modelo.
Los valores antiguos de esos parámetros se retiran antes de invocar el SDK;
el bridge rechaza valores API no predeterminados recibidos por otros clientes.

Codex admite todos los esfuerzos del SDK instalado: minimal, low, medium, high,
xhigh, max, ultra y persistent. Claude admite low, medium, high, xhigh y max.
Auto conserva el preset. La cuenta y el modelo pueden rechazar un nivel concreto.
Codex recibe verbosidad low/medium/high y resumen auto/concise/detailed/none.
El nuevo valor Ninguno (`none`) sí desactiva el resumen; Auto no lo desactiva.
Solo se transportan los resúmenes públicos entregados por el SDK, mediante
reasoning_content en Chat y reasoning items/eventos en Responses.

Búsqueda web de Codex funciona con ambos protocolos sin forzar Responses.
Su interruptor explícito, incluida la posición apagada, se firma por petición.
La captura con Web Search apagado no permite consultar el tiempo en directo;
habilítalo para datos actuales. Claude puede usar la herramienta de búsqueda
como función de un agente de LibreChat; su búsqueda CLI nativa sigue deshabilitada.
El interruptor Responses selecciona el transporte Roko→bridge; Codex sigue
utilizando internamente su protocolo nativo.

`maxContextTokens` es el presupuesto del historial en LibreChat: no aumenta
la ventana real del modelo. Disable Streaming cambia el transporte HTTP; los
resultados Codex siguen validándose completos antes de enviarse, para impedir
entregas de archivos inexistentes o metadatos inválidos. Las opciones de sandbox,
permisos y rutas continúan siendo exclusivas del administrador.

`CODEX_ALLOWED_MODELS` y `CLAUDE_ALLOWED_MODELS` permiten al administrador añadir
IDs reales autorizados para integraciones internas que envíen `cli_options.model`.
No se admite una lista de argumentos arbitraria.

## Identidad, estado y autenticación

Roko firma un contexto HMAC con usuario autenticado, tenant, conversación,
modelo, opciones efectivas y fecha. La API requiere además el bearer actual.
`body.user`, metadata y headers sin firma no sirven como identidad.
Los nombres de directorio se generan mediante HMAC; no contienen IDs ni emails.
La caché `previous_response_id` pertenece a usuario + tenant + conversación +
proveedor. Cambiar Fast/Normal/Deep dentro del mismo proveedor no pierde esa
pertenencia. Un ID ajeno produce el mismo error que un ID desconocido.

Los CLI usan un HOME/USERPROFILE y CODEX_HOME/CLAUDE_CONFIG_DIR nuevos por
petición. Solo se copia el fichero de autenticación de la cuenta compartida;
no se copian configuraciones, sesiones, memorias, skills, instrucciones ni MCP
personales. La copia renovada del login se conserva para la siguiente petición;
el resto se elimina al finalizar, incluyendo errores y cancelaciones normales.
Se usa una cola por proveedor para evitar carreras de renovación de tokens:
dos peticiones a Codex se atienden sucesivamente, Codex y Claude pueden ejecutar
en paralelo dentro del límite global. Usa una sola instancia del bridge y no
renueves el mismo login desde otro CLI mientras una petición esté activa.

La cuenta se autentica **una sola vez**, en el host que ejecuta el bridge.
Por defecto se leen `~/.codex/auth.json` y `~/.claude/.credentials.json` (en Windows,
los directorios de tu perfil). `CODEX_AUTH_DIR` y `CLAUDE_AUTH_DIR` permiten cambiar
estas rutas. Si ya existe `CODEX_HOME` o `CLAUDE_CONFIG_DIR` en el entorno del
bridge, se usan como origen del login, no como estado del proceso hijo.
En Codex, si tu login está en el almacén del sistema operativo en vez de un archivo,
crea un login de archivo con:

```powershell
codex -c 'cli_auth_credentials_store="file"' login
```

Claude también admite `CLAUDE_CODE_OAUTH_TOKEN` si ya lo usas. No se copian keys
API ni se activa facturación API como fallback. Un login ausente o incompatible
produce un error explícito de `login_required`.

**Alcance del aislamiento:** se separa el contexto y el estado de las aplicaciones;
no se implementan usuarios del sistema o contenedores por usuario. El sandbox de
Codex limita escrituras, pero no garantiza que un proceso hostil no pueda leer
otras rutas legibles por la cuenta del sistema. Para esa frontera adicional hace
falta ejecutar workers con permisos/volúmenes independientes. No publiques el
bridge directamente en Internet; conserva el acceso interno del despliegue.

## Continuar editando sin volver a adjuntar

La versión más reciente de los archivos generados se guarda como adjunto en
LibreChat/Roko. En el siguiente turno, Roko la recupera automáticamente, comprobando
propietario y tenant, y la vuelve a enviar al workspace nuevo. Funciona al cambiar
entre las variantes y también entre proveedores que puedan editar ese formato.
`resendFiles` debe estar habilitado y los archivos deben seguir existiendo en el
almacenamiento de Roko. Sus volúmenes de archivos deben persistir al recrear Docker.
No dependas de `runtime/` del bridge para conservar documentos.

Un nuevo adjunto explícito tiene prioridad. Se utiliza la última salida de la rama
actual; no otra rama. Si esa última versión fue eliminada, se muestra un error y
se pide adjuntarla, sin volver silenciosamente a la original. Se conservan los
límites de salida existentes (10 archivos / 15 MiB total).

## Validación

En el bridge: `node --test test/*.test.mjs`.
Pruebas de identidad, opciones, filesystem y SDK: `node --test test/isolation.test.mjs test/providers.test.mjs`.
En Roko: `node --test scratchpad/bridge-continuation.test.cjs scratchpad/bridge-context.test.mjs`.
Para DOCX firmado, desde Roko/main:

```powershell
node scratchpad/verify-bridge-files.mjs C:\ruta\al\bridge scratchpad/input.docx scratchpad/edited.docx
```

La suite del bridge tiene 47 éxitos y 4 fallos preexistentes, reproducidos en el
ZIP original (42 éxitos y los mismos 4 fallos): expectativas antiguas de web-search,
chunking de Responses y decisiones tras un tool-result. Las 9 pruebas de Roko y
el transporte DOCX firmado pasan. La prueba de aislamiento falla deliberadamente
si se elimina la comprobación del propietario de `previous_response_id`.
No se ha probado una sesión real de las suscripciones ni una compilación completa
Docker/React/TypeScript con todas las dependencias de Roko.
