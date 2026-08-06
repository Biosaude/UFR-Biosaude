import { apiError, supabase, tableFor } from '../_lib/supabase.js';

export async function readModule(module, req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método não permitido.' });
  try {
    const { body: active } = await supabase(`importacoes?module=eq.${module}&is_active=eq.true&status=eq.publicado&select=id,version_id,module,file_name,row_count,column_count,total_value,summary,published_at&limit=1`);
    const current = active?.[0]; if (!current) return res.status(200).json({ module, rows: [], columns: [], report: null, updated: null, versionId: null });
    const rows = []; let from = 0;
    while (true) { const { body } = await supabase(`${tableFor(module)}?version_id=eq.${current.version_id}&is_active=eq.true&select=data&order=row_number.asc`, { headers: { Range: `${from}-${from + 999}` } }); rows.push(...body.map((item) => item.data)); if (body.length < 1000) break; from += 1000; }
    return res.status(200).json({ module, rows, columns: current.summary?.columns || Object.keys(rows[0] || {}), report: current.summary, updated: current.published_at, versionId: current.version_id });
  } catch (e) { return apiError(res, e); }
}
