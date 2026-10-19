# Research: Court booking

## Portal

Squash reservations are made on `https://pistes.esportiurocafort.com`, not the
old DiR identificacio page. Login posts `NomUsuari` and `Contrasenya`. A court
is chosen on `ReservaFase1.php?TipusPista=SQUASH`, a free 15-minute start links
to `ReservaFase2.php`, and confirming with a bo posts to `ReservaFase3.php`.
Success text is "Reserva finalitzada correctament". The reservation counter is
the argument of `ConfirmaEliminaPista` on `ReservesLlista.php`, and cancelling
is `ReservesLlista.php?Operacio=EliminaPista&Comptador={ref}`. Open days roll
forward about seven days from the slot start. Card payment is a separate
checkout and is not used.

**Decision**: Playwright drives that sequence and pays with a bo. Courts SQ04,
SQ05, SQ10, and SQ11 are court indexes 0–3. SQ12 is recognized when listing.
A local fixture site implements the same gateway methods for tests.

**Alternative rejected**: Raw HTTP now. It is a later spec, once a recording
shows a stable postback sequence.

## Horizon and quota

The operator set the squash horizon at one week. DiR's public class FAQ says
collective activities open 5 days ahead, with 2 bookings per day, 3
simultaneous holds, and cancellation until 20 minutes before start. A fifth
late cancel or no-show in 30 days freezes booking for 7 days.

**Decision**: Horizon defaults to 7 days, and the grab opens at 00:00 Madrid on that day, not at the slot's clock time. Daily cap defaults to 2. Simultaneous
cap defaults to 3. Cancel lead defaults to 3 hours. Penalty guard defaults to
20 minutes: inside that guard the worker does not cancel, because a late
cancel risks the freeze. All five numbers are environment configuration so a
headed check against squash can correct them without a code change.

## When to freeze the court count

Members can keep toggling "I'm in" until the slot starts. If the worker
recomputed the court count on every tick, a late toggle would book extra
courts after other gym members had a chance, or would cancel courts that were
already won.

**Decision**: The first tick at or after the horizon opening freezes
`courtsTargeted` from who is in at that instant. Later opt-ins do not add
courts. Zero members in freezes the slot at zero.

## Which account pays

Booked minutes are the cost of lending a DiR account. Played minutes are time
on court. The member with the lowest `booked - played` who still has quota
takes the next booking. Ties break by user id so the choice is stable.

## Encryption

AES-256-GCM with a 12-byte random nonce and the user id as AAD. The key is
32 bytes from `CREDENTIALS_KEY` (base64). Identifier and password are separate
ciphertexts so the account page can decrypt the identifier without a code path
that also returns the password.

## Coexistence

The CX23 already runs Caddy, Headscale, RustDesk, and family-api from
family-net. FODBS joins a shared Docker network `fodbs-edge` so Caddy can
proxy `fodbs.yk2.dev` to the FODBS server. Postgres has no host port.
The worker launches Chromium with `/dev/shm` disabled so the 768 MB cap is
the real limit.

## Time zone

Slot rules store a weekday (ISO 1–7) and a `HH:mm` local time. Occurrences are
materialized in `Europe/Madrid`.
