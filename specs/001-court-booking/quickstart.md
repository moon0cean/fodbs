# Quickstart: Court booking

## Local

1. Create `.env` from `.env.example`. `CREDENTIALS_KEY` must be 32 bytes of
   base64 (`openssl rand -base64 32`). Set `BOOTSTRAP_ADMIN_EMAIL` and
   `BOOTSTRAP_ADMIN_PASSWORD` (at least 10 characters).
2. `docker network create fodbs-edge` is only required for the Hetzner overlay.
   Local Compose creates its own Postgres and publishes the server on port 8088.
3. `docker compose up --build`.
4. Open `http://127.0.0.1:8088`. Sign in as the bootstrap admin.
5. On Admin, create a weekly slot and an invite. Open the invite link in a
   private window and accept it.
6. Each member saves DiR credentials on Account. Those values are write-only
   for the password.
7. On the dashboard, slide to the slot date and mark **I'm in** before the
   horizon opens. After the worker books, sit on a court. Three names fill a
   court. A fourth is refused.

Without Docker, run Postgres 16 yourself, point `DATABASE_URL` at it, then
`npm run dev` and open the Vite URL printed in the terminal.

## Tests

`npm test` uses an in-memory scheduler store, a fake gateway, and a local
fixture site. It does not call `dir.cat`.

## Court site

Squash booking is built in for `https://pistes.esportiurocafort.com`. Set
`GYM_BASE_URL` to that login page and restart the worker. The worker logs in,
pays with a bo, and reads the reservation counter from "Les meves reserves".

`GYM_FLOW=fixture` points the same adapter at the in-process fixture and is
what the automated test uses.

## Horizon check

If a headed session shows squash opening at 5 days rather than 7, set
`HORIZON_DAYS=5` and restart. The court formula does not change.
