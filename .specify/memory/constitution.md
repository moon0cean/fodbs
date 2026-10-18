# FODBS Constitution

## Core Principles

### I. Spec Is the Contract

Every user-visible behavior MUST trace to a requirement ID in `specs/`. A new
behavior, including a change to who may book, how courts are counted, or how
balances are computed, MUST land in a `specs/NNN-*` specification before
application code. Tests that encode acceptance criteria MUST pass before a
change is treated as done. Implementation that contradicts the current spec
is a defect.

### II. Invitation Only

FODBS has no public registration. A person gets an account only by accepting
an invite created by an admin. Someone without an account may ask for access
with an email address. That request does not create an account; an admin
approves it by sending an invite. The first admin is created from the operator's
environment when the database is empty. A member can pause and restore their
own account. While the account is paused they MUST NOT opt in or take a seat,
and the worker MUST NOT use them. They can still log in to restore it.

### III. Gym Secrets Stay Sealed

DiR identifiers and passwords are encrypted with AES-256-GCM before they touch
the database. The master key lives only in the environment. The API MUST NOT
return a gym password. Logs MUST NOT contain gym passwords, FODBS passwords,
session cookies, or invite tokens. Decryption happens in the worker at the
moment of a portal call, and on the account page only so the owner can see
their own identifier.

### IV. Book the Opening, Then Give Courts Back

The worker submits court bookings at the instant the gym horizon opens, using
sessions prepared shortly before that instant. It books only as many courts as
opted-in players need, and it chooses the member account with the lightest
booking burden that still has gym quota. A held court whose two front squares
are not both filled at the start of the slot's local day MUST be cancelled
before the gym's penalty window. The back spot is optional. A missed cancel
MUST NOT be sent inside that penalty window.

### V. One App Beside Family-net

FODBS is one TypeScript application: an HTTP server that also serves the UI,
a worker process, and Postgres. It deploys as its own Compose project on the
existing Hetzner CX23. It MUST NOT replace Caddy, Headscale, RustDesk, or
family-api. Postgres MUST NOT be published on the host. Chromium runs only
while a grab or cancel needs it.

### VI. The Portal Is an Adapter

DiR has no API. All portal calls go through a `GymGateway`. Tests use a fake
gateway or a local fixture site. CI MUST NOT call `dir.cat`. A portal failure
MUST NOT take down the HTTP server.

### VII. Secrets Stay Out of Git

Passwords, credential keys, session secrets, and SSH keys MUST NOT be
committed. Local secrets live in an untracked `.env`. Production secrets live
in an untracked env file on the VPS, next to family-net's env file, and are
not copied into this repository.

## Security and Privacy

Accounts are invitation-gated and passwords are stored with argon2id. Session
cookies are httpOnly. Login attempts are rate-limited. Gym ciphertext uses a
random nonce and the user id as additional authenticated data. Admins can
deactivate a member and cannot read that member's gym password.

## Development Workflow

The lifecycle is:

```text
constitution → specify → plan → tasks → implement → local acceptance
→ (later) Hetzner deploy
```

Local checks are `npm test` and `npm run typecheck`. Tests that open the
public internet MUST stay out of CI. The first release MUST run on the
operator's machine. Deploy to the CX23 is a documented later step.

## Governance

This constitution supersedes informal practice for FODBS. A change to
invitation rules, encryption, the grab formula, or the family-net boundary
requires an amendment here and a spec update in the same change. Complexity
beyond one server, one worker, and one database must be justified in the
feature plan.

**Version**: 1.0.0 | **Ratified**: 2026-10-17 | **Last Amended**: 2026-10-17
