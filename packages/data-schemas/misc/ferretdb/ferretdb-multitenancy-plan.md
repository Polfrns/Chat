# FerretDB: evaluación experimental

Este directorio conserva pruebas de compatibilidad y exploración para FerretDB.
No describe una migración activa de Roko ni acredita rendimiento o seguridad de
una instalación de producción. El Compose principal utiliza MongoDB.

## Material disponible

- [docker-compose.ferretdb.yml](docker-compose.ferretdb.yml): entorno experimental.
- [jest.ferretdb.config.mjs](jest.ferretdb.config.mjs): selecciona los
  `*.ferretdb.spec.ts` de este directorio; no se ejecuta en CI.
- `multiTenancy` y `sharding`: comportamiento de aislamiento y particionado.
- `aclBitops`, `orgOperations`, `migrationAntiJoin`: operadores usados por permisos,
  organizaciones y migraciones.
- `promptLookup`, `randomPrompts`, `pullAll`, `pullSubdocument`: consultas y
  actualizaciones concretas que necesitan compatibilidad verificable.

## Ejecución independiente

Usa una base desechable sin datos de usuarios. Desde `packages/data-schemas`, con
las dependencias instaladas y el entorno experimental configurado:

```sh
docker compose -f misc/ferretdb/docker-compose.ferretdb.yml up -d
```

Define `FERRETDB_URI` para la instancia de prueba. El comando que declara la
configuración de Jest es:

```sh
npx jest --config misc/ferretdb/jest.ferretdb.config.mjs --testTimeout=300000
```

No se ha ejecutado este entorno como parte de la revisión documental. Un resultado
de compatibilidad de un operador no demuestra soporte completo de Mongoose,
aislamiento de todas las consultas ni capacidad bajo carga. Antes de una adopción,
contrasta todos los operadores, índices, migraciones y consultas reales, y mide
con un conjunto de datos y versiones reproducibles. No se conservan umbrales de
latencia o capacidad sin medición vigente.
