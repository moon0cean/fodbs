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

export interface GymGateway {
  ready(): boolean;
  openSession(login: GymLogin): Promise<GymSession>;
  book(session: GymSession, request: GymBookRequest): Promise<{ externalRef: string }>;
  cancel(session: GymSession, externalRef: string): Promise<void>;
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

export const DIR_LOGIN = {
  usernameSelector: '#ctl00_content_txtIdentificador',
  passwordSelector: '#ctl00_content_txtContrasenya',
  submitSelector: '#ctl00_content_imgbEnviar',
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

export function dirFlow(env: NodeJS.ProcessEnv, baseUrl: string): GymFlow {
  const cancelTemplate = env.GYM_CANCEL_URL ?? '';
  return {
    loginUrl: baseUrl,
    ...DIR_LOGIN,
    postLoginSelector: env.GYM_SEL_READY ?? '',
    bookUrl: env.GYM_BOOK_URL ?? '',
    clubSelector: env.GYM_SEL_CLUB ?? '',
    courtSelector: env.GYM_SEL_COURT ?? '',
    startsSelector: env.GYM_SEL_STARTS ?? '',
    durationSelector: env.GYM_SEL_DURATION ?? '',
    bookSelector: env.GYM_SEL_BOOK ?? '',
    refSelector: env.GYM_SEL_REF ?? '',
    cancelUrl: (externalRef) => cancelTemplate.replaceAll('{ref}', encodeURIComponent(externalRef)),
    cancelSelector: env.GYM_SEL_CANCEL ?? '',
    cancelledSelector: env.GYM_SEL_CANCELLED || '#cancelled',
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
