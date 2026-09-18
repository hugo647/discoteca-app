import { createHmac, timingSafeEqual } from 'node:crypto';
import { verifyPassword, hashPassword, isValidPassword, isValidUsername } from './lib/auth.js';
import { getPool, withTransaction } from './lib/db.js';

const cookieName = 'la_previa_session';
const sessionSeconds = 60 * 60 * 12;

function readCookies(header) {
  return Object.fromEntries((header || '').split(';').map(part => {
    const index = part.indexOf('=');
    return index === -1 ? [] : [part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1).trim())];
  }).filter(entry => entry.length));
}
function signature(payload, secret) { return createHmac('sha256', secret).update(payload).digest('base64url'); }
function hasValidSession(token, secret) {
  if (!token || !secret) return false;
  const [version, userId, expiry, receivedSignature] = token.split('.');
  if (version !== 'v1' || !userId || !/^\d+$/.test(expiry) || !receivedSignature || Number(expiry) <= Date.now()) return false;
  const expected = Buffer.from(signature(`${version}.${userId}.${expiry}`, secret));
  const received = Buffer.from(receivedSignature);
  return received.length === expected.length && timingSafeEqual(received, expected);
}
function safeNext(value) { return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') ? value : '/'; }
function redirect(request, path, status = 302, headers = {}) { return new Response(null, {status, headers:{Location:new URL(path, request.url).toString(), ...headers}}); }
function setSessionAndRedirect(request, next, userId, secret) {
  const expiry = Date.now() + sessionSeconds * 1000;
  const payload = `v1.${userId}.${expiry}`;
  return redirect(request, next, 303, { 'Set-Cookie': `${cookieName}=${payload}.${signature(payload, secret)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${sessionSeconds}` });
}

export const config = { runtime: 'nodejs' };

export default async function middleware(request) {
  const url = new URL(request.url);
  const {pathname} = url;
  const secret = process.env.ACCESS_SECRET;
  if (pathname === '/login.html' || pathname === '/register.html' || pathname.startsWith('/legal/')) return;
  if (pathname === '/api/register') {
    if (request.method !== 'POST') return redirect(request, '/register.html');
    if (!secret || !getPool()) return new Response('El registro todavía no está configurado.', {status:503});
    const form = await request.formData();
    const username = String(form.get('username') || '').trim().toLowerCase();
    const displayName = String(form.get('display_name') || '').trim();
    const password = form.get('password');
    const next = safeNext(form.get('next'));
    if (!isValidUsername(username) || displayName.length < 1 || displayName.length > 60 || !isValidPassword(password) || form.get('confirm_adult') !== 'on' || form.get('accept_terms') !== 'on' || form.get('accept_privacy') !== 'on') return redirect(request, `/register.html?error=validation&next=${encodeURIComponent(next)}`, 303);
    try {
      const userId = await withTransaction(async client => {
        const created = await client.query('insert into app_users (display_name, username, password_hash) values ($1, $2, $3) returning id', [displayName, username, await hashPassword(password)]);
        await client.query(`insert into consent_records (user_id, purpose, policy_version, collection_source) values ($1, 'account', $2, 'registration'), ($1, 'account', $2, 'registration_18plus'), ($1, 'persistent_profile', $2, 'registration')`, [created.rows[0].id, process.env.LEGAL_POLICY_VERSION || '2026-09-17']);
        return created.rows[0].id;
      });
      return setSessionAndRedirect(request, next, userId, secret);
    } catch (error) {
      if (error?.code === '23505') return redirect(request, `/register.html?error=exists&next=${encodeURIComponent(next)}`, 303);
      return new Response('No se ha podido crear el perfil.', {status:500});
    }
  }
  if (pathname === '/api/login') {
    if (request.method !== 'POST') return redirect(request, '/login.html');
    if (!secret || !getPool()) return new Response('El acceso todavía no está configurado.', {status:503});
    const form = await request.formData();
    const username = String(form.get('username') || '').trim().toLowerCase();
    const password = form.get('password');
    const result = await getPool().query("select id, password_hash from app_users where username=$1 and status='active' and deleted_at is null", [username]);
    const user = result.rows[0];
    const valid = user && typeof password === 'string' && await verifyPassword(password, user.password_hash);
    const next = safeNext(form.get('next'));
    return valid ? setSessionAndRedirect(request, next, user.id, secret) : redirect(request, `/login.html?error=1&next=${encodeURIComponent(next)}`, 303);
  }
  if (pathname === '/api/logout') return redirect(request, '/login.html', 303, {'Set-Cookie':`${cookieName}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`});
  if (hasValidSession(readCookies(request.headers.get('cookie'))[cookieName], secret)) return;
  return redirect(request, `/login.html?next=${encodeURIComponent(`${pathname}${url.search}`)}`);
}
