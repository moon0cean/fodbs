# Feature Specification: Group board, manual booking, and preferred players

This feature amends the board in `001-court-booking` and the seating rules in `002-play-shape`.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Group counts on the board (Priority: P1)

The board shows how many courts the group still has to play, not a copy of one person's hours.

1. **Given** three future courts this Madrid week and one next week, **When** a member opens the board, **Then** the group card shows those court counts and the roster has no personal hour difference.
2. **Given** a member, **When** they open Cuenta, **Then** the five personal hour figures are still there.

### User Story 2 - Book a free court by hand (Priority: P1)

A member with a DiR account can look for a court and book one.

1. **Given** a free court at the requested time, **When** they search, **Then** that court is listed before any alternative.
2. **Given** no court at that time and a free court 30 minutes earlier the same Madrid day, **When** they search, **Then** the earlier court is listed as an alternative.
3. **Given** they confirm a free court, **When** the booking succeeds, **Then** it is charged to their DiR account and they are seated.
4. **Given** they are already at the daily or simultaneous cap, **When** they confirm, **Then** nothing is booked.

### User Story 3 - Scheduler settings and a look that does not book (Priority: P1)

An admin sets how the worker books, and can ask it to look at the club without booking.

1. **Given** offset search is off, **When** the planned time is unavailable, **Then** the worker does not try 30 minutes either side.
2. **Given** the availability check is on, **When** it is due, **Then** the chosen DiR account is used only to read free or busy, and the board shows that for courts with no reservation.

### User Story 4 - Preferred players (Priority: P2)

A member keeps an ordered list of other members and guest names. The list fills empty spots after they book or sit. It does not book another court and it does not send email.

1. **Given** the member is the charged account, **When** they book or sit, **Then** preferred members take empty spots.
2. **Given** the member sits on someone else's court, **When** the list has another member, **Then** that person becomes a seat request.
3. **Given** the member is on the court, **When** the list has a guest name, **Then** the guest is added to an empty spot.

## Requirements *(mandatory)*

- **FR-201**: The board MUST show group court counts for this Madrid week still to play, next week, and already started. Each non-cancelled reservation counts once. The roster MUST NOT show a personal hour difference.
- **FR-202**: Cuenta MUST keep the personal booked, this week, next week, played, and difference figures.
- **FR-203**: A member with DiR credentials MUST be able to search a day, time, and duration. The search reads the club form and MUST NOT confirm a payment or a booking. Exact free courts come first, then free courts 30 minutes earlier or later on the same Madrid day when that offset is enabled.
- **FR-204**: Confirming a search result MUST book that court on the member's DiR account, store the reservation, and seat them, unless the daily or simultaneous cap says no.
- **FR-205**: An admin MUST be able to set days ahead (default 7), how often the worker checks (default 15 seconds), and whether it may try ±30 minutes (default on). The worker uses those values, and the environment values when no row exists.
- **FR-206**: An admin MUST be able to enable an availability check on one DiR account, every N hours (default 6). The check uses the same read-only look as the wizard. Results appear on the board for courts that have no reservation.
- **FR-207**: A member MUST be able to save an ordered list of other members and guest names. After they book or sit, empty spots are filled from that list. Preferred members are seated when the actor is the charged account, and requested otherwise. Guest names are added only when the actor may add a guest. The list MUST NOT create a club booking and MUST NOT send mail.

## Assumptions

Opening the club form can start a temporary hold even when FODBS does not confirm it. The probe leaves the form without ticking payment or pressing the add button. Automated tests use the fake gateway and do not call the live club.
