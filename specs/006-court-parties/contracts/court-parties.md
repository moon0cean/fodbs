# Contract: Court parties, cancellation preference, and empty spots

Base path `/api`. Auth is the `fodbs_session` cookie. Errors are JSON `{ "error": "<code>" }`.

## Account preference

### `GET /api/account`

The existing object gains:

```json
{ "autoCancel": false }
```

`false` is the value for every member until they change it.

### `PUT /api/account/auto-cancel`

Body: `{ "enabled": true }`. `enabled` is a boolean.

204 on success. 400 `invalid_body` when `enabled` is missing. 401 when signed out.

The next scheduler check uses the stored value for courts charged to this member. It does not cancel anything by itself.

## Dashboard

### `GET /api/dashboard?date=YYYY-MM-DD`

Each occurrence gains:

```json
{ "unplaced": [{ "id": "…", "displayName": "…" }] }
```

`unplaced` is empty until `courtsTargeted` is set and the number of held reservations has reached it, or until the slot has started. It then lists opted-in members who have no seat on a held reservation for that occurrence.

A court with `status: "cancelled"` returns `occupants: []`. Seat history remains available on `GET /api/account` reservations, which already include player names. Those names are history, not current occupants.

Unbooked courts return `occupants: []`. Opt-in names stay on the occurrence's `optedIn` list and are not copied into bubbles.

## Empty spot

### `POST /api/reservations/:id/occupants`

Body is one of:

```json
{ "position": "front_left", "kind": "self" }
```

```json
{ "position": "front_right", "kind": "member", "userId": "…" }
```

```json
{ "position": "back", "kind": "guest", "name": "" }
```

`position` is `front_left`, `front_right`, or `back`. `name` is a string of at most 40 characters and may be empty.

204 when the person is seated.

202 `{ "requested": true }` when the add becomes a seat request. That happens when the actor is not the charged member, or when the target member has no gym credentials. The charged member still accepts or rejects it with the existing request route.

400 codes:

| Code | When |
| --- | --- |
| `invalid_body` | Missing kind, position, or user id |
| `inactive` | Actor or target is paused |
| `not_held` | Reservation is cancelled, played, or missing a booking |
| `started` | The slot has started |
| `spot_taken` | That position already has a person |
| `already_seated` | That member is already on this court |
| `not_allowed` | Actor may not fill this court |
| `last_member` | Existing guest rule: the last invited member cannot leave a guest behind. Not returned by a successful add |

404 `missing` when the reservation does not exist.

The court does not grow a second guest form. Guests still go through this route only.

## Worker

These are observable outcomes, not a new HTTP surface.

- At the horizon, `courtsTargeted` freezes at the number of play parties, capped at 4.
- Each booked court seats only that party. The charged member is on `front_left`.
- A party that cannot pay, or that does not fit under the cap or the quota, adds no seats on another party's court.
- A held court is sent to `GymGateway.cancel` for being short only when the charged member's `autoCancel` is true, the occupant count is below two, the court is not effective, and the clock is from 23:55 Madrid the evening before until 20 minutes before the start.
- Turning `autoCancel` off does not revive a reservation already marked `cancelled`.
