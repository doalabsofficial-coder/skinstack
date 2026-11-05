import { client, status } from './sync.js';

/*
 * 다른 사람 루틴 구경하기 (Supabase shared_routines). 읽기는 로그인 없이, 공개·신고는 로그인 필요.
 * 공개되는 정보: 닉네임, 피부 타입 태그(선택), 루틴 이름·시간대, 제품(브랜드·이름·종류), 한 줄 후기.
 */
const FEED_COLS = 'id, nickname, skin_type, slot, name, note, items, created_at';
export const SKIN_TYPES = ['dry', 'oily', 'combination', 'normal'];

/** 공개용 제품 목록 (전성분·메모·사용량 등 개인 기록은 제외) */
export const toSharedItems = (products) => products
  .map((p) => ({ brand: p.brand || '', name: p.name || '', category: p.category || p.categoryHint || null, catalogId: p.catalogId || null }))
  .filter((i) => i.name)
  .slice(0, 20);

const norm = (s) => (s || '').toLowerCase().replace(/\s+/g, '');
/** 공개 루틴의 제품이 내 화장대에 있는지 (이름 같고, 브랜드가 둘 다 있으면 브랜드도 같아야 함) */
export const ownedMatch = (item, vanity) => vanity.find((p) => !p.archived && norm(p.name) === norm(item.name)
  && (!item.brand || !p.brand || norm(p.brand) === norm(item.brand))) || null;

const loginRequired = () => Object.assign(new Error('login_required'), { code: 'login_required' });

export async function listShared({ skinType } = {}) {
  const c = await client();
  let q = c.from('shared_routines').select(FEED_COLS).order('created_at', { ascending: false }).limit(50);
  if (skinType) q = q.eq('skin_type', skinType);
  const { data, error } = await q;
  if (error) throw error;
  return data;
}

/** 내가 공개한 루틴들 (source_id = 내 루틴 id) */
export async function myShared() {
  if (!status.user) return [];
  const c = await client();
  const { data, error } = await c.from('shared_routines').select('id, source_id, nickname, skin_type, note').eq('owner', status.user.id);
  if (error) throw error;
  return data;
}

export async function publish(routine, products, { nickname, skinType, note }) {
  if (!status.user) throw loginRequired();
  const c = await client();
  const row = { nickname, skin_type: skinType || null, slot: routine.slot, name: routine.name, note: note || null, items: toSharedItems(products) };
  const { data: existing, error: findErr } = await c.from('shared_routines').select('id').eq('owner', status.user.id).eq('source_id', routine.id).maybeSingle();
  if (findErr) throw findErr;
  // upsert 는 쓰면 안 됨: source_id 에 update 권한이 없어 충돌 시 권한 오류
  const res = existing
    ? await c.from('shared_routines').update({ ...row, updated_at: new Date().toISOString() }).eq('id', existing.id)
    : await c.from('shared_routines').insert({ ...row, source_id: routine.id });
  if (res.error) throw res.error;
}

export async function unpublish(routineId) {
  if (!status.user) throw loginRequired();
  const c = await client();
  const { error } = await c.from('shared_routines').delete().eq('owner', status.user.id).eq('source_id', routineId);
  if (error) throw error;
}

export async function report(routineId, reason) {
  if (!status.user) throw loginRequired();
  const c = await client();
  const { error } = await c.from('routine_reports').insert({ routine_id: routineId, reason: reason || null });
  if (error && error.code !== '23505') throw error; // 23505 = 이미 신고함 → 성공으로 처리
}
