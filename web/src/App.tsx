import { useEffect, useState } from 'react';
import { api, ApiError, type Account, type Balance, type Court, type Dashboard, type Opening, type SessionUser } from './api';
import { AdminScreen } from './Admin';
import { CourtCard } from './Court';
import { courtNumber } from './courts';
import { useI18n, type Lang } from './i18n';

type Tab = 'dashboard' | 'account' | 'admin';

export function App() {
  const { t, lang, setLang } = useI18n();
  const [me, setMe] = useState<SessionUser | null | undefined>(undefined);
  const [tab, setTab] = useState<Tab>('dashboard');
  const [error, setError] = useState('');

  useEffect(() => {
    api<SessionUser>('/api/auth/me')
      .then(setMe)
      .catch(() => setMe(null));
  }, []);

  if (me === undefined) return <main className="gate">{t('loading')}</main>;

  const inviteToken = readInviteToken();
  if (!me && inviteToken) {
    return <InviteScreen token={inviteToken} onDone={setMe} />;
  }
  if (!me) return <LoginScreen onDone={setMe} />;

  return (
    <div className="app">
      <header className="top">
        <div>
          <p className="mark">FODBS</p>
          <p className="sub">{t('tagline')}</p>
        </div>
        <nav>
          <button className={tab === 'dashboard' ? 'on' : ''} onClick={() => setTab('dashboard')}>{t('board')}</button>
          <button className={tab === 'account' ? 'on' : ''} onClick={() => setTab('account')}>{t('account')}</button>
          {me.role === 'admin' && (
            <button className={tab === 'admin' ? 'on' : ''} onClick={() => setTab('admin')}>{t('admin')}</button>
          )}
          <span className="langs">
            <button type="button" className={lang === 'es' ? 'on' : ''} onClick={() => setLang('es')}>ES</button>
            <button type="button" className={lang === 'en' ? 'on' : ''} onClick={() => setLang('en')}>EN</button>
          </span>
          <button
            onClick={() => {
              void api('/api/auth/logout', { method: 'POST' }).then(() => setMe(null));
            }}
          >
            {t('signOut')}
          </button>
        </nav>
      </header>
      {error && <p className="banner">{error}</p>}
      {tab === 'dashboard' && <DashboardScreen me={me} onError={setError} />}
      {tab === 'account' && <AccountScreen onActive={setMe} />}
      {tab === 'admin' && me.role === 'admin' && <AdminScreen me={me} />}
    </div>
  );
}

function LoginScreen({ onDone }: { onDone: (user: SessionUser) => void }) {
  const { t, explain } = useI18n();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [asking, setAsking] = useState(false);
  const [requestEmail, setRequestEmail] = useState('');
  const [requested, setRequested] = useState(false);

  return (
    <main className="gate">
      <LangSwitch />
      <p className="mark">FODBS</p>
      <h1>{t('inviteOnly')}</h1>
      <p className="lede">{t('lede')}</p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          setError('');
          api<SessionUser>('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) })
            .then(onDone)
            .catch((reason: unknown) => setError(message(reason, explain)));
        }}
      >
        <label>{t('email')}<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
        <label>{t('password')}<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
        {error && <p className="banner">{error}</p>}
        <button className="solid" type="submit">{t('enter')}</button>
      </form>
      <button type="button" onClick={() => setAsking((value) => !value)}>{t('requestAccess')}</button>
      {asking && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            setError('');
            api('/api/access-requests', { method: 'POST', body: JSON.stringify({ email: requestEmail }) })
              .then(() => setRequested(true))
              .catch((reason: unknown) => setError(message(reason, explain)));
          }}
        >
          <p>{t('requestHint')}</p>
          <label>{t('email')}<input type="email" value={requestEmail} onChange={(event) => setRequestEmail(event.target.value)} required /></label>
          {requested && <p className="notice" role="status">{t('requestSent')}</p>}
          <button className="solid" type="submit">{t('requestSend')}</button>
        </form>
      )}
    </main>
  );
}

