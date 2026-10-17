import { createServer, type Server } from 'node:http';
import { fixtureFlow, type GymFlow } from './gateway.js';

type FixtureUser = { username: string; password: string };

export async function startFixture(users: FixtureUser[]): Promise<{
  url: string;
  flow: GymFlow;
  bookings: Map<string, { username: string; court: string }>;
  close: () => Promise<void>;
}> {
  const sessions = new Map<string, string>();
  const bookings = new Map<string, { username: string; court: string }>();
  let seq = 1;

  const server: Server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const form = new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    const sid = readCookie(req.headers.cookie, 'sid');
    const username = sid ? sessions.get(sid) : undefined;

    if (url.pathname === '/login' && req.method === 'GET') {
      html(res, loginPage());
      return;
    }
    if (url.pathname === '/login' && req.method === 'POST') {
      const found = users.find((user) => user.username === form.get('username') && user.password === form.get('password'));
      if (!found) {
        res.statusCode = 401;
        res.end('nope');
        return;
      }
      const token = `s${seq++}`;
      sessions.set(token, found.username);
      res.statusCode = 302;
      res.setHeader('set-cookie', `sid=${token}; Path=/`);
      res.setHeader('location', '/agenda');
      res.end();
      return;
    }
    if (!username) {
      res.statusCode = 302;
      res.setHeader('location', '/login');
      res.end();
      return;
    }
    if (url.pathname === '/agenda') {
      html(res, agendaPage());
      return;
    }
    if (url.pathname === '/book' && req.method === 'POST') {
      const ref = `ref-${seq++}`;
      bookings.set(ref, { username, court: form.get('court') ?? '' });
      res.statusCode = 302;
      res.setHeader('location', `/done?ref=${encodeURIComponent(ref)}`);
      res.end();
      return;
    }
    if (url.pathname === '/done') {
      html(res, `<p id="external-ref">${escapeHtml(url.searchParams.get('ref') ?? '')}</p>`);
      return;
    }
    if (url.pathname.startsWith('/cancel/')) {
      const ref = decodeURIComponent(url.pathname.slice('/cancel/'.length));
      if (req.method === 'GET') {
        html(res, `<p id="ref">${escapeHtml(ref)}</p><form method="post"><button id="cancel" type="submit">Cancel</button></form>`);
        return;
      }
      bookings.delete(ref);
      html(res, `<p id="cancelled">${escapeHtml(ref)}</p>`);
      return;
    }
    res.statusCode = 404;
    res.end('missing');
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  const url = `http://127.0.0.1:${port}`;
  return {
    url,
    flow: fixtureFlow(url),
    bookings,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

function html(res: import('node:http').ServerResponse, body: string): void {
  res.setHeader('content-type', 'text/html; charset=utf-8');
  res.end(`<!doctype html><html><body>${body}</body></html>`);
}

function loginPage(): string {
  return `<form method="post" action="/login">
    <input id="username" name="username" />
    <input id="password" name="password" type="password" />
    <button id="submit" type="submit">Enter</button>
  </form>`;
}

function agendaPage(): string {
  return `<main id="agenda">
    <form method="post" action="/book">
      <input id="club" name="club" />
      <input id="court" name="court" />
      <input id="starts" name="starts" />
      <input id="duration" name="duration" />
      <button id="book" type="submit">Book</button>
    </form>
  </main>`;
}

function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return rest.join('=');
  }
  return undefined;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char] ?? char);
}
