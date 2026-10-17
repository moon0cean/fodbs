# Tasks: Court booking

**Input**: Design documents from `/specs/001-court-booking/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

## Phase 1: Setup

- [x] T001 Create the TypeScript project, Vite web root, Docker Compose, and env example
- [x] T002 Add Vitest and strict `tsc` scripts

## Phase 2: Foundational

- [x] T003 Add Drizzle schema and idempotent SQL migration in `src/db/`
- [x] T004 Add config loading and AES-256-GCM helpers in `src/config.ts` and `src/crypto.ts`
- [x] T005 Add Fastify app shell, cookie sessions, and static UI hosting in `src/server.ts`

## Phase 3: User Story 1 - Invitation access (P1)

- [x] T006 [US1] Accept invites, bootstrap the first admin, and rate-limit login in `src/http.ts`
- [x] T007 [US1] Reject deactivated users and reused invites

## Phase 4: User Story 2 - Sealed gym credentials (P1)

- [x] T008 [US2] Save and owner-read gym credentials without returning the password
- [x] T009 [US2] Cover encrypt, decrypt, and AAD mismatch in `tests/crypto.test.ts`

## Phase 5: User Story 3 - Board and balances (P1)

- [x] T010 [US3] Implement balance and seat rules in `src/domain.ts` and `tests/domain.test.ts`
- [x] T011 [US3] Serve `GET /api/dashboard`, availability, and seats per `contracts/http-api.md`
- [x] T012 [US3] Build the week slider, 2x2 courts, account page, and active-member balance in `web/`

## Phase 6: User Story 4 - Scheduler and gateway (P1)

- [x] T013 [US4] Implement grab, quota, and cancel in `src/scheduler.ts`
- [x] T014 [US4] Add the fake gateway and Playwright gateway plus fixture site in `src/gym/`
- [x] T015 [US4] Cover court count, account rotation, idempotent grab, and cancel windows in `tests/scheduler.test.ts`
- [x] T016 [US4] Cover a fixture book and cancel in `tests/playwright-gateway.test.ts`

## Phase 7: User Story 5 - Admin (P2)

- [x] T017 [US5] Admin invites, user activation, and slot rules
- [x] T018 [US5] Admin screen in `web/src/App.tsx`

## Phase 8: Deploy notes

- [x] T019 Document Hetzner coexistence in `deploy/HETZNER.md` and `deploy/docker-compose.hetzner.yml`
