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

A merge to `main` builds `ghcr.io/moon0cean/fodbs:main` and the deploy job
pulls it on the server. It does not build Chromium on the CX23.

`deploy/docker-compose.hetzner.yml` points the server and the worker at that
image, drops the published `8088` port, and attaches `fodbs-server` to
`fodbs-edge`. Postgres stays on the Compose network only.

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
http://fodbs.yk2.dev {
	encode gzip
	reverse_proxy fodbs-server:8088
}

fodbs.yk2.dev {
	encode gzip
	reverse_proxy fodbs-server:8088
}
```

The plain HTTP site is required while Cloudflare proxies the name. Proxied
mode calls the origin on port 80, and Caddy's automatic HTTPS redirect would
loop.

DNS, in the `yk2.dev` zone: an A record `fodbs` to `91.98.138.43`,
proxied (orange cloud). Cloudflare SSL/TLS mode must be Full (strict).
The name is `fodbs.yk2.dev`, not a name under `family.yk2.dev`.

FODBS is served by the public Caddy listener on ports 80 and 443. It is not
on the Tailscale network, and opening the site does not require Tailscale.
Reload Caddy after the file change. Leave UFW as it is.
Ports 80 and 443 are already open for Caddy. Do not open 5432.

## Secrets

Sensitive values live as GitHub Actions secrets on `moon0cean/fodbs`. The
deploy job writes `/opt/fodbs/.env` from them and never commits it. The file
is mode `600`.

Secrets:

- `CREDENTIALS_KEY` — 32 bytes of base64. Keep the key already on the server.
  A new key cannot read bookings that were saved with the old one.
- `POSTGRES_PASSWORD` — the password of the existing `fodbs` database volume.
- `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_PASSWORD`, `BOOTSTRAP_ADMIN_NAME`
- `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` — optional. When all three are set,
  mail uses `smtp.gmail.com` on port 587. When they are empty, invites stay
  as copyable links.
- `DEPLOY_SSH_KEY` — the private key the workflow uses to reach the host.

`deploy/render-env.mjs` fills the rest: `PUBLIC_URL=https://fodbs.yk2.dev`,
`COOKIE_SECURE=true`, the Rocafort login URL, `Europe/Madrid`, and the
horizon, quota, and tick defaults. Do not copy a laptop `.env` onto the host.

## What stays untouched

Headscale, RustDesk, family-api, and their volumes stay as they are. The only
family-net edits are the Caddy site and the shared network attachment above.
