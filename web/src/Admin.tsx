import { useEffect, useState, type ReactNode } from 'react';
import { api, type SessionUser } from './api';
import { courtNumber } from './courts';
import { Help } from './Help';
import { PAGE_SIZE, Pager } from './Pager';
import { useI18n, type Lang } from './i18n';

type ChargedBooking = {
  id: string;
  startsAt: string;
  courtIndex: number;
  status: string;
  durationMinutes: number;
  players: string[];
};

type Member = { id: string; email: string; displayName: string; role: string; active: boolean; hasGymCredentials: boolean };
type Invite = { id: string; role: string; email: string | null; expiresAt: string; usedAt: string | null };
type RequestRow = { id: string; email: string; status: string; createdAt: string };
type Rule = { id: string; weekday: number; startTime: string; durationMinutes: number; clubCode: string; active: boolean };
type Section = 'members' | 'invites' | 'requests' | 'slots';

export function AdminScreen({ me }: { me: SessionUser }) {
  const { t, lang, weekdayShort, status, explain } = useI18n();
  const [section, setSection] = useState<Section>('members');
  const [users, setUsers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [link, setLink] = useState('');
  const [mailed, setMailed] = useState(false);
  const [error, setError] = useState('');
  const [inviteRole, setInviteRole] = useState<'member' | 'admin'>('member');
  const [inviteEmail, setInviteEmail] = useState('');
  const [weekday, setWeekday] = useState(1);
  const [startTime, setStartTime] = useState('19:00');
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [openMenu, setOpenMenu] = useState('');
  const [bookings, setBookings] = useState<{ name: string; rows: ChargedBooking[] } | null>(null);
  const [bookPage, setBookPage] = useState(0);

  function load() {
    Promise.all([
      api<{ users: Member[] }>('/api/admin/users'),
      api<{ invites: Invite[] }>('/api/admin/invites'),
      api<{ requests: RequestRow[] }>('/api/admin/access-requests'),
      api<{ rules: Rule[] }>('/api/admin/slot-rules'),
    ]).then(([userBody, inviteBody, requestBody, ruleBody]) => {
      setUsers(userBody.users);
      setInvites(inviteBody.invites);
      setRequests(requestBody.requests);
      setRules(ruleBody.rules);
    }).catch((reason: unknown) => setError(text(reason, explain)));
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    function close(event: PointerEvent) {
      const target = event.target;
      if (target instanceof Element && target.closest('.menu')) return;
      setOpenMenu('');
    }
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, []);

  function remember(created: { token: string; mailed: boolean }) {
    setMailed(created.mailed);
    setLink(`${window.location.origin}/invite/${created.token}`);
    setInviteEmail('');
    load();
  }

  const sections: { id: Section; label: string }[] = [
    { id: 'members', label: t('members') },
    { id: 'invites', label: t('invites') },
    { id: 'requests', label: t('requests') },
    { id: 'slots', label: t('weeklySlots') },
  ];

  return (
    <main className="panel">
      {error && <p className="banner">{error}</p>}
      <div className="section-shell">
        <nav className="section-nav" aria-label={t('admin')}>
          {sections.map((item) => (
            <button key={item.id} type="button" className={section === item.id ? 'on' : 'ghost'} onClick={() => setSection(item.id)}>
              {item.label}
            </button>
          ))}
        </nav>
        <div className="section-main">
          {section === 'members' && (
            <section>
              <h2>{t('members')}</h2>
              <table className="data">
                <thead>
                  <tr>
                    <th>{t('name')}</th>
                    <th>{t('email')}</th>
                    <th>{t('role')}</th>
                    <th>{t('status')}</th>
                    <th>{t('credentials')}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr key={user.id}>
                      <td>{user.displayName}</td>
                      <td>{user.email}</td>
                      <td>{user.role === 'admin' ? t('administrator') : t('member')}</td>
                      <td>{user.active ? t('activeState') : t('pausedState')}</td>
                      <td>{user.hasGymCredentials ? t('credentialsSaved') : t('noCredentials')}</td>
                      <td>
                        <RowMenu
                          label={t('actions')}
                          open={openMenu === user.id}
                          onToggle={() => setOpenMenu(openMenu === user.id ? '' : user.id)}
                        >
                          <button
                            type="button"
                            onClick={() => {
                              setOpenMenu('');
                              setBookPage(0);
                              api<{ displayName: string; reservations: ChargedBooking[] }>(`/api/admin/users/${user.id}/bookings`)
                                .then((body) => setBookings({ name: body.displayName, rows: body.reservations }))
                                .catch((reason: unknown) => setError(text(reason, explain)));
                            }}
                          >
                            {t('bookings')}
                          </button>
                          {user.id !== me.id && (
                            <button
                              type="button"
                              onClick={() => {
                                setOpenMenu('');
                                api(`/api/admin/users/${user.id}`, { method: 'PATCH', body: JSON.stringify({ active: !user.active }) })
                                  .then(load)
                                  .catch((reason: unknown) => setError(text(reason, explain)));
                              }}
                            >
                              {user.active ? t('deactivate') : t('activate')}
                            </button>
                          )}
                          {user.id !== me.id && (
                            <button
                              type="button"
                              onClick={() => {
                                setOpenMenu('');
                                api(`/api/admin/users/${user.id}`, { method: 'DELETE' })
                                  .then(load)
                                  .catch((reason: unknown) => setError(text(reason, explain)));
                              }}
                            >
                              {t('remove')}
                            </button>
                          )}
                        </RowMenu>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}
          {section === 'invites' && (
            <section>
              <h2>{t('invites')}</h2>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  setError('');
                  api<{ token: string; mailed: boolean }>('/api/admin/invites', {
                    method: 'POST',
                    body: JSON.stringify({ role: inviteRole, email: inviteEmail }),
                  }).then(remember).catch((reason: unknown) => setError(text(reason, explain)));
                }}
              >
                <div className="field-grid">
                <label>{t('role')}
                  <select value={inviteRole} onChange={(event) => setInviteRole(event.target.value as 'member' | 'admin')}>
                    <option value="member">{t('member')}</option>
                    <option value="admin">{t('administrator')}</option>
                  </select>
                </label>
                <label>{t('email')}<input type="email" value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} required /></label>
                <button className="solid" type="submit">{t('sendInvite')}</button>
                </div>
              </form>
              {link && <p className="notice" role="status">{mailed ? t('mailed') : t('mailMissing')}</p>}
              {link && (
                <p className="link-row">
                  <code>{link}</code>
                  <button className="ghost" type="button" onClick={() => void navigator.clipboard.writeText(link)}>{t('copy')}</button>
                </p>
              )}
              <table className="data">
                <thead>
                  <tr>
                    <th>{t('email')}</th>
                    <th>{t('role')}</th>
                    <th>{t('status')}</th>
                    <th>{t('when')}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {invites.map((invite) => (
                    <tr key={invite.id}>
                      <td>{invite.email ?? t('openInvite')}</td>
                      <td>{invite.role === 'admin' ? t('administrator') : t('member')}</td>
                      <td>{invite.usedAt ? t('used') : t('open')}</td>
                      <td>{new Date(invite.expiresAt).toLocaleDateString(lang === 'es' ? 'es-ES' : 'en-GB')}</td>
                      <td>
                        {!invite.usedAt && (
                          <RowMenu
                            label={t('actions')}
                            open={openMenu === invite.id}
                            onToggle={() => setOpenMenu(openMenu === invite.id ? '' : invite.id)}
                          >
                            <button
                              type="button"
                              onClick={() => {
                                setOpenMenu('');
                                api<{ token: string; mailed: boolean }>(`/api/admin/invites/${invite.id}/send`, { method: 'POST' })
                                  .then(remember)
                                  .catch((reason: unknown) => setError(text(reason, explain)));
                              }}
                            >
                              {t('resend')}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setOpenMenu('');
                                api(`/api/admin/invites/${invite.id}`, { method: 'DELETE' })
                                  .then(load)
                                  .catch((reason: unknown) => setError(text(reason, explain)));
                              }}
                            >
                              {t('revoke')}
                            </button>
                          </RowMenu>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}
          {section === 'requests' && (
            <section>
              <h2>{t('requests')}</h2>
              <table className="data">
                <thead>
                  <tr>
                    <th>{t('email')}</th>
                    <th>{t('status')}</th>
                    <th>{t('when')}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {requests.map((request) => (
                    <tr key={request.id}>
                      <td>{request.email}</td>
                      <td>{request.status === 'approved' ? t('approved') : request.status === 'rejected' ? t('rejected') : t('requestPending')}</td>
                      <td>{new Date(request.createdAt).toLocaleString(lang === 'es' ? 'es-ES' : 'en-GB')}</td>
                      <td>
                        {request.status === 'pending' && (
                          <RowMenu
                            label={t('actions')}
                            open={openMenu === request.id}
                            onToggle={() => setOpenMenu(openMenu === request.id ? '' : request.id)}
                          >
                            <button
                              type="button"
                              onClick={() => {
                                setOpenMenu('');
                                api<{ token: string; mailed: boolean }>(`/api/admin/access-requests/${request.id}/approve`, { method: 'POST' })
                                  .then((created) => {
                                    setSection('invites');
                                    remember(created);
                                  })
                                  .catch((reason: unknown) => setError(text(reason, explain)));
                              }}
                            >
                              {t('approve')}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setOpenMenu('');
                                api(`/api/admin/access-requests/${request.id}/reject`, { method: 'POST' })
                                  .then(load)
                                  .catch((reason: unknown) => setError(text(reason, explain)));
                              }}
                            >
                              {t('reject')}
                            </button>
                          </RowMenu>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}
          {section === 'slots' && (
            <SlotSection
              rules={rules}
              lang={lang}
              weekday={weekday}
              startTime={startTime}
              durationMinutes={durationMinutes}
              setWeekday={setWeekday}
              setStartTime={setStartTime}
              setDurationMinutes={setDurationMinutes}
              weekdayShort={weekdayShort}
              onSaved={load}
              onError={setError}
            />
          )}
        </div>
      </div>
      {bookings && (
        <div className="modal-back" onClick={() => setBookings(null)}>
          <div className="modal" role="dialog" aria-modal="true" aria-label={bookings.name} onClick={(event) => event.stopPropagation()}>
            <h2>{bookings.name}<Help text={t('helpBookings')} /></h2>
            {bookings.rows.length === 0 && <p className="empty">{t('nothingCharged')}</p>}
            {bookings.rows.length > 0 && (
              <table className="data">
                <thead>
                  <tr>
                    <th>{t('when')}</th>
                    <th>{t('court')}</th>
                    <th>{t('players')}</th>
                    <th>{t('status')}</th>
                    <th>{t('duration')}</th>
                  </tr>
                </thead>
                <tbody>
                  {bookings.rows.slice(bookPage * PAGE_SIZE, bookPage * PAGE_SIZE + PAGE_SIZE).map((reservation) => (
                    <tr key={reservation.id}>
                      <td>{clock(reservation.startsAt, lang)}</td>
                      <td>{courtNumber(reservation.courtIndex)}</td>
                      <td>{reservation.players.join(', ')}</td>
                      <td>{status(reservation.status)}</td>
                      <td>{hours(reservation.durationMinutes)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <Pager page={bookPage} pages={Math.ceil(bookings.rows.length / PAGE_SIZE)} onPage={setBookPage} />
            <button className="ghost" type="button" onClick={() => setBookings(null)}>{t('close')}</button>
          </div>
        </div>
      )}
    </main>
  );
}

function SlotSection({
  rules,
  lang,
  weekday,
  startTime,
  durationMinutes,
  setWeekday,
  setStartTime,
  setDurationMinutes,
  weekdayShort,
  onSaved,
  onError,
}: {
  rules: Rule[];
  lang: Lang;
  weekday: number;
  startTime: string;
  durationMinutes: number;
  setWeekday: (value: number) => void;
  setStartTime: (value: string) => void;
  setDurationMinutes: (value: number) => void;
  weekdayShort: (index: number) => string;
  onSaved: () => void;
  onError: (value: string) => void;
}) {
  const { t, explain } = useI18n();
  return (
    <section>
      <h2>{t('weeklySlots')}</h2>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          api('/api/admin/slot-rules', {
            method: 'POST',
            body: JSON.stringify({ weekday, startTime, durationMinutes, clubCode: 'ROC' }),
          }).then(onSaved).catch((reason: unknown) => onError(text(reason, explain)));
        }}
      >
        <div className="field-grid">
        <label>{t('weekday')}
          <select value={weekday} onChange={(event) => setWeekday(Number(event.target.value))}>
            {[1, 2, 3, 4, 5, 6, 7].map((day) => <option key={day} value={day}>{weekdayName(day, lang)} ({weekdayShort(day - 1)})</option>)}
          </select>
        </label>
        <label>{t('start')}<input type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} required /></label>
        <label>{t('minutes')}<input type="number" min={30} max={180} value={durationMinutes} onChange={(event) => setDurationMinutes(Number(event.target.value))} /></label>
        <button className="solid" type="submit">{t('addSlot')}</button>
        </div>
      </form>
      <table className="data">
        <thead>
          <tr>
            <th>{t('weekday')}</th>
            <th>{t('start')}</th>
            <th>{t('minutes')}</th>
            <th>{t('status')}</th>
          </tr>
        </thead>
        <tbody>
          {rules.map((rule) => (
            <tr key={rule.id}>
              <td>{weekdayName(rule.weekday, lang)}</td>
              <td>{rule.startTime}</td>
              <td>{rule.durationMinutes}</td>
              <td>
                <button
                  className="ghost"
                  type="button"
                  onClick={() => {
                    api(`/api/admin/slot-rules/${rule.id}`, { method: 'PATCH', body: JSON.stringify({ active: !rule.active }) })
                      .then(onSaved)
                      .catch((reason: unknown) => onError(text(reason, explain)));
                  }}
                >
                  {rule.active ? t('pause') : t('resume')}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <SchedulerForm onError={onError} />
    </section>
  );
}

function SchedulerForm({ onError }: { onError: (value: string) => void }) {
  const { t, explain } = useI18n();
  const [horizonDays, setHorizonDays] = useState(7);
  const [tickSeconds, setTickSeconds] = useState(15);
  const [tryOffset, setTryOffset] = useState(true);
  const [availabilityEnabled, setAvailabilityEnabled] = useState(false);
  const [availabilityAccountId, setAvailabilityAccountId] = useState('');
  const [availabilityIntervalHours, setAvailabilityIntervalHours] = useState(6);
  const [accounts, setAccounts] = useState<{ id: string; displayName: string }[]>([]);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api<{
      settings: {
        horizonDays: number;
        tickSeconds: number;
        tryOffset: boolean;
        availabilityEnabled: boolean;
        availabilityAccountId: string | null;
        availabilityIntervalHours: number;
      };
      accounts: { id: string; displayName: string }[];
    }>('/api/admin/scheduler').then((body) => {
      setHorizonDays(body.settings.horizonDays);
      setTickSeconds(body.settings.tickSeconds);
      setTryOffset(body.settings.tryOffset);
      setAvailabilityEnabled(body.settings.availabilityEnabled);
      setAvailabilityAccountId(body.settings.availabilityAccountId ?? '');
      setAvailabilityIntervalHours(body.settings.availabilityIntervalHours);
      setAccounts(body.accounts);
    }).catch((reason: unknown) => onError(text(reason, explain)));
  }, []);

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        setSaved(false);
        api('/api/admin/scheduler', {
          method: 'PUT',
          body: JSON.stringify({
            horizonDays,
            tickSeconds,
            tryOffset,
            availabilityEnabled,
            availabilityAccountId: availabilityAccountId || null,
            availabilityIntervalHours,
          }),
        }).then(() => setSaved(true)).catch((reason: unknown) => onError(text(reason, explain)));
      }}
    >
      <h2>{t('schedulerSettings')}</h2>
      <div className="field-grid">
      <label>{t('horizonDays')}<input type="number" min={1} max={14} value={horizonDays} onChange={(event) => setHorizonDays(Number(event.target.value))} /></label>
      <label>{t('tickSeconds')}<input type="number" min={5} max={3600} value={tickSeconds} onChange={(event) => setTickSeconds(Number(event.target.value))} /> {t('seconds')}</label>
      <label className="check"><input type="checkbox" checked={tryOffset} onChange={(event) => setTryOffset(event.target.checked)} /> {t('tryOffset')}</label>
      <label className="check"><input type="checkbox" checked={availabilityEnabled} onChange={(event) => setAvailabilityEnabled(event.target.checked)} /> {t('availabilityCheck')}</label>
      <label>{t('checkAccount')}
        <select value={availabilityAccountId} onChange={(event) => setAvailabilityAccountId(event.target.value)}>
          <option value="" />
          {accounts.map((account) => <option key={account.id} value={account.id}>{account.displayName}</option>)}
        </select>
      </label>
      <label>{t('everyHours')}<input type="number" min={1} max={48} value={availabilityIntervalHours} onChange={(event) => setAvailabilityIntervalHours(Number(event.target.value))} /> {t('hoursLabel')}</label>
      <button className="solid" type="submit">{t('savePlay')}</button>
      </div>
      {saved && <p className="notice" role="status">{t('saved')}</p>}
    </form>
  );
}

function RowMenu({
  label,
  open,
  onToggle,
  children,
}: {
  label: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <div className="menu">
      <button type="button" className="cog" aria-label={label} aria-expanded={open} onClick={onToggle}>
        <CogIcon />
      </button>
      {open && <div className="menu-pop" role="menu">{children}</div>}
    </div>
  );
}

function CogIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path fill="currentColor" d="M19.4 13.5a7.7 7.7 0 0 0 .1-1.5 7.7 7.7 0 0 0-.1-1.5l2-1.6a.5.5 0 0 0 .1-.6l-1.9-3.3a.5.5 0 0 0-.6-.2l-2.4 1a7.4 7.4 0 0 0-2.6-1.5l-.4-2.5a.5.5 0 0 0-.5-.4h-3.8a.5.5 0 0 0-.5.4l-.4 2.5a7.4 7.4 0 0 0-2.6 1.5l-2.4-1a.5.5 0 0 0-.6.2L.6 8.3a.5.5 0 0 0 .1.6l2 1.6a7.7 7.7 0 0 0-.1 1.5 7.7 7.7 0 0 0 .1 1.5l-2 1.6a.5.5 0 0 0-.1.6l1.9 3.3a.5.5 0 0 0 .6.2l2.4-1a7.4 7.4 0 0 0 2.6 1.5l.4 2.5a.5.5 0 0 0 .5.4h3.8a.5.5 0 0 0 .5-.4l.4-2.5a7.4 7.4 0 0 0 2.6-1.5l2.4 1a.5.5 0 0 0 .6-.2l1.9-3.3a.5.5 0 0 0-.1-.6l-2-1.6ZM12 15.5A3.5 3.5 0 1 1 12 8a3.5 3.5 0 0 1 0 7.5Z" />
    </svg>
  );
}

function clock(iso: string, lang: Lang): string {
  return new Intl.DateTimeFormat(lang === 'es' ? 'es-ES' : 'en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' }).format(new Date(iso));
}

function hours(minutes: number): string {
  const absolute = Math.abs(minutes);
  return `${Math.floor(absolute / 60)} h ${String(absolute % 60).padStart(2, '0')} min`;
}

function weekdayName(isoWeekday: number, lang: Lang): string {
  return new Intl.DateTimeFormat(lang === 'es' ? 'es-ES' : 'en-GB', { weekday: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(2026, 9, 18 + isoWeekday)));
}

function text(reason: unknown, explain: (code: string) => string): string {
  if (reason && typeof reason === 'object' && 'message' in reason && typeof reason.message === 'string') {
    return explain(reason.message);
  }
  return explain('request_failed');
}
