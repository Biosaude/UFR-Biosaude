import { del, list, put } from '@vercel/blob';

const MODULES = ['Utilizado', 'Faturado', 'Recebido'];
const memoryFallback = globalThis.__ufrPersistentBases ??= {};

function blobTokenAvailable() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

function assertBlobConfiguration() {
  if (!blobTokenAvailable() && (process.env.BLOB_STORE_ID || process.env.BLOB_WEBHOOK_PUBLIC_KEY)) {
    throw new Error('O Vercel Blob está vinculado, mas a credencial BLOB_READ_WRITE_TOKEN não está disponível neste deployment.');
  }
}

export default async function handler(request, response) {
  if (request.method === 'GET') {
    try {
      if (request.query.history) return response.status(200).json(await readHistory(request.query.history));
      const result = {};
      for (const module of MODULES) {
        const value = await readLatest(module);
        if (value) result[module] = value;
      }
      if (!Object.keys(result).length) return response.status(404).json({});
      return response.status(200).json(result);
    } catch (error) { return response.status(500).json({ error: safeMessage(error) }); }
  }
  if (request.method === 'PATCH') {
    if (!authorized(request)) return response.status(401).json({ error: 'Usuário sem autorização para restaurar bases.' });
    try { await restoreVersion(request.query.module, request.query.version); return response.status(200).json({ ok: true }); }
    catch (error) { return response.status(500).json({ error: safeMessage(error) }); }
  }
  if (request.method === 'DELETE') {
    if (!authorized(request)) return response.status(401).json({ error: 'Usuário sem autorização para excluir bases.' });
    try { await deleteCurrent(request.query.module); return response.status(200).json({ ok: true }); }
    catch (error) { return response.status(500).json({ error: safeMessage(error) }); }
  }
  if (request.method !== 'POST') return response.status(405).json({ error: 'Método não permitido.' });
  if (!authorized(request)) return response.status(401).json({ error: 'Usuário sem autorização para substituir bases.' });
  const module = request.query.module;
  if (!MODULES.includes(module)) return response.status(400).json({ error: 'Módulo inválido.' });
  try {
    const payload = typeof request.body === 'string' ? JSON.parse(request.body) : request.body;
    if (!payload || payload.module !== module || !payload.blobUrl) return response.status(400).json({ error: 'Conteúdo da base inválido.' });
    const audit = { date: new Date().toISOString(), user: decodeURIComponent(request.headers['x-ufr-user'] ?? 'Administrador'), module, fileName: payload.report?.fileName, rows: payload.rowCount, version: payload.version, fileHash: payload.fileHash, blobUrl: payload.blobUrl };
    await writeVersion(module, payload, audit);
    return response.status(200).json({ ok: true, version: payload.version });
  } catch (error) { return response.status(500).json({ error: safeMessage(error) }); }
}

function authorized(request) { const expected = process.env.UFR_ADMIN_TOKEN; return !!expected && request.headers.authorization === `Bearer ${expected}`; }
function safeMessage(error) { return error instanceof Error ? error.message : 'Falha no armazenamento persistente.'; }

async function readLatest(module) {
  assertBlobConfiguration();
  if (!blobTokenAvailable()) return memoryFallback[module]?.latest ?? null;
  const blobs = await listBlobs(`ufr/${module}/latest.json`);
  if (!blobs.length) return null;
  const latest = await fetch(blobs[0].url, { cache: 'no-store' });
  return latest.ok ? latest.json() : null;
}

async function writeVersion(module, payload, audit) {
  assertBlobConfiguration();
  const reference = { blobUrl: payload.blobUrl, version: payload.version, updated: payload.updated, updatedBy: payload.updatedBy };
  if (!blobTokenAvailable()) { memoryFallback[module] = { latest: reference, versions: { ...(memoryFallback[module]?.versions ?? {}), [payload.version]: reference }, history: [...(memoryFallback[module]?.history ?? []), audit] }; return; }
  await putBlob(`ufr/${module}/latest.json`, reference, true);
  await putBlob(`ufr/${module}/audit/${payload.version}.json`, audit, false);
}

async function readHistory(module) {
  if (!MODULES.includes(module)) throw new Error('Módulo inválido.');
  assertBlobConfiguration();
  if (!blobTokenAvailable()) return memoryFallback[module]?.history ?? [];
  const blobs = await listBlobs(`ufr/${module}/audit/`);
  return Promise.all(blobs.map(async (blob) => (await fetch(blob.url, { cache: 'no-store' })).json()));
}

async function restoreVersion(module, version) {
  if (!MODULES.includes(module) || !version) throw new Error('Versão inválida.');
  assertBlobConfiguration();
  if (!blobTokenAvailable()) { const versionEntry = memoryFallback[module]?.versions?.[version]; if (!versionEntry) throw new Error('Versão não encontrada.'); memoryFallback[module].latest = versionEntry; return; }
  const blobs = await listBlobs(`ufr/${module}/versions/${version}.json`);
  if (!blobs.length) throw new Error('Versão não encontrada.');
  const reference = { blobUrl: blobs[0].url, version };
  await putBlob(`ufr/${module}/latest.json`, reference, true);
}

async function deleteCurrent(module) {
  if (!MODULES.includes(module)) throw new Error('Módulo inválido.');
  assertBlobConfiguration();
  if (!blobTokenAvailable()) { delete memoryFallback[module]; return; }
  const blobs = await listBlobs(`ufr/${module}/latest.json`);
  if (blobs.length) await del(blobs.map((blob) => blob.url));
}

async function listBlobs(prefix) {
  return (await list({ prefix, limit: 1000 })).blobs;
}

async function putBlob(pathname, value, overwrite) {
  await put(pathname, JSON.stringify(value), { access: 'public', addRandomSuffix: false, allowOverwrite: overwrite, contentType: 'application/json' });
}
