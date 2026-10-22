import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { config, PUBLIC_DIR, UPLOAD_DIR, REGIONS } from './config.js';
import { db, newId, now, seedIfEmpty, rowToCatalog, rowToRequest, rowToCommunity, matchKey } from './db.js';
import { HttpError, sendJson, readJson, rateLimit, clientIp, str, optionalUrl } from './http.js';
import { issueUserToken, requireUser, requireAdmin, isAdmin, adminEnabled, checkAdminPassword, createAdminSession, destroyAdminSession } from './auth.js';
import { affiliateStatus, getPurchaseLink, checkLink, listLinks } from './affiliate.js';
import { extractLabel, ocrAvailable } from './ocr.js';
import { CATEGORY_IDS, REGULATORY } from '../docs/js/domain/categories.js';

seedIfEmpty();

const REQUEST_STATUSES = ['received', 'reviewing', 'needs_info', 'approved', 'rejected'];
const regionOf = (v) => (REGIONS[v] ? v : 'GLOBAL');

/* ---------------- 업로드 (제품 사진, 요청 첨부) ---------------- */

const IMAGE_SIGNATURES = [
  { ext: 'jpg', mime: 'image/jpeg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { ext: 'png', mime: 'image/png', test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { ext: 'webp', mime: 'image/webp', test: (b) => b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP' },
];

function saveImage(dataUrl) {
  const m = /^data:image\/[a-z]+;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl || '');
  if (!m) throw new HttpError(400, 'invalid_image');
  const buf = Buffer.from(m[1], 'base64');
  if (buf.length > 4_000_000) throw new HttpError(413, 'payload_too_large');
  const sig = IMAGE_SIGNATURES.find((s) => s.test(buf));
  if (!sig) throw new HttpError(400, 'invalid_image');
  const file = `${newId()}.${sig.ext}`;
  fs.writeFileSync(path.join(UPLOAD_DIR, file), buf);
  return file;
}

/* ---------------- 카탈로그 입력 검증 ---------------- */

function catalogFields(body) {
  const category = body.category ? String(body.category) : null;
  if (category && !CATEGORY_IDS.includes(category)) throw new HttpError(400, 'invalid_category');
  const regulatory = REGULATORY.includes(body.regulatory) ? body.regulatory : 'unknown';
  const notes = Array.isArray(body.interactionNotes) ? body.interactionNotes.slice(0, 20).map((n) => ({
    group: str(n.group, 40), level: n.level === 'avoid' ? 'avoid' : 'caution', source: str(n.source, 500),
  })).filter((n) => n.group) : [];
  return {
    brand: str(body.brand, 120),
    name: str(body.name, 200),
    name_en: str(body.nameEn, 200),
    volume: str(body.volume, 40),
    category,
    ingredients_text: str(body.ingredientsText, 8000),
    usage_text: str(body.usageText, 3000),
    warnings_text: str(body.warningsText, 3000),
    regulatory,
    region: regionOf(body.region),
    source_url: optionalUrl(body.sourceUrl),
    source_note: str(body.sourceNote, 1000),
    interaction_notes: JSON.stringify(notes),
  };
}

/* ---------------- 라우트 ---------------- */

const routes = [];
const route = (method, pattern, handler) => routes.push({ method, pattern, handler });

route('GET', /^\/api\/config$/, async () => ({
  ocrAi: await ocrAvailable(),
  adminEnabled: adminEnabled(),
  regions: Object.keys(REGIONS),
  affiliate: affiliateStatus(),
}));

route('POST', /^\/api\/session$/, async (req) => {
  rateLimit(`session:${clientIp(req)}`, 30, 60 * 60_000);
  return { token: issueUserToken() };
});

// 검색: 관리자 승인 제품(우선) + 고객 누적 입력 제품(미검토 표시)
route('GET', /^\/api\/catalog\/search$/, async (req, url) => {
  const q = str(url.searchParams.get('q'), 100).toLowerCase();
  if (q.length < 1) return { items: [] };
  const like = `%${q.replace(/[%_]/g, '')}%`;
  const compact = `%${matchKey('', q).replace(/[%_]/g, '')}%`;
  const rows = db.prepare(`SELECT * FROM catalog_products WHERE status = 'approved'
    AND (lower(brand) LIKE ? OR lower(name) LIKE ? OR lower(name_en) LIKE ? OR lower(brand || ' ' || name) LIKE ?)
    ORDER BY updated_at DESC LIMIT 30`).all(like, like, like, like);
  const approvedKeys = new Set(rows.map((r) => matchKey(r.brand, r.name)));
  const community = db.prepare(`SELECT * FROM community_products WHERE status = 'visible'
    AND (lower(brand) LIKE ? OR lower(name) LIKE ? OR lower(brand || ' ' || name) LIKE ? OR match_key LIKE ?)
    ORDER BY contributor_count DESC, updated_at DESC LIMIT 30`).all(like, like, like, compact)
    .filter((r) => !approvedKeys.has(r.match_key));
  return { items: [...rows.map(rowToCatalog), ...community.map(rowToCommunity)] };
});

