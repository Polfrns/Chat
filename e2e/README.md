# Pruebas E2E de Roko / LibreChat

Los perfiles Playwright están en este directorio y sus comandos en
[package.json](../package.json). La selección CI de `ci/test.sh` no ejecuta estos
E2E; consulta [TESTS.md](../TESTS.md) para el alcance completo.

## Perfil mock

```sh
npm run e2e:mock
```

Compila la aplicación y utiliza `e2e/config/librechat.e2e.yaml`, un proveedor LLM
simulado mediante `LIBRECHAT_TEST_RUN_HOOK` y un usuario autenticado de prueba.
No acredita el comportamiento de una cuenta Claude/Codex real o del Bridge remoto.
Los perfiles local y CI normal pueden necesitar servicios y configuración propios.

## Grabar una interacción

```sh
npm run e2e:record
```

Compila, prepara la sesión mock y abre codegen en `/c/new`, por defecto con puerto
3333 para no colisionar con la API habitual 3080. Las grabaciones se escriben en
`e2e/recordings/` y no se incorporan automáticamente a la suite.

Para usar la configuración local real:

```sh
npm run e2e:record:local
```

La herramienta admite opciones como:

```sh
node e2e/setup/record.js --url=http://localhost:3080/c/new
node e2e/setup/record.js --profile=local --no-output
node e2e/setup/record.js --auth-only
```

Revisa cada grabación antes de convertirla en un spec de `e2e/specs/mock/`.
Usa los helpers compartidos, selectores por rol/etiqueta o `data-testid`, datos
deterministas y aserciones del resultado. Evita sleeps fijos y registros que
contengan credenciales o documentos reales. La fixture de deployment skill se
mantiene como entrada del test, no como guía operativa del producto.
