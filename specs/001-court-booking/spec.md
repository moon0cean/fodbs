# Feature Specification: Court booking

**Feature Branch**: `001-court-booking`

**Created**: 2026-10-17

**Status**: Implemented

**Input**: User description: "Invitation-only automated booking for four DiR squash courts, with encrypted member credentials, a fair scheduler, a 2x2 court board, and balances of hours booked versus hours played."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Join only by invitation (Priority: P1)

An admin sends an invite. The invited person sets a display name, email, and
FODBS password, then signs in. Nobody else can create an account. A
deactivated member is refused at login.

**Why this priority**: The system is private. Every later action assumes a
known member.

**Independent Test**: Accept an invite, sign in, and confirm a second use of
the same invite fails. Confirm a deactivated user cannot sign in.

**Acceptance Scenarios**:

1. **Given** an unused invite, **When** the invitee submits a name, email, and password of at least 10 characters, **Then** they have a member account and a session.
2. **Given** an invite that was already used or is past its expiry, **When** someone submits it, **Then** no account is created.
3. **Given** an invite bound to an email, **When** the invitee submits a different email, **Then** the accept is rejected.
4. **Given** a deactivated user, **When** they submit the correct password, **Then** the login is rejected.
5. **Given** no accounts and bootstrap admin environment variables, **When** the server starts, **Then** that admin exists and no second bootstrap runs.

---

### User Story 2 - Store DiR credentials sealed (Priority: P1)

A member saves the identifier and password of their DiR account. The password
is never shown again. The worker can decrypt it only to talk to DiR.

**Why this priority**: Bookings are made on members' own gym accounts.

**Independent Test**: Save credentials, read the account payload, and confirm
the password is absent and the stored value is not the plaintext.

**Acceptance Scenarios**:

1. **Given** a signed-in member, **When** they save a DiR identifier and password, **Then** the account page shows the identifier and does not show the password.
2. **Given** stored credentials, **When** the ciphertext is read from the database, **Then** it is AES-256-GCM and does not contain the plaintext password.
3. **Given** a different user id as authenticated data, **When** decryption is attempted, **Then** it fails.
4. **Given** any log line produced while saving or booking, **When** it is inspected, **Then** it does not contain the gym password, the FODBS password, or the invite token.

---

### User Story 3 - See the week and take a court (Priority: P1)

A member opens the dashboard, slides across the bookable days starting today,
and sees four squash courts in a 2x2. They mark themselves in for a
slot and, once a court is held, add or remove only themselves. A court holds
at most three players. The dashboard shows every active member and the group
balance. The account page shows that member's balance and the reservations
charged to their DiR account.

**Why this priority**: This is the screen the group uses.

**Independent Test**: With two held courts, seat three players on one court,
reject a fourth, and move a player to the other court. Compare booked and
played minutes with the reservation rows.

**Acceptance Scenarios**:

1. **Given** active members, **When** a member opens the dashboard, **Then** they see those members and the group balance: total booked hours, hours booked this week that have not started, hours booked next week that have not started, hours played, and the difference.
2. **Given** a date inside the horizon, **When** the member selects it on the slider, **Then** the slots for that date and a 2x2 of courts are shown. The slider starts on the current Madrid day and lists no earlier day.
3. **Given** a held court with two seats, **When** the member joins, **Then** they are seated.
4. **Given** a held court with three seats, **When** another member joins it, **Then** the join is rejected.
5. **Given** a member already seated on another court of the same slot, **When** they join a different held court, **Then** they leave the first court and sit on the second.
6. **Given** a member, **When** they open the account page or the dashboard, **Then** they see total booked hours, hours booked this week that have not started, hours booked next week that have not started, hours played, the difference, and the reservations charged to their gym account.
7. **Given** a cancelled reservation, **When** balances are computed, **Then** it adds nothing.
8. **Given** three future courts next week, one of them still empty, **When** balances are computed, **Then** all three hours are booked and shown for next week, none count as played, and the difference stays unchanged.

---

### User Story 4 - Grab at the horizon and cancel empty courts (Priority: P1)

Admins define a weekly slot. Members who are in before the horizon opens are
counted. At 00:00 Madrid, `horizonDays` before the slot's date, the worker books `min(4, ceil(optedIn / 3))`
courts on DiR. The account used is the eligible member with the lowest
charge minus play who is still under the gym quota. The charge includes
future courts. Play counts only after the reservation has started. Sessions
are opened shortly before that instant. A held court with only one player
in the front boxes is cancelled from 23:55 Madrid the evening before, and
not inside the penalty guard. The same grab
does not book a court twice.

