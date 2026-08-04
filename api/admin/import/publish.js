import { apiError, parseBody, requireAdmin, supabase } from '../../_lib/supabase.js';
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido.' }); if (!await requireAdmin(req, res)) return;
  try {
    const { importId } = parseBody(req); await supabase('rpc/activate_import', { method: 'POST', body: JSON.stringify({ target_id: importId, require_ready: true }) });
    return res.status(200).json({ message: 'Base atualizada e publicada com sucesso. Os novos dados já estão disponíveis para os visualizadores.' });
  } catch (e) { return apiError(res, e); }
}
