import { apiError, parseBody, requireAdmin, supabase, tableFor } from '../../_lib/supabase.js';
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido.' }); if (!await requireAdmin(req, res)) return;
  try {
    const { importId } = parseBody(req); const { body: list } = await supabase(`importacoes?id=eq.${encodeURIComponent(importId)}&select=*&limit=1`); const imp = list?.[0]; if (!imp) return res.status(404).json({ error: 'Importação não encontrada.' });
    const data = []; let from = 0; while (true) { const { body } = await supabase(`${tableFor(imp.module)}?import_id=eq.${imp.id}&select=data&order=row_number.asc`, { headers: { Range: `${from}-${from + 999}` } }); data.push(...body.map((row) => row.data)); if (body.length < 1000) break; from += 1000; }
    const stored = data.length, valueColumn = imp.module === 'Recebido' ? 'Vr.recebido' : 'Valor total';
    const numbers = data.map((row) => numeric(row[valueColumn])).filter((value) => value !== null); const total = numbers.length ? numbers.reduce((sum, value) => sum + value, 0) : null;
    const totalsMatch = total === imp.summary.totalValue; const compatible = stored === imp.row_count && imp.processed_batches === imp.expected_batches && totalsMatch;
    const status = compatible ? 'pronto para publicar' : 'erro'; const error = compatible ? null : 'Os dados gravados não correspondem à planilha. A versão anterior foi preservada.';
    await supabase(`importacoes?id=eq.${imp.id}`, { method: 'PATCH', body: JSON.stringify({ stored_row_count: stored, status, error_message: error }) });
    return res.status(compatible ? 200 : 422).json({ compatible, read: imp.row_count, stored, readTotal: imp.summary.totalValue, storedTotal: total, zeroValues: numbers.filter((value) => value === 0).length, negativeValues: numbers.filter((value) => value < 0).length, invalidFields: imp.invalid_fields, rejectedRecords: imp.rejected_records, batches: imp.processed_batches, expectedBatches: imp.expected_batches, error });
  } catch (e) { return apiError(res, e); }
}
function numeric(value) { if (typeof value === 'number' && Number.isFinite(value)) return value; if (typeof value !== 'string' || !value.trim()) return null; const clean = value.replace(/R\$/gi, '').replace(/\s/g, ''); const comma = clean.lastIndexOf(','), dot = clean.lastIndexOf('.'), decimal = comma > dot ? ',' : '.', normalized = clean.replace(decimal === ',' ? /\./g : /,/g, '').replace(decimal, '.'); const parsed = Number(normalized); return Number.isFinite(parsed) ? parsed : null; }
