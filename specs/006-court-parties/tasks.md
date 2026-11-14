# Tasks: Separate play parties and court controls

**Input**: Design documents from `/specs/006-court-parties/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/court-parties.md, quickstart.md

**Tests**: Included. Constitution principle I requires acceptance tests to pass, and quickstart.md names the cases. Write the listed test changes first so they fail, then implement.

**Organization**: Tasks follow the user stories in spec.md. This repo is the existing single project: `src/`, `web/src/`, `tests/`. Do not add packages. Do not lower the server memory limit.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task belongs to

## Phase 1: Setup

**Purpose**: Keep the existing app. No new library and no new process.

- [x] T001 Confirm `package.json` scripts stay `npm test` (unit) and `npm run test:integration`, and that implementation stays inside the paths in `specs/006-court-parties/plan.md`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The cancel flag and the test double exist before any story. No user story work starts until this phase is done.

- [x] T002 Add `autoCancel` on `users` in `src/db/schema.ts` and an idempotent `alter table users add column if not exists auto_cancel boolean not null default false` in `src/db/migrate.ts`. The column is boolean, not null, default false.
- [x] T003 [P] Default `autoCancel` to false on held-open rows in `tests/memory-store.ts` so existing scheduler tests keep compiling

**Checkpoint**: A migrated database has `auto_cancel = false` for every member. The memory store exposes that default.

---

## Phase 3: User Story 1 - Short courts stay unless asked (Priority: P1) MVP

**Goal**: Automatic cancellation is the charged member's choice, off until they turn it on. Hand cancel still works.

**Independent Test**: Leave the preference off, hold a one-player court through 23:55 Madrid the evening before, and confirm it stays. Turn it on and confirm that court is cancelled outside the last 20 minutes. Two players in any boxes stay either way.

### Tests for User Story 1

- [x] T004 [P] [US1] Update `shouldCancel` cases in `tests/domain.test.ts`. Existing 23:55 cancel cases pass `autoCancel: true`. Add `autoCancel: false` with one occupant at 23:55 Madrid and assert false. Two occupants, `effective: true`, and a time inside the last 20 minutes stay false.
- [x] T005 [P] [US1] Update `cancels an empty court inside the window and leaves it alone inside the penalty guard` in `tests/scheduler.test.ts`. With the charged member's `autoCancel` false, a tick at 23:55 does not cancel. With it true, one occupant cancels outside the guard and does not cancel inside the last 20 minutes.
- [x] T006 [P] [US1] Add a round-trip in `tests/account.integration.test.ts`: `GET /api/account` returns `autoCancel: false`, `PUT /api/account/auto-cancel` with `{ "enabled": true }` returns 204, a later GET returns true, and a missing `enabled` returns 400 `invalid_body`.

### Implementation for User Story 1

- [x] T007 [US1] In `src/domain.ts`, `shouldCancel` returns false when `autoCancel` is false. When true, keep the current rule: fewer than two occupants, not effective, at or after 23:55 Madrid the evening before, and more than 20 minutes before start.
- [x] T008 [US1] In `src/db/index.ts`, return the charged member's `autoCancel` from `heldOpen`, return `autoCancel` from `accountView` (false when unset), and add `saveAutoCancel(userId, enabled)`.
- [x] T009 [US1] In `src/scheduler.ts`, skip the short-court cancel when `autoCancel` is false. Still call `markEffective` when occupants are at least two at or after the deadline, whether or not the flag is on. Do not revive a reservation already cancelled.
- [x] T010 [US1] In `src/http.ts`, include `autoCancel` on `GET /api/account`. Add `PUT /api/account/auto-cancel` with body `{ "enabled": boolean }`, 204 on success, 400 `invalid_body` when `enabled` is missing, 401 when signed out, matching `specs/006-court-parties/contracts/court-parties.md`.
- [x] T011 [P] [US1] Add the Cuenta switch in `web/src/App.tsx`, next to the existing preference form, and Spanish plus English strings in `web/src/i18n.tsx`. The control loads and saves `autoCancel`. It is off until the member turns it on.

**Checkpoint**: A one-player court charged to a member who left the switch off survives 23:55. Turning it on cancels on the next check outside the penalty guard. Removing yourself still confirms and cancels.

---

## Phase 4: User Story 2 - Unchosen members do not share a court (Priority: P1)

**Goal**: One court per play party, host's account first, nobody outside the party seated or charged.

**Independent Test**: Two members opt in for the same time and neither saved the other. Neither name appears on the other's court. Five such members book four courts and the fifth is unplaced.

### Tests for User Story 2

- [x] T012 [US2] Extend `tests/memory-store.ts` so a player can carry booked minutes, a credential flag, an opt-in time, and an ordered preferred list of member ids or guest names. Existing players stay credentialed, unlinked, and party size 3.
- [x] T013 [P] [US2] Add `planParties` cases in `tests/domain.test.ts`. Two unlinked candidates make two parties. A host who saved an opted-in credentialed partner makes one party and that partner is not a second host. A mutual pair hosts on the lighter booked-hours member. Two hosts who saved the same partner: the partner stays with the lighter host, then the earlier opt-in, then the lower user id. Party size 2 fills only `front_left` and `front_right`. A guest name is a guest and not a host. A candidate without credentials does not host. A sixth party is past the cap of four.
- [x] T014 [P] [US2] Rewrite `books two courts on the lightest accounts and does not book them again` in `tests/scheduler.test.ts`. Five opted-in members who have not chosen each other book four courts on their own accounts, the fifth has no seat, and a second tick does not add a booking. Add a case where the host saved one partner: one court, both seated, the partner not charged on a second court. Add a case where the host returns `bons_unavailable` and the partner in that party pays, and an outsider is not tried.

### Implementation for User Story 2

- [x] T015 [US2] Implement `planParties` in `src/domain.ts` using the claim rules in `specs/006-court-parties/data-model.md`. Cap booked parties at four. Payer order is the host, then other party members by charge minus play, dropping anyone at `dirMaxPerDay` 2 or `dirMaxSimultaneous` 4.
- [x] T016 [US2] In `src/db/index.ts`, `createReservation` accepts that party and seats only it: charged member on `front_left`, then the other credentialed members, then guest names, stopping at party size 2 or 3. Remove the loop that seats every opted-in member. `setAvailability` must not call `seatOptIn` when someone opts in. Declining still clears that member's seat.
- [x] T017 [US2] In `src/scheduler.ts`, freeze `courtsTargeted` with `planParties` instead of `courtsToBook` plus `partyDivisor`. Book one court per party. Try the host's account first, then the next payer in that party on the same court. Do not call `pickAccount` on members outside the party. Warm prelogin for those payers. A party that cannot pay adds no seats on another party's court.
- [x] T018 [US2] Stop `assignOptedIn` in `src/domain.ts` from painting opted-in members into unbooked bubbles. In `src/db/index.ts`, add `unplaced` on each dashboard occurrence as specified in `specs/006-court-parties/contracts/court-parties.md`: empty until `courtsTargeted` is set and held reservations have reached it, or the slot has started; then opted-in members with no seat on a held reservation. Show that list in `web/src/App.tsx` with Spanish and English copy in `web/src/i18n.tsx`.

**Checkpoint**: Overlapping schedules do not mix people. A saved partner who is also in shares the host's court and does not get another. Someone left over can see that no court was held.

---

## Phase 5: User Story 3 - Empty spot adds a member or a guest (Priority: P1)

**Goal**: Choosing an empty spot on a held court opens one popup: yourself if you may sit, an active member, or a guest.

**Independent Test**: On a held court, add one active member and one guest from the popup. Both appear only on that court. A paused member is not offered. A cancelled court does not open the popup.

### Tests for User Story 3

- [x] T019 [US3] Extend `tests/account.integration.test.ts` for `POST /api/reservations/:id/occupants`. Expect 204 for `kind: "self"`, `kind: "member"` when the actor is the charged member and the target has credentials, and `kind: "guest"` with `name` a string of at most 40 characters, including empty. Expect 202 `{ "requested": true }` when the actor is not the charged member or the target has no credentials. Expect 400 `inactive`, `spot_taken`, `already_seated`, and `not_held` for those cases in `specs/006-court-parties/contracts/court-parties.md`.

### Implementation for User Story 3

- [x] T020 [US3] Add `addOccupant` in `src/db/index.ts`. Position is `front_left`, `front_right`, or `back`. Reject a paused actor or target, a reservation that is not held, a started slot, a filled position, and a member already on the court. The charged member places a credentialed member immediately. Anyone else, or a member without credentials, creates the existing seat request. A seated member or the charged member may add a guest. Do not add a second guest form path.
- [x] T021 [US3] Add `POST /api/reservations/:id/occupants` in `src/http.ts` with the three bodies and status codes in `specs/006-court-parties/contracts/court-parties.md`. A 202 still sends the existing seat-request mail.
- [x] T022 [P] [US3] Add Spanish and English labels for the popup in `web/src/i18n.tsx`, and the new error codes in `web/src/errors.ts`.
- [x] T023 [US3] In `web/src/Court.tsx`, an empty spot on a held court opens one popup instead of sitting immediately. Offer self when the signed-in member may sit and is not already on the court, active members from the dashboard `activeUsers` list (paused members are already absent), and a guest name. Remove the guest form under the diagram. Pass `activeUsers` from `web/src/App.tsx`.

**Checkpoint**: The empty spot is the only way to add a guest. The charged member places a credentialed member at once. Other adds become the request the charged member already approves.

---

## Phase 6: User Story 4 - A cancelled court shows no players (Priority: P2)

**Goal**: After a cancel, the board has no player marks, including the charged member's colour. Seat rows remain for Cuenta history.

**Independent Test**: Cancel a held court that shows the charged member, refresh, and confirm that colour and every other mark are gone. Cuenta can still name who was on it.

### Tests for User Story 4

- [x] T024 [P] [US4] In `tests/domain.test.ts`, `buildCourts` returns `occupants: []` when status is `cancelled`, and still returns occupants when status is `held` or `played`.

### Implementation for User Story 4

- [x] T025 [US4] In `src/domain.ts`, `buildCourts` clears occupants when `status` is `cancelled`. In `src/db/index.ts`, `markCancelled` only sets `status` to `cancelled` and `cancelledAt`. It does not delete `seats`. Account history keeps reading those seats as names.

**Checkpoint**: A refresh of a cancelled court still shows no player marks. History names stay on Cuenta.

---

## Phase 7: User Story 5 - One section inset (Priority: P3)

**Goal**: The board, roster, booking, opt-in, Cuenta, the members page, and popups share one inner padding and one gap between stacked sections.

**Independent Test**: Compare those surfaces on a wide window and below 800px. The inset matches and the phone court slider still slides. The squash diagram, buttons, and help marks keep their own sizes.

### Implementation for User Story 5

- [x] T026 [P] [US5] In `web/src/styles.css`, define `--section-pad: 12px 14px` and `--section-gap: 12px` and use them on `.balance`, `.roster`, `.slot`, `.panel-block`, `.section-main`, `.section-main section`, `.modal`, and the gate card. Do not change `.bubble`, `.help-mark`, or button min sizes.

**Checkpoint**: Those sections line up. The court drawing is unchanged.

---

## Phase 8: Polish

**Purpose**: Prove the stories together against quickstart.md.

- [x] T027 Run `npm test` and `npm run typecheck` from the repo root and fix failures in the files this feature touched
- [x] T028 [P] Run `npm run test:integration` with `TEST_DATABASE_URL` pointed at a throwaway Postgres, not the live database
- [x] T029 Walk the account, popup, and spacing checks in `specs/006-court-parties/quickstart.md` on `localhost:8088`. Do not book or cancel a court on the live club.

---

## Dependencies & Execution Order

### Phase Dependencies

- Setup (Phase 1) has no dependencies.
- Foundational (Phase 2) blocks every user story.
- User stories start after Phase 2. Do them in spec order when the same file is involved.
- Polish runs after the stories you intend to ship.

### User Story Dependencies

- **User Story 1 (P1)**: After Phase 2. No dependency on other stories.
- **User Story 2 (P1)**: After Phase 2. Independently testable, but `src/scheduler.ts` and `src/domain.ts` are also edited by User Story 1, so finish T009 before T017, and T007 before T015.
- **User Story 3 (P1)**: After Phase 2. `src/http.ts`, `web/src/i18n.tsx`, `web/src/App.tsx`, and `tests/account.integration.test.ts` are also edited by User Story 1, so finish T010 and T011 before T019 and T021. The popup does not require parties to be implemented.
- **User Story 4 (P2)**: After Phase 2. `src/domain.ts` is also edited by User Stories 1 and 2, so finish T015 and T018 before T025.
- **User Story 5 (P3)**: After Phase 2. Only `web/src/styles.css`. It can proceed beside the other stories.

### Within Each User Story

- Tests listed first are written to fail before the implementation tasks in that story.
- Schema and store changes before the scheduler.
- Server route before the screen that calls it.
- User Story 1 is complete before treating a later story's shared-file edit as ready.

### Parallel Opportunities

- T003 can run with T002.
- T004, T005, and T006 can run together.
- T011 can run with T010.
- T013 and T014 can run together after T012.
- T022 can run with T020.
- T024 can run beside User Story 5.
- T026 can run beside any story that does not edit `web/src/styles.css`.
- T028 can run with T027.

---

## Parallel Example: User Story 1

```bash
# Failing tests together:
Task: "T004 shouldCancel cases in tests/domain.test.ts"
Task: "T005 scheduler cancel preference in tests/scheduler.test.ts"
Task: "T006 auto-cancel round-trip in tests/account.integration.test.ts"

