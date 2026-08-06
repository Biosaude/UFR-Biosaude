import { apiError, modules, parseBody, requireAdmin, supabase } from '../../_lib/supabase.js';
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido.' });
  const user = await requireAdmin(req, res); if (!user) return;
  try {
    const p = parseBody(req); if (!modules.includes(p.module) || !p.fileName || !p.summary) return res.status(400).json({ error: 'Importação inválida.' });
    const id = crypto.randomUUID(), version = crypto.randomUUID();
    const [periodStart, periodEnd] = parsePeriod(p.summary.period);
    const record = { id, module: p.module, file_name: p.fileName, user_id: user.id, row_count: p.summary.rowCount, column_count: p.summary.columns?.length, total_value: p.summary.totalValue, period_start: periodStart, period_end: periodEnd, zero_values: p.summary.zeroValues, negative_values: p.summary.negativeValues, invalid_fields: (p.summary.invalidDates || 0) + (p.summary.invalidValues || 0), rejected_records: 0, expected_batches: p.expectedBatches, processed_batches: 0, status: 'processando', version_id: version, is_active: false, summary: p.summary };
    await supabase('importacoes', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(record) });
    return res.status(201).json({ importId: id, versionId: version });
  } catch (e) { return apiError(res, e); }
}
function parsePeriod(period) { const iso = (value) => { const match = value?.match(/^(\d{2})\/(\d{2})\/(\d{4})$/); return match ? `${match[3]}-${match[2]}-${match[1]}` : null; }; const parts = period?.split(' a ') || []; return [iso(parts[0]), iso(parts[1])]; }
