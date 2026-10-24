# Especificación actual de Roko

Estado del código revisado el 20 de octubre de 2026. Esta especificación describe
el repositorio; no certifica la versión instalada en servidores externos.

## Arquitectura

Roko conserva el monorepo LibreChat: `api/` sirve Express y sus rutas existentes;
`packages/api` aporta lógica TypeScript; `packages/data-provider` comparte contratos;
`packages/data-schemas` define persistencia MongoDB; `client/` y `packages/client`
contienen aplicación y componentes React. El paquete raíz declara `v0.8.6`.

```mermaid
flowchart LR
  UI[Cliente React] --> API[API Roko]
  API --> DB[(MongoDB)]
  API --> Bridge[Bridge externo: Claude / Codex]
  API --> FS[leedeo-filestore: REST / MCP]
  API -. telemetría filtrada .-> LF[Langfuse]
  Bridge -. contexto firmado .-> LF
```

El Compose base también define Meilisearch, vectordb y rag_api. Redis se configura
aparte cuando se necesita coordinación entre instancias. El pipeline de este
repositorio despliega el servicio `api`; Bridge y filestore se operan por separado.

## Identidad y registro

Cada usuario tiene un correo normalizado a minúsculas. El índice de usuarios es
único para **`email + tenantId`**: impide duplicados dentro del mismo tenant, permite
varios usuarios con distintos correos y no impone unicidad global entre tenants.

El registro comprueba el usuario existente y las colisiones del índice. Una
colisión devuelve HTTP 409 con código `EMAIL_ALREADY_EXISTS`; el cliente muestra
el error localizado. Este cambio no fusiona ni repara automáticamente datos
duplicados de instalaciones anteriores.

Fuentes: [esquema de usuario](packages/data-schemas/src/schema/user.ts) y
[AuthService](api/server/services/AuthService.js).

## Sesiones y almacenamiento

Una sesión Roko agrupa varias conversaciones. `Conversation.sessionId` referencia
`ChatSession`, distinto de las sesiones de autenticación. Sus campos son:

| Campo | Invariante |
| --- | --- |
| `name` | Obligatorio, trim, máximo 150 caracteres |
| `owner` | Identidad del propietario |
| `filestoreUids` | Lista ordenada de identificadores opacos de filestore |
| `tenantId` | Ámbito de tenant cuando corresponde |
| `createdAt`, `updatedAt` | Timestamps de MongoDB |

El índice `{owner, updatedAt}` sirve al listado. La asignación de conversaciones,
el acceso a sesiones y las decisiones de permisos se validan en el servidor.
Las rutas de sesión requieren autenticación JWT de Roko.

### Integración con leedeo-filestore

[RokoClient](packages/api/src/roko/client.ts) conecta a `ROKO_SERVER_URL` usando
`ROKO_API_KEY`, un bearer de servicio. **No emite un JWT de usuario por petición
para el filestore externo.** La autorización por sesión de Roko se aplica en sus
rutas y hooks; los permisos del servicio externo corresponden también a la cuenta
asociada a esa API key.

`runtime-config.yaml` configura el MCP `leedeo-filestore` en `${ROKO_SERVER_URL}/mcp`.
La API de gestión externa usa `/api/filestores/` y UIDs. El cliente implementa
listado, creación, consulta, edición, borrado y operaciones de archivos. La
desregistración interna no se expone como una ruta pública de usuario de Roko.

Los hooks anteriores y posteriores a las herramientas distinguen filestores ya
adjuntos y accesos que requieren confirmación. La creación puede proponer nombre,
descripción y opciones al usuario. Las decisiones se distribuyen mediante SSE y
los almacenes de solicitudes; Redis permite coordinación entre instancias, con
alternativa en memoria para una sola instancia. Una solicitud pendiente tiene
caducidad; no equivale a un permiso permanente sobre cualquier filestore.

### Rutas de sesión

La implementación completa y sus parámetros están en
[sessions.js](api/server/routes/sessions.js).

| Método | Ruta relativa a `/api/sessions` | Operación |
| --- | --- | --- |
| GET / POST | `/` | Listar / crear sesiones |
| PUT | `/chats/:conversationId` | Asignar conversación |
| GET / PATCH / DELETE | `/:sessionId` | Consultar / renombrar / borrar |
| GET | `/:sessionId/chats` | Listar conversaciones |
| GET / POST | `/:sessionId/filestores` | Consultar / adjuntar filestores |
| DELETE | `/:sessionId/filestores/:filestoreUid` | Desadjuntar |
| GET | `/:sessionId/filestore-requests/stream` | Eventos SSE |
| GET | `/:sessionId/filestore-access-requests` | Solicitudes de acceso |
| POST | `/:sessionId/filestore-access-requests/:filestoreUid/:decision` | Decidir acceso |
| GET | `/:sessionId/filestore-creation-requests` | Solicitudes de creación |
| POST | `/:sessionId/filestore-creation-requests/:requestId/:decision` | Confirmar o rechazar creación |