# Screen beside the route, against the contract:
Task: "T010 PUT /api/account/auto-cancel in src/http.ts"
Task: "T011 Cuenta switch in web/src/App.tsx and web/src/i18n.tsx"
```

## Parallel Example: User Story 2

```bash
# After the memory store grows the party fields:
Task: "T013 planParties cases in tests/domain.test.ts"
Task: "T014 party grab cases in tests/scheduler.test.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Finish Phase 1 and Phase 2.
2. Finish User Story 1.
3. Stop and run the one-player 23:55 check with the preference off, then on.

### Incremental Delivery

1. User Story 1 stops unwanted cancels.
2. User Story 2 stops overlapping members sharing a court.
3. User Story 3 is how a held court gets a partner or a guest after that.
4. User Story 4 clears the blue mark after a cancel.
5. User Story 5 aligns section spacing.

### Parallel Team Strategy

After Phase 2, one person can take User Story 5 immediately. User Stories 1, 2, and 4 should stay with one person because they share `src/domain.ts` and `src/scheduler.ts`. User Story 3 waits only for the User Story 1 edits to `src/http.ts` and `web/src/App.tsx`.

---

## Notes

- [P] means a different file and no unfinished dependency.
- Do not call `dir.cat` or `pistes.esportiurocafort.com` from tests.
- Do not print passwords, the credentials key, or SMTP secrets.
- `courtsToBook` and `partyDivisor` remain in `src/domain.ts` only if something else still calls them. The grab must not use them to mix opted-in members.
