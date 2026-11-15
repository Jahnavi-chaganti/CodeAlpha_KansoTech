import crypto from 'node:crypto';

let cachedDevFallbackSecret = null;

function getSessionSecret() {
  const envSecret = process.env.SESSION_SECRET && process.env.SESSION_SECRET.trim();
  if (envSecret && envSecret !== 'replace-with-a-long-random-session-secret') {
    return envSecret;
  }
  if (!cachedDevFallbackSecret) {
    cachedDevFallbackSecret = crypto.randomBytes(32).toString('hex');
    if (process.env.NODE_ENV === 'production') {
      console.error(
        '[Kanso Tech Auth] WARNING: SESSION_SECRET is missing in production. Generated an ephemeral runtime secret; configure SESSION_SECRET in environment variables.'
      );
    } else {
      console.warn(
        '[Kanso Tech Auth] SESSION_SECRET not configured; using an ephemeral cryptographic runtime secret.'
      );
    }
  }
  return cachedDevFallbackSecret;
}

const AUTH_COOKIE = 'kanso_auth';
const GUEST_COOKIE = 'kanso_guest';

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return { hash: derived, salt };
}

export function verifyPassword(password, storedHash, salt) {
  const derived = crypto.scryptSync(password, salt, 64);
  const storedBuf = Buffer.from(storedHash, 'hex');
  if (derived.length !== storedBuf.length) {
    return false;
  }
  return crypto.timingSafeEqual(derived, storedBuf);
}

export function timingSafeEqualsString(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export function signAuthToken(payload) {
  const fullPayload = {
    userId: payload.userId,
    email: payload.email,
    name: payload.name,
    role: payload.role || 'customer',
    exp: Date.now() + 1000 * 60 * 60 * 24 * 7,
  };
  const encoded = Buffer.from(JSON.stringify(fullPayload)).toString('base64url');
  const sig = crypto.createHmac('sha256', getSessionSecret()).update(encoded).digest('base64url');
  return `${encoded}.${sig}`;
}

export function verifyAuthToken(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [encoded, sig] = token.split('.');
  if (!encoded || !sig) return null;

  const expectedSig = crypto
    .createHmac('sha256', getSessionSecret())
    .update(encoded)
    .digest('base64url');

  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    if (!parsed.userId || !parsed.exp || parsed.exp < Date.now()) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function parseCookies(cookieHeader) {
  if (!cookieHeader) return {};
  const result = {};
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const val = decodeURIComponent(part.slice(idx + 1).trim());
    if (key) result[key] = val;
  }
  return result;
}

function isHttpsRequest(req) {
  return Boolean(req.secure || req.headers['x-forwarded-proto'] === 'https');
}

export function setAuthCookie(req, res, token) {
  const https = isHttpsRequest(req);
  res.cookie(AUTH_COOKIE, token, {
    httpOnly: true,
    path: '/',
    maxAge: 1000 * 60 * 60 * 24 * 7,
    sameSite: https ? 'none' : 'lax',
    secure: https,
  });
}

export function clearAuthCookie(req, res) {
  const https = isHttpsRequest(req);
  res.clearCookie(AUTH_COOKIE, {
    httpOnly: true,
    path: '/',
    sameSite: https ? 'none' : 'lax',
    secure: https,
  });
}

export function getAuthFromRequest(req) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    const verified = verifyAuthToken(token);
    if (verified) return verified;
  }

  const cookies = parseCookies(req.headers.cookie);
  return verifyAuthToken(cookies[AUTH_COOKIE]);
}

export function getGuestSessionId(req, res) {
  const headerGuest = req.headers['x-guest-session'];
  if (typeof headerGuest === 'string' && headerGuest.trim().length >= 8 && headerGuest.trim().length <= 128) {
    return headerGuest.trim();
  }

  const cookies = parseCookies(req.headers.cookie);
  if (cookies[GUEST_COOKIE] && cookies[GUEST_COOKIE].length >= 8) {
    return cookies[GUEST_COOKIE];
  }

  const freshId = crypto.randomUUID();
  if (res) {
    const https = isHttpsRequest(req);
    res.cookie(GUEST_COOKIE, freshId, {
      httpOnly: false,
      path: '/',
      maxAge: 1000 * 60 * 60 * 24 * 30,
      sameSite: https ? 'none' : 'lax',
      secure: https,
    });
  }
  return freshId;
}

export function createRateLimiter({ windowMs = 15 * 60 * 1000, max = 30, message = 'Too many attempts. Please wait and try again.' } = {}) {
  const buckets = new Map();

  return (req, res, next) => {
    if (process.env.DISABLE_RATE_LIMIT === '1') {
      next();
      return;
    }

    const now = Date.now();
    const ip =
      (typeof req.headers['x-forwarded-for'] === 'string' && req.headers['x-forwarded-for'].split(',')[0].trim()) ||
      req.ip ||
      req.socket?.remoteAddress ||
      'unknown';
    const key = `${ip}:${req.path}`;
    const existing = buckets.get(key);

    if (!existing || existing.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      if (buckets.size > 5000) {
        for (const [k, v] of buckets.entries()) {
          if (v.resetAt <= now) buckets.delete(k);
        }
      }
      next();
      return;
    }

    existing.count += 1;
    if (existing.count > max) {
      const retryAfterSec = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
      res.setHeader('Retry-After', String(retryAfterSec));
      res.status(429).json({ error: message });
      return;
    }

    next();
  };
}
