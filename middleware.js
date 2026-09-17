import { createHmac, timingSafeEqual } from 'node:crypto';

const cookieName = 'la_previa_session';
const sessionSeconds = 60 * 60 * 12;

function readCookies(header) {
  return Object.fromEntries((header || '').split(';').map(part => {
    const index = part.indexOf('=');
    return index === -1 ? [] : [part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1).trim())];
  }).filter(entry => entry.length));
}

function signature(payload, secret) {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

function hasValidSession(token, secret) {
  if (!token || !secret) return false;
  const [version, expiry, receivedSignature] = token.split('.');
  if (version !== 'v1' || !/^\d+$/.test(expiry) || !receivedSignature || Number(expiry) <= Date.now()) return false;
  const expectedSignature = signature(`${version}.${expiry}`, secret);
  const received = Buffer.from(receivedSignature);
  const expected = Buffer.from(expectedSignature);
  return received.length === expected.length && timingSafeEqual(received, expected);
}

function safeNext(value) {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') ? value : '/';
}

function redirect(request, path, status = 302, headers = {}) {
  return new Response(null, {
    status,
    headers: { Location: new URL(path, request.url).toString(), ...headers }
  });
}

export const config = { runtime: 'nodejs' };

export default async function middleware(request) {
  const url = new URL(request.url);
  const { pathname } = url;
  const username = process.env.ACCESS_USERNAME || 'husuar';
  const password = process.env.ACCESS_PASSWORD;
  const secret = process.env.ACCESS_SECRET;

  if (pathname === '/login.html') return;

  if (pathname === '/api/login') {
    if (request.method !== 'POST') return redirect(request, '/login.html');
    if (!password || !secret) return new Response('El acceso todavía no está configurado.', { status: 503 });
    const form = await request.formData();
    const submittedPassword = form.get('password');
    const validUser = form.get('username') === username;
    const validPassword = typeof submittedPassword === 'string' && Buffer.byteLength(submittedPassword) === Buffer.byteLength(password) && timingSafeEqual(Buffer.from(submittedPassword), Buffer.from(password));
    const next = safeNext(form.get('next'));
    if (!validUser || !validPassword) return redirect(request, `/login.html?error=1&next=${encodeURIComponent(next)}`, 303);
    const expiry = Date.now() + sessionSeconds * 1000;
    const payload = `v1.${expiry}`;
    const token = `${payload}.${signature(payload, secret)}`;
    return redirect(request, next, 303, { 'Set-Cookie': `${cookieName}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${sessionSeconds}` });
  }

  if (pathname === '/api/logout') {
    return redirect(request, '/login.html', 303, { 'Set-Cookie': `${cookieName}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0` });
  }

  if (hasValidSession(readCookies(request.headers.get('cookie'))[cookieName], secret)) return;
  return redirect(request, `/login.html?next=${encodeURIComponent(`${pathname}${url.search}`)}`);
}
