const supabaseUrl = () => process.env.VITE_SUPABASE_URL;
const anonKey = () => process.env.VITE_SUPABASE_ANON_KEY;
const serviceKey = () => process.env.SUPABASE_SERVICE_ROLE_KEY;

export function configured() {
  return Boolean(supabaseUrl() && anonKey() && serviceKey());
}

export async function supabase(path, options = {}) {
  if (!configured()) throw new Error('Supabase não configurado no servidor.');
  const response = await fetch(`${supabaseUrl()}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: serviceKey(),
      Authorization: `Bearer ${serviceKey()}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(body?.message || body?.error || 'Falha ao consultar o banco de dados.');
  return { body, headers: response.headers };
}

export async function requireAdmin(request, response) {
  const bearer = request.headers.authorization;
  if (!bearer?.startsWith('Bearer ') || !configured()) {
    response.status(401).json({ error: 'Unauthorized' });
    return null;
  }
  const token = bearer.slice(7);
  const auth = await fetch(`${supabaseUrl()}/auth/v1/user`, {
    headers: { apikey: anonKey(), Authorization: `Bearer ${token}` },
  });
  if (!auth.ok) {
    response.status(401).json({ error: 'Unauthorized' });
    return null;
  }
  const user = await auth.json();
  const { body } = await supabase(
    `usuarios?auth_user_id=eq.${encodeURIComponent(user.id)}&role=eq.admin&select=id,auth_user_id,role&limit=1`,
  );
  if (!body?.length) {
    response.status(403).json({ error: 'Forbidden' });
    return null;
  }
  return user;
}

export const parseBody = (request) => (typeof request.body === 'string' ? JSON.parse(request.body) : request.body || {});
export const modules = ['Utilizado', 'Faturado', 'Recebido'];
export const tableFor = (module) => ({ Utilizado: 'utilizado', Faturado: 'faturado', Recebido: 'recebido' })[module];
export function apiError(response, error) {
  return response.status(500).json({ error: error instanceof Error ? error.message : 'Erro interno.' });
}
