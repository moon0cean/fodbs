# Feature Specification: Play shape

**Feature Branch**: `002-play-shape`

**Created**: 2026-10-17

**Status**: Implemented

**Input**: User description: "Players set cadence, time, and a preference for 2 or 3. They can add a guest only on a court where an invited member is playing, and that member pays for the whole court. The court is a squash diagram with two mandatory front bubbles and one optional back bubble. Both front bubbles must be filled by the end of the day before, or the booking is cancelled. Spanish is the default language, English is available. The board works on a phone."

This feature amends FR-010, FR-011, and FR-015 from `001-court-booking`.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Set how you play (Priority: P1)

A member saves the weekdays they play, the time they prefer, and whether they want a court of 2 or 3. A slot at that weekday and time counts them in unless they opt out.

**Independent Test**: Save Monday 19:00 and party size 2. A Monday 19:00 occurrence includes them. Opting out keeps them out on the next sync.

**Acceptance Scenarios**:

1. **Given** a member, **When** they save weekdays, a preferred time, and party size 2 or 3, **Then** the account page shows those values again.
2. **Given** a preference that matches an occurrence, **When** occurrences are synced, **Then** the member is in for that occurrence.
3. **Given** the member then opts out, **When** sync runs again, **Then** they stay out.

### User Story 2 - Squash court and guests (Priority: P1)

A held court is drawn as a squash court. Two bubbles sit in the front service boxes and are mandatory. One bubble sits at the back and is optional. An invited member on that court can add a named guest into an empty bubble. A guest cannot be added to a court with no invited member. The invited member who adds guests assumes the whole court in the balance.

**Independent Test**: Place two members in the front boxes, add a guest in the back, and confirm the host's booked minutes increase by the full duration once. A guest name does not add played minutes.

**Acceptance Scenarios**:

1. **Given** a held court, **When** a member takes a front box, **Then** that bubble shows their name and they leave any other court of the same slot.
2. **Given** the member is on the court, **When** they add a guest to an empty bubble, **Then** the guest name appears there and only on that court.
3. **Given** no invited member on the court, **When** someone tries to add a guest, **Then** it is rejected.
4. **Given** guests on the court, **When** the last invited member tries to leave, **Then** the leave is rejected.
5. **Given** a court with guests, **When** balances are computed, **Then** the host is booked for the full duration and each invited member who occupies a bubble is played for that duration.

### User Story 3 - Cancel unless both front boxes are filled (Priority: P1)

From 23:55 Madrid the evening before the slot, both front bubbles must be occupied by a member or a guest. Otherwise the reservation is cancelled, as long as that instant is still outside the penalty guard. The back bubble can stay empty. Once both front bubbles are filled at or after that deadline, the booking is effective and a later empty back bubble does not cancel it.

**Independent Test**: With the front right empty, a tick before 23:55 the evening before does not cancel, a tick at 23:55 and outside the penalty guard does, and a court with both front boxes filled does not.

**Acceptance Scenarios**:

1. **Given** a held court missing a front box and the clock before 23:55 Madrid the evening before, **When** the worker ticks, **Then** the court stays held.
2. **Given** the same court at 23:55 that evening and before the penalty guard, **When** the worker ticks, **Then** the gateway cancel runs and the reservation is cancelled.
3. **Given** both front boxes filled, **When** the deadline has passed, **Then** the court is not cancelled.
4. **Given** the clock inside the penalty guard, **When** a front box is still empty, **Then** the worker does not call cancel.

### User Story 4 - Spanish and a phone layout (Priority: P2)

The interface is Spanish unless the member switches to English. The choice is remembered on the device. On a narrow screen the four squash courts sit in a horizontal slider, one court at a time, and controls are large enough to tap.

**Independent Test**: Load with no saved language and see Spanish. Switch to English and reload. Below 800px the courts slide sideways in order 05, 04, 11, 10.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-101**: A member MUST be able to save weekdays (ISO 1–7), a preferred `HH:mm`, and a party size of 2 or 3.
- **FR-102**: An occurrence whose Madrid weekday and time match a member's preference MUST count that member in, unless they have opted out. Once a court is actually booked, opt-in MUST seat that player in opt-in order when that player has linked DiR credentials. A court with no reservation MUST NOT be shown as booked.
- **FR-112**: A member without linked DiR credentials MUST NOT take a seat directly and MUST NOT be seated by opt-in. They can request one empty spot on a held court. The member whose DiR account is charged for that court receives an email and approves or rejects the request in FODBS. Approval places the requester on that spot. Rejection does not.
- **FR-103**: Court count MUST use a divisor of 2 when more opted-in members prefer 2 than 3, and 3 otherwise, still capped at 4 courts.
- **FR-104**: A held court MUST be drawn as a singles squash floor: front wall at the top, the short line across the court, the half-court line from the middle of the short line to the back wall, and a 1.6 m service box on each side wall sitting on the short line. Positions are `front_left` and `front_right` inside those boxes, and `back` behind them toward the back wall. The two boxes are mandatory. `back` is optional.
- **FR-105**: A member MUST be able to take an empty position and MUST leave any other court of that occurrence.
- **FR-106**: An invited member who occupies the court MUST be able to add one guest to an empty position on that same court. The guest is a name, or no name. No email is collected. A guest MUST NOT be added when no invited member is on the court.
- **FR-107**: The last invited member on a court that has a guest MUST NOT be able to leave until the guest is removed.
- **FR-108**: When a court has at least one guest, booked minutes for the full duration MUST be attributed to the invited host who added a guest, not split. Played minutes MUST count only invited members in a bubble.
- **FR-109**: From 23:55 Madrid the evening before the slot, a held court that is not yet effective and is missing a front occupant MUST be cancelled when the clock is still before the penalty guard. Both front occupants present at that deadline MUST make the booking effective. A guest in a front box counts as an occupant.
- **FR-110**: The UI MUST default to Spanish, offer English, and remember the choice. Messages shown for a failed action MUST follow that language. The court cards MUST fill the width of the panel. Their order is Squash 05 top left, 04 top right, 11 bottom left, and 10 bottom right. Below 800px those four courts MUST be a horizontal slider in that same order, one court across the panel, so the member can slide to the next court. Above that they stay side by side. Opting in, or a booking on one court, MUST NOT move or stretch the other card.
- **FR-111**: A member MUST be able to pause and restore their own account. A paused account can log in, and MUST NOT opt in, take a seat, or be used to book.

### Key Entities

- **PlayerPreference**: weekdays, preferred time, party size, per user.
- **Occupant**: a position on a reservation, either an invited user or a guest name.
- **Host**: the invited member who carries the whole court cost when guests are present.
- **Effective**: set when both front positions are filled at or after the local deadline.

## Success Criteria *(mandatory)*

- **SC-101**: Preference sync and opt-out are stable across a second sync.
- **SC-102**: A guest cannot exist on a court with no invited member.
- **SC-103**: Missing a front box from 23:55 the evening before cancels; filling both front boxes does not.
- **SC-104**: `npm test` passes without calling DiR.

## Assumptions

- Preferred time matches an admin slot exactly (`HH:mm` in Europe/Madrid). Other slots still accept a manual opt-in.
- Party size changes how many courts are grabbed. It does not cancel a court that has the two front boxes filled.
- Guest names are display-only. They are not FODBS accounts and have no balance.
- The gym-account rotation for the scheduler still follows the DiR account that placed the booking.
