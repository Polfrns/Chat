# Esquemas y persistencia

`@librechat/data-schemas` contiene esquemas Mongoose, tipos, fábricas de modelos
y métodos de persistencia compartidos por Roko. Se construye desde el monorepo.

| Directorio | Responsabilidad |
| --- | --- |
| `src/schema` | Definiciones de campos, índices y validación |
| `src/types` | Tipos públicos y documentos |
| `src/models` | Fábricas de modelos y plugins |
| `src/methods` | Operaciones sobre los modelos inyectados |
| `src/config` | Contexto de tenant y configuración compartida |
| `src/migrations` | Migraciones explícitas de índices |
| `src/utils` | Utilidades de persistencia |

[src/index.ts](src/index.ts) es la entrada pública: exporta `createModels`,
`createMethods`, tipos y utilidades de contexto. Evita crear una conexión global
en un esquema o hacer depender la lógica de una instancia de producción.

## Modelos de Roko

[ChatSession](src/schema/chatSession.ts) usa `owner`, `name`, `filestoreUids`,
`tenantId` y timestamps. `Conversation.sessionId` relaciona conversaciones con
esa sesión; no es la sesión de refresh-token de autenticación.

[User](src/schema/user.ts) normaliza el correo a minúsculas y define unicidad
compuesta de `email + tenantId`. Cambiar un índice no fusiona datos antiguos.
Los métodos de sesión deben conservar el ámbito del propietario, además del
ámbito de tenant aplicable.

## Aislamiento de tenant

[tenantContext.ts](src/config/tenantContext.ts) proporciona contexto y claves
acotadas. El plugin [tenantIsolation.ts](src/models/plugins/tenantIsolation.ts)
centraliza reglas de consultas; las utilidades de escrituras masivas y las
migraciones tienen sus propias pruebas. No sustituyas esas fronteras por filtros
ad hoc dispersos ni uses `runAsSystem` para eludir una comprobación de usuario.

## Compilación y pruebas

Desde la raíz:

```sh
npm run build:data-schemas
npm run test:packages:data-schemas
```

Los tests protegen métodos con lógica, aislamiento y migraciones, no solo la
forma del objeto. Consulta [TESTS.md](../../TESTS.md) para el alcance CI.
Los [experimentos FerretDB](misc/ferretdb/ferretdb-multitenancy-plan.md) son una
evaluación separada; el Compose principal continúa usando MongoDB.
