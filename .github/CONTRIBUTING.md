# Contribuir a Roko

Lee [SPEC.md](../SPEC.md), [TESTS.md](../TESTS.md),
[AGENTS.md](../AGENTS.md) y [AGENT-REVIEW.md](../AGENT-REVIEW.md) antes de un cambio
significativo. Las instrucciones de agentes y el criterio de diseño se mantienen
en esos documentos; no se duplican aquí.

## Entorno

Usa Node 24 y npm según [package.json](../package.json). Instala desde la raíz con
`npm ci`, aplica `npm run observability:patch` y compila con `npm run frontend`.
Configura el entorno local según [README.md](../README.md) y [DEPLOY.md](../DEPLOY.md).
Los servicios externos y sus credenciales no se incluyen en el checkout.

## Organización del cambio

- Mantén los contratos compartidos en `packages/data-provider` y los esquemas en
  `packages/data-schemas`; las rutas Express siguen en `api/`.
- Declara tipos para estructuras con significado, conserva límites de tenant y
  propietario y evita acoplar lógica a transportes externos.
- Localiza los textos de interfaz en los JSON de `client/src/locales/`.
- Haz cambios de frontend dentro de los componentes y utilidades existentes;
  usa los patrones de estado y acceso a datos del área modificada.
- Actualiza la especificación cuando cambie una interfaz o un invariante y
  `TESTS.md` cuando cambien las garantías de pruebas.

Trabaja en una rama para cambios significativos y presenta una PR con alcance
concreto. El título del commit debe tener menos de 72 caracteres. No incluyas
`.env`, claves, credenciales CLI, datos ni artefactos temporales de `scratchpad/`.

## Verificación y revisión

Selecciona pruebas que puedan detectar el fallo o el cambio real. Distingue
pruebas unitarias, integración simulada y validación del proveedor desplegado.
Los comandos y la selección CI están en [TESTS.md](../TESTS.md); `test:all` no
incluye todos los grupos Node, configuración o E2E.

En la PR explica qué cambió, por qué, qué comprobaste y qué queda pendiente.
Incluye capturas para cambios de UI cuando ayuden a revisar el comportamiento.
No presentes resultados de otra revisión como evidencia del cambio actual.
