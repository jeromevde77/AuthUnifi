# Caddy avec le plugin DNS OVH, pour obtenir un certificat Let's Encrypt via le
# challenge DNS-01 (validation par enregistrement DNS, AUCUN port entrant requis).
# Idéal pour un portail purement local : le Pi n'est jamais exposé sur Internet.
FROM caddy:2-builder AS builder
RUN xcaddy build --with github.com/caddy-dns/ovh

FROM caddy:2
COPY --from=builder /usr/bin/caddy /usr/bin/caddy
