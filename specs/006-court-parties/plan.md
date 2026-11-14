# Implementation Plan: Separate play parties and court controls

**Branch**: `006-court-parties` | **Date**: 2026-11-14 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/006-court-parties/spec.md`

## Summary

Stop pooling everyone who opted in at the same hour. At the horizon, form one play party per host from that host's saved partners and guest names, book one court per party up to four, and charge only an account inside the party, host first. Automatic cancellation becomes a per-member flag, off by default, checked only for the charged member. A cancelled court drops its player marks on the board without deleting the seat history. An empty spot on a held court opens one popup to sit yourself, add an active member, or add a guest. Section padding and the gap between sections come from two shared CSS values.

## Technical Context

**Language/Version**: TypeScript 5 on Node.js 22

**Primary Dependencies**: Fastify 5, React 19, Vite 6, Drizzle, postgres.js, Zod 3, Luxon, Vitest 3.2.4, Playwright

**Storage**: PostgreSQL 16. One new column, `users.auto_cancel boolean not null default false`. Parties are computed; they are not stored.

**Testing**: Vitest unit tests for party planning, cancel preference, and cancelled-court marks. Scheduler tests with `FakeGymGateway`. Existing integration and e2e stay on `TEST_DATABASE_URL`. No calls to `dir.cat` or `pistes.esportiurocafort.com`.

**Target Platform**: Linux. The live site is the existing Compose project on the Hetzner CX23.

**Project Type**: Web application. One HTTP server serves the API and the built UI. One worker process books and cancels.

**Performance Goals**: Party planning is in memory for a group of tens of members and must not add a portal call. Dashboard reads stay well under a second.

**Constraints**: No secrets in git. Gym passwords never returned. Postgres not published on the host. Do not lower the server memory limit (768 MB). Do not prune Docker volumes. Chromium runs only inside a grab, cancel, or inspect. Invitation-only access stays.

**Scale/Scope**: One invited group, four courts, the existing board, Cuenta, members page, and popups. No new service.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- Principle I: `specs/006-court-parties` is the contract. FR-011, FR-013, FR-014, FR-015, and FR-008 in `specs/001-court-booking`, FR-102, FR-103, and FR-109 in `specs/002-play-shape`, and FR-207 in `specs/005-group-and-booking` now point here so the older pooling and always-cancel sentences are not still in force.
- Principle II: no public registration. Paused members stay unable to opt in, sit, or be offered in the popup.
- Principle III: no new secret handling. The popup and the preference do not return gym passwords.
- Principle IV: amended in this feature to 1.1.0. One court per party, host's account first, automatic cancellation off until the charged member turns it on, penalty guard unchanged, hand cancel unchanged.
- Principle V: still one server, one worker, one database, beside family-net. No new process.
- Principle VI: portal calls stay behind `GymGateway`. Tests keep the fake gateway.
- Principle VII: no secrets committed.

Post-design re-check: pass. The data model adds one boolean. The HTTP contract does not expose credentials. The worker still cancels only through the gateway, and only when the charged member's flag is on.

## Project Structure

### Documentation (this feature)

```text
specs/006-court-parties/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── court-parties.md
└── tasks.md             # /speckit-tasks, not this command
```

### Source Code (repository root)

```text
src/
├── domain.ts            # planParties, shouldCancel(autoCancel), buildCourts, assignOptedIn
├── scheduler.ts         # one grab per party, cancel gated by the charged member
├── http.ts              # preference and occupant routes
└── db/
    ├── schema.ts
    ├── migrate.ts
    └── index.ts         # createReservation seats the party only

web/src/
├── Court.tsx            # empty-spot popup; no guest form under the diagram
├── App.tsx              # Cuenta switch, unplaced notice, pass active members
├── api.ts
├── i18n.tsx
└── styles.css           # --section-pad and --section-gap

tests/
├── domain.test.ts
├── scheduler.test.ts
└── memory-store.ts
```

**Structure Decision**: The current single TypeScript app. Party planning is a pure function in `src/domain.ts` so the scheduler and the tests share it. The UI reads the dashboard it already loads.

## Complexity Tracking

None. The grab-formula change is the constitution amendment in this feature, not an extra service or a stored party table.
