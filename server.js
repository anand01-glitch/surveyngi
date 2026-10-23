/*
 * JCET Student Survey — zero-dependency Node server.
 *   - serves the public survey (/) and the admin dashboard (/admin)
 *   - stores responses in data/responses.json (atomic writes)
 *   - admin API is protected by a signed, HttpOnly session cookie
 *
 * Config (environment variables):
 *   PORT              default 3000
 *   ADMIN_PASSWORD    admin login password (CHANGE THE DEFAULT before going live)
 *   SESSION_SECRET    signs session cookies (random per boot if unset => admins re-login after restart)
 *   DATA_FILE         path of the JSON store
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');
const SURVEY = require('./public/questions.js');
const demo = require('./lib/demo.js');

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const DEFAULT_PASSWORD = 'jcet@admin2026';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || DEFAULT_PASSWORD;
const SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, 'data', 'responses.json');
const PUBLIC_DIR = path.join(__dirname, 'public');
const SESSION_MS = 8 * 60 * 60 * 1000;
const COOKIE = 'jcet_admin';

/* ------------------------------------------------------------------ storage */
fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
let responses = [];
try { responses = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); } catch (e) { responses = []; }
if (!Array.isArray(responses)) responses = [];

let writeChain = Promise.resolve();
function persist() {
  writeChain = writeChain
    .then(async () => {
      const tmp = DATA_FILE + '.tmp';
      await fs.promises.writeFile(tmp, JSON.stringify(responses));
      await fs.promises.rename(tmp, DATA_FILE);
    })
    .catch((err) => console.error('Failed to save responses:', err));
  return writeChain;
}

/* --------------------------------------------------------------- validation */
function validateAnswers(input) {
  if (!input || typeof input !== 'object') return { error: 'Invalid answers payload.' };
  const clean = {};
  for (const q of SURVEY.questions) {
    const v = input[q.id];
    const empty = v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);
    if (empty) {
      if (q.required) return { error: 'Question ' + q.id + ' is required.' };
      if (q.type === 'text') clean[q.id] = '';
      continue;
    }
    if (q.type === 'single') {
      if (typeof v !== 'string' || !q.options.includes(v)) return { error: 'Invalid answer for question ' + q.id + '.' };
      clean[q.id] = v;
    } else if (q.type === 'rating') {
      const n = Number(v);
      if (!Number.isInteger(n) || n < 1 || n > 5) return { error: 'Invalid rating for question ' + q.id + '.' };
      clean[q.id] = n;
    } else if (q.type === 'multi') {
      if (!Array.isArray(v)) return { error: 'Invalid answer for question ' + q.id + '.' };
      const uniq = Array.from(new Set(v));
      if (uniq.length > q.max) return { error: 'Question ' + q.id + ' allows at most ' + q.max + ' choices.' };
      if (!uniq.every((o) => typeof o === 'string' && q.options.includes(o))) return { error: 'Invalid choice for question ' + q.id + '.' };
      clean[q.id] = uniq;
    } else if (q.type === 'text') {
      if (typeof v !== 'string') return { error: 'Invalid text for question ' + q.id + '.' };
      clean[q.id] = v.trim().slice(0, q.maxLength || 1500);
    }
  }
  return { clean };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
function validateDetails(body) {
  const out = {};
  for (const d of SURVEY.details) {
    let v = body && body[d.id];
    v = typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '';
    if (!v) {
      if (d.required) return { error: d.label + ' is required.' };
      out[d.id] = '';
      continue;
    }
    if (d.minLength && v.length < d.minLength) return { error: d.label + ' is too short.' };
    if (v.length > d.maxLength) return { error: d.label + ' is too long.' };
    if (d.type === 'email') {
      if (!EMAIL_RE.test(v)) return { error: 'Please enter a valid email address.' };
      v = v.toLowerCase();
    }
    out[d.id] = v;
  }
  return { clean: out };
}

