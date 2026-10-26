import { useState } from 'react';
import { api, type Court, type Occupant, type Spot } from './api';
import { courtNumber } from './courts';
import { useI18n } from './i18n';

const SPOTS: Spot[] = ['front_left', 'front_right', 'back'];

export type CourtTime = {
  occurrenceId: string;
  label: string;
  court: Court;
};

export function CourtCard({
  courtIndex,
  times,
  meId,
  canBook,
  onChange,
  onError,
}: {
  courtIndex: number;
  times: CourtTime[];
  meId: string;
  canBook: boolean;
  onChange: () => void;
  onError: (value: string) => void;
}) {
  const { t } = useI18n();
  const [selectedId, setSelectedId] = useState('');
  const current = times.find((time) => time.occurrenceId === selectedId) ?? times[0];
  const court = current?.court ?? { courtIndex, reservationId: null, status: 'open' as const, startsAt: null, occupants: [] };

  return (
    <article className="squash">
      <div className="court-label">
        <span>{t('court')} {courtNumber(courtIndex)}</span>
        {times.length > 0 && (
          <div className="time-slider" role="listbox" aria-label={`${t('courtTimes')} ${courtNumber(courtIndex)}`}>
            {times.map((time) => (
              <button
                key={time.occurrenceId}
                type="button"
                className={current && time.occurrenceId === current.occurrenceId ? 'on' : 'ghost'}
                onClick={() => setSelectedId(time.occurrenceId)}
              >
                {time.label}
              </button>
            ))}
          </div>
        )}
      </div>
      <SquashCourt court={court} meId={meId} canBook={canBook} onChange={onChange} onError={onError} />
    </article>
  );
}

function SquashCourt({
  court,
  meId,
  canBook,
  onChange,
  onError,
}: {
  court: Court;
  meId: string;
  canBook: boolean;
  onChange: () => void;
  onError: (value: string) => void;
}) {
  const { t, explain } = useI18n();
  const [guestName, setGuestName] = useState('');
  const [notice, setNotice] = useState('');
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
    void api<{ requested?: boolean }>(`/api/reservations/${court.reservationId}/seats`, {
      method: 'POST',
      body: JSON.stringify({ join, position: spot }),
    }).then((result) => {
      setNotice(result?.requested ? t('requestSentCourt') : '');
      onChange();
    }).catch((reason: unknown) => onError(text(reason, explain)));
  }

  function decide(requestId: string, decision: 'approve' | 'reject') {
    if (!court.reservationId) return;
    void api(`/api/reservations/${court.reservationId}/requests/${requestId}/${decision}`, { method: 'POST' })
      .then(() => {
        setNotice('');
        onChange();
      })
      .catch((reason: unknown) => onError(text(reason, explain)));
  }

  function removeGuest(occupantId: string) {
    if (!court.reservationId) return;
    void api(`/api/reservations/${court.reservationId}/guests/${occupantId}`, { method: 'DELETE' })
      .then(onChange)
      .catch((reason: unknown) => onError(text(reason, explain)));
  }

  return (
    <div className={`court-body status-${court.status}`}>
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
            <div key={spot} className={`bubble-slot ${spot}`}>
              <button
                type="button"
                className={`bubble ${person ? 'filled' : ''} ${isGuest ? 'guest' : ''}`}
                disabled={blocked && !own}
                onClick={() => {
                  if (!joinable || isGuest) return;
                  sit(spot);
                }}
              >
                <strong>{person ? initials(person.displayName || t('guest')) : '+'}</strong>
                <span>{label}</span>
              </button>
              {isGuest && joinable && mine && person && (
                <button
                  type="button"
                  className="guest-x"
                  aria-label={`${t('removeGuest')} ${label}`}
                  onClick={() => removeGuest(person.id)}
                >
                  ×
                </button>
              )}
            </div>
          );
        })}
      </div>
      {joinable && !canBook && !mine && <p className="notice">{t('seatRequestHint')}</p>}
      {notice && <p className="notice" role="status">{notice}</p>}
      {court.requests?.map((request) => (
        <div key={request.id} className="guest-row">
          <p>{request.displayName} · {t('requestPending')}</p>
          {court.ownerId === meId && (
            <div className="request-actions">
              <button className="solid" type="button" onClick={() => decide(request.id, 'approve')}>{t('approve')}</button>
              <button className="ghost" type="button" onClick={() => decide(request.id, 'reject')}>{t('reject')}</button>
            </div>
          )}
        </div>
      ))}
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
          <button className="ghost" type="submit">{t('addGuest')}</button>
        </form>
      )}
    </div>
  );
}

function initials(name: string): string {
  return name.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '').join('');
}

function text(reason: unknown, explain: (code: string) => string): string {
  return reason instanceof Error ? explain(reason.message) : explain('request_failed');
}
