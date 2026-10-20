import jwt from 'jsonwebtoken';
import type { JwtPayload } from 'jsonwebtoken';
import type { Identity } from './types';

/**
 * Project a bearer token onto an Identity, or null if absent/invalid.
 *
 * TEMPORARY token shape: a JWT `{ sub, tenant }` signed with the shared secret.
 * This is the seam for the future auth broker — only the validation below
 * changes when real tokens arrive; callers keep handing us a bearer string.
 */
export function identityFromAuthHeader(header: string | undefined, secret: string): Identity | null {
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    return null;
  }
  let payload: string | JwtPayload;
  try {
    payload = jwt.verify(token, secret);
  } catch {
    return null;
  }
  if (typeof payload === 'string') {
    return null;
  }
  const subject = payload.sub;
  const tenant = typeof payload.tenant === 'string' ? payload.tenant : null;
  if (typeof subject !== 'string' || !tenant) {
    return null;
  }
  return { subject, tenant };
}
