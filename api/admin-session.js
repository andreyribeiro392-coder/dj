const crypto = require('crypto');

const COOKIE_NAME = 'aurora_admin_session';
const ADMIN_EMAIL = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
const SESSION_SECRET = String(process.env.ADMIN_SESSION_SECRET || process.env.ADMIN_SECRET || process.env.GOOGLE_CLIENT_SECRET || '').trim();

function signature(value) {
  return crypto.createHmac('sha256', SESSION_SECRET).update(value).digest('hex');
}

function createSession(email) {
  const expires = Date.now() + 1000 * 60 * 60 * 24 * 30;
  const payload = email + '|' + expires;
  return payload + '|' + signature(payload);
}

function validSession(value) {
  if (!value || !SESSION_SECRET) return false;
  const parts = value.split('|');
  if (parts.length !== 3) return false;
  const payload = parts[0] + '|' + parts[1];
  if (Number(parts[1]) < Date.now()) return false;
  const expected = signature(payload);
  return crypto.timingSafeEqual(Buffer.from(parts[2]), Buffer.from(expected)) && parts[0] === ADMIN_EMAIL;
}

function parseCookies(header) {
  return Object.fromEntries(String(header || '').split(';').map(part => {
    const index = part.indexOf('=');
    return index > -1 ? [part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1).trim())] : [];
  }).filter(Boolean));
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!ADMIN_EMAIL || !SESSION_SECRET) {
    res.status(503).json({admin: false, error: 'admin_not_configured'});
    return;
  }
  if (req.method === 'GET') {
    const cookies = parseCookies(req.headers.cookie);
    res.status(200).json({admin: validSession(cookies[COOKIE_NAME])});
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({admin: false});
    return;
  }
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const accessToken = String(body.accessToken || '').trim();
    if (!accessToken) { res.status(400).json({admin: false}); return; }
    const response = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: {Authorization: 'Bearer ' + accessToken}
    });
    if (!response.ok) { res.status(401).json({admin: false}); return; }
    const profile = await response.json();
    const email = String(profile.email || '').trim().toLowerCase();
    if (email !== ADMIN_EMAIL) { res.status(403).json({admin: false}); return; }
    const token = createSession(email);
    res.setHeader('Set-Cookie', COOKIE_NAME + '=' + encodeURIComponent(token) + '; Path=/; Max-Age=2592000; HttpOnly; Secure; SameSite=Lax');
    res.status(200).json({admin: true});
  } catch (_) {
    res.status(502).json({admin: false});
  }
};
