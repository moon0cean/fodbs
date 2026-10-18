import { describe, expect, it } from 'vitest';
import { dirFlow } from '../src/gym/gateway.js';
import { courtCode, courtIndexFromName, courtNumber, displayCourtIndexes, endClock, fase2Url, parseListedBooking, slotParts } from '../src/gym/rocafort.js';

describe('Rocafort court flow', () => {
  it('maps the four bookable courts and the fifth listed court', () => {
    expect(courtCode(0)).toBe('SQ04');
    expect(courtCode(3)).toBe('SQ11');
    expect(courtIndexFromName('Squash 11')).toBe(3);
    expect(courtIndexFromName('Squash 12')).toBe(4);
    expect(courtCode(5)).toBeNull();
    expect(displayCourtIndexes([0, 1, 2, 3]).map(courtNumber)).toEqual(['05', '04', '11', '10']);
  });

  it('logs into the court site without selector settings', () => {
    const flow = dirFlow('https://pistes.esportiurocafort.com/index.php');
    expect(flow.usernameSelector).toBe('#NomUsuari:visible');
    expect(flow.passwordSelector).toBe('#Contrasenya:visible');
    expect(flow.bookUrl).toBe('https://pistes.esportiurocafort.com/ReservaFase1.php?TipusPista=SQUASH');
    expect(flow.courtSelector).toBe('');
  });

  it('builds the Madrid slot and the end time the club expects', () => {
    const startsAt = new Date('2026-10-22T05:00:00.000Z');
    expect(slotParts(startsAt, 'Europe/Madrid')).toEqual({ dia: '2026-10-22', hora: '07:00' });
    expect(endClock(startsAt, 60, 'Europe/Madrid')).toBe('08:00:00');
    expect(fase2Url('https://pistes.esportiurocafort.com', 0, startsAt, 'Europe/Madrid')).toBe(
      'https://pistes.esportiurocafort.com/ReservaFase2.php?TipusPista=SQUASH&NumPista=SQ04&Dia=2026-10-22&HoraInicial=07%3A00',
    );
  });

  it('reads a reservation row into a booking', () => {
    const booking = parseListedBooking({
      id: '126381',
      court: 'Squash 05',
      date: '21/10/2026',
      start: '18:00',
      end: '19:00',
    }, 'Europe/Madrid');
    expect(booking).toMatchObject({
      externalRef: '126381',
      durationMinutes: 60,
      clubCode: 'ROC',
      courtIndex: 1,
    });
    expect(booking?.startsAt.toISOString()).toBe('2026-10-21T16:00:00.000Z');
  });
});
