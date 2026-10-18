import { useState } from 'react';
import { api, type Court, type Occupant, type Spot } from './api';
import { courtNumber } from './courts';
import { useI18n } from './i18n';

const SPOTS: Spot[] = ['front_left', 'front_right', 'back'];

export function SquashCourt({
  court,
  meId,
  onChange,
  onError,
}: {
  court: Court;
  meId: string;
  onChange: () => void;
  onError: (value: string) => void;
}) {
  const { t, status, explain } = useI18n();
  const [guestName, setGuestName] = useState('');
  const joinable = court.status === 'held' && court.reservationId;
  const mine = court.occupants.some((occupant) => occupant.userId === meId);
  const nextEmpty = SPOTS.find((spot) => !court.occupants.some((occupant) => occupant.position === spot));

  function occupant(spot: Spot): Occupant | undefined {
    return court.occupants.find((item) => item.position === spot);
  }

  function sit(spot: Spot) {
    if (!court.reservationId) return;
    const current = occupant(spot);
    const join = current?.userId !== meId;
    void api(`/api/reservations/${court.reservationId}/seats`, {
      method: 'POST',
      body: JSON.stringify({ join, position: spot }),
    }).then(onChange).catch((reason: unknown) => onError(text(reason, explain)));
  }

  return (
    <article className={`squash status-${court.status}`}>
      <div className="court-label">
        <span>{t('court')} {courtNumber(court.courtIndex)}</span>
        <em>{status(court.status)}</em>
      </div>
      <div className="diagram" aria-label={`${t('court')} ${courtNumber(court.courtIndex)}`}>
        <div className="front-wall" />
        <div className="short-line" />
        <div className="half-line" />
        <div className="service-box left" />
        <div className="service-box right" />
        {SPOTS.map((spot) => {
          const person = occupant(spot);
          const own = person?.userId === meId;
          const isGuest = Boolean(person && !person.userId);
          const blocked = Boolean(person && !own) || !joinable;
          const label = person ? (person.displayName || t('guest')) : '+';
          return (
            <button
              key={spot}
              type="button"
              className={`bubble ${spot} ${person ? 'filled' : ''} ${isGuest ? 'guest' : ''}`}
              disabled={blocked && !own}
              onClick={() => {
                if (!joinable) return;
                if (isGuest) return;
                sit(spot);
              }}
            >
              <strong>{person ? initials(person.displayName || t('guest')) : '+'}</strong>
              <span>{label}</span>
            </button>
          );
        })}
      </div>
      <p className="court-caption">{t('courtCaption')}</p>
      {joinable && mine && nextEmpty && (
        <form
          className="guest-row"
          onSubmit={(event) => {
            event.preventDefault();
            if (!court.reservationId || !nextEmpty) return;
            void api(`/api/reservations/${court.reservationId}/guests`, {
              method: 'POST',
              body: JSON.stringify({ name: guestName, position: nextEmpty }),
            }).then(() => {
              setGuestName('');
              onChange();
            }).catch((reason: unknown) => onError(text(reason, explain)));
          }}
        >
          <label>{t('guest')}
            <input value={guestName} onChange={(event) => setGuestName(event.target.value)} maxLength={40} placeholder={t('guestName')} />
          </label>
          <button className="solid" type="submit">{t('addGuest')}</button>
          <p>{t('guestHint')}</p>
        </form>
      )}
      {joinable && mine && court.occupants.filter((occupant) => !occupant.userId).map((occupant) => (
        <button
          key={occupant.id}
          type="button"
          className="guest-remove"
          onClick={() => {
            if (!court.reservationId) return;
            void api(`/api/reservations/${court.reservationId}/guests/${occupant.id}`, { method: 'DELETE' })
              .then(onChange)
              .catch((reason: unknown) => onError(text(reason, explain)));
          }}
        >
          {t('removeGuest')} {occupant.displayName || t('guest')}
        </button>
      ))}
    </article>
  );
}

function initials(name: string): string {
  return name.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '').join('');
}

function text(reason: unknown, explain: (code: string) => string): string {
  return reason instanceof Error ? explain(reason.message) : explain('request_failed');
}
