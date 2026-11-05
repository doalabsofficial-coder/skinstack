/*
 * 서버 API 래퍼. 오류는 ApiError(code) 로 통일 → 화면에서 t(`error.${code}`) 로 표시.
 */
const TOKEN_KEY = 'skinstack:token';

export class ApiError extends Error {
  constructor(code, status) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

async function request(method, path, body, { auth = false } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (auth) headers.Authorization = `Bearer ${await userToken()}`;
  let res;
  try {
    res = await fetch(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), credentials: 'same-origin' });
  } catch {
    throw new ApiError('network', 0);
  }
  let data = null;
  try { data = await res.json(); } catch { /* empty */ }
  if (!res.ok) throw new ApiError(data?.error || 'server_error', res.status);
  return data;
}

let tokenPromise = null;
async function userToken() {
  let token = null;
  try { token = localStorage.getItem(TOKEN_KEY); } catch { /* ignore */ }
  if (token) return token;
  tokenPromise ??= request('POST', '/api/session').then(({ token: tk }) => {
    try { localStorage.setItem(TOKEN_KEY, tk); } catch { /* ignore */ }
    return tk;
  });
  return tokenPromise;
}

export const api = {
  config: () => request('GET', '/api/config'),
  searchCatalog: (q) => request('GET', `/api/catalog/search?q=${encodeURIComponent(q)}`),
  ocr: (front, back) => request('POST', '/api/ocr', { front, back }),
  purchaseLink: (payload) => request('POST', '/api/purchase-link', payload),
  contribute: (payload) => request('POST', '/api/community/contribute', payload, { auth: true }),
  createRequest: (payload) => request('POST', '/api/requests', payload, { auth: true }),
  myRequests: () => request('GET', '/api/requests/mine', undefined, { auth: true }),
  replyRequest: (id, payload) => request('POST', `/api/requests/${id}/reply`, payload, { auth: true }),
  admin: {
    me: () => request('GET', '/api/admin/me'),
    login: (password) => request('POST', '/api/admin/login', { password }),
    logout: () => request('POST', '/api/admin/logout', {}),
    requests: (status) => request('GET', `/api/admin/requests${status ? `?status=${status}` : ''}`),
    updateRequest: (id, payload) => request('PATCH', `/api/admin/requests/${id}`, payload),
    approve: (id, payload) => request('POST', `/api/admin/requests/${id}/approve`, payload),
    catalog: () => request('GET', '/api/admin/catalog'),
    updateCatalog: (id, payload) => request('PATCH', `/api/admin/catalog/${id}`, payload),
    community: () => request('GET', '/api/admin/community'),
    setCommunityStatus: (id, status) => request('PATCH', `/api/admin/community/${id}`, { status }),
    links: () => request('GET', '/api/admin/links'),
    checkLink: (id) => request('POST', `/api/admin/links/${id}/check`, {}),
  },
};