function InviteScreen({ token, onDone }: { token: string; onDone: (user: SessionUser) => void }) {
  const { t, explain } = useI18n();
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  return (
    <main className="gate">
      <LangSwitch />
      <p className="mark">FODBS</p>
      <h1>{t('acceptInvite')}</h1>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          setError('');
          api<SessionUser>('/api/auth/accept-invite', {
            method: 'POST',
            body: JSON.stringify({ token, email, password, displayName }),
          })
            .then(onDone)
            .catch((reason: unknown) => setError(message(reason, explain)));
        }}
      >
        <label>{t('name')}<input value={displayName} onChange={(event) => setDisplayName(event.target.value)} required /></label>
        <label>{t('email')}<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
        <label>{t('password')}<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={10} required /></label>
        {error && <p className="banner">{error}</p>}
        <button className="solid" type="submit">{t('createAccount')}</button>
      </form>
    </main>
  );
}

function DashboardScreen({ me, onError }: { me: SessionUser; onError: (value: string) => void }) {
  const { t, lang, explain } = useI18n();
  const [data, setData] = useState<Dashboard | null>(null);
  const [date, setDate] = useState('');

  function load(next = date) {
    const query = next ? `?date=${next}` : '';
    api<Dashboard>(`/api/dashboard${query}`)
      .then((dashboard) => {
        setData(dashboard);
        setDate(dashboard.date);
        onError('');
      })
      .catch((reason: unknown) => onError(message(reason, explain)));
  }

  useEffect(() => {
    load('');
  }, []);

  if (!data) return <main className="panel">{t('setting')}</main>;

  return (
    <main className="panel">
      <section className="summary">
        <article className="balance">
          <h2>{t('groupBalance')}</h2>
          <div className="figures">
            <p><span>{t('weekCourts')}</span><strong>{data.group.weekRemaining}</strong></p>
            <p><span>{t('nextWeekCourts')}</span><strong>{data.group.nextWeek}</strong></p>
            <p><span>{t('playedCourts')}</span><strong>{data.group.played}</strong></p>
          </div>
        </article>
        <div className="roster">
          <h2>{t('activePlayers')}</h2>
          <ul>
            {data.activeUsers.map((user) => (
              <li key={user.id}>
                <span className="avatar">{initials(user.displayName)}</span>
                <span>{user.displayName}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>
      <p className="venue">{t('venue')}</p>
      <div className="slider" role="listbox" aria-label={t('dates')}>
        {data.dates.map((iso) => (
          <button
            key={iso}
            className={iso === data.date ? 'date on' : 'date'}
            data-date={iso}
            onClick={() => {
              setDate(iso);
              load(iso);
            }}
          >
            <span>{weekday(iso, lang)}</span>
            <strong>{dayMonth(iso, lang)}</strong>
          </button>
        ))}
      </div>
      {!me.active && <p className="banner">{t('pausedHint')}</p>}
      {me.active && !data.me.hasGymCredentials && <p className="notice">{t('seatRequestHint')}</p>}
      {data.me.hasGymCredentials && <BookWizard date={data.date} onBooked={() => load(data.date)} onError={onError} />}
      {data.occurrences.some((occurrence) => occurrence.checks.length > 0) && (
        <div className="checks">
          {data.occurrences.filter((occurrence) => occurrence.checks.length > 0).map((occurrence) => (
            <p key={occurrence.id}>
              <strong>{timeOnly(occurrence.startsAt, lang)}</strong>
              {occurrence.checks.map((check) => (
                <span key={check.courtIndex}>{t('court')} {courtNumber(check.courtIndex)} {check.free ? t('freeCourt') : t('busyCourt')}</span>
              ))}
            </p>
          ))}
        </div>
      )}
      {data.occurrences.length === 0 && <p className="empty">{t('noSlot')}</p>}
      <div className="joins">
        {data.occurrences.filter((occurrence) => !occurrence.courts.some((court) => court.reservationId)).map((occurrence) => (
          <div key={occurrence.id} className="join">
            <strong>{timeOnly(occurrence.startsAt, lang)}</strong>
            <button
              className={occurrence.myOptIn ? 'solid' : ''}
              type="button"
              disabled={!me.active || !data.me.hasGymCredentials}
              onClick={() => {
                if (!me.active) return;
                void api(`/api/occurrences/${occurrence.id}/availability`, {
                  method: 'POST',
                  body: JSON.stringify({ in: !occurrence.myOptIn }),
                }).then(() => load(data.date)).catch((reason: unknown) => onError(message(reason, explain)));
              }}
            >
              {occurrence.myOptIn ? t('imIn') : t('countMe')}
            </button>
          </div>
        ))}
      </div>
      <section className="slot">
        <div className="slot-layout">
          <div className="courts">
            {[1, 0, 3, 2].map((courtIndex) => (
              <CourtCard
                key={courtIndex}
                courtIndex={courtIndex}
                meId={me.id}
                canBook={data.me.hasGymCredentials}
                times={data.occurrences.flatMap((occurrence) => {
                  const court = occurrence.courts.find((item) => item.courtIndex === courtIndex);
                  if (!court || !courtHasPlay(court)) return [];
                  return [{
                    occurrenceId: occurrence.id,
                    label: timeOnly(court.startsAt ?? occurrence.startsAt, lang),
                    court,
                  }];
                })}
                onChange={() => load(data.date)}
                onError={onError}
              />
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}

function AccountScreen({ onActive }: { onActive: (user: SessionUser) => void }) {
  const { t, lang, status, weekdayShort, explain } = useI18n();
  const [account, setAccount] = useState<Account | null>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [playSaved, setPlaySaved] = useState(false);
  const [credsSaved, setCredsSaved] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncedNote, setSyncedNote] = useState(false);
  const [active, setActive] = useState(true);
  const [section, setSection] = useState<'hours' | 'club' | 'play' | 'status'>('hours');
  const [weekdays, setWeekdays] = useState<number[]>([1, 3]);
  const [preferredTime, setPreferredTime] = useState('19:00');
  const [partySize, setPartySize] = useState<2 | 3>(3);

  function load() {
    api<Account>('/api/account').then((next) => {
      setAccount(next);
      setUsername(next.gymUsername ?? '');
      setActive(next.active);
      if (next.preferences) {
        setWeekdays(next.preferences.weekdays);
        setPreferredTime(next.preferences.preferredTime);
        setPartySize(next.preferences.partySize);
      }
    }).catch((reason: unknown) => setError(message(reason, explain)));
  }

  useEffect(() => {
    load();
  }, []);

  if (!account) return <main className="panel">{t('accountOpening')}</main>;

  const sections = [
    { id: 'hours' as const, label: t('yourBalance') },
    { id: 'club' as const, label: t('credentials') },
    { id: 'play' as const, label: t('playShape') },
    { id: 'status' as const, label: t('status') },
  ];

  return (
    <main className="panel">
      {error && <p className="banner">{error}</p>}
      <div className="section-shell">
        <nav className="section-nav" aria-label={t('account')}>
          {sections.map((item) => (
            <button key={item.id} type="button" className={section === item.id ? 'on' : ''} onClick={() => setSection(item.id)}>
              {item.label}
            </button>
          ))}
        </nav>
        <div className="section-main">
      {section === 'hours' && (
      <>
      <BalanceCard title={t('yourBalance')} balance={account.balance} />
      <section>
      <h2>{t('bookedOnYou')}</h2>
      {account.reservations.length === 0 && <p className="empty">{t('nothingCharged')}</p>}
      <ul className="ledger">
        {account.reservations.map((reservation) => (
          <li key={reservation.id}>
            <span>{clock(reservation.startsAt, lang)} · {t('court')} {courtNumber(reservation.courtIndex)}</span>
            <em>{status(reservation.status)}</em>
            <strong>{hours(reservation.durationMinutes)}</strong>
          </li>
        ))}
      </ul>
      </section>
      </>
      )}
      {section === 'club' && (
      <section>
        <h2>{t('bons')}</h2>
        <p className="bons">{account.bonsRemaining == null ? t('bonsUnknown') : account.bonsRemaining}</p>
        <button
          className="solid"
          type="button"
          disabled={syncing || !account.hasGymCredentials}
          onClick={() => {
            setError('');
            setSyncedNote(false);
            setSyncing(true);
            const before = account.syncedAt;
            void api('/api/account/sync', { method: 'POST' })
              .then(async () => {
                const deadline = Date.now() + 45_000;
                while (Date.now() < deadline) {
                  await new Promise((resolve) => setTimeout(resolve, 2000));
                  const next = await api<Account>('/api/account');
                  setAccount(next);
                  if (next.syncedAt && next.syncedAt !== before) {
                    setSyncedNote(true);
                    return;
                  }
                }
                setError(t('syncFailed'));
              })
              .catch((reason: unknown) => setError(message(reason, explain)))
              .finally(() => setSyncing(false));
          }}
        >
          {syncing ? t('syncing') : t('syncNow')}
        </button>
        {syncedNote && <p className="notice" role="status">{t('synced')}</p>}
        <h2>{t('credentials')}</h2>
        <p>{t('sealed')}</p>
        <p>{t('syncHint')}</p>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            setError('');
            setCredsSaved(false);
            api('/api/account/credentials', { method: 'PUT', body: JSON.stringify({ username, password }) })
              .then(() => {
                setPassword('');
                setCredsSaved(true);
                load();
              })
              .catch((reason: unknown) => setError(message(reason, explain)));
          }}
        >
          <label>{t('identifier')}<input value={username} onChange={(event) => setUsername(event.target.value)} required /></label>
          <label>{t('password')}<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
          <button className="solid" type="submit">{t('replaceCredentials')}</button>
          {credsSaved && <p className="notice" role="status">{t('saved')}</p>}
        </form>
      </section>
      )}
      {section === 'status' && (
      <section>
        <h2>{t('status')}</h2>
        <p>{active ? t('activeHint') : t('pausedHint')}</p>
        <button
          className="solid"
          type="button"
          onClick={() => {
            setError('');
            api<SessionUser>('/api/account/active', { method: 'PATCH', body: JSON.stringify({ active: !active }) })
              .then((user) => {
                onActive(user);
                load();
              })
              .catch((reason: unknown) => setError(message(reason, explain)));
          }}
        >
          {active ? t('pauseAccount') : t('restoreAccount')}
        </button>
      </section>
      )}
      {section === 'play' && (
      <section>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          setError('');
          setPlaySaved(false);
          api('/api/account/preferences', {
            method: 'PUT',
            body: JSON.stringify({ weekdays, preferredTime, partySize }),
          }).then(() => {
            setPlaySaved(true);
            load();
          }).catch((reason: unknown) => setError(message(reason, explain)));
        }}
      >
        <h2>{t('playShape')}</h2>
        <p>{t('playShapeHint')}</p>
        <fieldset className="days">
          <legend>{t('weekdays')}</legend>
          {[1, 2, 3, 4, 5, 6, 7].map((day) => {
            const selected = weekdays.includes(day);
            return (
              <button
                key={day}
                type="button"
                className={selected ? 'on' : ''}
                aria-pressed={selected}
                onClick={() => {
                  setWeekdays((current) => current.includes(day) ? current.filter((item) => item !== day) : [...current, day]);
                  setPlaySaved(false);
                }}
              >
                {weekdayShort(day - 1)}
              </button>
            );
          })}
        </fieldset>
        <label>{t('preferredTime')}<input type="time" value={preferredTime} onChange={(event) => { setPreferredTime(event.target.value); setPlaySaved(false); }} required /></label>
        <fieldset className="days">
          <legend>{t('party')}</legend>
          <button type="button" className={partySize === 2 ? 'on' : ''} aria-pressed={partySize === 2} onClick={() => { setPartySize(2); setPlaySaved(false); }}>{t('pair')}</button>
          <button type="button" className={partySize === 3 ? 'on' : ''} aria-pressed={partySize === 3} onClick={() => { setPartySize(3); setPlaySaved(false); }}>{t('trio')}</button>
        </fieldset>
        <button className="solid" type="submit">{t('savePlay')}</button>
        {playSaved && <p className="notice" role="status">{t('saved')}</p>}
      </form>
      <PreferredForm account={account} onSaved={load} onError={setError} />
      </section>
      )}
        </div>
      </div>
    </main>
  );
}


function BookWizard({ date, onBooked, onError }: { date: string; onBooked: () => void; onError: (value: string) => void }) {
  const { t, lang, explain } = useI18n();
  const [time, setTime] = useState('18:00');
  const [duration, setDuration] = useState<30 | 60 | 90 | 120>(60);
  const [exact, setExact] = useState<Opening[]>([]);
  const [alternatives, setAlternatives] = useState<Opening[]>([]);
  const [searched, setSearched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  function confirm(opening: Opening) {
    setBusy(true);
    setSaved(false);
    onError('');
    void api('/api/bookings/confirm', {
      method: 'POST',
      body: JSON.stringify({ startsAt: opening.startsAt, courtIndex: opening.courtIndex, durationMinutes: duration }),
    }).then(() => {
      setSaved(true);
      setExact([]);
      setAlternatives([]);
      setSearched(false);
      onBooked();
    }).catch((reason: unknown) => onError(message(reason, explain))).finally(() => setBusy(false));
  }

  return (
    <form
      className="wizard"
      onSubmit={(event) => {
        event.preventDefault();
        setBusy(true);
        setSaved(false);
        onError('');
        void api<{ exact: Opening[]; alternatives: Opening[] }>('/api/bookings/search', {
          method: 'POST',
          body: JSON.stringify({ date, time, durationMinutes: duration }),
        }).then((result) => {
          setExact(result.exact);
          setAlternatives(result.alternatives);
          setSearched(true);
        }).catch((reason: unknown) => onError(message(reason, explain))).finally(() => setBusy(false));
      }}
    >
      <h2>{t('bookCourt')}</h2>
      <label>{t('preferredTime')}<input type="time" value={time} onChange={(event) => setTime(event.target.value)} required /></label>
      <label>{t('duration')}
        <select value={duration} onChange={(event) => setDuration(Number(event.target.value) as 30 | 60 | 90 | 120)}>
          {[30, 60, 90, 120].map((minutes) => <option key={minutes} value={minutes}>{minutes}</option>)}
        </select>
      </label>
      <button className="solid" type="submit" disabled={busy || !date}>{busy ? t('setting') : t('searchCourts')}</button>
      {saved && <p className="notice" role="status">{t('bookingSaved')}</p>}
      {searched && exact.length === 0 && alternatives.length === 0 && <p className="empty">{t('noneFree')}</p>}
      <OpeningList title={t('exactSlots')} openings={exact} lang={lang} disabled={busy} onPick={confirm} />
      <OpeningList title={t('otherSlots')} openings={alternatives} lang={lang} disabled={busy} onPick={confirm} />
    </form>
  );
}

function OpeningList({ title, openings, lang, disabled, onPick }: {
  title: string;
  openings: Opening[];
  lang: Lang;
  disabled: boolean;
  onPick: (opening: Opening) => void;
}) {
  const { t } = useI18n();
  if (openings.length === 0) return null;
  return (
    <div className="openings">
      <h3>{title}</h3>
      {openings.map((opening) => (
        <button key={`${opening.courtIndex}-${opening.startsAt}`} type="button" disabled={disabled} onClick={() => onPick(opening)}>
          {t('court')} {courtNumber(opening.courtIndex)} · {timeOnly(opening.startsAt, lang)}
        </button>
      ))}
    </div>
  );
}

function PreferredForm({ account, onSaved, onError }: { account: Account; onSaved: () => void; onError: (value: string) => void }) {
  const { t, explain } = useI18n();
  const [players, setPlayers] = useState(account.preferred.map((player) => ({ userId: player.userId, guestName: player.guestName, displayName: player.displayName })));
  const [memberId, setMemberId] = useState('');
  const [guestName, setGuestName] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setPlayers(account.preferred.map((player) => ({ userId: player.userId, guestName: player.guestName, displayName: player.displayName })));
  }, [account]);

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onError('');
        setSaved(false);
        void api('/api/account/preferred', {
          method: 'PUT',
          body: JSON.stringify({ players: players.map((player) => ({ userId: player.userId, guestName: player.guestName })) }),
        }).then(() => {
          setSaved(true);
          onSaved();
        }).catch((reason: unknown) => onError(message(reason, explain)));
      }}
    >
      <h2>{t('preferredPlayers')}</h2>
      <p>{t('preferredHint')}</p>
      <ul className="ledger">
        {players.map((player, index) => (
          <li key={`${player.userId ?? player.guestName}-${index}`}>
            <span>{player.displayName}</span>
            <button type="button" onClick={() => setPlayers((current) => current.filter((_, item) => item !== index))}>{t('remove')}</button>
          </li>
        ))}
      </ul>
      <label>{t('memberPick')}
        <select value={memberId} onChange={(event) => setMemberId(event.target.value)}>
          <option value="" />
          {account.companions.filter((person) => !players.some((player) => player.userId === person.id)).map((person) => (
            <option key={person.id} value={person.id}>{person.displayName}</option>
          ))}
        </select>
      </label>
      <button
        type="button"
        disabled={!memberId || players.length >= 4}
        onClick={() => {
          const person = account.companions.find((item) => item.id === memberId);
          if (!person) return;
          setPlayers((current) => [...current, { userId: person.id, guestName: null, displayName: person.displayName }]);
          setMemberId('');
          setSaved(false);
        }}
      >
        {t('addPlayer')}
      </button>
      <label>{t('guest')}
        <input value={guestName} maxLength={40} onChange={(event) => setGuestName(event.target.value)} />
      </label>
      <button
        type="button"
        disabled={!guestName.trim() || players.length >= 4}
        onClick={() => {
          setPlayers((current) => [...current, { userId: null, guestName: guestName.trim(), displayName: guestName.trim() }]);
          setGuestName('');
          setSaved(false);
        }}
      >
        {t('addGuest')}
      </button>
      <button className="solid" type="submit">{t('savePlay')}</button>
      {saved && <p className="notice" role="status">{t('saved')}</p>}
    </form>
  );
}

