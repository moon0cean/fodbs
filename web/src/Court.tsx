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
  members,
  onChange,
  onError,
}: {
  courtIndex: number;
  times: CourtTime[];
  meId: string;
  canBook: boolean;
  members: { id: string; displayName: string }[];
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
      <SquashCourt court={court} meId={meId} canBook={canBook} members={members} onChange={onChange} onError={onError} />
    </article>
  );
}

function SquashCourt({
  court,
  meId,
  canBook,
  members,
  onChange,
  onError,
}: {
  court: Court;
  meId: string;
  canBook: boolean;
  members: { id: string; displayName: string }[];
  onChange: () => void;
  onError: (value: string) => void;
}) {
  const { t, explain } = useI18n();
  const [guestName, setGuestName] = useState('');
  const [memberId, setMemberId] = useState('');
  const [spot, setSpot] = useState<Spot | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [notice, setNotice] = useState('');
  const joinable = court.status === 'held' && court.reservationId;
  const mine = court.occupants.some((occupant) => occupant.userId === meId);

  function occupant(spot: Spot): Occupant | undefined {
    return court.occupants.find((item) => item.position === spot);
  }

  function fill(body: { position: Spot; kind: 'self' } | { position: Spot; kind: 'member'; userId: string } | { position: Spot; kind: 'guest'; name: string }) {
    if (!court.reservationId) return;
    void api<{ requested?: boolean }>(`/api/reservations/${court.reservationId}/occupants`, {
      method: 'POST',
      body: JSON.stringify(body),
    }).then((result) => {
      setNotice(result?.requested ? t('requestSentCourt') : '');
      setSpot(null);
      setGuestName('');
      setMemberId('');
      onChange();
    }).catch((reason: unknown) => onError(text(reason, explain)));
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

  function removePlayer(occupantId: string) {
    if (!court.reservationId) return;
    void api(`/api/reservations/${court.reservationId}/seats/${occupantId}`, { method: 'DELETE' })
      .then(onChange)
      .catch((reason: unknown) => onError(text(reason, explain)));
  }

  function cancelCourt() {
    if (!court.reservationId) return;
    void api(`/api/reservations/${court.reservationId}/cancel`, { method: 'POST' })
      .then(() => {
        setLeaving(false);
        onChange();
      })
      .catch((reason: unknown) => onError(text(reason, explain)));
  }

  function transferCourt(userId: string) {
    if (!court.reservationId) return;
    void api(`/api/reservations/${court.reservationId}/transfer`, {
      method: 'POST',
      body: JSON.stringify({ userId }),
    }).then(() => {
      setLeaving(false);
      onChange();
    }).catch((reason: unknown) => onError(text(reason, explain)));
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
          const holder = Boolean(person?.userId && person.userId === court.ownerId);
          const blocked = Boolean(person && !own) || !joinable;
          const label = person ? (person.displayName || t('guest')) : '+';
          const canRemove = Boolean(person && joinable && (
            (isGuest && (mine || court.ownerId === meId))
            || own
            || (court.ownerId === meId && person.userId)
          ));
          return (
            <div key={spot} className={`bubble-slot ${spot}`}>
              <button
                type="button"
                className={`bubble ${person ? 'filled' : ''} ${isGuest ? 'guest' : ''} ${holder ? 'holder' : ''}`}
                disabled={blocked && !own}
                onClick={() => {
                  if (!joinable || isGuest || person) return;
                  setSpot(spot);
                }}
              >
                <strong>{person ? initials(person.displayName || t('guest')) : '+'}</strong>
                <span>{label}</span>
              </button>
              {canRemove && person && (
                <button
                  type="button"
                  className="guest-x"
                  aria-label={`${t('removeGuest')} ${label}`}
                  onClick={() => {
                    if (isGuest) removeGuest(person.id);
                    else if (own && court.ownerId === meId) setLeaving(true);
                    else if (own) sit(spot);
                    else removePlayer(person.id);
                  }}
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
      {leaving && (
        <div className="modal-back" onClick={() => setLeaving(false)}>
          <div className="modal" role="dialog" aria-label={t('leaveCourt')} onClick={(event) => event.stopPropagation()}>
            <h2>{t('leaveCourt')}</h2>
            <p className="hint">{court.occupants.some((person) => person.userId && person.userId !== meId) ? t('leaveCourtChoice') : t('cancelCourtConfirm')}</p>
            {court.occupants.filter((person) => person.userId && person.userId !== meId).map((person) => (
              <button key={person.id} className="solid" type="button" onClick={() => transferCourt(person.userId ?? '')}>{t('transferTo')} {person.displayName}</button>
            ))}
            <button className="ghost" type="button" onClick={cancelCourt}>{t('cancelCourt')}</button>
            <button className="ghost" type="button" onClick={() => setLeaving(false)}>{t('close')}</button>
          </div>
        </div>
      )}
      {spot && (
        <div className="modal-back" onClick={() => setSpot(null)}>
          <div className="modal" role="dialog" aria-label={t('addToSpot')} onClick={(event) => event.stopPropagation()}>
            <h2>{t('addToSpot')}</h2>
            {!mine && <button className="solid" type="button" onClick={() => fill({ position: spot, kind: 'self' })}>{t('sitHere')}</button>}
            <label>{t('addMember')}
              <select value={memberId} onChange={(event) => setMemberId(event.target.value)}>
                <option value="">{t('addMember')}</option>
                {members.filter((member) => member.id !== meId && !court.occupants.some((occupant) => occupant.userId === member.id)).map((member) => (
                  <option key={member.id} value={member.id}>{member.displayName}</option>
                ))}
              </select>
            </label>
            <button className="ghost" type="button" disabled={!memberId} onClick={() => fill({ position: spot, kind: 'member', userId: memberId })}>{t('addMember')}</button>
            <label>{t('guest')}
              <input value={guestName} onChange={(event) => setGuestName(event.target.value)} maxLength={40} placeholder={t('guestName')} />
            </label>
            <button className="ghost" type="button" onClick={() => fill({ position: spot, kind: 'guest', name: guestName })}>{t('addGuest')}</button>
            <button className="ghost" type="button" onClick={() => setSpot(null)}>{t('close')}</button>
          </div>
        </div>
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
