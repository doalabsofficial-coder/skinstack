import crypto from 'node:crypto';
import { config, REGIONS } from './config.js';
import { db, newId, now } from './db.js';

/*
 * 제휴 링크 제공자.
 * - 실제 코드/키는 환경 변수에서만 읽습니다. 설정이 없으면 enabled=false → 앱에서 구매 버튼을 숨깁니다.
 * - 새 제휴처(예: amazon_jp)는 여기에 provider 를 추가하고 config.REGIONS 에 연결하세요.
 */
const PROVIDERS = {
  coupang: {
    enabled: () => Boolean(config.affiliate.coupang.accessKey && config.affiliate.coupang.secretKey),
    // 파트너스 사이트에서 직접 생성한 단축 링크는 이미 제휴 코드가 포함되어 있음
    isAffiliateUrl: (url) => /^https:\/\/link\.coupang\.com\//.test(url),
    disclosureKey: 'affiliate.disclosure.coupang',
    searchUrl: (q) => `https://www.coupang.com/np/search?q=${encodeURIComponent(q)}`,
    convert: coupangDeeplink,
  },
  amazon_us: {
    enabled: () => Boolean(config.affiliate.amazonUs.tag),
    disclosureKey: 'affiliate.disclosure.amazon',
    searchUrl: (q) => `https://www.amazon.com/s?k=${encodeURIComponent(q)}`,
    convert: async (url) => {
      const u = new URL(url);
      u.searchParams.set('tag', config.affiliate.amazonUs.tag);
      return u.toString();
    },
  },
};

export function affiliateStatus() {
  return Object.fromEntries(Object.entries(REGIONS).map(([region, r]) => {
    const p = r.affiliate && PROVIDERS[r.affiliate];
    return [region, { provider: r.affiliate, enabled: Boolean(p && p.enabled()) }];
  }));
}

// 쿠팡 파트너스 Open API: 일반 쿠팡 URL → 파트너스 딥링크
async function coupangDeeplink(url) {
  const { accessKey, secretKey, subId } = config.affiliate.coupang;
  const method = 'POST';
  const apiPath = '/v2/providers/affiliate_open_api/apis/openapi/v1/deeplink';
  const d = new Date();
  const p2 = (n) => String(n).padStart(2, '0');
  const datetime = `${p2(d.getUTCFullYear() % 100)}${p2(d.getUTCMonth() + 1)}${p2(d.getUTCDate())}T${p2(d.getUTCHours())}${p2(d.getUTCMinutes())}${p2(d.getUTCSeconds())}Z`;
  const signature = crypto.createHmac('sha256', secretKey).update(datetime + method + apiPath).digest('hex');
  const res = await fetch(`https://api-gateway.coupang.com${apiPath}`, {
    method,
    headers: {
      'Content-Type': 'application/json;charset=UTF-8',
      Authorization: `CEA algorithm=HmacSHA256, access-key=${accessKey}, signed-date=${datetime}, signature=${signature}`,
    },
    body: JSON.stringify({ coupangUrls: [url], ...(subId ? { subId } : {}) }),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`coupang_http_${res.status}`);
  const json = await res.json();
  const link = json?.data?.[0]?.shortenUrl || json?.data?.[0]?.landingUrl;
  if (json?.rCode !== '0' || !link) throw new Error(`coupang_api_${json?.rCode ?? 'unknown'}`);
  return link;
}

/**
 * 재구매용 링크 생성. productUrl 이 없으면 검색 결과 페이지로 연결합니다
 * (특정 상품이 항상 판매 중이라고 가정하지 않기 위해).
 */
export async function getPurchaseLink({ region, query, productUrl }) {
  const providerKey = REGIONS[region]?.affiliate;
  const provider = providerKey && PROVIDERS[providerKey];
  if (!provider) return null;
  if (productUrl && provider.isAffiliateUrl?.(productUrl)) {
    db.prepare(`INSERT INTO affiliate_links (id, provider, target_url, affiliate_url, created_at) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(provider, target_url) DO NOTHING`).run(newId(), providerKey, productUrl, productUrl, now());
    const row = db.prepare('SELECT * FROM affiliate_links WHERE provider = ? AND target_url = ?').get(providerKey, productUrl);
    return row.check_status === 'broken' ? null : linkDto(providerKey, provider, row, true);
  }
  if (!provider.enabled()) return null;

  const target = productUrl || provider.searchUrl(query);
  const cached = db.prepare('SELECT * FROM affiliate_links WHERE provider = ? AND target_url = ?').get(providerKey, target);
  if (cached && cached.check_status !== 'broken') {
    return linkDto(providerKey, provider, cached, Boolean(productUrl));
  }
  const affiliateUrl = await provider.convert(target);
  const id = cached?.id ?? newId();
  db.prepare(`INSERT INTO affiliate_links (id, provider, target_url, affiliate_url, created_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(provider, target_url) DO UPDATE SET affiliate_url = excluded.affiliate_url, check_status = 'unchecked'`)
    .run(id, providerKey, target, affiliateUrl, now());
  const row = db.prepare('SELECT * FROM affiliate_links WHERE id = ?').get(id);
  return linkDto(providerKey, provider, row, Boolean(productUrl));
}

function linkDto(providerKey, provider, row, isProductPage) {
  return {
    provider: providerKey,
    url: row.affiliate_url,
    kind: isProductPage ? 'product' : 'search',
    checkStatus: row.check_status,
    lastCheckedAt: row.last_checked_at,
    disclosureKey: provider.disclosureKey,
  };
}

/** 링크가 살아 있는지 서버에서 확인 (관리자 전용). 일부 쇼핑몰은 봇 요청을 막아 'unverifiable' 이 될 수 있음 */
export async function checkLink(id) {
  const row = db.prepare('SELECT * FROM affiliate_links WHERE id = ?').get(id);
  if (!row) return null;
  let status = 'unverifiable';
  let code = null;
  try {
    const res = await fetch(row.affiliate_url, {
      method: 'GET',
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 (link-check)' },
      signal: AbortSignal.timeout(8000),
    });
    code = res.status;
    if (res.ok) status = 'ok';
    else if (res.status === 404 || res.status === 410) status = 'broken';
  } catch {
    status = 'unverifiable';
  }
  db.prepare('UPDATE affiliate_links SET check_status = ?, last_status_code = ?, last_checked_at = ? WHERE id = ?')
    .run(status, code, now(), id);
  return db.prepare('SELECT * FROM affiliate_links WHERE id = ?').get(id);
}

export function listLinks() {
  return db.prepare('SELECT * FROM affiliate_links ORDER BY created_at DESC LIMIT 200').all();
}
