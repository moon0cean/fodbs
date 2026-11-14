# Feature Specification: Separate play parties and court controls

**Feature Branch**: `006-court-parties`

**Created**: 2026-11-14

**Status**: Draft

**Input**: User description: "we need to adjust several specs and fix issues: automatic cancellation must be a user preference, false by default; the blue circle is not removed when a court gets cancelled; we need a mechanism that stays reliable as new members with similar schedules overlap, because not everybody books and plays with people who are in the system; all panels and sections need the same spacing and padding across the app; clicking an empty spot on an already booked court should open a popup to add an existing active player or a guest."

This feature replaces the rule that every short court is cancelled, and the rule that every member who is in for a time is seated on the courts booked for that time. Older statements of those two rules are not the contract for this behavior.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Short courts stay unless the charged member asked to cancel them (Priority: P1)

A member decides whether a court charged to them is given back when it never fills. That choice is off until they turn it on. A court with one player is no longer cancelled overnight for a member who left the choice off.

**Why this priority**: An unwanted cancel drops a real booking. New members make short courts common, and the club booking should stay unless that member chose otherwise.

**Independent Test**: Leave the preference off, hold a court with one player through 23:55 Madrid the evening before, and confirm the club booking is still held the next day. Turn the preference on for another one-player court and confirm that one is cancelled outside the penalty guard.

**Acceptance Scenarios**:

1. **Given** a new member, **When** they open Cuenta, **Then** automatic cancellation is off.
2. **Given** the preference is off and the court is charged to that member, **When** 23:55 Madrid the evening before arrives with only one player, **Then** the court stays booked.
3. **Given** the member turns the preference on, **When** a later check runs outside the last 20 minutes with fewer than two players, **Then** the club booking is cancelled.
4. **Given** the preference is on and two players are saved in any boxes, **When** the evening deadline passes, **Then** the court stays and counts as effective. A guest counts as a player.
5. **Given** the preference is on and fewer than two players remain inside the last 20 minutes, **When** a check runs, **Then** the court is not cancelled.
6. **Given** the charged member is the only member on the court, **When** they remove themselves, **Then** they confirm, and the club booking is cancelled.
7. **Given** another member is already on that court, **When** the charged member removes themselves, **Then** they choose whether to cancel the club booking or hand the court to that member. Handing it over keeps the club booking, charges the chosen member, and removes the previous charged member. A guest cannot receive the court.

---

### User Story 2 - People who did not choose each other do not share a court (Priority: P1)

Members can want the same weekday and time without playing together. Some partners are not in the system at all. A court is booked for one party: the host, the partners that host already chose, and guest names for people who have no account. A second member with the same schedule gets their own court, or stays unbooked. They are not dropped into the first court.

**Why this priority**: Overlapping schedules are already putting the wrong people on the same court. That gets worse as more members join.

**Independent Test**: Two members opt in for Wednesday 18:00 and neither has chosen the other. Each is either on their own court or visibly without a court, and neither name appears on the other's court.

**Acceptance Scenarios**:

1. **Given** two members in for the same time who have not chosen each other, **When** courts are booked, **Then** they are not seated together.
2. **Given** a host who saved a member as a partner, and that partner is also in for that time, **When** the court is booked, **Then** the partner is seated on the host's court and does not also receive a second court.
3. **Given** two members who each saved the other, **When** courts are booked, **Then** they share one court.
4. **Given** a host who saved a guest name, **When** the court is booked, **Then** that name is added as a guest and no account is created.
5. **Given** a saved member partner who is not in for that time, **When** the court is booked, **Then** that partner is not seated and the spot stays empty.
6. **Given** more parties than the club or the paying accounts can take, **When** booking finishes, **Then** the parties that did not fit stay off every other court, and those members can see that no court was held for them.
7. **Given** nobody in a party can pay with bons, **When** booking is attempted, **Then** that party is not booked and is not moved onto another party's court.
8. **Given** one partner saved by two hosts, **When** courts are booked, **Then** the partner sits only on the court of the host with fewer booked hours. If those hours are equal, the partner sits with the host who joined that time earlier.

---

### User Story 3 - An empty spot can take a member or a guest (Priority: P1)

On a court that is already booked, an empty spot is how a member adds someone. One popup offers an active member who already has an account, or a guest for someone who does not.

**Why this priority**: Once strangers are no longer seated automatically, the empty spot is the normal way to finish a court, including with people who will never join.

**Independent Test**: Open a held court with an empty spot, add one active member, then add a guest on another empty spot. Both appear only on that court.

**Acceptance Scenarios**:

