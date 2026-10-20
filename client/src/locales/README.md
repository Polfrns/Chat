# Traducciones de la interfaz

La aplicación usa i18next con JSON en `<idioma>/translation.json`.
[i18n.ts](i18n.ts) registra los recursos y la resolución de idioma. Los textos
específicos de Roko deben mantenerse aquí junto al resto de la interfaz.

## Modificar un texto

1. Reutiliza una clave existente si su significado coincide.
2. Si añades una clave, actualiza la base inglesa y los idiomas mantenidos para
   esa función, especialmente español e inglés en las pantallas Roko.
3. Conserva interpolaciones, pluralización y formato de i18next.
4. Usa el hook de localización existente en los componentes y revisa la interfaz
   con los idiomas afectados. No supongas que una clave nueva se sincroniza sola
   con un servicio externo de traducción.

El selector está en
[General.tsx](../components/Nav/SettingsTabs/General/General.tsx).
Al añadir un idioma revisa también su registro y metadatos, no solo un JSON.

La utilidad de [config/translations](../../../config/translations/README.md)
conserva un flujo antiguo basado en archivos TypeScript; no es el procedimiento
actual para editar estos recursos JSON.
