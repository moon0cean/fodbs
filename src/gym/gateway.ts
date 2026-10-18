import { ROCAFORT_ORIGIN } from './rocafort.js';

export type GymLogin = { username: string; password: string };

export type GymBookRequest = {
  clubCode: string;
  courtIndex: number;
  startsAt: Date;
  durationMinutes: number;
};

export type GymSession = {
  username: string;
  password: string;
};

export type GymListedBooking = {
  externalRef: string;
  startsAt: Date;
  durationMinutes: number;
  clubCode: string;
  courtIndex: number;
};

export interface GymGateway {
  ready(): boolean;
  canList(): boolean;
  openSession(login: GymLogin): Promise<GymSession>;
  book(session: GymSession, request: GymBookRequest): Promise<{ externalRef: string }>;
  cancel(session: GymSession, externalRef: string): Promise<void>;
  listBookings(session: GymSession): Promise<GymListedBooking[]>;
  listBons(session: GymSession): Promise<number | null>;
  close(session: GymSession): Promise<void>;
}

export type GymFlow = {
  loginUrl: string;
  usernameSelector: string;
  passwordSelector: string;
  submitSelector: string;
  postLoginSelector: string;
  bookUrl: string;
  clubSelector: string;
  courtSelector: string;
  startsSelector: string;
  durationSelector: string;
  bookSelector: string;
  refSelector: string;
  cancelUrl: (externalRef: string) => string;
  cancelSelector: string;
  cancelledSelector: string;
};

export function fixtureFlow(baseUrl: string): GymFlow {
  return {
    loginUrl: `${baseUrl}/login`,
    usernameSelector: '#username',
    passwordSelector: '#password',
    submitSelector: '#submit',
    postLoginSelector: '#agenda',
    bookUrl: `${baseUrl}/agenda`,
    clubSelector: '#club',
    courtSelector: '#court',
    startsSelector: '#starts',
    durationSelector: '#duration',
    bookSelector: '#book',
    refSelector: '#external-ref',
    cancelUrl: (externalRef) => `${baseUrl}/cancel/${encodeURIComponent(externalRef)}`,
    cancelSelector: '#cancel',
    cancelledSelector: '#cancelled',
  };
}

export function dirFlow(baseUrl: string): GymFlow {
  const origin = baseUrl.includes('pistes.esportiurocafort.com') ? ROCAFORT_ORIGIN : new URL(baseUrl).origin;
  return {
    loginUrl: `${origin}/index.php`,
    usernameSelector: '#NomUsuari:visible',
    passwordSelector: '#Contrasenya:visible',
    submitSelector: 'form[name="entrada"]:visible button',
    postLoginSelector: 'a[href="index.php?Operacio=TancarSessio"]',
    bookUrl: `${origin}/ReservaFase1.php?TipusPista=SQUASH`,
    clubSelector: '',
    courtSelector: '',
    startsSelector: '',
    durationSelector: '',
    bookSelector: '',
    refSelector: '',
    cancelUrl: (externalRef) => `${origin}/ReservesLlista.php?Operacio=EliminaPista&Comptador=${encodeURIComponent(externalRef)}`,
    cancelSelector: '',
    cancelledSelector: '',
  };
}

export function flowIsReady(flow: GymFlow): boolean {
  return Boolean(
    flow.bookUrl &&
      flow.bookSelector &&
      flow.refSelector &&
      flow.courtSelector &&
      flow.startsSelector &&
      flow.cancelSelector &&
      flow.cancelledSelector,
  );
}
