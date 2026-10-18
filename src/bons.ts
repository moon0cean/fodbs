import type { Mailer } from './mail.js';
import { emptyBonsMessage, lowBonsMessage } from './mail.js';

export const HOUR_BONS = 4;

export type BonsLevel = 'ok' | 'low' | 'empty';

export function bonsLevel(remaining: number): BonsLevel {
  if (remaining <= 0) return 'empty';
  if (remaining < HOUR_BONS) return 'low';
  return 'ok';
}

export function shouldNotify(previous: BonsLevel, next: BonsLevel): boolean {
  return next !== 'ok' && next !== previous;
}

export async function recordBons(options: {
  remaining: number;
  previous: BonsLevel;
  email: string;
  mailer: Mailer;
}): Promise<BonsLevel> {
  const next = bonsLevel(options.remaining);
  if (!shouldNotify(options.previous, next)) return next;
  if (!options.mailer.configured()) return options.previous;
  const message = next === 'empty' ? emptyBonsMessage() : lowBonsMessage(options.remaining);
  await options.mailer.send({ to: options.email, subject: message.subject, text: message.text });
  return next;
}
