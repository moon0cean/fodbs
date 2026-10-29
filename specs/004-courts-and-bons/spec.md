# Feature Specification: Court times and bons

**Feature Branch**: `004-courts-and-bons`

**Created**: 2026-10-18

**Status**: Implemented

**Input**: Each court shows the times it may be booked that day, on its own slider. The account page shows remaining bons, a sync button refreshes bookings and bons, guests are removed from a mark on their bubble, and a member is emailed when their bons are gone or cannot cover another hour.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A time slider on each court (Priority: P1)

The day slider stays above the board. Each court shows only the times that court itself is booked, or the times where someone is already on that court. A time that is not booked yet has one opt-in control for the whole slot, not one under every court. Player marks stay circles. The board does not explain that two players are required.

**Independent Test**: Book one court at 18:00. That court shows 18:00. The other three do not show an opt-in button. A future unbooked 20:00 shows one “Me apunto”.

**Acceptance Scenarios**:

1. **Given** one booked court at a time, **When** the board loads, **Then** only that court shows the time, and the other courts have no “Apuntado” button.
2. **Given** a time with no booking yet, **When** the board loads, **Then** there is one opt-in control for that time.
3. **Given** any court, **When** a player mark is shown, **Then** its width and height match.

### User Story 2 - Bons and a manual sync (Priority: P1)

The account page shows how many squash bons remain. A sync button asks the club for the current bookings and the current bons.

**Independent Test**: Packs of 40 with 22 used, and an expired pack with unused franjas, leave 18. The account page shows 18 after a sync.

**Acceptance Scenarios**:

1. **Given** saved club credentials, **When** the member syncs, **Then** current bookings are imported and the remaining bons are shown.
2. **Given** no club credentials, **When** the member syncs, **Then** the action is refused.
3. **Given** a pack whose expiry date is before today, **When** remaining bons are counted, **Then** that pack is ignored.

### User Story 3 - Remove a guest from the bubble (Priority: P1)

A guest is only shown inside a bubble. A red circle with a cross on that bubble removes the guest. No guest list is drawn under the court.

**Independent Test**: Add a guest, see the cross on the bubble, and see no remove control under the court.

### User Story 4 - Mail when bons run out (Priority: P2)

A member is emailed once when they have no bons left, and once when they still have some but fewer than one hour (4 bons). Buying more and falling back into that state sends the mail again. Staying in the same state does not.

**Independent Test**: 18 bons sends nothing. 3 bons sends the low notice once. 0 bons sends the empty notice once. Another sync at 0 sends nothing.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-401**: The day slider MUST stay above the courts. A court MUST list only the times that court is booked or already has players, and a time selection on one court MUST NOT change another court. A time that is not booked yet MUST have a single opt-in control, not one on every court. Player marks MUST be circles. The board MUST NOT explain that two players are required. Below 800px the courts themselves MUST slide sideways, and that slide MUST stay separate from each court's time slider.
- **FR-402**: The account page MUST show the remaining squash bons from the latest sync. Remaining bons are the unused franjas of packs that have no expiry or an expiry on or after today in Europe/Madrid.
- **FR-403**: A member with club credentials MUST be able to request a sync of bookings and bons. The worker performs it. A member without credentials MUST be refused.
- **FR-404**: A red cross on a bubble removes that player. A seated member can remove a guest. The charged member can remove another player. Removing yourself leaves the court, except the charged member: that action asks for confirmation and then cancels the club booking. The charged member's bubble MUST use a different colour from the other players. The court MUST NOT list guests underneath the diagram. Spanish copy MUST say bonos.
- **FR-405**: When a sync finds fewer than 4 bons, or none, the member MUST be emailed once for that state. The mail is in Spanish. A later sync that finds the same state MUST NOT send it again.

### Assumptions

- One hour on a Rocafort court spends 4 bons, because the club sells time in 15-minute franjas.
- The bons page is `BonsLlista.php`. Only the first table, the pack history, is counted.