/* -------------------------------------------------------------------- auth */
const hmac = (s) => crypto.createHmac('sha256', SECRET).update(s).digest('base64url');
function makeToken() {
  const exp = String(Date.now() + SESSION_MS);
  return exp + '.' + hmac(exp);
}
function validToken(tok) {
  if (!tok || typeof tok !== 'string') return false;
  const [exp, sig] = tok.split('.');
  if (!exp || !sig) return false;
  const good = Buffer.from(hmac(exp));
  const got = Buffer.from(sig);
  if (good.length !== got.length || !crypto.timingSafeEqual(good, got)) return false;
  return Number(exp) > Date.now();
}
function parseCookies(req) {
  const out = {};
  (req.headers.cookie || '').split(';').forEach((p) => {
    const i = p.indexOf('=');
    if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}
function isAdmin(req) { return validToken(parseCookies(req)[COOKIE]); }
function passwordMatches(input) {
  const a = crypto.createHash('sha256').update(String(input)).digest();
  const b = crypto.createHash('sha256').update(ADMIN_PASSWORD).digest();
  return crypto.timingSafeEqual(a, b);
}

/* ------------------------------------------------------------ rate limiting */
const buckets = new Map();
function limited(key, max, windowMs) {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.reset < now) { buckets.set(key, { count: 1, reset: now + windowMs }); return false; }
  b.count++;
  return b.count > max;
}
setInterval(() => { const now = Date.now(); buckets.forEach((b, k) => { if (b.reset < now) buckets.delete(k); }); }, 60000).unref();
const clientIp = (req) => req.socket.remoteAddress || 'unknown';

/* ------------------------------------------------------------------ helpers */
function send(res, status, body, headers) {
  const isObj = typeof body === 'object' && !Buffer.isBuffer(body) && body !== null;
  const payload = isObj ? JSON.stringify(body) : body;
  res.writeHead(status, Object.assign({
    'Content-Type': isObj ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  }, headers));
  res.end(payload);
}
function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(new Error('too-large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); }
      catch (e) { reject(new Error('bad-json')); }
    });
    req.on('error', reject);
  });
}
const csvCell = (v) => {
  let s = Array.isArray(v) ? v.join('; ') : v === undefined || v === null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // neutralise spreadsheet formula injection
  return '"' + s.replace(/"/g, '""') + '"';
};
function toCsv() {
  const head = ['Response ID', 'Submitted (ISO)', 'Name', 'Email'].concat(SURVEY.questions.map((q) => 'Q' + q.id + '. ' + q.text));
  const rows = responses.map((r) =>
    [r.id, new Date(r.ts).toISOString(), r.name || '', r.email || ''].concat(SURVEY.questions.map((q) => r.answers[q.id])).map(csvCell).join(','));
  return '﻿' + [head.map(csvCell).join(',')].concat(rows).join('\r\n');
}

/* --------------------------------------------------------------- static files */
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2'
};
function serveStatic(req, res, urlPath) {
  let rel = decodeURIComponent(urlPath);
  if (rel === '/' || rel === '') rel = '/index.html';
  if (rel === '/admin' || rel === '/admin/') rel = '/admin/index.html';
  const full = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!full.startsWith(PUBLIC_DIR + path.sep)) return send(res, 403, 'Forbidden');
  fs.stat(full, (err, st) => {
    if (err || !st.isFile()) return send(res, 404, 'Not found');
    const ext = path.extname(full).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Content-Length': st.size,
      'Cache-Control': ext === '.html' || ext === '.js' || ext === '.css' ? 'no-cache' : 'public, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'same-origin'
    });
    fs.createReadStream(full).pipe(res);
  });
}