**Why this priority**: Other members of the gym can take the same courts. The
scheduler exists to be first, and to give back courts the group will not use.

**Independent Test**: Run the scheduler against a fake gateway with five
opted-in members and two eligible accounts. Expect two bookings on two
accounts, a second tick that does not add bookings, and a cancel of a court
that stays empty inside the cancel window.

**Acceptance Scenarios**:

1. **Given** five members in and enough quota, **When** the horizon opens, **Then** two courts are booked and the accounts are the ones with the lowest booking burden.
2. **Given** nobody in, **When** the horizon opens, **Then** no court is booked and the slot is frozen at zero courts.
3. **Given** a member already at two bookings that day or three future holds, **When** the worker chooses an account, **Then** that member is skipped.
4. **Given** a successful grab, **When** the tick runs again, **Then** no second portal booking is made for those courts.
5. **Given** a held court with only one front box filled, **When** the clock reaches 23:55 Madrid the day before, **Then** the gateway cancel is called and the reservation becomes cancelled.
6. **Given** the clock inside the last penalty-guard minutes, **When** the court is still empty, **Then** the worker does not call cancel.
7. **Given** a portal error, **When** the tick finishes, **Then** the HTTP server is unaffected and the grab is retried on a later tick.
8. **Given** the planned time is unavailable on every court, **When** another court is free 30 minutes earlier or later the same day, **Then** that court is booked at the free time and the board shows that time.
9. **Given** every court is unavailable at the planned time and 30 minutes either side, **When** the sweep finishes, **Then** the opted-in members are emailed once and no court is shown as booked.
10. **Given** a weekly slot and an imported gym booking at the same Madrid start, **When** the board and the worker run, **Then** only that imported court is shown and no second court is booked.

---

### User Story 5 - Admins run the group (Priority: P2)

An admin creates invites, activates or deactivates members, and creates or
deactivates weekly slot rules (weekday, start time, duration, club code).

**Why this priority**: The scheduler and the invite gate need an operator.

**Independent Test**: As an admin, create a slot and an invite. As a member,
confirm those admin routes are rejected.

**Acceptance Scenarios**:

1. **Given** an admin, **When** they create a Monday 19:00 slot for 60 minutes, **Then** the worker can materialize occurrences of that rule.
2. **Given** a member session, **When** they call an admin route, **Then** the response is forbidden.
3. **Given** a deactivated slot rule, **When** occurrences are materialized, **Then** no new occurrence is created for it.

---

### Edge Cases

