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

## Recording the DiR court form

Login selectors are already set to the live WebForms fields. The pages after
login are behind a member session, so booking selectors start empty and grabs
fail with `gym_flow_unconfigured` until they are set.

1. Set `GYM_HEADLESS=false` and `PLAYWRIGHT_NO_SANDBOX=false` in `.env`.
2. Run the worker once while signed into a headed Chromium window and watch
   where DiR places the court, the date, the confirm button, and the
   confirmation reference.
3. Set:

```text
GYM_FLOW=dir
GYM_BASE_URL=https://www.dir.cat/net/mv/identificacio.aspx
GYM_BOOK_URL=<page used to reserve a court>
GYM_SEL_CLUB=<selector>
GYM_SEL_COURT=<selector>
GYM_SEL_STARTS=<selector>
GYM_SEL_DURATION=<selector>
GYM_SEL_BOOK=<selector>
GYM_SEL_REF=<selector>
GYM_CANCEL_URL=https://www.dir.cat/net/mv/<cancel page>?ref={ref}
GYM_SEL_CANCEL=<selector>
```

`{ref}` is replaced with the external reference. Restart the worker. The next
tick inside the pre-login window opens sessions, and the tick at the horizon
submits.

`GYM_FLOW=fixture` points the same adapter at the in-process fixture and is
what the automated test uses.

## Horizon check

If a headed session shows squash opening at 5 days rather than 7, set
`HORIZON_DAYS=5` and restart. The court formula does not change.
