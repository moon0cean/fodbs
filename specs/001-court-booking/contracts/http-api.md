# HTTP API: Court booking

Base path `/api`. Auth is the `fodbs_session` cookie. Errors are JSON
`{ "error": "<code>" }`.

Unauthenticated routes: `POST /api/auth/login`, `POST /api/auth/accept-invite`,
`GET /api/health`.

## Auth

### `POST /api/auth/login`

Body: `{ "email", "password" }`.

Rate limit: 10 requests per minute per IP.

200 `{ "id", "email", "displayName", "role", "active" }` and sets the cookie.

401 `invalid_credentials` for a wrong password or a deactivated user.

### `POST /api/auth/logout`

204. Clears the cookie and deletes the session.

### `GET /api/auth/me`

200 the same user object plus `hasGymCredentials`. 401 if signed out.

### `POST /api/auth/accept-invite`

Body: `{ "token", "email", "password", "displayName" }`.

201 the user object and a session cookie.

400 `invalid_invite`, `email_mismatch`, `weak_password`, or `email_taken`.

## Account

### `GET /api/account`

200:

```json
{
  "balance": { "bookedMinutes": 0, "playedMinutes": 0 },
  "hasGymCredentials": true,
  "gymUsername": "12345678Z",
  "reservations": [
    {
      "id": "...",
      "startsAt": "2026-10-24T17:00:00.000Z",
      "courtIndex": 0,
      "status": "held",
      "durationMinutes": 60,
      "clubCode": "ROC"
    }
  ]
}
```

`gymUsername` is the owner's identifier. The password is not a field.

### `PUT /api/account/credentials`

Body: `{ "username", "password" }`. Both required, non-empty.

204. Replaces any previous ciphertext.

## Dashboard

### `GET /api/dashboard?date=YYYY-MM-DD`

`date` is a Madrid calendar date. It defaults to today in Madrid. The
returned `dates` start on that day and run through the horizon. Earlier days
and dates past the horizon are rejected with 400 `date_out_of_range`.

200:

```json
{
  "activeUsers": [
    { "id": "...", "displayName": "Ada", "bookedMinutes": 60, "playedMinutes": 120 }
  ],
  "globalBalance": { "bookedMinutes": 60, "playedMinutes": 120 },
  "me": { "id": "...", "displayName": "Ada", "role": "member", "hasGymCredentials": true },
  "dates": ["2026-10-17"],
  "date": "2026-10-17",
  "occurrences": [
    {
      "id": "...",
      "startsAt": "2026-10-17T17:00:00.000Z",
      "durationMinutes": 60,
      "clubCode": "ROC",
      "courtsTargeted": 1,
      "optedIn": [{ "id": "...", "displayName": "Ada" }],
      "myOptIn": true,
      "courts": [
        {
          "courtIndex": 0,
          "reservationId": "...",
          "status": "held",
          "seats": [{ "userId": "...", "displayName": "Ada" }]
        }
      ]
    }
  ]
}
```

`courts` always has four entries. A court with no reservation has
`reservationId: null` and `status: "open"` before the freeze, or `"skipped"`
after a freeze that did not book that index.

### `POST /api/occurrences/:id/availability`

Body: `{ "in": true }`.

204. 400 `started` or `inactive`. Members may toggle until the start. The
toggle does not change `courtsTargeted` after the freeze.

### `POST /api/reservations/:id/seats`

Body: `{ "join": true }`.

204. The actor is the signed-in user. 400 `inactive`, `started`, `not_held`,
`full`, or `missing`. Joining while seated on another court of the same
occurrence moves the seat.

## Admin

All routes require `role = admin`. Otherwise 403 `forbidden`.

### `GET /api/admin/users`

200 `{ "users": [{ "id", "email", "displayName", "role", "active", "hasGymCredentials" }] }`.

### `PATCH /api/admin/users/:id`

Body: `{ "active": false }`. 204. An admin cannot deactivate themselves.

### `POST /api/admin/invites`

Body: `{ "role": "member", "email": "optional@example.com" }`.

201 `{ "token", "expiresAt", "role", "email" }`. `token` is returned only here.

### `GET /api/admin/invites`

200 `{ "invites": [{ "id", "role", "email", "expiresAt", "usedAt" }] }`. No token.

### `GET /api/admin/slot-rules`

200 `{ "rules": [{ "id", "weekday", "startTime", "durationMinutes", "clubCode", "active" }] }`.

### `POST /api/admin/slot-rules`

Body: `{ "weekday": 1, "startTime": "19:00", "durationMinutes": 60, "clubCode": "ROC" }`.

201 the rule.

### `PATCH /api/admin/slot-rules/:id`

Body: `{ "active": false }`. 204.

## Health

### `GET /api/health`

200 `{ "ok": true }`.
