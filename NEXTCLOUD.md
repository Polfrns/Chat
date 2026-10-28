# Nextcloud independiente del workspace

Roko conecta directamente con la API de Nextcloud. Las carpetas de OMV visibles
en la cuenta Nextcloud se utilizan a través de esa cuenta. No se montan discos
del host ni se utiliza la clave compartida de roko-workspace. La gestión de
archivos de Nextcloud permanece independiente.

## Configuración

Añade a `.env` la URL canónica de Nextcloud, incluyendo el subdirectorio de
instalación si existe:

```dotenv
NEXTCLOUD_URL=https://cloud.example.com
NEXTCLOUD_LOGIN_ENABLED=true
NEXTCLOUD_AUTO_REGISTER=true
PERSISTENT_SESSIONS=true
```

`DOMAIN_CLIENT` debe coincidir con el origen desde el que se abre Roko.
El proceso API debe poder resolver y alcanzar la URL de Nextcloud y confiar en
su certificado. La URL es configuración del administrador, no un destino que
pueda cambiar el usuario o el modelo. Se rechazan redirecciones al enviar
credenciales. Para una instalación bajo `/nextcloud`, configura ese sufijo.

No hay una contraseña global de Nextcloud. Cada usuario autoriza una credencial
de aplicación mediante [Login Flow v2](https://docs.nextcloud.com/server/stable/developer_manual/client_apis/LoginFlow/index.html).
Las credenciales y los tokens de vinculación se guardan cifrados usando las
claves de cifrado existentes de LibreChat. Conserva esas claves entre reinicios.

## Entrar con Nextcloud y vincular una cuenta existente

En el login de Roko aparece **Entrar con Nextcloud**. Se abre Nextcloud en otra
pestaña; si ya hay sesión, se autoriza el acceso sin volver a crear una cuenta.
Al terminar, Roko crea automáticamente un usuario con rol USER y vincula el
acceso a archivos. No crea administradores.

Las cuentas nuevas usan internamente una dirección técnica determinista bajo
`nextcloud.invalid`: no se utiliza como buzón ni permite fusionar cuentas por
un correo de Nextcloud que no ha sido verificado por Roko. La identidad estable
es servidor Nextcloud + UID canónico + tenant.

Si ya existe una cuenta Roko con conversaciones que quieres conservar, entra
primero con esa cuenta, abre el botón Nextcloud junto a adjuntar archivos y
selecciona **Vincular mi cuenta de Nextcloud**. En adelante, entrar con esa cuenta
Nextcloud abre el mismo usuario de Roko. La misma identidad Nextcloud no puede
vincularse a otro usuario Roko del mismo tenant. No hay fusión automática por email.
La verificación en dos pasos de Roko se conserva cuando ya está habilitada.

`NEXTCLOUD_AUTO_REGISTER=false` permite únicamente identidades ya vinculadas.
`NEXTCLOUD_LOGIN_ENABLED=false` oculta y deshabilita el inicio de sesión mediante
Nextcloud, manteniendo disponible la vinculación desde una cuenta Roko.

## Archivos y herramientas

El botón Nextcloud permite navegar por carpetas y adjuntar copias al chat.
Los adjuntos siguen la validación y el procesamiento habituales de LibreChat;
adjuntar un archivo no concede permiso para modificar el original. Los cambios
en una copia del chat no se sincronizan solos con Nextcloud.

Con `NEXTCLOUD_URL` configurado, los chats de agentes disponen de
`nextcloud_files`, también al utilizar endpoints personalizados compatibles
con llamadas de herramientas. Permite listar, leer texto, proponer contenido
nuevo y guardar archivos del chat que pertenezcan al usuario. Cada invocación
resuelve las credenciales del usuario autenticado en el servidor.

Ejemplos:

- «Lista mi carpeta Proyectos de Nextcloud».
- «Lee Proyectos/notas.txt y propón corregirlo».
- «Guarda el informe generado como Informes/informe.pdf en Nextcloud».

La integración usa las [operaciones WebDAV](https://docs.nextcloud.com/server/stable/developer_manual/client_apis/WebDAV/basic.html).
Nextcloud aplica sus propios permisos, incluidas las carpetas compartidas.

## Aprobación de escrituras

Todas las escrituras generan una propuesta inmutable. El panel se abre con el
destino, tamaño y contenido anterior/propuesto para texto, o con el nombre del
archivo del chat para binarios. El usuario aprueba o rechaza desde Roko. El
modelo no dispone de una operación para aprobar sus propias propuestas.

Las propuestas están vinculadas a usuario, tenant y revisión de la conexión,
caducan a los diez minutos y solo se consumen una vez mediante una transición
atómica en MongoDB. Si se vuelve a vincular la cuenta, los permisos pendientes
dejan de ser válidos. No autorizan futuras escrituras al mismo archivo.

Una copia nueva usa `If-None-Match: *`; reemplazar un original exige su ETag
fuerte y usa `If-Match`. Si cambia desde su lectura, se rechaza la escritura.
Un conflicto o fallo de transporte no se convierte en un éxito. Tras aprobar,
el modelo puede consultar el estado de la propuesta; la aprobación no lanza
automáticamente otra generación del modelo.

El selector permite navegar por carpetas y descargar adjuntos de hasta 100 MiB;
el límite efectivo al adjuntar también depende del tamaño total, los tipos
aceptados y el límite del endpoint/modelo elegido. Los tipos no reconocidos se
adjuntan como binarios genéricos y el modelo puede no analizar su contenido.
Las propuestas de escritura siguen limitadas a 8 MiB por el tamaño máximo del
documento MongoDB que las guarda cifradas; leer y adjuntar desde `/backups` está
permitido, pero crear o reemplazar archivos en esa carpeta o sus descendientes
se rechaza en el servidor. Leer/proponer texto conserva el límite de 512 KiB y
el listado de carpeta el de 2 MiB. Esta versión no incluye borrado, movimientos,
edición colaborativa ni sincronización en segundo plano.

Desvincular elimina las credenciales guardadas y las propuestas, e intenta
revocar la credencial en Nextcloud. Si la revocación remota falla, el panel lo
indica. La asociación de identidad de login se conserva para que el próximo
acceso con Nextcloud vuelva al mismo usuario Roko.

## Sesiones persistentes

El override de Docker activa `PERSISTENT_SESSIONS=true`. El JWT de acceso sigue
teniendo su duración corta; LibreChat lo renueva usando una sesión de refresco
revocable guardada en MongoDB. Las sesiones locales/Nextcloud se crean o amplían
con fecha de expiración práctica en el año 9999, eliminando el timeout normal
por inactividad. Las sesiones ya caducadas requieren entrar de nuevo una vez.

Cerrar sesión, revocar sesiones, borrar cookies o cambiar las claves de firma
sigue invalidando el acceso. Los navegadores pueden limitar la duración de las
cookies persistentes, por ejemplo a 400 días; su renovación ocurre al refrescar
la sesión. No se promete conservar una cookie indefinidamente con el navegador
cerrado. Las sesiones OIDC gestionadas por un proveedor externo conservan las
reglas de ese proveedor.
Para desactivar posteriormente la persistencia de sesiones ya emitidas, revócalas
o cierra sesión; cambiar la variable afecta a la creación de nuevas sesiones.

## Aplicar y validar

```powershell
docker compose up -d --build api
```

La validación real debe utilizar dos usuarios Nextcloud distintos: comprobar
sus carpetas y compartidos, login nuevo y vinculado, segundo factor si procede,
copias, reemplazos aprobados, rechazo de una aprobación ajena y conflictos ETag.
Los paquetes compartidos compilaron y las cuatro suites seleccionadas de
Nextcloud/autenticación pasaron con 84 pruebas simuladas. La ejecución amplia
posterior utilizó Redis y MongoDB aislados en Docker: 14848 casos pasan, 168
fallan y 61 quedan omitidos/TODO. Entre los fallos hay tests del menú de adjuntos
que no montan el AuthProvider que ahora necesita Nextcloud. El frontend conserva
siete errores de tipos y falla al compilar por exports default de `ActivityParts`,
lo que bloquea los E2E. No se ha probado contra un Nextcloud real. Véanse el
alcance, los fallos y los requisitos de preparación en [TESTS.md](TESTS.md).
