# Data model: Separate play parties and court controls

## User

Existing `users` row.

| Field | Rule |
| --- | --- |
| `auto_cancel` | Boolean, not null, default false. The member edits it from Cuenta. It applies to reservations whose `charged_user_id` is this user, including rows booked before the edit. |

No other user field changes. Paused (`active = false`) members are not candidates, not payers, and not listed in the empty-spot popup.

## Play party

Not stored. Built at the scheduler tick, and again for a manual booking, from data that already exists.

Inputs:

- Opted-in rows for the occurrence (`availability.declined = false`), with `created_at`.
- The member's `player_preferences.party_size` (2 or 3; missing means 3) and whether they have gym credentials.
- Booked minutes already used for burden, the same charge-minus-play figure as today.
- That member's `preferred_players`, ordered by `position`. A row is either `target_user_id` or `guest_name`.

Output, in host order:

| Field | Rule |
| --- | --- |
| Host | An opted-in candidate with credentials who was not claimed by another candidate. |
| Members | Host first, then claimed partners who have credentials and were in for this time. Length plus guests is at most the host's party size. |
| Guests | Guest names from the host's list, in list order, in the spots the members did not take. |
| Payers | Host, then other members in the party ordered by charge minus play, then user id. Drop anyone over the daily or simultaneous quota. |

Claim rules:

- A candidate listed by one or more other candidates is claimed by the lister with fewer booked hours. Equal hours: earlier opt-in. Still equal: lower user id.
- If each lists the other, only the lighter member hosts. The other is claimed and does not host.
- A claimed member does not claim anyone.
- Someone who is not opted in cannot claim and cannot be seated from the list.
- At most four parties are booked. Later parties are unplaced.

Validation:

- A user id appears in at most one party for that occurrence.
- A guest name does not create a user.
- A party with an empty payer list is not booked.

## Reservation

Unchanged columns. `charged_user_id` is the payer chosen from that party and is the blue mark. `status` moves `held` → `cancelled` only by the existing cancel path. `effective` becomes true when two occupants are saved at or after 23:55 Madrid the evening before, whether or not `auto_cancel` is on.

`host_user_id` stays the member who carries a court that has a guest. It is not the play-party host.

## Seat

Unchanged. Cancel does not delete seats. The board omits them when `status` is `cancelled`. Cuenta history still reads them.

Positions stay `front_left`, `front_right`, and `back`. The charged member is `front_left`. Party size 2 does not use `back`.

## Seat request

Unchanged. The popup creates one when the actor is not the charged member, or when the target has no gym credentials. One pending request per member per reservation.

## What is not stored

- Which party a reservation came from. After booking, the seats are the record.
- An "unplaced" flag. The dashboard derives it: opted-in members with no seat on a held reservation for that occurrence, once the frozen court count has been filled or the slot has started.
