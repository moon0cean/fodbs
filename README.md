# FODBS

Invitation-only booking for four DiR squash courts. The spec is
[specs/001-court-booking/spec.md](specs/001-court-booking/spec.md). Local setup
is [specs/001-court-booking/quickstart.md](specs/001-court-booking/quickstart.md).
The Hetzner notes, written so this stack can sit beside family-net, are
[deploy/HETZNER.md](deploy/HETZNER.md).

```bash
cp .env.example .env
# set CREDENTIALS_KEY, BOOTSTRAP_ADMIN_EMAIL, BOOTSTRAP_ADMIN_PASSWORD
docker compose up --build
```

`npm test` does not call dir.cat.
