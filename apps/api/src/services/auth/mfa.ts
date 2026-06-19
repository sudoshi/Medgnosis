import crypto from 'node:crypto';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const TOTP_DIGITS = 6;
const TOTP_PERIOD_SECONDS = 30;
const TOTP_WINDOW = 1;

export interface MfaRecoveryCodeRecord {
  hash: string;
  created_at: string;
  used_at: string | null;
}

export function generateTotpSecret(byteLength = 20): string {
  return base32Encode(crypto.randomBytes(byteLength));
}

export function buildOtpAuthUrl(email: string, secret: string): string {
  const issuer = 'Medgnosis';
  const label = `${issuer}:${email}`;
  const url = new URL(`otpauth://totp/${encodeURIComponent(label)}`);
  url.searchParams.set('secret', secret);
  url.searchParams.set('issuer', issuer);
  url.searchParams.set('algorithm', 'SHA1');
  url.searchParams.set('digits', String(TOTP_DIGITS));
  url.searchParams.set('period', String(TOTP_PERIOD_SECONDS));
  return url.toString();
}

export function generateTotpCode(secret: string, nowMs = Date.now()): string {
  const counter = Math.floor(nowMs / 1000 / TOTP_PERIOD_SECONDS);
  return hotp(secret, counter);
}

export function verifyTotpCode(secret: string, code: string, nowMs = Date.now()): boolean {
  return verifyTotpCodeWithStep(secret, code, nowMs).valid;
}

export function verifyTotpCodeWithStep(
  secret: string,
  code: string,
  nowMs = Date.now(),
): { valid: boolean; step: number | null } {
  const normalizedCode = code.trim();
  if (!/^\d{6}$/.test(normalizedCode)) return { valid: false, step: null };

  const counter = Math.floor(nowMs / 1000 / TOTP_PERIOD_SECONDS);
  for (let offset = -TOTP_WINDOW; offset <= TOTP_WINDOW; offset += 1) {
    const step = counter + offset;
    if (timingSafeEqual(hotp(secret, step), normalizedCode)) {
      return { valid: true, step };
    }
  }
  return { valid: false, step: null };
}

export function protectMfaSecret(secret: string, keyMaterial: string): string {
  const key = crypto.createHash('sha256').update(keyMaterial).digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [
    'v1',
    iv.toString('base64url'),
    tag.toString('base64url'),
    encrypted.toString('base64url'),
  ].join(':');
}

export function unprotectMfaSecret(storedSecret: string, keyMaterial: string): string {
  if (!storedSecret.startsWith('v1:')) {
    return storedSecret;
  }

  const [, ivPart, tagPart, encryptedPart] = storedSecret.split(':');
  if (!ivPart || !tagPart || !encryptedPart) {
    throw new Error('Invalid encrypted MFA secret');
  }

  const key = crypto.createHash('sha256').update(keyMaterial).digest();
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    key,
    Buffer.from(ivPart, 'base64url'),
  );
  decipher.setAuthTag(Buffer.from(tagPart, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedPart, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

export function generateRecoveryCodes(count = 8): string[] {
  return Array.from({ length: count }, () => `MG-${recoveryPart()}-${recoveryPart()}`);
}

export function recoveryCodeRecords(codes: string[], nowIso = new Date().toISOString()): MfaRecoveryCodeRecord[] {
  return codes.map((code) => ({
    hash: hashRecoveryCode(code),
    created_at: nowIso,
    used_at: null,
  }));
}

export function parseRecoveryCodeRecords(value: unknown): MfaRecoveryCodeRecord[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((record) => {
    if (
      record &&
      typeof record === 'object' &&
      typeof (record as { hash?: unknown }).hash === 'string'
    ) {
      return [{
        hash: (record as { hash: string }).hash,
        created_at: typeof (record as { created_at?: unknown }).created_at === 'string'
          ? (record as { created_at: string }).created_at
          : new Date(0).toISOString(),
        used_at: typeof (record as { used_at?: unknown }).used_at === 'string'
          ? (record as { used_at: string }).used_at
          : null,
      }];
    }
    return [];
  });
}

export function consumeRecoveryCode(
  records: MfaRecoveryCodeRecord[],
  code: string,
  nowIso = new Date().toISOString(),
): { valid: boolean; records: MfaRecoveryCodeRecord[] } {
  const hash = hashRecoveryCode(code);
  let consumed = false;
  const updated = records.map((record) => {
    if (!consumed && !record.used_at && timingSafeEqual(record.hash, hash)) {
      consumed = true;
      return { ...record, used_at: nowIso };
    }
    return record;
  });

  return { valid: consumed, records: updated };
}

export function hashRecoveryCode(code: string): string {
  return crypto
    .createHash('sha256')
    .update(normalizeRecoveryCode(code))
    .digest('hex');
}

function hotp(secret: string, counter: number): string {
  const key = base32Decode(secret);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac('sha1', key).update(counterBuffer).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary = ((hmac[offset] & 0x7f) << 24)
    | ((hmac[offset + 1] & 0xff) << 16)
    | ((hmac[offset + 2] & 0xff) << 8)
    | (hmac[offset + 3] & 0xff);
  const otp = binary % (10 ** TOTP_DIGITS);
  return otp.toString().padStart(TOTP_DIGITS, '0');
}

function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';

  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }

  return output;
}

function base32Decode(input: string): Buffer {
  const normalized = input.toUpperCase().replace(/[\s=]/g, '');
  let bits = 0;
  let value = 0;
  const output: number[] = [];

  for (const char of normalized) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) {
      throw new Error('Invalid base32 secret');
    }

    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }

  return Buffer.from(output);
}

function recoveryPart(): string {
  return base32Encode(crypto.randomBytes(5)).slice(0, 8);
}

function normalizeRecoveryCode(code: string): string {
  return code.trim().toUpperCase().replace(/\s+/g, '');
}

function timingSafeEqual(expected: string, actual: string): boolean {
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(actual);
  if (expectedBuffer.length !== actualBuffer.length) return false;
  return crypto.timingSafeEqual(expectedBuffer, actualBuffer);
}
