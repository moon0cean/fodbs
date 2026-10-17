import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export type Lang = 'es' | 'en';

const copy = {
  es: {
    loading: 'Cargando el tablero…',
    setting: 'Preparando las pistas…',
    accountOpening: 'Abriendo la cuenta…',
    board: 'Tablero',
    account: 'Cuenta',
    pauseAccount: 'Pausar cuenta',
    restoreAccount: 'Activar cuenta',
    pausedHint: 'La cuenta está en pausa. No entras en las pistas ni en las reservas.',
    activeHint: 'La cuenta está activa.',
    admin: 'Admin',
    signOut: 'Salir',
    inviteOnly: 'Solo por invitación.',
    lede: 'Pistas de squash, reservadas en el minuto en que abre la semana.',
    email: 'Correo',
    password: 'Contraseña',
    enter: 'Entrar',
    acceptInvite: 'Acepta la invitación.',
    name: 'Nombre',
    createAccount: 'Crear cuenta',
    groupBalance: 'Balance del grupo',
    yourBalance: 'Tu balance',
    activePlayers: 'Jugadores activos',
    dates: 'Fechas',
    venue: 'DIR Esportiu Rocafort',
    noSlot: 'No hay turno este día. Un admin puede añadir un horario semanal.',
    inBefore: 'apuntados',
    imIn: 'Apuntado',
    countMe: 'Me apunto',
    court: 'Pista',
    mandatory: 'Obligatorio',
    optional: 'Opcional',
    guest: 'Invitado',
    addGuest: 'Añadir invitado',
    guestHint: 'Tú asumes el coste de la pista entera.',
    removeGuest: 'Quitar',
    credentials: 'Credenciales DiR',
    sealed: 'La contraseña se guarda sellada y no vuelve a mostrarse.',
    identifier: 'Identificador',
    replaceCredentials: 'Reemplazar credenciales',
    saved: 'Guardado.',
    bookedOnYou: 'Cargado en tu cuenta',
    nothingCharged: 'Todavía no hay nada cargado a tu nombre.',
    playShape: 'Cómo juegas',
    playShapeHint: 'Los turnos que coincidan con tus días y tu hora te apuntan solos. Puedes salir de uno concreto.',
    weekdays: 'Días',
    preferredTime: 'Hora',
    party: 'Jugadores',
    pair: '2',
    trio: '3',
    guestName: 'Nombre, si quieres',
    courtCaption: 'Las dos cajas de saque, pegadas a la línea corta, son obligatorias. El del fondo es opcional.',
    savePlay: 'Guardar',
    invite: 'Invitar',
    role: 'Rol',
    member: 'Miembro',
    emailBind: 'Vincular correo',
    optionalField: 'Opcional',
    createInvite: 'Crear invitación',
    copy: 'Copiar',
    openInvite: 'Invitación abierta',
    used: 'usada',
    open: 'abierta',
    members: 'Miembros',
    credentialsSaved: 'credenciales guardadas',
    noCredentials: 'sin credenciales',
    deactivate: 'Desactivar',
    activate: 'Activar',
    weeklySlots: 'Turnos semanales',
    weekday: 'Día',
    start: 'Inicio',
    minutes: 'Minutos',
    clubCode: 'Código de club',
    addSlot: 'Añadir turno',
    pause: 'Pausar',
    resume: 'Reanudar',
    booked: 'Reservado',
    played: 'Jugado',
    delta: 'Delta',
    failed: 'Algo ha fallado',
    min: 'min',
  },
  en: {
    loading: 'Loading the club board…',
    setting: 'Setting the courts…',
    accountOpening: 'Opening the account…',
    board: 'Board',
    account: 'Account',
    pauseAccount: 'Pause account',
    restoreAccount: 'Activate account',
    pausedHint: 'The account is paused. You are left out of courts and bookings.',
    activeHint: 'The account is active.',
    admin: 'Admin',
    signOut: 'Sign out',
    inviteOnly: 'Invitation only.',
    lede: 'Squash courts, booked the minute the week opens.',
    email: 'Email',
    password: 'Password',
    enter: 'Enter',
    acceptInvite: 'Accept the invite.',
    name: 'Name',
    createAccount: 'Create account',
    groupBalance: 'Group balance',
    yourBalance: 'Your balance',
    activePlayers: 'Active players',
    dates: 'Dates',
    venue: 'DIR Esportiu Rocafort',
    noSlot: 'No slot on this day. An admin can add a weekly time.',
    inBefore: 'in',
    imIn: "I'm in",
    countMe: 'Count me in',
    court: 'Court',
    mandatory: 'Required',
    optional: 'Optional',
    guest: 'Guest',
    addGuest: 'Add guest',
    guestHint: 'You take the cost of the whole court.',
    removeGuest: 'Remove',
    credentials: 'DiR credentials',
    sealed: 'The password is stored sealed and is never shown again.',
    identifier: 'Identifier',
    replaceCredentials: 'Replace credentials',
    saved: 'Saved.',
    bookedOnYou: 'Booked on your account',
    nothingCharged: 'Nothing charged to you yet.',
    playShape: 'How you play',
    playShapeHint: 'Slots that match your days and time count you in. You can still opt out of one.',
    weekdays: 'Days',
    preferredTime: 'Time',
    party: 'Players',
    pair: '2',
    trio: '3',
    guestName: 'Name, if you want',
    courtCaption: 'The two service boxes on the short line are required. The player at the back is optional.',
    savePlay: 'Save',
    invite: 'Invite',
    role: 'Role',
    member: 'Member',
    emailBind: 'Email bind',
    optionalField: 'Optional',
    createInvite: 'Create invite',
    copy: 'Copy',
    openInvite: 'Open invite',
    used: 'used',
    open: 'open',
    members: 'Members',
    credentialsSaved: 'credentials saved',
    noCredentials: 'no credentials',
    deactivate: 'Deactivate',
    activate: 'Activate',
    weeklySlots: 'Weekly slots',
    weekday: 'Weekday',
    start: 'Start',
    minutes: 'Minutes',
    clubCode: 'Club code',
    addSlot: 'Add slot',
    pause: 'Pause',
    resume: 'Resume',
    booked: 'Booked',
    played: 'Played',
    delta: 'Delta',
    failed: 'Something went wrong',
    min: 'min',
  },
} as const;

export type CopyKey = keyof (typeof copy)['es'];

const WEEKDAY_LABELS: Record<Lang, string[]> = {
  es: ['L', 'M', 'X', 'J', 'V', 'S', 'D'],
  en: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
};

const STATUS: Record<Lang, Record<string, string>> = {
  es: { open: 'abierta', pending: 'pendiente', skipped: 'sin reservar', held: 'reservada', cancelled: 'cancelada', played: 'jugada' },
  en: { open: 'open', pending: 'pending', skipped: 'skipped', held: 'held', cancelled: 'cancelled', played: 'played' },
};

type I18nValue = {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: CopyKey) => string;
  weekdayShort: (index: number) => string;
  status: (value: string) => string;
};

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => (localStorage.getItem('fodbs_lang') === 'en' ? 'en' : 'es'));

  useEffect(() => {
    document.documentElement.lang = lang;
    localStorage.setItem('fodbs_lang', lang);
  }, [lang]);

  const value: I18nValue = {
    lang,
    setLang: setLangState,
    t: (key) => copy[lang][key],
    weekdayShort: (index) => WEEKDAY_LABELS[lang][index] ?? '',
    status: (status) => STATUS[lang][status] ?? status,
  };
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const value = useContext(I18nContext);
  if (!value) throw new Error('i18n');
  return value;
}
