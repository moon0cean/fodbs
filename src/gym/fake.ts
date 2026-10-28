import { randomUUID } from 'node:crypto';
import type { GymBookRequest, GymGateway, GymListedBooking, GymLogin, GymSession } from './gateway.js';

type FakeSession = GymSession & { id: string };

export class FakeGymGateway implements GymGateway {
  readonly bookings: { externalRef: string; username: string; courtIndex: number; startsAt: string }[] = [];
  listed: GymListedBooking[] = [];
  failLogins = new Set<string>();
  failBooks = false;
  unavailable = new Set<string>();
  noBons = new Set<string>();
  bons: number | null = null;
  inspects = 0;

  ready(): boolean {
    return true;
  }

  canList(): boolean {
    return true;
  }

  async openSession(login: GymLogin): Promise<FakeSession> {
    if (this.failLogins.has(login.username)) throw new Error('gym_login_failed');
    return { id: randomUUID(), username: login.username, password: login.password };
  }

  async book(session: GymSession, request: GymBookRequest): Promise<{ externalRef: string }> {
    if (this.failBooks) throw new Error('portal_rejected');
    if (this.unavailable.has(`${request.courtIndex}|${request.startsAt.toISOString()}`)) throw new Error('slot_unavailable');
    if (this.noBons.has(session.username)) throw new Error('bons_unavailable');
    const externalRef = `fake-${request.courtIndex}-${request.startsAt.toISOString()}-${this.bookings.length}`;
    this.bookings.push({
      externalRef,
      username: session.username,
      courtIndex: request.courtIndex,
      startsAt: request.startsAt.toISOString(),
    });
    return { externalRef };
  }

  async inspect(_session: GymSession, request: GymBookRequest): Promise<'free' | 'busy'> {
    this.inspects += 1;
    if (this.unavailable.has(`${request.courtIndex}|${request.startsAt.toISOString()}`)) return 'busy';
    return 'free';
  }

  async cancel(_session: GymSession, externalRef: string): Promise<void> {
    const index = this.bookings.findIndex((booking) => booking.externalRef === externalRef);
    if (index < 0) throw new Error('unknown_ref');
    this.bookings.splice(index, 1);
  }

  async listBookings(): Promise<GymListedBooking[]> {
    return this.listed;
  }

  async listBons(): Promise<number | null> {
    return this.bons;
  }

  async close(): Promise<void> {}
}
