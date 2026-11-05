import { getState, onSaved, syncableData, applyRemote, setSyncUser } from './store.js';

/*
 * 기기 간 동기화 (Supabase). 사용자별 user_state 한 행에 화장대·내 루틴·기록·마스크팩을 저장.
 * - 공개(publishable) 키: 브라우저용으로 공개되어도 되는 키. 데이터는 RLS 로 본인 행만 접근 가능.
 * - 더 최근에 저장된 쪽이 반영됨. 이 기기를 처음 연결할 때는 사용자에게 어느 데이터를 쓸지 물어봄.
 * shortcut: 두 기기에서 동시에 오프라인 수정하면 나중 저장만 남음 → 항목 단위 병합이 필요해지면 routines 테이블로 이전
 */
export const SUPABASE_URL = 'https://wgipwbowaugqhrtecqvp.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_q9Kg3cgW2uj-4TxMY9I6aw_gpGKlv5o';
const LIB = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3/+esm';

/** 무엇을 할지 결정 (순수 함수) */
export function decide({ linked, remoteAt, localAt }) {
  if (!linked) return remoteAt ? 'ask' : 'push';
  if (!remoteAt) return 'push';
  if (remoteAt > (localAt || '')) return 'pull';
  if ((localAt || '') > remoteAt) return 'push';
  return 'none';
}

export const status = { ready: false, user: null, lastSync: null, error: null, busy: false };
let sb = null;
let hooks = { onChange: () => {}, ask: async () => 'cloud' };
let pushTimer = null;

export async function client() {
  if (!sb) {
    const { createClient } = await import(LIB);
    sb = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { flowType: 'pkce', persistSession: true, detectSessionInUrl: true } });
  }
  return sb;
}

const changed = () => hooks.onChange();
const fail = (err) => { status.error = err?.message || String(err); status.busy = false; changed(); };

async function push() {
  if (!status.user || getState().meta?.syncUser !== status.user.id) return;
  const at = getState().meta?.updatedAt || new Date().toISOString();
  const { error } = await sb.from('user_state').upsert({ user_id: status.user.id, data: syncableData(), updated_at: at });
  if (error) return fail(error);
  status.lastSync = new Date().toISOString();
  status.error = null;
  changed();
}

/** 클라우드와 비교해 내려받거나 올림 */
export async function syncNow() {
  if (!status.user) return;
  status.busy = true;
  changed();
  const { data: row, error } = await sb.from('user_state').select('data, updated_at').eq('user_id', status.user.id).maybeSingle();
  if (error) return fail(error);
  const local = getState();
  const linked = local.meta?.syncUser === status.user.id;
  let action = decide({ linked, remoteAt: row?.updated_at ? new Date(row.updated_at).toISOString() : null, localAt: local.meta?.updatedAt });
  if (action === 'ask') action = (await hooks.ask()) === 'cloud' ? 'pull' : 'push';
  if (action === 'pull') applyRemote(row.data, new Date(row.updated_at).toISOString(), status.user.id);
  else {
    if (!linked) setSyncUser(status.user.id);
    if (action === 'push') await push();
  }
  status.busy = false;
  status.lastSync = new Date().toISOString();
  changed();
}

export async function initSync(h) {
  hooks = { ...hooks, ...h };
  try {
    const c = await client();
    const { data: { session } } = await c.auth.getSession();
    status.user = session?.user || null;
    status.ready = true;
    c.auth.onAuthStateChange((event, s) => {
      const was = status.user?.id;
      status.user = s?.user || null;
      // 인증 콜백 안에서 바로 Supabase 를 호출하면 교착될 수 있어 한 틱 뒤로 미룸
      if (status.user && status.user.id !== was) setTimeout(() => syncNow().catch(fail), 0);
      changed();
    });
    // 로컬 변경 → 1.5초 모아서 업로드
    onSaved(() => { clearTimeout(pushTimer); pushTimer = setTimeout(() => push().catch(fail), 1500); });
    // 다른 기기에서 바꾼 내용: 앱으로 돌아올 때 확인
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') syncNow().catch(fail); });
    if (status.user) await syncNow();
  } catch (err) {
    fail(err);
  }
  changed();
}

export async function sendLoginLink(email) {
  const c = await client();
  const { error } = await c.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + location.pathname } });
  if (error) throw error;
}

export async function signOut() {
  await (await client()).auth.signOut();
  status.user = null;
  changed();
}
