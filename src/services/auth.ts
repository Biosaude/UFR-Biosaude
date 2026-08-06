export interface AuthSession {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  user: { id: string; email?: string };
}

type SupabaseAuthResponse = { response: Response; body: AuthSession & { expires_in: number } };
type RuntimeAuthConfig = { configured: boolean; url?: string; anonKey?: string };

const key = 'ufr-admin-session';
const envSupabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const envSupabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();
let runtimeConfigPromise: Promise<RuntimeAuthConfig> | null = null;
let supabaseClient: ReturnType<typeof createClient> | null = null;

function createClient(url: string, anonKey: string) {
  const request = async (path: string, init: RequestInit): Promise<SupabaseAuthResponse> => {
    const response = await fetch(`${url}${path}`, {
      ...init,
      headers: { apikey: anonKey, 'Content-Type': 'application/json', ...init.headers },
    });
    const body = await response.json().catch(() => ({}));
    return { response, body };
  };

  return {
    auth: {
      async signInWithPassword(credentials: { email: string; password: string }) {
        return request('/auth/v1/token?grant_type=password', {
          method: 'POST',
          body: JSON.stringify(credentials),
        });
      },
      async refreshSession(refreshToken: string) {
        return request('/auth/v1/token?grant_type=refresh_token', {
          method: 'POST',
          body: JSON.stringify({ refresh_token: refreshToken }),
        });
      },
      async signOut(accessToken: string) {
        return request('/auth/v1/logout', {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}` },
        });
      },
    },
  };
}

const supabaseFromEnv = envSupabaseUrl && envSupabaseAnonKey
  ? createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY)
  : null;

async function readRuntimeConfig() {
  if (!runtimeConfigPromise) {
    runtimeConfigPromise = fetch('/api?scope=auth', { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : { configured: false }))
      .catch(() => ({ configured: false }));
  }
  return runtimeConfigPromise;
}

async function getSupabase() {
  if (supabaseFromEnv) return supabaseFromEnv;
  if (supabaseClient) return supabaseClient;

  const runtime = await readRuntimeConfig();
  const url = runtime.url?.trim();
  const anonKey = runtime.anonKey?.trim();
  if (!runtime.configured || !url || !anonKey) throw new Error('Autenticação não configurada.');

  supabaseClient = createClient(url, anonKey);
  return supabaseClient;
}

export const getStoredSession = () => {
  try {
    return JSON.parse(localStorage.getItem(key) || 'null') as AuthSession | null;
  } catch {
    return null;
  }
};

const save = (data: AuthSession & { expires_in: number }): AuthSession => {
  const session = { ...data, expires_at: Math.floor(Date.now() / 1000) + data.expires_in };
  localStorage.setItem(key, JSON.stringify(session));
  return session;
};

export async function signIn(email: string, password: string) {
  const supabase = await getSupabase();
  const { response, body } = await supabase.auth.signInWithPassword({ email, password });
  if (!response.ok) throw new Error('E-mail ou senha inválidos.');
  return save(body);
}

export async function validSession() {
  let session = getStoredSession();
  if (!session) return null;

  const supabase = await getSupabase();
  if (session.expires_at > Date.now() / 1000 + 60) return session;

  const { response, body } = await supabase.auth.refreshSession(session.refresh_token);
  if (!response.ok) {
    localStorage.removeItem(key);
    return null;
  }
  session = save(body);
  return session;
}

export async function signOut() {
  const session = getStoredSession();
  if (!session) {
    localStorage.removeItem(key);
    return;
  }

  const supabase = await getSupabase();
  await supabase.auth.signOut(session.access_token).catch(() => null);
  localStorage.removeItem(key);
}

export async function adminFetch(path: string, init: RequestInit = {}) {
  const session = await validSession();
  if (!session) throw new Error('Sua sessão expirou. Entre novamente.');
  return fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}`, ...init.headers },
  });
}