- Zero opted-in members freezes the slot at zero courts. Later opt-ins do not add courts.
- Thirteen or more opted-in members still book at most four courts.
- Fewer eligible accounts than courts books only as many as quota allows and retries until the slot starts.
- A member cannot opt in or sit after the slot has started.
- A member cannot sit on a cancelled or not-yet-booked court.
- Decrypting with the wrong key fails closed.
- Login is rate-limited.
- The worker does not call the public internet in automated tests.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST create member and admin accounts only from an admin invite or from the empty-database bootstrap.
- **FR-002**: Invites MUST be single-use, expiring, and stored only as a hash. An email-bound invite MUST reject any other email.
- **FR-003**: FODBS passwords MUST be hashed with argon2id and MUST be at least 10 characters.
- **FR-004**: Sessions MUST be server-side, carried in an httpOnly cookie, and MUST stop working when the user is deactivated or the session is expired.
- **FR-005**: The system MUST encrypt each gym identifier and password with AES-256-GCM, a random nonce, and the user id as additional authenticated data.
- **FR-006**: The API MUST NOT return a gym password. The account owner MAY see their own gym identifier.
- **FR-007**: The dashboard MUST list active members, the group booked-versus-played balance, a date slider that starts on the current Madrid day and covers the horizon, and four courts in a 2x2. Earlier days MUST NOT appear on that slider.
- **FR-008**: A member MUST be able to mark themselves in or out of a future slot, and MUST be able to add or remove only themselves on a held court, with a maximum of three players.
- **FR-009**: Joining a second court of the same slot MUST move the member off the first court.
- **FR-010**: The balance MUST show total booked hours, hours booked this week that have not started, hours booked next week that have not started, hours played, and the difference, for each member and for the group. Total booked minutes are the duration of every non-cancelled reservation charged to that account, including a future court that is not yet effective; a court with a guest is charged to its host. This week and next week are the current and following Monday–Sunday weeks in Madrid, and only reservations that have not started. Played minutes are the duration of non-cancelled reservations that have already started and on which that member sits; a future seat does not count, and the group total counts every seated member. The difference is played minutes minus the booked minutes of reservations that have already started. A future booking MUST NOT change the difference. A cancelled reservation MUST add nothing.
- **FR-011**: At the horizon opening the worker MUST freeze the court count at `min(maxCourts, ceil(optedIn / maxPerCourt))` using who was in at that instant, defaulting to 4 courts and 3 players.
- **FR-012**: The worker MUST open portal sessions `preLoginMinutes` before the opening and submit bookings at the opening. The opening is 00:00 Madrid on the day `horizonDays` before the slot's Madrid date. The default horizon is 7 days and the default pre-login is 2 minutes. After the opening, the worker MUST keep trying until the slot starts.
- **FR-021**: A grab MUST try every court at the planned time, then the same search 30 minutes earlier and 30 minutes later, staying on the same Madrid day. The reservation MUST record the time that was actually booked, and the board MUST show a court time only for a real reservation. When every try is unavailable, FODBS MUST email the opted-in members once and MUST NOT present any court as booked.
- **FR-022**: An imported gym booking at the same Madrid start, duration, and club as a weekly slot MUST count as that slot. FODBS MUST keep one occurrence for that time, MUST show only the courts that are actually reserved, and MUST NOT grab another court once the targeted count is already reserved.
- **FR-013**: Among accounts under `dirMaxPerDay` (default 2) and `dirMaxSimultaneous` (default 3), the worker MUST choose the lowest charge minus play. The charge is every non-cancelled reservation on that gym account, including future and not-yet-effective courts. Play is only reservations that have already started.
- **FR-014**: A grab MUST be idempotent per occurrence and court index.
- **FR-015**: The worker MUST cancel a held court that is missing a front occupant from 23:55 Madrid the day before the slot until `start - penaltyGuardMinutes`. The default penalty guard is 20 minutes. A court with both front boxes filled, or one already effective, MUST stay.
- **FR-016**: Portal calls MUST go through `GymGateway`. A portal failure MUST be recorded and MUST NOT crash the HTTP process.
- **FR-017**: Admins MUST be able to create invites, activate or deactivate users, and create or deactivate slot rules. Members MUST NOT.
- **FR-018**: Automated tests MUST NOT send requests to `dir.cat` or `pistes.esportiurocafort.com`.
- **FR-020**: The worker MUST book squash on `pistes.esportiurocafort.com` by choosing the court, the Madrid start, and an end time on a 15-minute grid, then paying with a bo. The reservation counter is the external reference used to list and cancel. A missing bo, a court the club does not offer, or a duration the slot does not allow MUST fail that attempt and MUST NOT start a card payment.
- **FR-019**: Deployment documentation MUST describe a separate Compose project, memory caps, no published Postgres port, and a single extra Caddy host on the existing family-net VPS.

### Key Entities

- **User**: FODBS identity, role, active flag. Separate from the gym credential.
- **Invite**: Hashed single-use token, optional email, role, expiry.
- **GymCredential**: Ciphertext for the DiR identifier and password.
- **SlotRule**: Weekly weekday, local start time, duration, club code, active flag.
- **Occurrence**: One dated slot. Court count freezes at the horizon opening.
- **Availability**: A member who is in for an occurrence.
- **Reservation**: A court this system booked, the charged user, external reference, status `held`, `cancelled`, or `played`.
- **Seat**: A member on a reservation. At most three per reservation.
- **BookingAttempt**: Idempotency record for a grab or cancel.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An invited person can reach a signed-in dashboard without any public signup path.
- **SC-002**: A database read of gym credentials shows ciphertext, and the account JSON has no password field.
- **SC-003**: Five opted-in members produce exactly two court bookings on the fake gateway, and a repeated tick does not increase that count.
- **SC-004**: A held court with one front box filled is cancelled from 23:55 Madrid the evening before and is left alone inside the penalty guard.
- **SC-005**: A fourth player cannot sit on a court, and a player cannot occupy two courts of the same slot.
- **SC-006**: `npm test` passes without network access to DiR.

## Assumptions

- Squash is booked on `https://pistes.esportiurocafort.com`. Login is `#NomUsuari` and `#Contrasenya`. A reservation is court, day, start, and end time, paid with a bo. Courts are SQ04, SQ05, SQ10, SQ11, and SQ12. The worker targets the first four. The reservation counter on "Les meves reserves" is the external reference.
- The product horizon is 7 days even though DiR's public class FAQ says 5 days. Both the horizon and the quota caps are configuration.
- Slot times are interpreted in `Europe/Madrid`.
- UI copy is English.
- One worker process is enough. There is no public signup, payment, waitlist, or mobile client in this feature.
- Hetzner deploy is documented, not executed, in this feature.
