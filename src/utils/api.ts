/**
 * The one place the app talks to the server.
 *
 *  - Web (same origin): paths like "/api/..." work as they are; the browser sends the session cookie.
 *  - Native app (Capacitor) or a web build pointed at another server: the page's origin is not the API's origin, so
 *    cookies are not usable. The app asks for the session token at sign-in, keeps it, and sends it as a bearer token.
 *
 * Where the API lives, in order: a server address saved in the native app (for staging builds), then the
 * VITE_API_BASE_URL set when the app was built, then the page's own origin.
 */
const TOKEN_KEY = 'thp_token';
const SERVER_KEY = 'thp_server';

function store(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null; // private mode or blocked storage: the app still works for the current page load
  }
}
let memoryToken: string | null = null;
let memoryServer: string | null = null;

/**
 * iOS can clear a web view's localStorage when it is short of space, and a patient's access code works only once, so
 * a lost token would lock them out. In the native app the token and server address are therefore ALSO kept in
 * Capacitor Preferences (the app's own storage). Call this once at start-up, before the first request.
 */
// NOTE: never return or await a Capacitor plugin object (for example from an async helper): it is a Proxy, JavaScript
// would call .then() on it, and that throws "not implemented". Destructure it inside the function that uses it.
export async function loadStoredSession(): Promise<void> {
  if (!isNativeApp()) return;
  try {
    const { Preferences } = await import('@capacitor/preferences');
    memoryToken = (await Preferences.get({ key: TOKEN_KEY })).value ?? memoryToken;
    memoryServer = (await Preferences.get({ key: SERVER_KEY })).value ?? memoryServer;
  } catch { /* fall back to localStorage */ }
}
function persistNative(key: string, value: string | null) {
  if (!isNativeApp()) return;
  import('@capacitor/preferences')
    .then(({ Preferences }) => (value ? Preferences.set({ key, value }) : Preferences.remove({ key })))
    .catch(() => { /* best effort: localStorage still holds it */ });
}

/** True inside the Capacitor shell (the native runtime defines window.Capacitor; no plugin import needed). */
export function isNativeApp(): boolean {
  return !!(window as any).Capacitor?.isNativePlatform?.();
}

/** Accepts https URLs, and plain http only for local development servers. Returns the origin, or null. */
export function cleanServerUrl(input: string): string | null {
  try {
    const u = new URL(input.trim());
    const local = u.hostname === 'localhost' || u.hostname === '127.0.0.1' || /^(10|192\.168)\./.test(u.hostname);
    if (u.protocol !== 'https:' && !(u.protocol === 'http:' && local)) return null;
    return u.origin;
  } catch {
    return null;
  }
}

export function apiBase(): string {
  const saved = isNativeApp() ? (store()?.getItem(SERVER_KEY) ?? memoryServer) : null;
  const built = (import.meta as any).env?.VITE_API_BASE_URL as string | undefined;
  return cleanServerUrl(saved || '') || cleanServerUrl(built || '') || '';
}

export function setServerUrl(input: string): boolean {
  const clean = input.trim() === '' ? '' : cleanServerUrl(input);
  if (clean === null) return false;
  memoryServer = clean || null;
  persistNative(SERVER_KEY, memoryServer);
  try {
    clean ? store()?.setItem(SERVER_KEY, clean) : store()?.removeItem(SERVER_KEY);
  } catch { /* ignore */ }
  return true;
}
export const savedServerUrl = () => store()?.getItem(SERVER_KEY) ?? memoryServer ?? '';

/** Cross-origin means cookies will not work, so a token is needed. */
export const usesBearer = () => isNativeApp() || apiBase() !== '';
/** Sent at sign-in so the server includes the token in its answer. */
export const clientKind = (): 'native' | undefined => (usesBearer() ? 'native' : undefined);

export const getToken = (): string | null => (usesBearer() ? (store()?.getItem(TOKEN_KEY) ?? memoryToken) : null);
export function setToken(token: string | null) {
  memoryToken = token;
  persistNative(TOKEN_KEY, token);
  try {
    token ? store()?.setItem(TOKEN_KEY, token) : store()?.removeItem(TOKEN_KEY);
  } catch { /* ignore */ }
}

/** "/api/x" → "https://server/api/x" when a server address is configured; unchanged otherwise. Absolute URLs pass through. */
export function apiUrl(path: string): string {
  return /^https?:\/\//i.test(path) ? path : `${apiBase()}${path}`;
}

/** fetch() for our own server. Adds the server address and, when needed, the bearer token. */
export function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = getToken();
  const headers = new Headers(init.headers);
  if (token && !headers.has('Authorization')) headers.set('Authorization', `Bearer ${token}`);
  return fetch(apiUrl(path), { ...init, headers });
}

/** Call after a sign-in response: keeps the token when the server sent one. */
export function rememberSession(body: { token?: string } | null | undefined) {
  if (usesBearer()) setToken(body?.token ?? null);
}
export const forgetSession = () => setToken(null);

/** Reads "#access=CODE" from the address, removes it from the address bar, and returns the code. */
export function takeAccessCodeFromUrl(): string | null {
  const m = /(?:^#|&)access=([A-Za-z0-9 -]{20,40})(?:&|$)/.exec(window.location.hash);
  if (!m) return null;
  try {
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
  } catch { /* ignore */ }
  return m[1];
}

/** Pulls a code out of whatever a person pasted: a full link, "access=CODE", or the bare code. */
export function parseAccessInput(text: string): string | null {
  const fromLink = /access=([A-Za-z0-9 -]{20,40})/.exec(text)?.[1];
  const code = (fromLink ?? text).replace(/[\s-]/g, '');
  return /^[A-Za-z0-9]{20}$/.test(code) ? code : null;
}
