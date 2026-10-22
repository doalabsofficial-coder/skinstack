export class HttpError extends Error {
  constructor(status, code, detail) {
    super(code);
    this.status = status;
    this.code = code;
    this.detail = detail;
  }
}

export function sendJson(res, status, body, headers = {}) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers,
  });
  res.end(payload);
}

export async function readJson(req, limitBytes = 1_000_000) {
  const type = req.headers['content-type'] || '';
  if (!type.includes('application/json')) throw new HttpError(415, 'unsupported_media_type');
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limitBytes) throw new HttpError(413, 'payload_too_large');
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new HttpError(400, 'invalid_json');
  }
}

export function parseCookies(req) {
  const out = {};
  for (const part of (req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export function clientIp(req) {
  return req.socket.remoteAddress || 'unknown';
}

// 아주 단순한 메모리 기반 요청 제한 (단일 서버용)
const buckets = new Map();
export function rateLimit(key, max, windowMs) {
  const now = Date.now();
  const entry = buckets.get(key);
  if (!entry || entry.reset < now) {
    buckets.set(key, { count: 1, reset: now + windowMs });
    return;
  }
  entry.count += 1;
  if (entry.count > max) throw new HttpError(429, 'rate_limited');
}

/** 문자열 필드 정리: 길이 제한, 공백 정리 */
export function str(value, max = 200) {
  if (value == null) return '';
  return String(value).replace(/\u0000/g, '').trim().slice(0, max);
}

export function optionalUrl(value) {
  const s = str(value, 1000);
  if (!s) return '';
  try {
    const u = new URL(s);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error();
    return u.toString();
  } catch {
    throw new HttpError(400, 'invalid_url');
  }
}