function BalanceCard({ title, balance }: { title: string; balance: Balance }) {
  const { t } = useI18n();
  return (
    <article className="balance">
      <h2>{title}</h2>
      <div className="figures">
        <p><span>{t('booked')}</span><strong>{hours(balance.bookedMinutes)}</strong></p>
        <p><span>{t('weekBooked')}</span><strong>{hours(balance.weekBookedMinutes)}</strong></p>
        <p><span>{t('nextWeekBooked')}</span><strong>{hours(balance.nextWeekBookedMinutes)}</strong></p>
        <p><span>{t('played')}</span><strong>{hours(balance.playedMinutes)}</strong></p>
        <p><span>{t('delta')}</span><strong className={balance.differenceMinutes >= 0 ? 'ahead' : 'behind'}>{signedHours(balance.differenceMinutes)}</strong></p>
      </div>
    </article>
  );
}

function LangSwitch() {
  const { lang, setLang } = useI18n();
  return (
    <span className="langs">
      <button type="button" className={lang === 'es' ? 'on' : ''} onClick={() => setLang('es')}>ES</button>
      <button type="button" className={lang === 'en' ? 'on' : ''} onClick={() => setLang('en')}>EN</button>
    </span>
  );
}

function readInviteToken(): string {
  const parts = window.location.pathname.split('/').filter(Boolean);
  if (parts[0] !== 'invite' || !parts[1]) return '';
  return decodeURIComponent(parts[1]);
}

