# Redis de desarrollo

Estos archivos ofrecen entornos locales opcionales. El Compose principal de Roko
no crea Redis. La coordinación de solicitudes entre varias instancias requiere
un backend compartido; el fallback en memoria solo coordina un proceso.

## Cluster local

Con Bash, `redis-server` y `redis-cli` instalados, desde la raíz:

```sh
bash redis-config/start-cluster.sh
redis-cli -c -p 7001 cluster info
bash redis-config/stop-cluster.sh
```

El script inicia tres nodos en los puertos 7001, 7002 y 7003, sin réplicas.
Los archivos `redis-7001.conf`, `redis-7002.conf`, `redis-7003.conf` definen esos
nodos; el estado se guarda bajo este directorio. Es un entorno de desarrollo,
no un despliegue de alta disponibilidad.

## TLS heredado

[redis-tls.conf](redis-tls.conf) deshabilita el puerto sin TLS y configura TLS en
6380. Tanto sus rutas de certificados como la ruta del config en
[start-redis-tls.sh](start-redis-tls.sh) están fijadas a un directorio personal de
otro entorno. El mensaje de ese script menciona además 6379, que no coincide con
el puerto TLS del archivo. **Necesitan adaptar rutas y certificados antes de usarlo.**

La revisión documental no modifica esos scripts ni proporciona certificados
válidos para otro host. No desactives la validación de certificados para compensar
una ruta o nombre incorrecto.

## Conexión de la aplicación

Consulta las variables Redis de [.env.example](../.env.example) y el cliente del
servidor antes de elegir URL, cluster o TLS. El contenedor debe poder alcanzar
las direcciones anunciadas por Redis; `127.0.0.1` de un nodo local no es el host
desde otro contenedor. Un `PING` correcto no demuestra que el pub/sub o las
operaciones de cluster usadas por la aplicación estén configuradas correctamente.
