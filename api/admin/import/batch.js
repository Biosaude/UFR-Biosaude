import { apiError, parseBody, requireAdmin, supabase, tableFor } from '../../_lib/supabase.js';
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido.' });
  if (!await requireAdmin(req, res)) return;
  try {
    const p = parseBody(req); if (!p.importId || !Number.isInteger(p.batchNumber) || !Array.isArray(p.rows) || p.rows.length > 1000) return res.status(400).json({ error: 'Lote inválido.' });
    const { body: imports } = await supabase(`importacoes?id=eq.${encodeURIComponent(p.importId)}&select=*&limit=1`); const imp = imports?.[0];
    if (!imp || !['processando', 'erro'].includes(imp.status)) return res.status(409).json({ error: 'Importação indisponível para lotes.' });
    const rows = p.rows.map((data, index) => ({ module: imp.module, import_id: imp.id, version_id: imp.version_id, is_active: false, batch_number: p.batchNumber, row_number: p.offset + index, data }));
    await supabase(tableFor(imp.module), { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' }, body: JSON.stringify(rows) });
    await supabase(`importacoes?id=eq.${imp.id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ processed_batches: Math.max(imp.processed_batches || 0, p.batchNumber), status: 'processando', error_message: null }) });
    return res.status(200).json({ ok: true, batchNumber: p.batchNumber, accepted: rows.length });
  } catch (e) { return apiError(res, e); }
}