// 고객 입력 누적: 사용자가 라벨과 대조해 확인한 제품 정보만 받음 (피부 정보 등 개인 정보는 받지 않음)
route('POST', /^\/api\/community\/contribute$/, async (req) => {
  const uid = requireUser(req);
  rateLimit(`contrib:${uid}`, 60, 60 * 60_000);
  const body = await readJson(req, 100_000);
  const brand = str(body.brand, 120);
  const name = str(body.name, 200);
  const category = CATEGORY_IDS.includes(body.category) ? body.category : null;
  if (!name || !category) throw new HttpError(400, 'missing_fields');
  const key = matchKey(brand, name);
  const ts = now();
  const f = {
    volume: str(body.volume, 40), ingredients: str(body.ingredientsText, 8000), usage: str(body.usageText, 3000),
  };
  let row = db.prepare('SELECT * FROM community_products WHERE match_key = ?').get(key);
  if (!row) {
    const id = newId();
    db.prepare(`INSERT INTO community_products (id, match_key, brand, name, volume, category, ingredients_text, usage_text, region, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(id, key, brand, name, f.volume, category, f.ingredients, f.usage, regionOf(body.region), ts, ts);
    row = db.prepare('SELECT * FROM community_products WHERE id = ?').get(id);
  } else {
    // 비어 있는 항목만 채움 (먼저 입력된 값을 임의로 덮어쓰지 않음)
    db.prepare(`UPDATE community_products SET
      volume = CASE WHEN volume = '' THEN ? ELSE volume END,
      ingredients_text = CASE WHEN ingredients_text = '' THEN ? ELSE ingredients_text END,
      usage_text = CASE WHEN usage_text = '' THEN ? ELSE usage_text END,
      updated_at = ? WHERE id = ?`).run(f.volume, f.ingredients, f.usage, ts, row.id);
  }
  db.prepare('INSERT OR IGNORE INTO community_contributions (product_id, user_id, created_at) VALUES (?, ?, ?)').run(row.id, uid, ts);
  db.prepare('UPDATE community_products SET contributor_count = (SELECT COUNT(*) FROM community_contributions WHERE product_id = ?) WHERE id = ?').run(row.id, row.id);
  return { ok: true };
});

route('POST', /^\/api\/ocr$/, async (req) => {
  rateLimit(`ocr:${clientIp(req)}`, 10, 60_000);
  const body = await readJson(req, 12_000_000);
  return extractLabel({ front: body.front, back: body.back });
});

route('POST', /^\/api\/purchase-link$/, async (req) => {
  rateLimit(`buy:${clientIp(req)}`, 30, 60_000);
  const body = await readJson(req);
  const query = str(body.query, 200);
  if (!query) throw new HttpError(400, 'invalid_query');
  let productUrl = '';
  if (body.catalogId) {
    // 카탈로그에 관리자가 등록한 상품 페이지가 있으면 사용 (source_url 이 해당 쇼핑몰일 때만)
    const row = db.prepare("SELECT source_url FROM catalog_products WHERE id = ? AND status = 'approved'").get(String(body.catalogId));
    if (row?.source_url && /coupang\.com|amazon\.com/.test(row.source_url)) productUrl = row.source_url;
  }
  try {
    const link = await getPurchaseLink({ region: regionOf(body.region), query, productUrl });
    return { link };
  } catch {
    return { link: null, error: 'link_generation_failed' };
  }
});

/* ----- 제품 등록 요청 (사용자) ----- */

route('POST', /^\/api\/requests$/, async (req) => {
  const uid = requireUser(req);
  rateLimit(`req:${uid}`, 20, 60 * 60_000);
  const body = await readJson(req, 6_000_000);
  const brand = str(body.brand, 120);
  const name = str(body.name, 200);
  if (!brand || !name) throw new HttpError(400, 'missing_fields');
  const photo = body.photo ? saveImage(body.photo) : null;
  const id = newId();
  const ts = now();
  db.prepare(`INSERT INTO product_requests (id, user_id, brand, name, volume, photo_file, info_url, note, region, status, history, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'received', ?, ?, ?)`)
    .run(id, uid, brand, name, str(body.volume, 40), photo, optionalUrl(body.infoUrl), str(body.note, 2000), regionOf(body.region),
      JSON.stringify([{ at: ts, status: 'received', by: 'user' }]), ts, ts);
  return rowToRequest(db.prepare('SELECT * FROM product_requests WHERE id = ?').get(id));
});

route('GET', /^\/api\/requests\/mine$/, async (req) => {
  const uid = requireUser(req);
  const rows = db.prepare('SELECT * FROM product_requests WHERE user_id = ? ORDER BY created_at DESC').all(uid);
  return { items: rows.map((r) => rowToRequest(r)) };
});

// 관리자가 "추가 정보 요청"한 경우 사용자가 답변
route('POST', /^\/api\/requests\/([\w-]+)\/reply$/, async (req, url, m) => {
  const uid = requireUser(req);
  const row = db.prepare('SELECT * FROM product_requests WHERE id = ? AND user_id = ?').get(m[1], uid);
  if (!row) throw new HttpError(404, 'not_found');
  if (row.status !== 'needs_info') throw new HttpError(409, 'invalid_state');
  const body = await readJson(req, 6_000_000);
  const reply = str(body.reply, 2000);
  const infoUrl = body.infoUrl ? optionalUrl(body.infoUrl) : row.info_url;
  const photo = body.photo ? saveImage(body.photo) : row.photo_file;
  const history = JSON.parse(row.history);
  history.push({ at: now(), status: 'reviewing', by: 'user' });
  db.prepare(`UPDATE product_requests SET user_reply = ?, info_url = ?, photo_file = ?, status = 'reviewing', history = ?, updated_at = ? WHERE id = ?`)
    .run(reply, infoUrl, photo, JSON.stringify(history), now(), row.id);
  return rowToRequest(db.prepare('SELECT * FROM product_requests WHERE id = ?').get(row.id));
});

/* ----- 관리자 (모든 라우트에서 서버 세션 검증) ----- */

route('POST', /^\/api\/admin\/login$/, async (req) => {
  rateLimit(`login:${clientIp(req)}`, 10, 15 * 60_000);
  const body = await readJson(req);
  checkAdminPassword(body.password);
  return { ok: true, __headers: { 'Set-Cookie': createAdminSession() } };
});

route('POST', /^\/api\/admin\/logout$/, async (req) => ({ ok: true, __headers: { 'Set-Cookie': destroyAdminSession(req) } }));

route('GET', /^\/api\/admin\/me$/, async (req) => ({ admin: isAdmin(req), enabled: adminEnabled() }));

route('GET', /^\/api\/admin\/requests$/, async (req, url) => {
  requireAdmin(req);
  const status = url.searchParams.get('status');
  const rows = REQUEST_STATUSES.includes(status)
    ? db.prepare('SELECT * FROM product_requests WHERE status = ? ORDER BY created_at DESC').all(status)
    : db.prepare('SELECT * FROM product_requests ORDER BY created_at DESC LIMIT 500').all();
  const counts = Object.fromEntries(db.prepare('SELECT status, COUNT(*) AS n FROM product_requests GROUP BY status').all().map((r) => [r.status, r.n]));
  return { items: rows.map((r) => rowToRequest(r, { forAdmin: true })), counts };
});

route('GET', /^\/api\/admin\/requests\/([\w-]+)\/photo$/, async (req, url, m, res) => {
  requireAdmin(req);
  const row = db.prepare('SELECT photo_file FROM product_requests WHERE id = ?').get(m[1]);
  if (!row?.photo_file) throw new HttpError(404, 'not_found');
  const file = path.join(UPLOAD_DIR, path.basename(row.photo_file));
  const sig = IMAGE_SIGNATURES.find((s) => file.endsWith(`.${s.ext}`));
  res.writeHead(200, { 'Content-Type': sig?.mime || 'application/octet-stream', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' });
  fs.createReadStream(file).pipe(res);
  return undefined;
});

// 상태 변경: reviewing | needs_info | rejected (+ 관리자 메모)
route('PATCH', /^\/api\/admin\/requests\/([\w-]+)$/, async (req, url, m) => {
  requireAdmin(req);
  const row = db.prepare('SELECT * FROM product_requests WHERE id = ?').get(m[1]);
  if (!row) throw new HttpError(404, 'not_found');
  const body = await readJson(req);
  const status = body.status ?? row.status;
  if (!['received', 'reviewing', 'needs_info', 'rejected'].includes(status)) throw new HttpError(400, 'invalid_status');
  const history = JSON.parse(row.history);
  if (status !== row.status) history.push({ at: now(), status, by: 'admin' });
  db.prepare(`UPDATE product_requests SET status = ?, admin_note = ?, brand = ?, name = ?, volume = ?, history = ?, updated_at = ? WHERE id = ?`)
    .run(status, str(body.adminNote ?? row.admin_note, 2000), str(body.brand ?? row.brand, 120), str(body.name ?? row.name, 200),
      str(body.volume ?? row.volume, 40), JSON.stringify(history), now(), row.id);
  return rowToRequest(db.prepare('SELECT * FROM product_requests WHERE id = ?').get(row.id), { forAdmin: true });
});

// 승인: 검토·수정한 제품 정보로 카탈로그 생성 → 일반 검색에 노출
route('POST', /^\/api\/admin\/requests\/([\w-]+)\/approve$/, async (req, url, m) => {
  requireAdmin(req);
  const row = db.prepare('SELECT * FROM product_requests WHERE id = ?').get(m[1]);
  if (!row) throw new HttpError(404, 'not_found');
  const body = await readJson(req, 200_000);
  const f = catalogFields({ brand: row.brand, name: row.name, volume: row.volume, region: row.region, ...body.product });
  if (!f.brand || !f.name) throw new HttpError(400, 'missing_fields');
  const catalogId = row.catalog_id || newId();
  const ts = now();
  db.prepare(`INSERT INTO catalog_products (id, brand, name, name_en, volume, category, ingredients_text, usage_text, warnings_text, regulatory, region, source_url, source_note, interaction_notes, status, created_at, updated_at)
    VALUES (:id, :brand, :name, :name_en, :volume, :category, :ingredients_text, :usage_text, :warnings_text, :regulatory, :region, :source_url, :source_note, :interaction_notes, 'approved', :ts, :ts)
    ON CONFLICT(id) DO UPDATE SET brand=:brand, name=:name, name_en=:name_en, volume=:volume, category=:category, ingredients_text=:ingredients_text,
      usage_text=:usage_text, warnings_text=:warnings_text, regulatory=:regulatory, region=:region, source_url=:source_url, source_note=:source_note,
      interaction_notes=:interaction_notes, status='approved', updated_at=:ts`)
    .run({ ...f, id: catalogId, ts });
  const history = JSON.parse(row.history);
  history.push({ at: ts, status: 'approved', by: 'admin' });
  db.prepare(`UPDATE product_requests SET status = 'approved', catalog_id = ?, admin_note = ?, history = ?, updated_at = ? WHERE id = ?`)
    .run(catalogId, str(body.adminNote ?? row.admin_note, 2000), JSON.stringify(history), ts, row.id);
  return { request: rowToRequest(db.prepare('SELECT * FROM product_requests WHERE id = ?').get(row.id), { forAdmin: true }), catalog: rowToCatalog(db.prepare('SELECT * FROM catalog_products WHERE id = ?').get(catalogId)) };
});

route('GET', /^\/api\/admin\/catalog$/, async (req) => {
  requireAdmin(req);
  return { items: db.prepare('SELECT * FROM catalog_products ORDER BY updated_at DESC LIMIT 500').all().map(rowToCatalog) };
});

route('GET', /^\/api\/admin\/catalog\/([\w-]+)$/, async (req, url, m) => {
  requireAdmin(req);
  const row = db.prepare('SELECT * FROM catalog_products WHERE id = ?').get(m[1]);
  if (!row) throw new HttpError(404, 'not_found');
  return rowToCatalog(row);
});

route('PATCH', /^\/api\/admin\/catalog\/([\w-]+)$/, async (req, url, m) => {
  requireAdmin(req);
  const row = db.prepare('SELECT * FROM catalog_products WHERE id = ?').get(m[1]);
  if (!row) throw new HttpError(404, 'not_found');
  const body = await readJson(req, 200_000);
  const f = catalogFields({ ...rowToCatalog(row), ...body });
  const status = body.status === 'hidden' ? 'hidden' : 'approved';
  db.prepare(`UPDATE catalog_products SET brand=:brand, name=:name, name_en=:name_en, volume=:volume, category=:category, ingredients_text=:ingredients_text,
    usage_text=:usage_text, warnings_text=:warnings_text, regulatory=:regulatory, region=:region, source_url=:source_url, source_note=:source_note,
    interaction_notes=:interaction_notes, status=:status, updated_at=:ts WHERE id=:id`).run({ ...f, status, ts: now(), id: row.id });
  return rowToCatalog(db.prepare('SELECT * FROM catalog_products WHERE id = ?').get(row.id));
});

route('GET', /^\/api\/admin\/community$/, async (req) => {
  requireAdmin(req);
  const rows = db.prepare('SELECT * FROM community_products ORDER BY contributor_count DESC, updated_at DESC LIMIT 500').all();
  return { items: rows.map((r) => ({ ...rowToCommunity(r), id: r.id, status: r.status })) };
});

route('PATCH', /^\/api\/admin\/community\/([\w-]+)$/, async (req, url, m) => {
  requireAdmin(req);
  const body = await readJson(req);
  const status = body.status === 'hidden' ? 'hidden' : 'visible';
  const r = db.prepare('UPDATE community_products SET status = ?, updated_at = ? WHERE id = ?').run(status, now(), m[1]);
  if (!r.changes) throw new HttpError(404, 'not_found');
  return { ok: true, status };
});

route('GET', /^\/api\/admin\/links$/, async (req) => {
  requireAdmin(req);
  return { items: listLinks(), affiliate: affiliateStatus() };
});

route('POST', /^\/api\/admin\/links\/([\w-]+)\/check$/, async (req, url, m) => {
  requireAdmin(req);
  const row = await checkLink(m[1]);
  if (!row) throw new HttpError(404, 'not_found');
  return row;
});

/* ---------------- 정적 파일 ---------------- */

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
};

const CSP = [
  "default-src 'self'",
  "script-src 'self' https://cdn.jsdelivr.net 'wasm-unsafe-eval'",
  "worker-src 'self' blob: https://cdn.jsdelivr.net",
  "connect-src 'self' https://cdn.jsdelivr.net https://tessdata.projectnaptha.com https://wgipwbowaugqhrtecqvp.supabase.co",
  "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
  "font-src 'self' https://cdn.jsdelivr.net",
  "img-src 'self' data: blob:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

function serveStatic(req, res, pathname) {
  let rel = decodeURIComponent(pathname);
  if (rel === '/' || !path.extname(rel)) rel = '/index.html'; // SPA
  const file = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!file.startsWith(PUBLIC_DIR + path.sep)) return sendJson(res, 403, { error: 'forbidden' });
  fs.stat(file, (err, stat) => {
    if (err || !stat.isFile()) return sendJson(res, 404, { error: 'not_found' });
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': rel === '/index.html' ? 'no-cache' : 'public, max-age=300',
      'Content-Security-Policy': CSP,
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Permissions-Policy': 'camera=(self), microphone=(), geolocation=()',
    });
    fs.createReadStream(file).pipe(res);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (!url.pathname.startsWith('/api/')) {
    if (req.method !== 'GET' && req.method !== 'HEAD') return sendJson(res, 405, { error: 'method_not_allowed' });
    return serveStatic(req, res, url.pathname);
  }
  try {
    const r = routes.find((x) => x.method === req.method && x.pattern.test(url.pathname));
    if (!r) throw new HttpError(404, 'not_found');
    const result = await r.handler(req, url, url.pathname.match(r.pattern), res);
    if (result === undefined) return; // 핸들러가 직접 응답
    const { __headers, ...body } = result;
    sendJson(res, 200, body, __headers);
  } catch (err) {
    if (err instanceof HttpError) return sendJson(res, err.status, { error: err.code });
    console.error(err);
    sendJson(res, 500, { error: 'server_error' });
  }
});

server.listen(config.port, () => {
  console.log(`SkinStack running → http://localhost:${config.port}`);
  if (!adminEnabled()) console.log('  · ADMIN_PASSWORD 미설정: 관리자 기능 비활성');
  const aff = affiliateStatus();
  console.log(`  · 제휴 링크: ${Object.entries(aff).map(([k, v]) => `${k}=${v.enabled ? 'on' : 'off'}`).join(', ')}`);
});
