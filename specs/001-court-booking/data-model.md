# Data Model: Court booking

Times are `timestamptz`. Slot local time is a `HH:mm` string. Weekday is ISO
(Monday = 1, Sunday = 7).

## User

| Field | Notes |
| --- | --- |
| id | UUID text, primary key |
| email | Unique, stored lowercased |
| password_hash | argon2id |
| display_name | 1–40 characters |
| role | `admin` or `member` |
| active | Deactivated users cannot authenticate |
| created_at | |

## Session

| Field | Notes |
| --- | --- |
| token_hash | SHA-256 of the cookie value, primary key |
| user_id | |
| expires_at | 14 days from login |

## Invite

| Field | Notes |
| --- | --- |
| id | UUID |
| token_hash | SHA-256, unique |
| email | Optional bind |
| role | Role granted on accept |
| created_by | Admin user id |
| expires_at | 7 days from creation |
| used_at | Null until accepted |
| used_by | Set on accept |

## GymCredential

| Field | Notes |
| --- | --- |
| user_id | Primary key |
| username_ciphertext | AES-256-GCM, AAD = user id |
| username_nonce | |
| password_ciphertext | AES-256-GCM, AAD = user id |
| password_nonce | |
| updated_at | |

The API never selects `password_ciphertext` for a response.

## SlotRule

| Field | Notes |
| --- | --- |
| id | |
| weekday | 1–7 |
| start_time | `HH:mm` in Europe/Madrid |
| duration_minutes | Positive |
| club_code | Passed to the gateway |
| active | Inactive rules produce no new occurrences |
| created_at | |

## Occurrence

| Field | Notes |
| --- | --- |
| id | |
| slot_rule_id | |
| starts_at | Unique with `slot_rule_id` |
| duration_minutes | Copied from the rule at creation |
| club_code | Copied from the rule |
| courts_targeted | Null until the horizon opening freezes it |
| grabbed_at | Set when the freeze is written |

## Availability

Primary key `(occurrence_id, user_id)`. Presence means the member is in.

## Reservation

| Field | Notes |
| --- | --- |
| id | |
| occurrence_id | |
| court_index | 0–3, unique with `occurrence_id` |
| charged_user_id | Whose gym account was used |
| external_ref | Portal reference |
| status | `held`, `cancelled`, or `played` |
| booked_at | |
| cancelled_at | |

A held reservation whose start has passed becomes `played`.

## Seat

Primary key `(reservation_id, user_id)`. At most three seats, enforced by the
domain function before insert.

## BookingAttempt

| Field | Notes |
| --- | --- |
| idempotency_key | Primary key. `grab:{occurrenceId}:{courtIndex}` or `cancel:{reservationId}` |
| kind | `grab` or `cancel` |
| status | `pending`, `succeeded`, or `failed` |
| detail | Short text, never a secret |
| updated_at | |

A succeeded key is not replayed. A failed key may be claimed again after 60
seconds.

## Balance

For a member, booked minutes are the durations of reservations charged to them
whose status is not `cancelled`. Played minutes are the durations of
non-cancelled reservations where they have a seat. The group totals are the
sums across members. Cancelled rows add nothing.

## Relationships

- User 1—0..1 GymCredential
- User 1—many Session, Invite (created), Reservation (charged), Seat, Availability
- SlotRule 1—many Occurrence
- Occurrence 1—many Availability, Reservation
- Reservation 1—many Seat, and 1 BookingAttempt for its cancel
