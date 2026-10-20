# Utilidad de traducción heredada

Los scripts de este directorio pertenecen al flujo anterior de localización,
basado en archivos TypeScript de `client/src/localization/languages/`.
La interfaz actual utiliza JSON en `client/src/locales/<idioma>/translation.json`.

Para cambios en Roko sigue
[la guía vigente de traducciones](../../client/src/locales/README.md).
No ejecutes esta utilidad esperando que actualice automáticamente esos JSON:
sus entradas, salidas y dependencias necesitan adaptación previa al formato actual.

Se conserva el código como referencia de la utilidad upstream, no como paso del
build, de la CI o del despliegue. No es necesario contratar una API de traducción
ni preparar una base vectorial para mantener los textos locales de la aplicación.
