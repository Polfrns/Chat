# Integración de Roko con Bridge

Bridge vive en un repositorio independiente. Roko se conecta mediante endpoints
compatibles con Chat Completions y Responses configurados en
[runtime-config.yaml](runtime-config.yaml). Esta guía describe el contrato actual,
no una instalación mediante ZIP ni una versión remota garantizada.

## Conexión e identidad

`ROKO_BRIDGE_BASE_URL` fija el origen y ruta autorizados. Los `baseURL` de Codex y
Claude Max deben apuntar a ese destino. `CLAUDE_BRIDGE_KEY` en Roko coincide con
`BRIDGE_API_KEY` en Bridge y tiene al menos 32 caracteres.

Roko firma un contexto HMAC con usuario autenticado, tenant, conversación,
modelo, opciones efectivas y timestamp. El bearer sigue siendo necesario.
Identidad sin firma, `body.user` o metadata aportada por el cliente no sustituyen
esa verificación. El adaptador rechaza destinos ajenos y redirecciones.

## Modelos y parámetros

| Alias normal | Alias rápido | Alias profundo | Esfuerzo inicial normal / rápido / profundo |
| --- | --- | --- | --- |
| `gpt-codex` | `gpt-codex-fast` | `gpt-codex-deep` | medium / low / high |
| `claude-max` | `claude-max-fast` | `claude-max-deep` | medium / low / high |

El modelo real lo decide la configuración de Bridge. El esfuerzo explícito tiene
prioridad sobre el preset; Auto conserva la selección del preset. El proveedor
puede rechazar un nivel aunque el SDK lo acepte para otro modelo o cuenta.

| Control | Codex | Claude |
| --- | --- | --- |
| Esfuerzo | minimal, low, medium, high, xhigh, max, ultra, persistent | low, medium, high, xhigh, max |
| Resumen público | default, auto, concise, detailed, none | Sin control Codex |
| Verbosidad | low, medium, high | Sin control Codex |
| Búsqueda web nativa | Booleano explícito, también se firma `false` | No habilitada por ese control |
| Temperatura, top-p, penalizaciones, stop, límite de salida API | No expuestos por el SDK integrado | No expuestos por el SDK integrado |

Default y Auto del resumen son opciones distintas. `none` desactiva la inclusión
de resúmenes públicos. La normalización elimina opciones antiguas incompatibles
y mantiene defaults válidos. Cambiar a Claude retira resumen, verbosidad y búsqueda
nativa de Codex. `maxContextTokens` limita historial en Roko, no amplía la ventana
real del modelo. El interruptor Responses selecciona el transporte a Bridge.

La fuente de capacidades del lado Roko es el código compartido de parámetros;
[bridge-parameters.test.cjs](scripts/bridge-parameters.test.cjs) comprueba la
normalización y los valores firmados. Permisos, sandbox, rutas y herramientas de
CLI se administran en Bridge, no mediante parámetros libres del usuario.

## Login y aislamiento del Bridge

Bridge utiliza el login de la cuenta de CLI configurada en su host. No necesita
copiar credenciales de Claude/Codex a Roko. El estado de aplicación y workspace se
separan por petición; las continuaciones pertenecen al usuario, tenant,
conversación y proveedor. Un ID de continuación ajeno no permite acceso.

El HOME temporal copia el login autorizado, no instrucciones, MCP, memorias o
sesiones personales. La renovación del login se serializa por proveedor. Una
instancia debe ser la responsable de ese estado compartido. Este aislamiento de
aplicación no equivale a usuarios de sistema o contenedores independientes.

## Actividad progresiva

Bridge debe emitir eventos públicos durante la ejecución: inicio, progreso,
finalización, error o cancelación de operaciones reales, más el comentario público
que entregue el proveedor. Roko no puede recuperar eventos que Bridge envíe solo
al final ni acciones que el SDK no exponga.

Los registros V1 se deduplican por operación y mantienen el orden del comentario.
Los códigos reconocidos en
[bridgeActivityDescriptions.json](client/src/components/Chat/Messages/Content/bridgeActivityDescriptions.json)
son identificadores de protocolo; al añadir códigos hay que mantener compatible
el catálogo de Bridge. Los registros se usan para presentación, no para ejecutar
acciones. Las explicaciones deben basarse en descripción, argumentos y resultado
observados; no afirmar una validación completa por un simple exit code cero.

El chat agrupa la actividad en un desplegable y muestra explicaciones breves,
sin el panel técnico anterior. Los tiempos son segundos; el contador del
encabezado mide la generación general mientras está montado. La procedencia y
los límites de esas medidas están en [SPEC.md](SPEC.md). Los ajustes de privacidad
de Langfuse solo afectan a la exportación, véase [OBSERVABILITY.md](OBSERVABILITY.md).

## Archivos y continuación

Bridge entrega salidas recogidas y validadas mediante su protocolo de adjuntos.
Roko guarda el archivo, su basename original y sus metadatos; no publica una ruta
privada del workspace como enlace descargable. El Markdown de la misma respuesta
se asocia al archivo concreto mediante el flujo de descarga autenticado.

Con `resendFiles` activo, el siguiente turno recupera la última salida de la rama
actual y la envía al workspace nuevo después de verificar propietario y tenant.
Un nuevo adjunto explícito tiene prioridad. Si falta la última versión se informa
del error, sin retroceder silenciosamente a la original. Los límites del protocolo
de salida son 10 archivos y 15 MiB en total.

La preview nativa y la conversión Office se resuelven en Roko. No requieren que
Bridge permita rutas públicas ni ejecute HTML en el chat. La fidelidad y los
formatos dependen de los conversores y códecs disponibles.

## Operación

Roko usa un timeout configurable `ROKO_BRIDGE_REQUEST_TIMEOUT_MS`, default
620000 ms, para dejar margen sobre Bridge. Ajusta los dos servicios si una tarea
legítima necesita más tiempo. Aumentar el timeout no instala compiladores,
dependencias ni conversores ausentes en el workspace.

Las suites del Bridge deben ejecutarse en su repositorio y con sus propias
instrucciones. No se mantienen aquí resultados de ZIP antiguos ni comandos que
dependan de scripts temporales de `scratchpad/`. Para Roko véase [TESTS.md](TESTS.md).
