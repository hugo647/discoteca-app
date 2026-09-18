import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);

export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const derivedKey = await scrypt(password, salt, 64);
  return `scrypt$${salt}$${Buffer.from(derivedKey).toString('hex')}`;
}

export async function verifyPassword(password, encoded) {
  const [algorithm, salt, storedHex] = String(encoded || '').split('$');
  if (algorithm !== 'scrypt' || !salt || !/^[a-f0-9]{128}$/i.test(storedHex)) return false;
  const derivedKey = await scrypt(password, salt, 64);
  const stored = Buffer.from(storedHex, 'hex');
  const received = Buffer.from(derivedKey);
  return stored.length === received.length && timingSafeEqual(stored, received);
}

export function isValidUsername(username) {
  return typeof username === 'string' && /^[a-z0-9][a-z0-9._-]{2,31}$/.test(username);
}

export function isValidPassword(password) {
  return typeof password === 'string' && password.length >= 10 && password.length <= 200;
}
