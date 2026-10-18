import { DateTime } from 'luxon';
import type { GymListedBooking } from './gateway.js';

export const ROCAFORT_ORIGIN = 'https://pistes.esportiurocafort.com';

export const ROCAFORT_COURTS = ['SQ04', 'SQ05', 'SQ10', 'SQ11', 'SQ12'] as const;

/** Top left, top right, bottom left, bottom right. */
export const COURT_DISPLAY_ORDER = [1, 0, 3, 2] as const;

export function courtNumber(index: number): string {
  return ROCAFORT_COURTS[index]?.slice(2) ?? String(index + 1);
}

export function displayCourtIndexes(indexes: number[]): number[] {
  const present = new Set(indexes);
  const ordered = COURT_DISPLAY_ORDER.filter((index) => present.has(index));
  const rest = indexes.filter((index) => !COURT_DISPLAY_ORDER.includes(index as (typeof COURT_DISPLAY_ORDER)[number]));
  return [...ordered, ...rest];
}

export function isRocafortUrl(url: string): boolean {
  return url.includes('pistes.esportiurocafort.com');
}

export function courtCode(index: number): string | null {
  return ROCAFORT_COURTS[index] ?? null;
}

export function courtIndexFromName(name: string): number {
  const digits = name.match(/(\d+)/)?.[1];
  if (!digits) return -1;
  return ROCAFORT_COURTS.indexOf(`SQ${digits.padStart(2, '0')}` as (typeof ROCAFORT_COURTS)[number]);
}

export function slotParts(startsAt: Date, zone: string): { dia: string; hora: string } {
  const start = DateTime.fromJSDate(startsAt, { zone });
  return { dia: start.toFormat('yyyy-MM-dd'), hora: start.toFormat('HH:mm') };
}

export function endClock(startsAt: Date, durationMinutes: number, zone: string): string {
  return DateTime.fromJSDate(startsAt, { zone }).plus({ minutes: durationMinutes }).toFormat('HH:mm:ss');
}

export function fase2Url(origin: string, courtIndex: number, startsAt: Date, zone: string): string | null {
  const code = courtCode(courtIndex);
  if (!code) return null;
  const slot = slotParts(startsAt, zone);
  const params = new URLSearchParams({
    TipusPista: 'SQUASH',
    NumPista: code,
    Dia: slot.dia,
    HoraInicial: slot.hora,
  });
  return `${origin}/ReservaFase2.php?${params.toString()}`;
}

export type ListedRow = { court: string; date: string; start: string; end: string; id: string };

export function parseListedBooking(row: ListedRow, zone: string): GymListedBooking | null {
  const courtIndex = courtIndexFromName(row.court);
  const starts = DateTime.fromFormat(`${row.date} ${row.start}`, 'dd/MM/yyyy HH:mm', { zone });
  const ends = DateTime.fromFormat(`${row.date} ${row.end}`, 'dd/MM/yyyy HH:mm', { zone });
  if (courtIndex < 0 || !starts.isValid || !ends.isValid) return null;
  const durationMinutes = ends.diff(starts, 'minutes').minutes;
  if (durationMinutes <= 0) return null;
  return {
    externalRef: row.id,
    startsAt: starts.toJSDate(),
    durationMinutes,
    clubCode: 'ROC',
    courtIndex,
  };
}