function message(reason: unknown, explain: (code: string) => string): string {
  return reason instanceof ApiError ? explain(reason.message) : explain('request_failed');
}

function hours(minutes: number): string {
  const sign = minutes < 0 ? '-' : '';
  const absolute = Math.abs(minutes);
  return `${sign}${Math.floor(absolute / 60)} h ${String(absolute % 60).padStart(2, '0')} min`;
}

function signedHours(minutes: number): string {
  if (minutes > 0) return `+${hours(minutes)}`;
  return hours(minutes);
}

function initials(name: string): string {
  return name.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '').join('');
}

function locale(lang: Lang): string {
  return lang === 'es' ? 'es-ES' : 'en-GB';
}

function weekday(iso: string, lang: Lang): string {
  return new Intl.DateTimeFormat(locale(lang), { weekday: 'short', timeZone: 'Europe/Madrid' }).format(new Date(`${iso}T12:00:00Z`));
}

function dayMonth(iso: string, lang: Lang): string {
  return new Intl.DateTimeFormat(locale(lang), { day: 'numeric', month: 'short', timeZone: 'Europe/Madrid' }).format(new Date(`${iso}T12:00:00Z`));
}

function courtHasPlay(court: Court): boolean {
  return Boolean(court.reservationId);
}

function timeOnly(iso: string, lang: Lang): string {
  return new Intl.DateTimeFormat(locale(lang), { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'Europe/Madrid' }).format(new Date(iso));
}

function clock(iso: string, lang: Lang): string {
  return new Intl.DateTimeFormat(locale(lang), { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' }).format(new Date(iso));
}

