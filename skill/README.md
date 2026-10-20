# Skills de despliegue

Este directorio contiene skills compartidas que el servidor carga al arrancar.
Cada skill vive en una carpeta con `SKILL.md` y, opcionalmente, recursos:

```text
skill/
  analysis-kit/
    SKILL.md
    references/
      notes.md
```

La ubicación por defecto es `skill`; `DEPLOYMENT_SKILLS_DIR` permite sustituirla.
La carga y validación están en
[deployment.ts](../packages/api/src/skills/deployment.ts). Estas skills se exponen
en lectura a los usuarios con Skills habilitado y no se persisten como documentos
Skill en MongoDB. Reinicia el servidor después de cambiar su contenido.

En Docker, incluye los archivos en la imagen o monta el directorio configurado.
Crear `/app/skill` vacío no incorpora por sí solo tus skills. No confundas este
directorio con las skills personales del CLI del Bridge ni con la fixture
[E2E](../e2e/fixtures/deployment-skills/e2e-deployment-skill/SKILL.md).