Las rutas `/api/filestores` adaptan la gestión del servicio externo. El servicio
SQLite/JWT de [packages/roko-server](packages/roko-server/README.md) conserva un
contrato anterior y no es intercambiable con el filestore externo.

## Nextcloud e inicio de sesión

La integración de Nextcloud es independiente del filestore. Con `NEXTCLOUD_URL`
configurado, Roko utiliza Login Flow v2 y WebDAV bajo la raíz del UID canónico
del usuario. Las credenciales de aplicación se cifran en MongoDB; ninguna
credencial compartida sustituye a la cuenta personal. Consultas, vinculaciones
y propuestas se filtran explícitamente por propietario y tenant.

El login con Nextcloud puede provisionar una cuenta USER sin registro separado.
Una identidad previamente vinculada abre la cuenta Roko existente; no se fusionan
usuarios por coincidencia de email. Las cuentas nuevas usan un email técnico
determinista `@nextcloud.invalid`. Las vinculaciones de identidad son únicas
por servidor + UID + tenant y se conservan al revocar el acceso a archivos.
El flujo anónimo está ligado a un nonce HttpOnly del navegador y al tenant.
La verificación adicional de Roko se mantiene al emitir su sesión.

`nextcloud_files` ofrece lectura y propuestas de escritura a los chats de
agentes. El panel reconoce colecciones DAV para navegar y adjunta archivos
individuales, incluidos tipos no reconocidos que se etiquetan como binarios
genéricos. La descarga desde Nextcloud admite hasta 100 MiB, sujeta además a
los límites de tamaño y tipo del endpoint/modelo. `/backups` y sus descendientes
permiten leer y adjuntar, pero rechazan escrituras tanto al proponer como al
ejecutar una propuesta. Las escrituras restantes se limitan a 8 MiB para caber
en el documento cifrado de MongoDB. Una propuesta guarda la revisión de la
cuenta, caduca y se consume atómicamente una sola vez. Las copias no sobrescriben
y los reemplazos exigen un ETag fuerte. El modelo no puede aprobar mediante sus
herramientas. No hay sincronización automática entre copias del chat, Nextcloud
y filestore.

`PERSISTENT_SESSIONS=true`, activado en el override Docker, conserva sesiones
locales/Nextcloud sin caducidad práctica por inactividad (fecha del año 9999),
manteniendo acceso JWT corto y revocación de sesiones. Las cookies siguen
sujetas a los límites del navegador y OIDC externo mantiene sus propias reglas.
Configuración, límites y rutas de uso: [NEXTCLOUD.md](NEXTCLOUD.md).

## Modelos y Bridge

Los endpoints personalizados usan seis alias: `gpt-codex`, `gpt-codex-fast`,
`gpt-codex-deep`, `claude-max`, `claude-max-fast`, `claude-max-deep`. Comparten
una matriz de capacidades para parámetros y normalización; los valores efectivos
se incluyen en el contexto firmado. Véase [CLI-BRIDGE.md](CLI-BRIDGE.md).

El adaptador solo firma solicitudes a la URL fija configurada y rechaza
redirecciones. Firma usuario, tenant, conversación, modelo, opciones y tiempo.
Los controles de sampling y tokens no expuestos por los SDK se deshabilitan y se
retiran de configuraciones guardadas. Cambiar de proveedor elimina opciones
incompatibles. Al reenviar Responses se eliminan elementos opacos de reasoning,
conservando mensajes y pares de llamadas/resultados.

El código OAuth de `packages/api/src/endpoints/claude` sigue presente. Es una
integración distinta del endpoint personalizado Claude Max que usa Bridge.

### Memorias y herramientas del chat

`runtime-config.yaml` habilita memorias personales con actualización automática
mediante el proveedor `ChatGPT Codex`, modelo `gpt-codex-fast`. La ejecución real
requiere que el Bridge admita las llamadas de herramientas del agente de memoria.
Se mantienen los controles de personalización y la gestión manual de memorias.

Los menús habilitan búsqueda web, búsqueda de archivos, ejecución de código,
artifacts, skills y gestión de MCP. Los parámetros readonly conservan su control
visible en gris, deshabilitado y sin un setter efectivo.

