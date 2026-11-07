export const SB_URL = 'https://bjnhezfulufpcujbhszh.supabase.co';
export const SB_KEY = 'sb_publishable_sJLkN5k2kTwbQN52CtC--A_DsmN0Gz2';

export async function rpc(fn, args = {}) {
  const res = await fetch(SB_URL + '/rest/v1/rpc/' + fn, {
    method: 'POST',
    headers: { apikey: SB_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(args)
  });
  const text = await res.text();
  if (!res.ok) throw new Error(res.status + ' ' + text);
  return text ? JSON.parse(text) : null;
}

export function store(key, value) {
  try {
    if (value === undefined) return JSON.parse(window.localStorage.getItem(key) || 'null');
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, JSON.stringify(value));
  } catch (e) { return null; }
  return value;
}
