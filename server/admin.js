import { apiError, modules, parseBody, requireAdmin, supabase, tableFor } from './supabase.js';

const allowedActions = ['start', 'batch', 'validate', 'publish', 'cancel', 'restore', 'history'];

export default async function handler(req, res) {
  const action = getAction(req);
  if (!allowedActions.includes(action)) return res.status(400).json({ error: 'Ação administrativa inválida.' });

  const user = await requireAdmin(req, res);
  if (!user) return;

  try {
    if (action === 'history') return await history(req, res);
    if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido.' });
    if (action === 'start') return await start(req, res, user);
    if (action === 'batch') return await batch(req, res);
    if (action === 'validate') return await validate(req, res);
    if (action === 'publish') return await publish(req, res);
    if (action === 'cancel') return await cancel(req, res);
    if (action === 'restore') return await restore(req, res);
    return res.status(400).json({ error: 'Ação administrativa inválida.' });
  } catch (e) {
    return apiError(res, e);
  }
}

async function start(req, res, user) {
  const p = parseBody(req);
  if (!modules.includes(p.module) || !p.fileName || !p.summary) {
    return res.status(400).json({ error: 'Importação inválida.' });
  }

  const id = crypto.randomUUID();
  const version = crypto.randomUUID();
  const [periodStart, periodEnd] = parsePeriod(p.summary.period);
  const record = {
    id,
    module: p.module,
    file_name: p.fileName,
    user_id: user.id,
    row_count: p.summary.rowCount,
    column_count: p.summary.columns?.length,
    total_value: p.summary.totalValue,
    period_start: periodStart,
    period_end: periodEnd,
    zero_values: p.summary.zeroValues,
    negative_values: p.summary.negativeValues,
    invalid_fields: (p.summary.invalidDates || 0) + (p.summary.invalidValues || 0),
    rejected_records: 0,
    expected_batches: p.expectedBatches,
    processed_batches: 0,
    status: 'processando',
    version_id: version,
    is_active: false,
    summary: p.summary,
  };
  await supabase('importacoes', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(record) });
  return res.status(201).json({ importId: id, versionId: version });
}

async function batch(req, res) {
  const p = parseBody(req);
  if (!p.importId || !Number.isInteger(p.batchNumber) || !Array.isArray(p.rows) || p.rows.length > 1000) {
    return res.status(400).json({ error: 'Lote inválido.' });
  }
  const { body: imports } = await supabase(`importacoes?id=eq.${encodeURIComponent(p.importId)}&select=*&limit=1`);
  const imp = imports?.[0];
  if (!imp || !['processando', 'erro'].includes(imp.status)) {
    return res.status(409).json({ error: 'Importação indisponível para lotes.' });
  }

  const rows = p.rows.map((data, index) => ({
    module: imp.module,
    import_id: imp.id,
    version_id: imp.version_id,
    is_active: false,
    batch_number: p.batchNumber,
    row_number: p.offset + index,
    data,
  }));
  await supabase(tableFor(imp.module), {
    method: 'POST',
    headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
    body: JSON.stringify(rows),
  });
  await supabase(`importacoes?id=eq.${imp.id}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ processed_batches: Math.max(imp.processed_batches || 0, p.batchNumber), status: 'processando', error_message: null }),
  });
  return res.status(200).json({ ok: true, batchNumber: p.batchNumber, accepted: rows.length });
}

async function validate(req, res) {
  const { importId } = parseBody(req);
  const { body: list } = await supabase(`importacoes?id=eq.${encodeURIComponent(importId)}&select=*&limit=1`);
  const imp = list?.[0];
  if (!imp) return res.status(404).json({ error: 'Importação não encontrada.' });

  const data = [];
  let from = 0;
  while (true) {
    const { body } = await supabase(`${tableFor(imp.module)}?import_id=eq.${imp.id}&select=data&order=row_number.asc`, {
      headers: { Range: `${from}-${from + 999}` },
    });
    data.push(...body.map((row) => row.data));
    if (body.length < 1000) break;
    from += 1000;
  }

  const stored = data.length;
  const valueColumn = imp.module === 'Recebido' ? 'Vr.recebido' : 'Valor total';
  const numbers = data.map((row) => numeric(row[valueColumn])).filter((value) => value !== null);
  const total = numbers.length ? numbers.reduce((sum, value) => sum + value, 0) : null;
  const totalsMatch = total === imp.summary.totalValue;
  const compatible = stored === imp.row_count && imp.processed_batches === imp.expected_batches && totalsMatch;
  const status = compatible ? 'pronto para publicar' : 'erro';
  const error = compatible ? null : 'Os dados gravados não correspondem à planilha. A versão anterior foi preservada.';

  await supabase(`importacoes?id=eq.${imp.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ stored_row_count: stored, status, error_message: error }),
  });
  return res.status(compatible ? 200 : 422).json({
    compatible,
    read: imp.row_count,
    stored,
    readTotal: imp.summary.totalValue,
    storedTotal: total,
    zeroValues: numbers.filter((value) => value === 0).length,
    negativeValues: numbers.filter((value) => value < 0).length,
    invalidFields: imp.invalid_fields,
    rejectedRecords: imp.rejected_records,
    batches: imp.processed_batches,
    expectedBatches: imp.expected_batches,
    error,
  });
}

async function publish(req, res) {
  const { importId } = parseBody(req);
  await supabase('rpc/activate_import', { method: 'POST', body: JSON.stringify({ target_id: importId, require_ready: true }) });
  return res.status(200).json({ message: 'Base atualizada e publicada com sucesso. Os novos dados já estão disponíveis para os visualizadores.' });
}

async function restore(req, res) {
  const { importId } = parseBody(req);
  await supabase('rpc/activate_import', { method: 'POST', body: JSON.stringify({ target_id: importId, require_ready: false }) });
  return res.status(200).json({ ok: true });
}

async function cancel(req, res) {
  const { importId } = parseBody(req);
  await supabase(`importacoes?id=eq.${encodeURIComponent(importId)}&is_active=eq.false`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'cancelado' }),
  });
  return res.status(200).json({ ok: true });
}

async function history(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método não permitido.' });
  const { body } = await supabase('importacoes?select=*&order=created_at.desc&limit=100');
  return res.status(200).json(body);
}

function getAction(req) {
  if (req.query?.action) return Array.isArray(req.query.action) ? req.query.action[0] : req.query.action;
  const host = req.headers.host || 'localhost';
  return new URL(req.url || '/api/admin', `http://${host}`).searchParams.get('action') || '';
}

function parsePeriod(period) {
  const iso = (value) => {
    const match = value?.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    return match ? `${match[3]}-${match[2]}-${match[1]}` : null;
  };
  const parts = period?.split(' a ') || [];
  return [iso(parts[0]), iso(parts[1])];
}

function numeric(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string' || !value.trim()) return null;
  const clean = value.replace(/R\$/gi, '').replace(/\s/g, '');
  const comma = clean.lastIndexOf(',');
  const dot = clean.lastIndexOf('.');
  const decimal = comma > dot ? ',' : '.';
  const normalized = clean.replace(decimal === ',' ? /\./g : /,/g, '').replace(decimal, '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}
