# DNS y nombres de host del chart

El Deployment admite `dnsPolicy`, `dnsConfig` y `hostAliases` en el nivel raíz de
[values.yaml](values.yaml). `dnsPolicy` vacío omite el campo y conserva el default
de Kubernetes. `dnsConfig: {}` y una lista vacía de aliases no generan entradas.

## Ejemplos de valores

Para ajustar opciones manteniendo la resolución del cluster:

```yaml
dnsPolicy: ClusterFirst
dnsConfig:
  options:
    - name: ndots
      value: "2"
```

Si necesitas servidores DNS explícitos:

```yaml
dnsPolicy: None
dnsConfig:
  nameservers:
    - 192.0.2.53
  searches:
    - example.internal
```

La dirección anterior es ilustrativa y debe sustituirse por un resolver real.
La resolución de Services del cluster puede dejar de funcionar si omites sus
resolvers y dominios al usar `None`.

Para un host estático, el chart ya admite:

```yaml
hostAliases:
  - ip: "192.0.2.10"
    hostnames:
      - bridge.example.internal
```

Renderiza con `helm template roko helm/librechat -f roko-values.yaml` desde la
raíz y revisa `spec.template.spec`. Comprueba después resolución y conectividad
desde un pod: renderizar YAML no demuestra que un DNS responda o que Bridge esté
disponible. Estos ejemplos no son resultados de pruebas del cluster actual.
