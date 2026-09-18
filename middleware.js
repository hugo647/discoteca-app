import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
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
function sessionUserId(token, secret) {
  if (!token || !secret) return false;
  const [version, userId, expiry, receivedSignature] = token.split('.');
  if (version !== 'v1' || !/^[0-9a-f-]{36}$/i.test(userId) || !/^\d+$/.test(expiry) || !receivedSignature || Number(expiry) <= Date.now()) return null;
  const expected = Buffer.from(signature(`${version}.${userId}.${expiry}`, secret));
  const received = Buffer.from(receivedSignature);
  return received.length === expected.length && timingSafeEqual(received, expected) ? userId : null;
}
function hasValidSession(token, secret) { return Boolean(sessionUserId(token, secret)); }
function safeNext(value) { return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') ? value : '/'; }
function redirect(request, path, status = 302, headers = {}) { return new Response(null, {status, headers:{Location:new URL(path, request.url).toString(), ...headers}}); }
function json(body, status = 200) { return Response.json(body, {status, headers:{'Cache-Control':'no-store'}}); }
function tokenHash(token) { return createHash('sha256').update(token).digest('hex'); }
function isSameOrigin(request) { const origin=request.headers.get('origin'); return !origin || origin===new URL(request.url).origin; }
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
  if (pathname === '/login.html' || pathname === '/register.html' || pathname === '/transfer.html' || pathname.startsWith('/legal/')) return;
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
        await client.query(`insert into consent_records (user_id, purpose, policy_version, collection_source) values ($1, 'account', $2, 'registration'), ($1, 'persistent_profile', $2, 'registration')`, [created.rows[0].id, process.env.LEGAL_POLICY_VERSION || '2026-09-17']);
        await client.query(`insert into age_declarations (user_id, policy_version) values ($1, $2)`, [created.rows[0].id, process.env.LEGAL_POLICY_VERSION || '2026-09-17']);
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
  const userId = sessionUserId(readCookies(request.headers.get('cookie'))[cookieName], secret);
  if (pathname === '/api/session') return json({authenticated:Boolean(userId)});
  if (pathname === '/api/event-accesses') {
    if (!userId) return json({error:'authentication_required'}, 401);
    if (!getPool()) return json({error:'database_not_configured'}, 503);
    const result = await getPool().query(`select a.id, a.status, a.expires_at, e.name as event_name, e.starts_at, t.id as pending_transfer_id, t.expires_at as transfer_expires_at
      from event_accesses a
      join events e on e.id = a.event_id
      left join event_access_transfers t on t.event_access_id = a.id and t.status = 'pending'
      where (a.holder_user_id = $1 and a.status = 'claimed') or (t.sender_user_id = $1 and a.status = 'transfer_pending')
      order by e.starts_at asc`, [userId]);
    return json({accesses:result.rows});
  }
  const transferMatch = pathname.match(/^\/api\/event-accesses\/([0-9a-f-]{36})\/transfer$/i);
  if (transferMatch) {
    if (!userId) return json({error:'authentication_required'}, 401);
    if (request.method !== 'POST') return json({error:'method_not_allowed'}, 405);
    if (!isSameOrigin(request)) return json({error:'invalid_origin'}, 403);
    if (!getPool()) return json({error:'database_not_configured'}, 503);
    try {
      const token = randomBytes(32).toString('base64url');
      const transfer = await withTransaction(async client => {
        const access = await client.query(`select id from event_accesses where id = $1 and holder_user_id = $2 and status = 'claimed' for update`, [transferMatch[1], userId]);
        if (!access.rows[0]) return null;
        const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
        const created = await client.query(`insert into event_access_transfers (event_access_id, sender_user_id, transfer_token_hash, expires_at) values ($1, $2, $3, $4) returning id, expires_at`, [transferMatch[1], userId, tokenHash(token), expiresAt]);
        await client.query(`update event_accesses set holder_user_id = null, status = 'transfer_pending', updated_at = now() where id = $1`, [transferMatch[1]]);
        return {id:created.rows[0].id, expiresAt:created.rows[0].expires_at, token};
      });
      if (!transfer) return json({error:'access_not_available'}, 409);
      return json({transferId:transfer.id, expiresAt:transfer.expiresAt, claimUrl:new URL(`/transfer.html?token=${encodeURIComponent(transfer.token)}`, request.url).toString()});
    } catch { return json({error:'transfer_failed'}, 500); }
  }
  const cancelMatch = pathname.match(/^\/api\/event-access-transfers\/([0-9a-f-]{36})\/cancel$/i);
  if (cancelMatch) {
    if (!userId) return json({error:'authentication_required'}, 401);
    if (request.method !== 'POST') return json({error:'method_not_allowed'}, 405);
    if (!isSameOrigin(request)) return json({error:'invalid_origin'}, 403);
    if (!getPool()) return json({error:'database_not_configured'}, 503);
    const restored = await withTransaction(async client => {
      const transfer = await client.query(`select id, event_access_id from event_access_transfers where id = $1 and sender_user_id = $2 and status = 'pending' and expires_at > now() for update`, [cancelMatch[1], userId]);
      if (!transfer.rows[0]) return false;
      await client.query(`update event_access_transfers set status = 'cancelled', cancelled_at = now() where id = $1`, [cancelMatch[1]]);
      await client.query(`update event_accesses set holder_user_id = $1, status = 'claimed', updated_at = now() where id = $2`, [userId, transfer.rows[0].event_access_id]);
      return true;
    });
    return restored ? json({restored:true}) : json({error:'transfer_not_available'}, 409);
  }
  if (pathname === '/api/event-access-transfers/claim') {
    if (!userId) return json({error:'authentication_required'}, 401);
    if (request.method !== 'POST') return json({error:'method_not_allowed'}, 405);
    if (!isSameOrigin(request)) return json({error:'invalid_origin'}, 403);
    if (!getPool()) return json({error:'database_not_configured'}, 503);
    const form = await request.formData();
    const suppliedToken = String(form.get('token') || '');
    if (!suppliedToken || suppliedToken.length > 200) return json({error:'invalid_transfer'}, 400);
    const claimed = await withTransaction(async client => {
      const transfer = await client.query(`select id, event_access_id from event_access_transfers where transfer_token_hash = $1 and status = 'pending' and expires_at > now() for update`, [tokenHash(suppliedToken)]);
      if (!transfer.rows[0]) return false;
      await client.query(`update event_access_transfers set status = 'claimed', claimed_by_user_id = $1, claimed_at = now() where id = $2`, [userId, transfer.rows[0].id]);
      await client.query(`update event_accesses set holder_user_id = $1, status = 'claimed', updated_at = now() where id = $2`, [userId, transfer.rows[0].event_access_id]);
      return true;
    });
    return claimed ? json({claimed:true}) : json({error:'transfer_not_available'}, 409);
  }
  if (userId) return;
  if (pathname.startsWith('/api/')) return json({error:'authentication_required'}, 401);
  return redirect(request, `/login.html?next=${encodeURIComponent(`${pathname}${url.search}`)}`);
}
