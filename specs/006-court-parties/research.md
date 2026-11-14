# Research: Separate play parties and court controls

## Automatic cancellation

- **Decision**: Store `users.auto_cancel` as a boolean, not null, default false. Existing rows get false. The worker reads it for the charged member only. `shouldCancel` returns false when the flag is off. When it is on, the current 23:55-to-penalty-guard rule stays. Two occupants at or after the deadline still mark the court effective even if the flag is off, so turning it on later does not cancel a court that already filled.
- **Rationale**: The confirmed assumption is one choice per charged member, off until they change it, including courts already held. A column on the user is the smallest store. Effective stays a latch on the reservation.
- **Alternatives considered**: One admin switch for the whole club. Rejected because the assumption is per member. A flag on each reservation copied at booking time. Rejected because a change on Cuenta must apply at the next check, including courts already held.

## Who shares a court

- **Decision**: Compute parties in memory at the tick. No party table. Candidates are active members opted in for that occurrence. Among candidates, a member listed by another candidate is claimed by the lister with fewer booked hours, then the earlier opt-in, then the user id. A mutual pair is not two claims: the lighter member hosts and the other is only claimed. A claimed member does not host and does not claim anyone else. Each remaining unclaimed candidate with club credentials hosts their own party. The host's saved list fills that court, in list order, up to the host's party size of 2 or 3, counting the host. A saved member is added only when they are a candidate, have credentials, and are not already claimed. Guest names fill remaining spots and never host. Members past the cap of four parties, and any party whose members cannot pay, stay unbooked.
- **Rationale**: This matches the confirmed rule that a schedule match is not a choice to share, that one saved partner does not get a second court, and that two listers of the same person resolve by booked hours. Computing it avoids a table that would go stale when someone edits their list before the grab.
- **Alternatives considered**: Keep `courtsToBook(optedIn / partyDivisor)` and only stop the auto-seat. Rejected because the extra courts would still be charged through the global lightest account and strangers would still be the payers. Seat every opted-in member only with their own preferred list on one shared court. Rejected because overlapping schedules would still mix parties.

## Who pays

- **Decision**: Payer order for a party is the host, then the other credentialed party members with the lightest charge minus play. Quota stays 2 per day and 4 simultaneous. `bons_unavailable` tries the next payer in that party on the same court. Nobody outside the party is tried. The charged member is seated on `front_left` and is the blue holder. The host is seated too when they are not the payer. `createReservation` stops calling `seatOptIn` for every opted-in member and stops prefilling a preferred list that is wider than this party. Opt-in itself no longer calls `seatOptIn`. Declining still removes that member's seat.
- **Rationale**: The club booking is in the payer's name, so the blue mark stays the charged member. The host is still on the court when a partner's bons pay. Keeping the retry inside the party is what stops a light outsider from being seated.
- **Alternatives considered**: Charge any eligible account and paint the host blue even when they did not pay. Rejected because the blue mark is the account that pays. Leave the global `pickAccount` loop. Rejected because that loop is the overlap bug.

## Seeing that no court was held

- **Decision**: Do not store an unplaced row. The dashboard lists opted-in members who are not occupants of a held reservation once `courtsTargeted` is set and the held count has reached it, or once the slot has started. The existing miss email still goes out only when the whole occurrence books nothing.
- **Rationale**: The member must be able to see it on the board. A stored row would need its own cleanup. Before the grab finishes, showing "no court" would be wrong.
- **Alternatives considered**: Email every unplaced member. Rejected as extra mail for a state the board can show. Paint them into a pending bubble. Rejected because that is the bug this feature removes.

## Cancelled court marks

- **Decision**: `buildCourts` returns an empty occupant list when the reservation status is `cancelled`. Seat rows stay in the database. Cuenta history still reads those rows as names. `assignOptedIn` no longer paints opted-in members into unbooked bubbles.
- **Rationale**: The blue circle is the charged member's seat rendered on a cancelled reservation. Clearing the diagram without deleting seats keeps history and removes the mark. Stopping the preview paint keeps a not-yet-booked court from looking occupied.
- **Alternatives considered**: Delete seats on cancel. Rejected because Cuenta may still name who was on a past booking. Hide the whole court card. Rejected because the member should see that the court was cancelled, just not who is "still" on it.

## Empty-spot popup

- **Decision**: One route, `POST /api/reservations/:id/occupants`, with a position and either the signed-in member, another user id, or a guest name. The server places a credentialed member immediately when the actor is the charged member, returns 202 and creates the existing seat request otherwise, and adds a guest when the actor is a seated member or the charged member. The under-court guest form is removed. The client uses `activeUsers` already on the dashboard. Paused members are absent there. The server still rejects a paused or already seated target.
- **Rationale**: The popup is one action with three outcomes the API already knows how to store. A new list endpoint would repeat the roster.
- **Alternatives considered**: Keep `POST /seats` for self and `POST /guests` for guests, and add a third call for other members. Rejected because the popup would have to guess which call is legal. The one route lets the server decide place versus request.

## Spacing

- **Decision**: Define `--section-pad: 12px 14px` and `--section-gap: 12px` and use them on the board, roster, booking, opt-in, Cuenta, the members page, and popup content. Button size, the help mark, and the squash diagram keep their own measurements.
- **Rationale**: Those two values are already what the main cards use. The uneven pieces are the popup (16px), the page header, and a few one-off gaps. Pointing the section bodies at the variables makes the inset one place to check.
- **Alternatives considered**: A new visual scale. Rejected because the request is alignment, not a redesign.

## Constitution

- **Decision**: Principle IV is amended to 1.1.0 in the same change. The older spec sentences that still required pooling or an unconditional cancel now cite this feature.
- **Rationale**: The constitution says a grab-formula change is an amendment plus a spec update, not an exception.
- **Alternatives considered**: Leave Principle IV and record a complexity exception. Rejected because the confirmed assumption retires that rule rather than waiving it once.
