# Feature Specification: Access and imported bookings

**Feature Branch**: `003-access`

**Created**: 2026-10-18

**Status**: Implemented

**Input**: Sync the gym's current bookings when an account gains credentials. Admins email invites. Visitors can request access, and an admin must approve. The admin screen uses a sidebar, tables, and a cog menu.

## User Scenarios & Testing

### User Story 1 - Bring in existing bookings (Priority: P1)

When a member stores DiR credentials, the bookings already on that gym account become part of FODBS. Saving the same credentials again does not duplicate them.

### User Story 2 - Invite by email and request access (Priority: P1)

An admin sends an invite to an email address. A person who has no account can submit their email from the login screen. An admin approves that request, which sends the invite, or rejects it. Submitting an email that already has an account does not reveal that fact.

### User Story 3 - Admin sidebar (Priority: P1)

The admin area has a left sidebar with members, invites, requests, and weekly slots. Members and invites are tables. A cog on each row opens the actions: activate or deactivate, and remove, for members; resend and revoke for invites; approve and reject for requests.

## Requirements

- **FR-301**: Storing DiR credentials MUST ask the worker to import that account's current gym bookings. A booking already stored under the same gym reference MUST NOT be imported again. When the gym list is not configured, credentials still save and nothing is imported.
- **FR-302**: An admin MUST be able to send an invite email to an address. The message contains the link that accepts the invite.
- **FR-303**: A visitor MUST be able to request access with an email address. A repeated request for the same address stays a single pending request. The response MUST NOT reveal whether that address already has an account.
- **FR-304**: An admin MUST be able to approve a request, which sends an invite to that address, or reject it.
- **FR-305**: The admin screen MUST use a sidebar for members, invites, requests, and slots. Members and invites MUST be tables. A cog MUST open the row actions: activate, deactivate, and remove for a member; resend and revoke for an invite; approve and reject for a request. The member cog MUST also open that member's charged bookings in a dialog. Those bookings, and the charged bookings on Cuenta, MUST be paginated eight per page.
- **FR-306**: Remove MUST refuse the signed-in admin, the last admin, and a member who already has bookings.

## Assumptions

- Imported bookings are charged to the member whose credentials were stored. They count in the balance. They do not create a new weekly slot rule.
- Invite mail uses the operator's SMTP settings. If those settings are absent, the invite still exists and the admin can copy the link.
- Access requests are not emailed to admins. They appear in the admin screen.