/* ------------------------------------------------------------------- router */
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const p = url.pathname;
  try {
    if (!p.startsWith('/api/')) {
      if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed');
      return serveStatic(req, res, p);
    }

    // Public: submit a response
    if (p === '/api/responses' && req.method === 'POST') {
      if (limited('submit:' + clientIp(req), 60, 60000)) return send(res, 429, { error: 'Too many submissions. Please wait a moment.' });
      const body = await readBody(req, 64 * 1024);
      if (body.website) return send(res, 201, { ok: true }); // honeypot: pretend success, store nothing
      const who = validateDetails(body);
      if (who.error) return send(res, 400, { error: who.error });
      const { clean, error } = validateAnswers(body.answers);
      if (error) return send(res, 400, { error });
      responses.push({ id: crypto.randomUUID(), ts: Date.now(), name: who.clean.name, email: who.clean.email, answers: clean });
      await persist();
      return send(res, 201, { ok: true });
    }

    // Admin: login / logout / session
    if (p === '/api/admin/login' && req.method === 'POST') {
      const ipKey = 'login:' + clientIp(req);
      const b = buckets.get(ipKey);
      if (b && b.reset > Date.now() && b.count >= 5) return send(res, 429, { error: 'Too many attempts. Try again in a minute.' });
      const body = await readBody(req, 4 * 1024);
      if (!passwordMatches(body.password || '')) {
        limited(ipKey, 5, 60000);
        return send(res, 401, { error: 'Incorrect password.' });
      }
      buckets.delete(ipKey);
      const cookie = COOKIE + '=' + encodeURIComponent(makeToken()) + '; HttpOnly; SameSite=Strict; Path=/; Max-Age=' + SESSION_MS / 1000;
      return send(res, 200, { ok: true }, { 'Set-Cookie': cookie });
    }
    if (p === '/api/admin/logout' && req.method === 'POST') {
      return send(res, 200, { ok: true }, { 'Set-Cookie': COOKIE + '=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0' });
    }
    if (p === '/api/admin/session' && req.method === 'GET') {
      return send(res, 200, { authenticated: isAdmin(req) });
    }

    // Everything below needs an admin session
    if (!p.startsWith('/api/admin/')) return send(res, 404, { error: 'Not found' });
    if (!isAdmin(req)) return send(res, 401, { error: 'Not authenticated' });
    if (req.method !== 'GET' && req.headers['x-requested-with'] !== 'fetch') return send(res, 403, { error: 'Bad request origin' });

    if (p === '/api/admin/responses' && req.method === 'GET') {
      return send(res, 200, { responses });
    }
    if (p === '/api/admin/export.csv' && req.method === 'GET') {
      return send(res, 200, toCsv(), {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="jcet-survey-responses-' + new Date().toISOString().slice(0, 10) + '.csv"'
      });
    }
    // Addresses other devices on the same network can use to reach this server (for the QR code / share link)
    if (p === '/api/admin/network' && req.method === 'GET') {
      const addresses = [];
      const ifs = os.networkInterfaces();
      Object.keys(ifs).forEach((name) => (ifs[name] || []).forEach((i) => {
        if ((i.family === 'IPv4' || i.family === 4) && !i.internal && !i.address.startsWith('169.254.')) {
          addresses.push({ name, url: 'http://' + i.address + ':' + PORT + '/', home: /^(192\.168\.|10\.)/.test(i.address) });
        }
      }));
      addresses.sort((a, b) => Number(b.home) - Number(a.home));
      return send(res, 200, { port: PORT, addresses });
    }
    if (p === '/api/admin/demo' && req.method === 'POST') {
      responses = responses.concat(demo.generate(160, Date.now() % 100000));
      responses.sort((a, b) => a.ts - b.ts);
      await persist();
      return send(res, 200, { ok: true });
    }
    if (p === '/api/admin/demo' && req.method === 'DELETE') {
      responses = responses.filter((r) => !r.demo);
      await persist();
      return send(res, 200, { ok: true });
    }
    const m = p.match(/^\/api\/admin\/responses\/([\w-]+)$/);
    if (m && req.method === 'DELETE') {
      const before = responses.length;
      responses = responses.filter((r) => r.id !== m[1]);
      if (responses.length === before) return send(res, 404, { error: 'Response not found' });
      await persist();
      return send(res, 200, { ok: true });
    }
    return send(res, 404, { error: 'Not found' });
  } catch (err) {
    if (err.message === 'too-large') return send(res, 413, { error: 'Payload too large' });
    if (err.message === 'bad-json') return send(res, 400, { error: 'Invalid JSON' });
    console.error(err);
    return send(res, 500, { error: 'Server error' });
  }
});

server.listen(PORT, HOST, () => {
  console.log('\n  JCET Student Survey running');
  console.log('  Survey : http://localhost:' + PORT + '/');
  console.log('  Admin  : http://localhost:' + PORT + '/admin');
  console.log('  Data   : ' + DATA_FILE);
  if (ADMIN_PASSWORD === DEFAULT_PASSWORD) {
    console.log('\n  !! Using the DEFAULT admin password. Set ADMIN_PASSWORD before sharing this site.');
  }
  console.log('');
});
