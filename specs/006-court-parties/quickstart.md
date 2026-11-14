# Quickstart: Separate play parties and court controls

Validate the design in [spec.md](spec.md) against [data-model.md](data-model.md) and [contracts/court-parties.md](contracts/court-parties.md). No live club calls. No confirm of a real booking.

## Prerequisites

- Node 22 and the repo install (`npm ci --no-audit --no-fund`).
- For integration or e2e only: `TEST_DATABASE_URL` pointing at a throwaway Postgres. Do not point it at the live database.

## Unit

```bash
npm test
npm run typecheck
```

Expected after implementation:

- Two members in for the same time, neither on the other's saved list, produce two parties. Five such members produce four parties and one unplaced member.
- A host who saved a partner who is also in produces one party, and that partner is not a second host.
- Two hosts who saved the same partner: the partner stays with the host who has fewer booked hours.
- `shouldCancel` is false when `autoCancel` is false, including at 23:55 with one occupant. It is true when `autoCancel` is true, one occupant, at or after 23:55, and more than 20 minutes before the start. Two occupants never cancel. Inside the last 20 minutes it stays false.
- `buildCourts` returns no occupants for a cancelled reservation.
- A scheduler tick with the fake gateway books one court per party, seats only that party, and does not call cancel while the charged member's flag is off.
- A second tick does not book those courts again.

## Account and popup

With the app on `localhost:8088` and a signed-in member:

1. Open Cuenta. Automatic cancellation is off. Turn it on, reload, and confirm it stayed on.
2. Open a held court and choose an empty spot. The popup offers the signed-in member when they are not already seated, an active member, and a guest. Confirm one of each on two empty spots. Paused members are not in the list.
3. Cancel that court. The board no longer shows the blue charged-member mark or any other player. Cuenta can still name who was on it.

## Spacing

Compare the board, roster, booking, opt-in, Cuenta, the members page, and an open popup on a wide window and below 800px. The section inset matches, and the gap between stacked sections matches. The squash diagram and the phone court slider are otherwise unchanged.

## Out of scope for this check

Do not book or cancel a court on the live club while probing. Do not print passwords, the credentials key, or SMTP secrets.
