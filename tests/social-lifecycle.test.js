import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(root, 'data.js'), 'utf8'), sandbox);
const data = sandbox.window.FiestaV2Data;
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const login = fs.readFileSync(path.join(root, 'login.html'), 'utf8');
const middleware = fs.readFileSync(path.join(root, 'middleware.js'), 'utf8');
const profileStyles = fs.readFileSync(path.join(root, 'profile-photos.css'), 'utf8');
const accessMiddleware = (await import(pathToFileURL(path.join(root, 'middleware.js')).href)).default;

test('every upcoming event has an official Fourvenues destination', () => {
  assert.ok(data.upcomingEvents.length >= 2);
  for (const event of data.upcomingEvents) {
    const url = new URL(event.ticketUrl);
    assert.equal(url.protocol, 'https:');
    assert.match(url.hostname, /(^|\.)fourvenues\.com$/);
  }
});

test('the permanent circle only references existing profiles', () => {
  const profileIds = new Set(data.profiles.map(profile => profile.id));
  assert.ok(data.defaultCircleIds.length >= 2);
  for (const id of data.defaultCircleIds) assert.ok(profileIds.has(id));
});

test('circle chat is limited to contacts attending the current event', () => {
  const profileIds = new Set(data.profiles.map(profile => profile.id));
  const circleIds = new Set(data.defaultCircleIds);
  assert.ok(data.currentEventCircleIds.length >= 1);
  for (const id of data.currentEventCircleIds) {
    assert.ok(profileIds.has(id));
    assert.ok(circleIds.has(id));
  }
  assert.match(app, /data\.currentEventCircleIds\.includes\(circlePerson\.id\)/);
  assert.match(app, /Podréis escribiros cuando coincidáis en una fiesta/);
});

test('other profiles expose mutual contacts without exposing a contact list', () => {
  for (const profile of data.profiles) {
    for (const id of profile.contactIds || []) {
      assert.ok(data.profiles.some(candidate => candidate.id === id));
    }
  }
  assert.match(html, /id="mutual-contacts"/);
  assert.match(html, /id="mutual-contact-faces"/);
  assert.doesNotMatch(html, /Contactos de esta persona/);
});

test('messages separates same-event contacts, greetings and drink invitations', () => {
  assert.match(html, /id="event-circle-list"/);
  assert.match(html, /id="greetings-list"/);
  assert.match(html, /id="drink-invitations-list"/);
  assert.match(app, /data-return-greeting/);
  assert.match(app, /data-received-drink/);
});

test('the social layer is ticket-gated while event discovery stays available', () => {
  assert.match(app, /\['room','crew','messages'\]\.includes\(name\)&&!state\.hasTicket/);
  assert.match(html, /data-screen="upcoming-event"/);
  assert.match(html, /id="fourvenues-link"/);
});

test('introductions require two different mutual connections', () => {
  assert.match(app, /if\(aId===bId\)return showToast/);
  assert.match(html, /El chat solo se abrirá si las dos aceptan/);
});

test('the deployed app is protected on every route by a server session', () => {
  assert.match(login, /action="\/api\/login" method="post"/);
  assert.match(login, /name="username"/);
  assert.match(login, /name="password" type="password"/);
  assert.match(middleware, /pathname === '\/login\.html'/);
  assert.match(middleware, /pathname === '\/api\/login'/);
  assert.match(middleware, /HttpOnly; Secure; SameSite=Lax/);
  assert.match(middleware, /hasValidSession/);
});

test('an unauthenticated direct route redirects to login and a valid session unlocks it', async () => {
  const previousPassword = process.env.ACCESS_PASSWORD;
  const previousSecret = process.env.ACCESS_SECRET;
  process.env.ACCESS_PASSWORD = 'demo-password';
  process.env.ACCESS_SECRET = 'demo-session-secret';
  try {
    const blocked = await accessMiddleware(new Request('https://la-previa.test/index.html'));
    assert.equal(blocked.status, 302);
    assert.match(blocked.headers.get('location'), /\/login\.html\?next=%2Findex\.html/);
    const form = new URLSearchParams({ username: 'husuar', password: 'demo-password', next: '/' });
    const loginResponse = await accessMiddleware(new Request('https://la-previa.test/api/login', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: form
    }));
    const sessionCookie = loginResponse.headers.get('set-cookie').split(';', 1)[0];
    const unlocked = await accessMiddleware(new Request('https://la-previa.test/', { headers: { cookie: sessionCookie } }));
    assert.equal(unlocked, undefined);
  } finally {
    if (previousPassword === undefined) delete process.env.ACCESS_PASSWORD;
    else process.env.ACCESS_PASSWORD = previousPassword;
    if (previousSecret === undefined) delete process.env.ACCESS_SECRET;
    else process.env.ACCESS_SECRET = previousSecret;
  }
});

test('chat send control is compact and crews support native touch scrolling', () => {
  assert.match(html, /aria-label="Enviar mensaje"/);
  assert.match(html, /<svg viewBox="0 0 24 24"/);
  assert.match(app, /function setupCrewScroller\(\)/);
  assert.match(app, /row\.onpointerdown=pause/);
  assert.match(app, /row\.scrollLeft\+=elapsed\*\.018/);
});

test('screens grow with their content without stacking bottom spacing', () => {
  assert.match(profileStyles, /\.mobile-app \{ min-height: 100dvh; padding-bottom: 0;/);
  assert.match(profileStyles, /\.screen \{ min-height: calc\(100dvh - 68px\); padding: 16px 16px calc\(78px \+ env\(safe-area-inset-bottom\)\); \}/);
  assert.match(profileStyles, /\.attendee-profile \{ padding: 0 0 calc\(78px \+ env\(safe-area-inset-bottom\)\)/);
  assert.match(profileStyles, /overscroll-behavior-y: none/);
});

test('crew creation lives in profile and plans follow attending crews', () => {
  assert.doesNotMatch(html, /data-screen-target="crew">Mi crew/);
  assert.match(html, /id="open-crew-manager"/);
  assert.match(html, /data-screen-target="profile">Volver al perfil/);
  assert.ok(html.indexOf('Crews en movimiento') < html.indexOf('Planes para hoy'));
  assert.match(app, /open-crew-manager/);
});

test('section language and headings stay direct and visually clean', () => {
  assert.match(html, /Gente que quizá conozcas/);
  assert.match(html, /También van/);
  assert.match(html, /Grupos que van hoy/);
  assert.match(html, /Elige y mira quién va/);
  assert.doesNotMatch(html, /Una capa extra|Sin filtros · por afinidad|Nuevas confirmaciones/);
  assert.match(profileStyles, /\.feed-title h2::after \{ content: none; \}/);
  assert.match(profileStyles, /\.plan-art::after \{ content: none; \}/);
});

test('interface polish avoids template decoration and repetitive placeholders', () => {
  assert.doesNotMatch(html, /↗/);
  assert.doesNotMatch(app, /↗/);
  assert.match(app, /Añade tu foto principal/);
  assert.match(app, /Elegir fotos/);
  assert.match(profileStyles, /\.plan-group-art::before \{ content: none; \}/);
  assert.match(profileStyles, /font-family: Inter, ui-sans-serif, system-ui, sans-serif/);
});
