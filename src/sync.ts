import type { AppDatabase } from './db/index.js';
import type { GymGateway, GymLogin } from './gym/gateway.js';

export async function syncAccountBookings(
  db: AppDatabase,
  gateway: GymGateway,
  login: GymLogin & { userId: string },
  now = new Date(),
): Promise<{ imported: number; bons: number | null }> {
  if (!gateway.canList()) return { imported: 0, bons: null };
  const session = await gateway.openSession(login);
  try {
    const bookings = await gateway.listBookings(session);
    const imported = await db.importBookings(login.userId, bookings, now);
    let bons: number | null = null;
    try {
      bons = await gateway.listBons(session);
    } catch {
      bons = null;
    }
    return { imported, bons };
  } finally {
    await gateway.close(session);
  }
}
