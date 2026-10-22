import { config } from './config.js';
import { HttpError } from './http.js';
import { CATEGORY_IDS } from '../docs/js/domain/categories.js';

/*
 * 제품 앞/뒤 사진 → 라벨 텍스트 구조화 (Claude 비전).
 * 원칙: 사진에 "보이는 글자"만 옮겨 적고, 보이지 않는 성분·효능은 추측하지 않는다.
 * 결과는 항상 사용자가 등록 화면에서 확인·수정한다.
 */

let clientPromise = null;
async function getClient() {
  if (!config.ocr.apiKey) return null;
  clientPromise ??= import('@anthropic-ai/sdk')
    .then(({ default: Anthropic }) => ({ Anthropic, client: new Anthropic({ apiKey: config.ocr.apiKey }) }))
    .catch(() => null); // SDK 미설치 (npm install 안 함)
  return clientPromise;
}

export async function ocrAvailable() {
  return Boolean(await getClient());
}

const LABEL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['brand', 'productName', 'volume', 'categoryGuess', 'ingredientsText', 'usageText',
    'warningsText', 'regulatoryMarkings', 'isMakeup', 'readable', 'notes'],
  properties: {
    brand: { type: 'string', description: 'Brand or manufacturer exactly as printed. Empty string if not visible.' },
    productName: { type: 'string', description: 'Product name exactly as printed. Empty if not visible.' },
    volume: { type: 'string', description: 'Net volume/weight as printed, e.g. "50 mL". Empty if not visible.' },
    categoryGuess: { type: 'string', enum: [...CATEGORY_IDS, 'makeup', 'unknown'] },
    ingredientsText: { type: 'string', description: 'Full ingredient list transcribed verbatim in printed order. Empty if not visible.' },
    usageText: { type: 'string', description: 'Directions for use transcribed verbatim. Empty if not visible.' },
    warningsText: { type: 'string', description: 'Cautions/warnings transcribed verbatim. Empty if not visible.' },
    regulatoryMarkings: {
      type: 'array',
      items: { type: 'string' },
      description: 'Verbatim regulatory markings, e.g. "기능성화장품", "의약외품", "일반의약품", "Drug Facts", "SPF 50+ PA++++".',
    },
    isMakeup: { type: 'boolean' },
    readable: { type: 'boolean', description: 'false if the label text is mostly unreadable.' },
    notes: { type: 'string', description: 'Short note about illegible or cut-off parts. Empty if none.' },
  },
};

const PROMPT = `You are transcribing a skincare product label from photos (front and/or back).
Rules:
- Transcribe ONLY text that is visible in the images. Never fill in ingredients, claims or directions from memory or from the product name.
- If a field is not visible or is illegible, return an empty string for it and mention it in "notes".
- Keep the original language of the label (Korean, English, etc.). Keep ingredient order as printed.
- categoryGuess must reflect what the label says (e.g. "세럼", "Sunscreen"); use "unknown" if unclear and "makeup" for foundation/cushion/lip/eye makeup.`;

const ALLOWED_MEDIA = new Set(['image/jpeg', 'image/png', 'image/webp']);

function toImageBlock(dataUrl) {
  const m = /^data:(image\/[a-z]+);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl || '');
  if (!m || !ALLOWED_MEDIA.has(m[1])) throw new HttpError(400, 'invalid_image');
  return { type: 'image', source: { type: 'base64', media_type: m[1], data: m[2] } };
}

export async function extractLabel({ front, back }) {
  const ctx = await getClient();
  if (!ctx) throw new HttpError(501, 'ocr_not_configured');
  const { Anthropic, client } = ctx;

  const images = [front, back].filter(Boolean).map(toImageBlock);
  if (!images.length) throw new HttpError(400, 'invalid_image');

  let response;
  try {
    response = await client.beta.messages.create({
      model: config.ocr.model,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: LABEL_SCHEMA } },
      messages: [{ role: 'user', content: [...images, { type: 'text', text: PROMPT }] }],
    });
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) throw new HttpError(429, 'rate_limited');
    if (err instanceof Anthropic.AuthenticationError) throw new HttpError(502, 'ocr_auth_failed');
    if (err instanceof Anthropic.BadRequestError) throw new HttpError(400, 'invalid_image');
    if (err instanceof Anthropic.APIError) throw new HttpError(502, 'ocr_failed');
    throw new HttpError(502, 'ocr_failed');
  }

  if (response.stop_reason === 'refusal' || response.stop_reason === 'max_tokens') {
    throw new HttpError(422, 'ocr_unreadable');
  }
  const text = response.content.find((b) => b.type === 'text')?.text;
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(502, 'ocr_failed');
  }
}
