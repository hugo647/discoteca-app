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
const register = fs.readFileSync(path.join(root, 'register.html'), 'utf8');
const terms = fs.readFileSync(path.join(root, 'legal/terminos.html'), 'utf8');
const legalPrivacy = fs.readFileSync(path.join(root, 'legal/privacidad.html'), 'utf8');
const accessFlow = fs.readFileSync(path.join(root, 'docs/event-access-flow.md'), 'utf8');
const middleware = fs.readFileSync(path.join(root, 'middleware.js'), 'utf8');
const profileStyles = fs.readFileSync(path.join(root, 'profile-photos.css'), 'utf8');
const privacySchema = fs.readFileSync(path.join(root, 'db/001_privacy_first_schema.sql'), 'utf8');
const privacyModel = fs.readFileSync(path.join(root, 'docs/data-protection-model.md'), 'utf8');
const accessMiddleware = (await import(pathToFileURL(path.join(root, 'middleware.js')).href)).default;

test('production client has no seeded events or attendees', () => {
  assert.equal(data.upcomingEvents.length, 0);
  assert.equal(data.profiles.length, 0);
  assert.equal(data.crews.length, 0);
  assert.equal(data.messages.length, 0);
});

test('the permanent circle only references existing profiles', () => {
  const profileIds = new Set(data.profiles.map(profile => profile.id));
  assert.equal(data.defaultCircleIds.length, 0);
  assert.equal(profileIds.size, 0);
});

test('circle chat is limited to contacts attending the current event', () => {
  const profileIds = new Set(data.profiles.map(profile => profile.id));
  const circleIds = new Set(data.defaultCircleIds);
  assert.equal(data.currentEventCircleIds.length, 0);
  assert.equal(profileIds.size, 0);
  assert.equal(circleIds.size, 0);
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

test('dev protects the app and exposes the complete login entry flow', async () => {
  assert.match(login, /action="\/api\/login" method="post"/);
  assert.match(login, /href="\/register\.html"/);
  assert.match(register, /action="\/api\/register" method="post"/);
  assert.match(middleware, /pathname === '\/api\/login'/);
  assert.match(middleware, /pathname === '\/api\/register'/);
  assert.match(middleware, /HttpOnly; Secure; SameSite=Lax/);
  assert.match(middleware, /hasValidSession/);
  const response = await accessMiddleware(new Request('https://la-previa.test/index.html'));
  assert.equal(response.status, 302);
  assert.match(response.headers.get('location'), /\/login\.html\?next=%2Findex\.html/);
});

test('registration requires legal acceptance and uses database-backed credentials', () => {
  assert.match(login, /href="\/register\.html"/);
  assert.match(register, /action="\/api\/register" method="post"/);
  assert.match(register, /name="accept_terms" required/);
  assert.match(register, /name="accept_privacy" required/);
  assert.match(register, /name="confirm_adult" required/);
  assert.match(register, /href="\/legal\/terminos\.html"/);
  assert.match(register, /href="\/legal\/privacidad\.html"/);
  assert.match(privacySchema, /username text not null unique/);
  assert.match(privacySchema, /password_hash text not null/);
  assert.match(terms, /Seguridad y uso responsable/);
  assert.match(terms, /18 años o más/);
  assert.match(legalPrivacy, /Qué datos tratamos/);
  assert.match(legalPrivacy, /Menores y control de edad/);
});

test('profile creation repeats the legal acceptance at the point of profile creation', () => {
  assert.match(html, /id="profile-privacy-consent" required/);
  assert.match(html, /id="profile-terms-consent" required/);
  assert.match(app, /Lee y acepta los avisos legales para guardar tu perfil/);
});

test('social room access is based on verified attendance, not profile creation', () => {
  assert.match(accessFlow, /event_attendance/);
  assert.match(accessFlow, /ticket_verified_at is not null/);
  assert.match(accessFlow, /El frontend no decide el acceso/);
  assert.match(app, /if\(\['room','crew','messages'\]\.includes\(name\)&&!state\.hasTicket\)/);
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
test('privacy-first schema separates consent, visibility and deletion', () => {
  assert.match(privacySchema, /create table if not exists consent_records/);
  assert.match(privacySchema, /create table if not exists profile_photos/);
  assert.match(privacySchema, /storage_key text not null unique/);
  assert.match(privacySchema, /delete_at timestamptz not null/);
  assert.match(privacySchema, /create table if not exists privacy_requests/);
  assert.match(privacySchema, /create table if not exists security_audit_log/);
  assert.match(privacyModel, /no se almacenan DNI,/);
  assert.match(privacyModel, /24 y 48 horas/);
  assert.match(privacyModel, /Evaluación de riesgos/);
});