1. **Given** a held court and an empty spot, **When** a member who may fill the court chooses that spot, **Then** a popup offers an active member or a guest.
2. **Given** the charged member picks an active member who can take a seat, **When** they confirm, **Then** that member is on that spot.
3. **Given** a seated member adds a guest name, or leaves the name blank, **When** they confirm, **Then** the guest is on that spot and no email is asked.
4. **Given** the member to add cannot take a seat directly, or the person adding them is not the charged member, **When** they confirm, **Then** the charged member receives a request and the spot stays empty until they accept.
5. **Given** a paused member, or a member already on the court, **When** the popup is open, **Then** that person is not offered.
6. **Given** a court that is cancelled or not booked yet, **When** a member looks at its spots, **Then** this popup is not offered.

---

### User Story 4 - A cancelled court no longer shows its players (Priority: P2)

Cancelling a court clears the diagram. The charged member's distinct colour goes away with every other player mark. The board must not keep looking occupied.

**Why this priority**: A colour left behind reads as a person still on a court the club has already released.

**Independent Test**: Cancel a held court whose charged member is shown in the distinct colour, refresh the board, and confirm that colour and the other player marks are gone.

**Acceptance Scenarios**:

1. **Given** a held court showing the charged member in their distinct colour, **When** the court is cancelled, **Then** the board shows no player marks on it.
2. **Given** the same court after a refresh, **When** the member looks again, **Then** the charged member's colour is still absent.
3. **Given** a cancelled booking listed later on Cuenta, **When** the member reads that history, **Then** the names may remain as history and are not drawn as people currently on a court.

---

### User Story 5 - Every section uses the same spacing (Priority: P3)

Panels line up. The board, the roster, booking, opt-in, Cuenta, the members page, and popups share one inner padding and the same space between stacked sections, on a wide screen and on a phone.

**Why this priority**: The actions above land in several sections. Uneven padding makes the app look like separate pieces.

**Independent Test**: Open each signed-in section on a wide window and on a narrow window and compare the inset of the section body and the gap under each section heading.

**Acceptance Scenarios**:

1. **Given** the board, the roster, booking, opt-in, Cuenta, and the members page, **When** they are compared, **Then** each section body uses the same inner padding and the same gap between stacked sections.
2. **Given** a popup, **When** it opens, **Then** its content uses that same inner padding.
3. **Given** a phone-width window, **When** the member slides between courts, **Then** the section inset stays the same and the court drawing is not restyled to create the alignment.

---

### Edge Cases

- The member turns automatic cancellation on after 23:55, with one player, and still outside the last 20 minutes. The next check cancels that court.
- The member turns it off after a cancel was already sent. The past cancel stays cancelled.
- A party has more saved names than the host's party size of 2 or 3. Only that many spots are filled. Someone who was only an extra name is not given a court of their own unless they were independently in for that time and were not seated.
- A partner is saved by two hosts who are both in for that time. The partner sits on one court only. The host with fewer booked hours keeps them. If those hours match, the host who joined that time earlier keeps them.
- The host cannot pay and a chosen partner can. The partner's account is charged, that partner is shown as the charged member, and the host is still seated. A member outside the party is not charged and is not seated.
- The host has no club credentials. That host is not the charged member. They can be added onto a credentialed member's court by request.
- The last invited member on a court that still has a guest cannot leave until the guest is removed.
- Two members choose the same empty spot. Only one person ends up on it. The other sees that the spot was taken.
- A guest is added, then the court is cancelled. The guest mark is removed with the charged member's colour.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-601**: Each member MUST have an automatic-cancellation preference, off by default. They MUST be able to turn it on or off from Cuenta. The value shown there MUST be the value that later checks use.
- **FR-602**: The preference MUST apply to courts charged to that member, including courts already held. A change MUST apply from the next check on.
- **FR-603**: While the preference is off, a held court MUST NOT be cancelled for having fewer than two players. The charged member MUST still be able to cancel it by removing themselves, after a confirmation. When another member is on the court, FR-614 applies first.
- **FR-604**: While the preference is on, a held court with fewer than two saved occupants MUST be cancelled from 23:55 Madrid the evening before the slot until 20 minutes before the start. Two occupants in any boxes MUST keep the court and make it effective. A guest counts as an occupant. Inside those last 20 minutes the court MUST NOT be cancelled for being short.
- **FR-605**: Being in for a time, including a schedule match that opts a member in, MUST mean that member wants a court then. It MUST NOT seat them with members they were not chosen to play with.
- **FR-606**: A party MUST be one host, the member partners that host saved, and the guest names that host saved, limited by that host's party size of 2 or 3. A saved member is seated only when they are also in for that time and may take a seat. A saved guest name is added as a guest. Spots the list does not fill MUST stay empty. A guest MUST NOT create an account.
- **FR-607**: Members who have not chosen each other MUST be separate parties and MUST NOT be seated on each other's courts. Members who have chosen each other MUST share one court. A member already placed MUST NOT receive another court for that time. When more than one member could host a shared partner, the member with fewer booked hours hosts; if those hours are equal, the member who joined that time earlier hosts.
- **FR-608**: The charged member MUST be someone in the party, MUST be seated, and MUST be shown in the charged member's distinct colour. The system MUST try the host's club account first, then another party member's account that can pay. It MUST NOT pay with, or seat, a member from outside the party.
- **FR-609**: A party that cannot be booked, because of club limits or because nobody in the party can pay, MUST stay unbooked. Its members MUST NOT be moved onto another party's court, and they MUST be able to see that no court was held for them.
- **FR-610**: On a held court, choosing an empty spot MUST open one popup for that spot. The popup MUST offer an active member or a guest. It MUST also offer the signed-in member themselves when they may sit and are not already on the court. Paused members, and members already on the court, MUST NOT be offered. The popup MUST NOT be offered on a cancelled court or a court that is not booked yet.
- **FR-611**: The charged member MUST be able to place an active member who can take a seat directly onto that spot. Adding a member who cannot take a seat directly, or an add made by someone other than the charged member, MUST become a request that the charged member accepts or rejects. A seated invited member MUST be able to add a guest immediately. The guest is a name, or no name, and no email is collected. The court MUST NOT show a second guest form under the diagram.
- **FR-612**: When a court is cancelled, the board MUST show no player marks on it, including the charged member's distinct colour. A refresh MUST show the same. History on Cuenta MAY keep the names of a past cancelled booking and MUST NOT draw those people as current occupants.
- **FR-613**: Every section and panel MUST use the same inner padding and the same space between stacked sections, on a wide screen and on a phone. This includes the board, the roster, booking, opt-in, Cuenta, the members page, court cards, tables inside those sections, and popups. The court drawing, buttons, and help marks keep their own sizes. Sliding between courts on a phone MUST NOT change the section inset.
- **FR-614**: When the charged member removes themselves and at least one other member is on that held court, the app MUST ask whether to cancel the club booking or hand the court to one of those members. Handing it over MUST keep the club booking, charge the chosen member, remove the previous charged member, and show the chosen member in the charged colour. A guest MUST NOT be offered as the receiver. When no other member is on the court, removing the charged member MUST still confirm and cancel.

