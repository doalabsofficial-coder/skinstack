import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DATA_DIR = path.join(ROOT, 'data');
export const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
export const PUBLIC_DIR = path.join(ROOT, 'docs');

const envPath = path.join(ROOT, '.env');
if (fs.existsSync(envPath)) {
  // 메모장 등에서 저장한 UTF-8 BOM 제거 후 파싱. 이미 설정된 환경 변수가 우선
  const parsed = parseEnv(fs.readFileSync(envPath, 'utf8').replace(/^﻿/, ''));
  for (const [k, v] of Object.entries(parsed)) process.env[k] ??= v;
}

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

function loadSessionSecret() {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  const file = path.join(DATA_DIR, '.session-secret');
  if (!fs.existsSync(file)) fs.writeFileSync(file, crypto.randomBytes(48).toString('hex'), { mode: 0o600 });
  return fs.readFileSync(file, 'utf8').trim();
}

const env = (key) => (process.env[key] ?? '').trim();

export const config = {
  port: Number(env('PORT')) || 3000,
  adminPassword: env('ADMIN_PASSWORD'),
  sessionSecret: loadSessionSecret(),
  seedDemo: env('SEED_DEMO') !== 'false',
  ocr: {
    apiKey: env('ANTHROPIC_API_KEY'),
    model: env('OCR_MODEL') || 'claude-opus-5-5',
  },
  affiliate: {
    coupang: {
      accessKey: env('COUPANG_ACCESS_KEY'),
      secretKey: env('COUPANG_SECRET_KEY'),
      subId: env('COUPANG_SUB_ID'),
    },
    amazonUs: {
      tag: env('AMAZON_US_ASSOCIATE_TAG'),
    },
  },
};

// 지역별 설정. 새 지역/제휴처를 추가할 때는 여기와 server/affiliate.js 의 PROVIDERS 만 수정하면 됩니다.
export const REGIONS = {
  KR: { affiliate: 'coupang' },
  US: { affiliate: 'amazon_us' },
  GLOBAL: { affiliate: null },
};
