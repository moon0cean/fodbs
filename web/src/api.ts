export class ApiError extends Error {
  constructor(message: string) {
    super(message);
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body !== undefined && !headers.has('content-type')) headers.set('content-type', 'application/json');
  const response = await fetch(path, {
    ...init,
    credentials: 'include',
    headers,
  });
  if (response.status === 204) return undefined as T;
  const body = (await response.json().catch(() => ({ error: 'request_failed' }))) as { error?: string };
  if (!response.ok) throw new ApiError(body.error ?? 'request_failed');
  return body as T;
}

export type SessionUser = {
  id: string;
  email: string;
  displayName: string;
  role: 'admin' | 'member';
  active: boolean;
  hasGymCredentials?: boolean;
};

export type Balance = { bookedMinutes: number; playedMinutes: number };

export type Spot = 'front_left' | 'front_right' | 'back';

export type Occupant = {
  id: string;
  position: Spot;
  userId: string | null;
  guestName: string | null;
  displayName: string;
};

export type Court = {
  courtIndex: number;
  reservationId: string | null;
  status: 'open' | 'pending' | 'skipped' | 'held' | 'cancelled' | 'played';
  occupants: Occupant[];
};

export type Dashboard = {
  activeUsers: ({ id: string; displayName: string } & Balance)[];
  globalBalance: Balance;
  me: { id: string; displayName: string; role: 'admin' | 'member'; hasGymCredentials: boolean };
  dates: string[];
  date: string;
  occurrences: {
    id: string;
    startsAt: string;
    durationMinutes: number;
    clubCode: string;
    courtsTargeted: number | null;
    optedIn: { id: string; displayName: string }[];
    myOptIn: boolean;
    courts: Court[];
  }[];
};

export type Account = {
  balance: Balance;
  hasGymCredentials: boolean;
  gymUsername: string | null;
  active: boolean;
  preferences: { weekdays: number[]; preferredTime: string; partySize: 2 | 3 } | null;
  reservations: {
    id: string;
    startsAt: string;
    courtIndex: number;
    status: string;
    durationMinutes: number;
    clubCode: string;
  }[];
};
