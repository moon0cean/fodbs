import type { AppDatabase } from './db/index.js';
import type { GymGateway, GymLogin } from './gym/gateway.js';

export async function syncAccountBookings(
  db: AppDatabase,
  gateway: GymGateway,
  login: GymLogin & { userId: string },
  now = new Date(),
): Promise<number> {
  if (!gateway.canList()) return 0;
  const session = await gateway.openSession(login);
  try {
    const bookings = await gateway.listBookings(session);
    return await db.importBookings(login.userId, bookings, now);
  } finally {
    await gateway.close(session);
  }
}