### Key Entities

- **Cancellation preference**: One member's choice to give back their short courts, on or off. Off until they change it. Applies to courts charged to them.
- **Party**: The people who share one court at one time. One host, member partners that host chose and who are in for that time, and guest names for people without an account. Size is the host's 2 or 3.
- **Spot choice**: One empty spot on a held court, filled by the signed-in member, another active member, or a guest.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-601**: With automatic cancellation left off, a one-player court charged to that member is still held after 23:55 Madrid the evening before, in every such case that nobody cancelled by hand.
- **SC-602**: With the preference on, a one-player court is cancelled when a check runs at 23:55 or later and more than 20 minutes before the start, and a two-player court is not.
- **SC-603**: In a pair of members who share a time and have not chosen each other, neither name appears on the other's court.
- **SC-604**: A member adds an active player or a guest to an empty spot from one popup, without leaving the court, and the added person is visible on that spot.
- **SC-605**: After a cancel, the board shows zero player marks for that court, including the charged member's colour, both immediately and after a refresh.
- **SC-606**: The board, roster, booking, opt-in, Cuenta, members page, and popups share one inner padding and one gap between stacked sections, on a wide window and on a phone-width window.

## Assumptions

- The preference belongs to each member, for courts charged to that member. It is not one switch for the whole club, and an admin does not set it for someone else.
- "Chosen" means the host saved that member as a playing partner, or someone added them from the empty-spot popup. A schedule match alone is not a choice to share a court.
- Schedule matching still opts a member in for that exact weekday and time unless they have declined. That opt-in asks for a court. It does not choose companions.
- The signed-in member can still take an empty spot themselves from the same popup, so adding someone else does not remove the way to sit.
- Removing another player, a guest counting as an occupant, the host paying for a court that has a guest, and the last invited member being unable to leave while a guest remains, all stay as they are. The charged member's confirm-and-cancel stays when they are the only member on the court. When another member is on it, they choose cancel or transfer, as in FR-614.
- Club limits stay as they are: two bookings a day on one account, four at the same time, and no more than four courts for one time.
- The older rule that every short court is cancelled is retired by FR-601 through FR-604. Wherever that older rule is still written, including the project constitution, it has to be updated with this feature.
- This feature does not change invitation-only access, manual search by the hour, the red remove mark, or the language default. New labels follow the member's language, Spanish unless they switched to English.
- Alignment is the section inset and the gap between sections. Colours, type, and the squash diagram are left as they are.
