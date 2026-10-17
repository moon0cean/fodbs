# Implementation Plan: Court booking

**Branch**: `001-court-booking` | **Date**: 2026-10-17 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/001-court-booking/spec.md`

## Summary

Build an invitation-only TypeScript monolith that stores DiR credentials with
AES-256-GCM, shows a week slider and a 2x2 court board, and runs a worker that
books courts when the horizon opens and cancels empty ones before the penalty
window. Portal I/O sits behind `GymGateway`. Tests use a fake gateway and a
local fixture site.

## Technical Context

**Language/Version**: TypeScript 5 on Node.js 22

**Primary Dependencies**: Fastify, React, Vite, Drizzle ORM, postgres.js, argon2, Zod, Luxon, Playwright

**Storage**: PostgreSQL 16

**Testing**: Vitest for policy, balances, crypto, the scheduler with a fake gateway, and Playwright against a local fixture. `tsc --noEmit` for the server and the web client.

**Target Platform**: Linux. Local Compose first. Later, the existing Hetzner CX23 behind family-net's Caddy.

**Project Type**: Web application (one server process serving API and built UI, plus a worker process)

**Performance Goals**: Dashboard reads return in well under a second for a group of tens of members. The grab tick submits at the horizon opening, after a pre-login of 2 minutes.

**Constraints**: No secrets in git. No live DiR calls in tests. Gym passwords never returned by the API. Postgres not published on the host. Chromium only while the worker holds a session. Memory caps: server 256 MB, Postgres 256 MB, worker 768 MB.

**Scale/Scope**: One invited group, four courts, one club configured per slot rule, three screens (dashboard, account, admin).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- Spec IDs FR-001 through FR-019 cover this plan.
- Invitation-only accounts, argon2id, and hashed invite tokens satisfy Principle II.
- AES-256-GCM with the user id as AAD, no password in API responses, and worker-only decrypt for portal calls satisfy Principle III.
- Horizon grab, burden ordering, and penalty-guard cancel satisfy Principle IV.
- One server, one worker, one Postgres, separate from family-net, satisfies Principle V.
- `GymGateway` plus fixture tests satisfy Principle VI.
- `.env` is untracked and satisfies Principle VII.
- Post-design: no extra service was added. Playwright stays inside the worker.

## Project Structure

### Documentation (this feature)

```text
specs/001-court-booking/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/http-api.md
├── tasks.md
└── checklists/requirements.md
```

### Source Code (repository root)

```text
src/
├── server.ts
├── worker.ts
├── config.ts
├── http.ts
├── domain.ts
├── crypto.ts
├── scheduler.ts
├── db/
│   ├── schema.ts
│   ├── migrate.ts
│   └── index.ts
└── gym/
    ├── gateway.ts
    ├── fake.ts
    ├── playwright.ts
    └── fixture-site.ts
web/
├── index.html
└── src/
tests/
docker-compose.yml
deploy/HETZNER.md
```

**Structure Decision**: Single TypeScript project. The server and the worker
are two entrypoints of the same program. The React UI is built by Vite into
`web/dist` and served by Fastify.

## Complexity Tracking

No constitution violations.
