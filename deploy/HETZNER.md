# FODBS on the family-net Hetzner CX23

FODBS stays a separate Compose project. It does not replace Caddy, Headscale,
RustDesk, or family-api. This page is the deploy note. It does not run the
deploy.

## Resources

The CX23 already runs the family-net stack. FODBS adds:

- `fodbs-server` capped at 256 MB
- `fodbs-postgres` capped at 256 MB, with no host port
- `fodbs-worker` capped at 768 MB

Chromium starts inside the worker only while a session is open, with
`--disable-dev-shm-usage`. The worker cap is the memory ceiling.

## Network

Caddy is the only public HTTP listener. FODBS joins a shared Docker network
so Caddy can reach it by container name.

```bash
docker network create fodbs-edge
```

On the server, from this repo:

```bash
docker compose -f docker-compose.yml -f deploy/docker-compose.hetzner.yml up -d --build
```

`deploy/docker-compose.hetzner.yml` drops the published `8088` port and attaches
`fodbs-server` to `fodbs-edge`. Postgres stays on the Compose network only.

## Caddy

Add the FODBS server to the family-net Caddy service. In
`family-net/vps/docker-compose.yml`, give Caddy the external network:

```yaml
services:
  caddy:
    networks:
      - default
      - edge

networks:
  edge:
    name: fodbs-edge
    external: true
```

Add this site to `family-net/vps/caddy/Caddyfile`, next to `app.{$FAMILY_DOMAIN}`:

```caddyfile
fodbs.{$FAMILY_DOMAIN} {
	encode gzip
	reverse_proxy fodbs-server:8088
}
```

DNS: an A record `fodbs.family.yk2.dev` to the same VPS address as
`app.family.yk2.dev`. Reload Caddy after the file change. Leave UFW as it is.
Ports 80 and 443 are already open for Caddy. Do not open 5432.

## Secrets

Copy `.env` to the VPS by hand, for example `/opt/fodbs/.env`. Do not commit
it. `CREDENTIALS_KEY` is 32 bytes of base64. Set `COOKIE_SECURE=true`.
Keep the Postgres password in that file and in the Compose interpolation so
`DATABASE_URL` matches. The file sits beside family-net's untracked env and
is not part of this repository.

## What stays untouched

Headscale, RustDesk, family-api, and their volumes stay as they are. The only
family-net edits are the Caddy site and the shared network attachment above.
