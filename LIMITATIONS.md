# Límites actuales

## Actividad y tiempos

- Solo se muestran eventos y resúmenes públicos que el proveedor o Bridge emiten.
  No se recupera razonamiento privado ni cada operación de lectura dentro de un shell.
- La descripción se basa en datos observados. Un comando opaco no demuestra la
  intención exacta del usuario; exit code cero no garantiza la corrección del archivo.
- La interfaz muestra explicaciones breves. Los argumentos, comandos y rutas del
  registro no se presentan como un panel técnico.
- Un SDK puede no comunicar el inicio real. Un intervalo observado mide eventos,
  no necesariamente toda la ejecución. Los segundos no eliminan esa limitación.
- El contador del encabezado incluye espera y generación mientras está montado;
  no se persiste y no aparece como una duración histórica inventada tras recargar.
- El streaming depende del proveedor, de Bridge y de los proxies intermedios.
  Agrupar tarjetas en React no convierte una salida final en eventos incrementales.

## Archivos y herramientas

- Preview depende de formato, tamaño, tiempo de conversión y códecs disponibles.
  HTML original se muestra como texto; Office convertido se aísla en sandbox.
- Un fallo de preview conserva la descarga. Archivos antiguos sin conversión
  pueden requerir regeneración. No existe soporte universal para cualquier binario.
- Los enlaces se resuelven entre los adjuntos de la respuesta actual; nombres
  ambiguos no se asignan al primer archivo arbitrariamente.
- Bridge necesita sus compiladores, librerías y conversores. Ampliar un timeout
  no permite producir un ejecutable de otra plataforma sin el toolchain adecuado.
- El workspace Bridge es efímero. Continuar una edición depende de los archivos
  persistidos en Roko, sus permisos y `resendFiles`.

## Aislamiento y permisos

- El correo es único por `email + tenantId`, no globalmente entre todos los tenants.
  La protección de registro no repara duplicados antiguos automáticamente.
- El Bridge usa aislamiento de estado de aplicación, no una cuenta de sistema o
  contenedor independiente por usuario. Los permisos del host siguen siendo relevantes.
- Roko accede al filestore externo con una API key de servicio. Los permisos de
  sesión de Roko no sustituyen los permisos de esa cuenta en el servicio externo.
- El fallback de solicitudes en memoria no coordina procesos distintos. Para
  varias instancias hay que configurar el transporte compartido correspondiente.

## Telemetría y verificación

- Langfuse recibe exportaciones acotadas y de mejor esfuerzo. Una caída puede
  perder observaciones; un proceso terminado abruptamente puede dejar spans sin exportar.
- Los proyectos Langfuse separados no se fusionan en un árbol automáticamente.
- Debug permite texto saneado y limitado; no equivale a clasificar toda información
  confidencial posible. Los filtros nuevos no eliminan trazas antiguas.
- Alias Bridge nuevos requieren revisar la política de contabilidad para evitar
  duplicar uso/coste. Los procesos internos no expuestos no se desglosan ficticiamente.
- La selección CI no ejecuta la suite completa ni modelos reales. Consulta
  [TESTS.md](TESTS.md) antes de interpretar un build verde como validación del producto.

Arquitectura: [SPEC.md](SPEC.md). Operación: [DEPLOY.md](DEPLOY.md).
Privacidad y comprobaciones: [OBSERVABILITY.md](OBSERVABILITY.md).