El botón Web Search y el parámetro de endpoints personalizados consultan el
mismo estado: `conversation.web_search` para Codex Bridge y
`ephemeralAgent.web_search` para otros proveedores personalizados, como LM Studio.
Claude Bridge conserva el control deshabilitado según su matriz de capacidades.
La búsqueda mediante herramienta mantiene la comprobación de credenciales de
LibreChat; Codex no necesita las credenciales de Serper/Jina para su búsqueda nativa.

Compose proporciona un valor por defecto para `LMSTUDIO_BASE_URL` que conserva
la dirección anterior. `LIBRECHAT_CODE_BASEURL` permite conectar el sandbox
compatible con la librería de agentes; habilitar la capacidad de código no crea
ese servicio. El MCP futuro de edición/workspace queda como plantilla comentada,
sin conexión ni herramientas ficticias. Véase [CHAT-TOOLS.md](CHAT-TOOLS.md).

## Actividad de la respuesta

El cliente agrupa comentario de progreso, partes THINK y herramientas en
**Actividad de la respuesta**. El grupo se abre durante la generación, se pliega
al terminar y permite reapertura manual. Respuesta final, errores y adjuntos
descargables quedan visibles fuera del grupo. Las columnas de agentes mantienen
sus propios grupos.

Los registros Bridge V1 se interpretan únicamente para presentación: no habilitan
ejecución. Se conserva el orden del comentario intercalado y una sola tarjeta por
operación al recibir cambios de estado. Los códigos públicos reconocidos de
`bridgeActivityDescriptions.json` mantienen compatibilidad; un código desconocido
no adquiere significado por su etiqueta. La explicación breve puede aprovechar
descripciones y parámetros observados, sin atribuir acciones internas no emitidas
por el SDK. El resultado distingue errores y validación parcial o no disponible.

La interfaz actual muestra explicaciones concisas, sin un panel de argumentos,
comandos o rutas técnicas. Los datos del chat y la copia exportada a Langfuse son
canales separados: cambiar el modo de privacidad de trazas no controla lo que
renderiza el chat. Solo se muestran comentarios y resúmenes públicos del
proveedor, no razonamiento interno privado.

### Tiempos

Las herramientas muestran segundos, con decimales cuando procede. Un intervalo
positivo menor de una décima aparece como `<0,1 s`; la ausencia de un comienzo
fiable no se convierte en una ejecución ficticia de cero segundos. La procedencia
puede ser tiempo de ejecución, tiempo del proveedor o intervalo observado entre
eventos; no todos representan tiempo de CPU ni duración completa del comando.

El encabezado comparte el contador general de generación: incluye la espera
anterior al primer evento y se detiene al acabar el envío. Usa un reloj monotónico
durante el montaje. Ese total **no se persiste**: al recargar una conversación
antigua no se inventa un total histórico. No se asigna un tiempo ficticio a cada
fragmento de pensamiento.

## Archivos generados y previsualización

Los archivos se persisten en el almacenamiento de Roko. Los enlaces Markdown se
resuelven contra los adjuntos de la respuesta actual y usan la descarga
autenticada del archivo correspondiente. Se conserva `metadata.originalFilename`
como basename público. Nombres ambiguos y enlaces externos no se redirigen a un
archivo supuesto; normalizar referencias sandbox no habilita traversal.

PDF, imágenes, texto y medios compatibles con el navegador pueden tener preview.
HTML sin convertir se muestra como texto. Office utiliza la conversión existente
y su ciclo pending/ready/failed mediante
[Files/preview.js](api/server/services/Files/preview.js); el HTML convertido se
aísla en un iframe sin scripts ni same-origin. El fallo de preview no elimina la
descarga. Los archivos antiguos sin conversión pueden necesitar regenerarse.

Las continuaciones recuperan la última salida de la rama actual, verificando
propietario y tenant, y la envían al nuevo workspace del Bridge. Un adjunto nuevo
explícito tiene prioridad. Una salida eliminada genera un error; no se sustituye
silenciosamente por una versión anterior.

## Telemetría y entrega

La raíz `roko.interaction` engloba el streaming. La exportación filtra una copia,
mantiene identidad seudonimizada de sesión y separa contabilidad Bridge y Roko.
La configuración, la propagación firmada y sus límites se documentan en
[OBSERVABILITY.md](OBSERVABILITY.md).

El Dockerfile aplica el parche de instrumentación, compila el frontend y hace
depender la imagen de producción de la etapa CI. GitHub Actions publica imágenes
identificadas por digest y despliega `api` mediante snapshots de configuración,
comprobación de salud y rollback. [CI-CLOUD.md](CI-CLOUD.md) describe ese contrato;
[TESTS.md](TESTS.md) distingue la selección CI del resto de suites disponibles.
