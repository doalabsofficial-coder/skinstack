import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { DATA_DIR, config } from './config.js';
import { DEMO_PRODUCTS } from '../docs/js/domain/demo.js';

export const db = new DatabaseSync(path.join(DATA_DIR, 'skinstack.db'));
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS catalog_products (
  id TEXT PRIMARY KEY,
  brand TEXT NOT NULL,
  name TEXT NOT NULL,
  name_en TEXT NOT NULL DEFAULT '',
  volume TEXT NOT NULL DEFAULT '',
  category TEXT,
  ingredients_text TEXT NOT NULL DEFAULT '',
  usage_text TEXT NOT NULL DEFAULT '',
  warnings_text TEXT NOT NULL DEFAULT '',
  regulatory TEXT NOT NULL DEFAULT 'unknown',
  region TEXT NOT NULL DEFAULT 'GLOBAL',
  source_url TEXT NOT NULL DEFAULT '',
  source_note TEXT NOT NULL DEFAULT '',
  interaction_notes TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'approved',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS product_requests (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  brand TEXT NOT NULL,
  name TEXT NOT NULL,
  volume TEXT NOT NULL DEFAULT '',
  photo_file TEXT,
  info_url TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  region TEXT NOT NULL DEFAULT 'GLOBAL',
  status TEXT NOT NULL DEFAULT 'received',
  admin_note TEXT NOT NULL DEFAULT '',
  user_reply TEXT NOT NULL DEFAULT '',
  catalog_id TEXT,
  history TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_requests_user ON product_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_requests_status ON product_requests(status);
CREATE TABLE IF NOT EXISTS affiliate_links (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  target_url TEXT NOT NULL,
  affiliate_url TEXT NOT NULL,
  check_status TEXT NOT NULL DEFAULT 'unchecked',
  last_status_code INTEGER,
  last_checked_at TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(provider, target_url)
);
-- 고객이 입력·확인한 제품 정보 누적 (미검토). 같은 브랜드+제품명은 하나로 합치고 입력한 사용자 수를 센다
CREATE TABLE IF NOT EXISTS community_products (
  id TEXT PRIMARY KEY,
  match_key TEXT NOT NULL UNIQUE,
  brand TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL,
  volume TEXT NOT NULL DEFAULT '',
  category TEXT,
  ingredients_text TEXT NOT NULL DEFAULT '',
  usage_text TEXT NOT NULL DEFAULT '',
  region TEXT NOT NULL DEFAULT 'GLOBAL',
  contributor_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'visible',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS community_contributions (
  product_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (product_id, user_id)
);
CREATE TABLE IF NOT EXISTS admin_sessions (
  token_hash TEXT PRIMARY KEY,
  expires_at INTEGER NOT NULL
);
`);

export const newId = () => crypto.randomUUID();
export const now = () => new Date().toISOString();

export function seedIfEmpty() {
  if (!config.seedDemo) return;
  const { n } = db.prepare('SELECT COUNT(*) AS n FROM product_requests').get();
  if (n > 0) return;
  // 데모: 예시 제품을 "접수됨" 요청으로 넣어 관리자 검토 흐름을 보여줍니다.
  // 성분/효능 정보는 확인되지 않았으므로 넣지 않습니다.
  const insert = db.prepare(`INSERT INTO product_requests
    (id, user_id, brand, name, volume, note, region, status, history, created_at, updated_at)
    VALUES (?, 'demo', ?, ?, ?, ?, 'KR', 'received', ?, ?, ?)`);
  const ts = now();
  for (const p of DEMO_PRODUCTS) {
    insert.run(newId(), p.brand || '', p.name, p.volumeText || '', 'demo-seed',
      JSON.stringify([{ at: ts, status: 'received', by: 'system' }]), ts, ts);
  }
}

export function rowToCatalog(r) {
  return {
    id: r.id,
    source: 'catalog',
    brand: r.brand,
    name: r.name,
    nameEn: r.name_en,
    volume: r.volume,
    category: r.category,
    ingredientsText: r.ingredients_text,
    usageText: r.usage_text,
    warningsText: r.warnings_text,
    regulatory: r.regulatory,
    region: r.region,
    sourceUrl: r.source_url,
    sourceNote: r.source_note,
    interactionNotes: JSON.parse(r.interaction_notes || '[]'),
    status: r.status,
    updatedAt: r.updated_at,
  };
}

/** 브랜드+제품명 비교 키: 공백·기호·대소문자 무시 */
export const matchKey = (brand, name) => `${brand} ${name}`.toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '');

export function rowToCommunity(r) {
  return {
    id: `c_${r.id}`,
    source: 'community',
    brand: r.brand,
    name: r.name,
    nameEn: '',
    volume: r.volume,
    category: r.category,
    ingredientsText: r.ingredients_text,
    usageText: r.usage_text,
    warningsText: '',
    regulatory: null, // 사용자 입력 데이터는 규제 분류를 신뢰하지 않음 → 등록 시 사용자가 확인
    region: r.region,
    interactionNotes: [],
    contributorCount: r.contributor_count,
    updatedAt: r.updated_at,
  };
}

export function rowToRequest(r, { forAdmin = false } = {}) {
  const base = {
    id: r.id,
    brand: r.brand,
    name: r.name,
    volume: r.volume,
    infoUrl: r.info_url,
    note: r.note,
    region: r.region,
    status: r.status,
    adminNote: r.admin_note,
    userReply: r.user_reply,
    catalogId: r.catalog_id,
    hasPhoto: Boolean(r.photo_file),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
  if (forAdmin) {
    base.userId = r.user_id;
    base.history = JSON.parse(r.history || '[]');
  }
  return base;
}
