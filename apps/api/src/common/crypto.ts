import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { config } from './config';

/**
 * AES-256-GCM for integration settings stored in the database (webhook URLs, future API keys).
 * The key comes from INTEGRATIONS_KEY (falls back to a hash of JWT_SECRET in development).
 */
function key(): Buffer {
  return createHash('sha256').update(process.env.INTEGRATIONS_KEY ?? `integrations:${config.jwtSecret}`).digest();
}

export function encryptJson(value: unknown): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return `v1.${iv.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${data.toString('base64url')}`;
}

export function decryptJson<T>(payload: string): T | null {
  try {
    const [v, iv, tag, data] = payload.split('.');
    if (v !== 'v1' || !iv || !tag || !data) return null;
    const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    const out = Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]);
    return JSON.parse(out.toString('utf8')) as T;
  } catch {
    return null;
  }
}
