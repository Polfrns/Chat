# Temas del paquete de UI

La entrada pública [index.ts](index.ts) exporta `ThemeProvider`, `useTheme`,
`ThemeContext`, `isDark`, `applyTheme`, tipos, átomos y temas incluidos.

## Contrato

`ThemeProvider` acepta `children`, `initialTheme`, `themeRGB` y `themeName`.
`useTheme()` ofrece `theme`, `setTheme`, `themeRGB`, `setThemeRGB`, `themeName`,
`setThemeName` y `resetTheme`. El modo admite light, dark o system. El modo system
observa la preferencia del dispositivo; `isDark` permite resolver el modo efectivo.

Las props inicializan el estado al montar. Para cambios posteriores usa los
setters del contexto; cambiar una prop no equivale a reinicializar el provider.
El estado se conserva en localStorage con las claves `color-theme`, `theme-colors`
y `theme-name`. `resetTheme` retira las propiedades CSS personalizadas.

## Colores

Usa [IThemeRGB](types/index.ts): las claves tienen formato `rgb-text-primary`,
`rgb-surface-primary`, etc. Los valores son canales separados por espacios,
por ejemplo `255 255 255`, no hexadecimales ni cadenas `rgb(...)`.

```tsx
import { ThemeProvider } from '@librechat/client';

<ThemeProvider
  initialTheme="system"
  themeName="Roko"
  themeRGB={{ 'rgb-text-primary': '230 230 230' }}
>
  <App />
</ThemeProvider>;
```

[applyTheme](utils/applyTheme.ts) valida canales entre 0 y 255 y aplica variables
CSS como `--text-primary: rgb(230 230 230)` en el elemento raíz. Los nombres
admitidos están definidos en el mapa de esa función y los tipos compartidos.

No existe en este módulo una carga automática de temas desde variables `.env`.
Si se necesita, el código que consume el provider debe cargar y validar esos
valores. Evita duplicar otro estado global de tema o manipular las mismas
variables CSS desde un componente independiente del provider.

La estructura es `context/` para React, `atoms/` para estado, `types/` para
contratos, `themes/` para paletas y `utils/` para aplicación y mapeo. Para ejecutar
las suites del cliente consulta [TESTS.md](../../../../TESTS.md).
