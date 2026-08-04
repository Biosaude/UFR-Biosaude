import { apiError, supabase, tableFor } from './_lib/supabase.js';

const modules = { utilizado: 'Utilizado', faturado: 'Faturado', recebido: 'Recebido' };
const views = ['overview', 'updates', ...Object.keys(modules)];

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método não permitido.' });

  const view = getView(req);
  if (!views.includes(view)) return res.status(400).json({ error: 'Consulta pública inválida.' });

  try {
    if (view === 'overview') return await overview(res);
    if (view === 'updates') return await updates(res);
    return await readModule(modules[view], res);
  } catch (e) {
    return apiError(res, e);
  }
}

async function overview(res) {
  const { body } = await supabase(
    'importacoes?is_active=eq.true&status=eq.publicado&select=module,version_id,published_at,row_count,total_value,summary&order=module.asc',
  );
  return res.status(200).json(body);
}

async function updates(res) {
  const { body } = await supabase(
    'importacoes?is_active=eq.true&status=eq.publicado&select=module,version_id,published_at,row_count&order=module.asc',
  );
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=15');
  return res.status(200).json(body);
}

async function readModule(module, res) {
  const { body: active } = await supabase(
    `importacoes?module=eq.${module}&is_active=eq.true&status=eq.publicado&select=id,version_id,module,file_name,row_count,column_count,total_value,summary,published_at&limit=1`,
  );
  const current = active?.[0];
  if (!current) return res.status(200).json({ module, rows: [], columns: [], report: null, updated: null, versionId: null });

  const rows = [];
  let from = 0;
  while (true) {
    const { body } = await supabase(`${tableFor(module)}?version_id=eq.${current.version_id}&is_active=eq.true&select=data&order=row_number.asc`, {
      headers: { Range: `${from}-${from + 999}` },
    });
    rows.push(...body.map((item) => item.data));
    if (body.length < 1000) break;
    from += 1000;
  }

  return res.status(200).json({
    module,
    rows,
    columns: current.summary?.columns || Object.keys(rows[0] || {}),
    report: current.summary,
    updated: current.published_at,
    versionId: current.version_id,
  });
}

function getView(req) {
  if (req.query?.view) return Array.isArray(req.query.view) ? req.query.view[0] : req.query.view;
  if (req.query?.module) return Array.isArray(req.query.module) ? req.query.module[0] : req.query.module;
  const host = req.headers.host || 'localhost';
  const url = new URL(req.url || '/api/dashboard', `http://${host}`);
  return url.searchParams.get('view') || url.searchParams.get('module') || '';
}
