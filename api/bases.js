import { del, list, put } from '@vercel/blob';

const MODULES = ['Utilizado', 'Faturado', 'Recebido'];
const memoryFallback = globalThis.__ufrPersistentBases ??= {};
const blobToken = () => process.env.ufrdabiosaude_READ_WRITE_TOKEN;

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
    try { await restoreVersion(request.query.module, request.query.version); return response.status(200).json({ ok: true }); }
    catch (error) { return response.status(500).json({ error: safeMessage(error) }); }
  }
  if (request.method === 'DELETE') {
    try { await deleteCurrent(request.query.module); return response.status(200).json({ ok: true }); }
    catch (error) { return response.status(500).json({ error: safeMessage(error) }); }
  }
  if (request.method !== 'POST') return response.status(405).json({ error: 'Método não permitido.' });
  const module = request.query.module;
  if (!MODULES.includes(module)) return response.status(400).json({ error: 'Módulo inválido.' });
  try {
    const payload = typeof request.body === 'string' ? JSON.parse(request.body) : request.body;
    if (!payload || payload.module !== module || !payload.blobUrl) return response.status(400).json({ error: 'Conteúdo da base inválido.' });
    const audit = { date: new Date().toISOString(), module, fileName: payload.report?.fileName, rows: payload.rowCount, version: payload.version, fileHash: payload.fileHash, blobUrl: payload.blobUrl, sourceBlobUrl: payload.sourceBlobUrl };
    await writeVersion(module, payload, audit);
    return response.status(200).json({ ok: true, version: payload.version });
  } catch (error) { return response.status(500).json({ error: safeMessage(error) }); }
}

function safeMessage(error) { return error instanceof Error ? error.message : 'Falha no armazenamento persistente.'; }

async function readLatest(module) {
  const token = blobToken();
  if (!token) return memoryFallback[module]?.latest ?? null;
  const blobs = await listBlobs(`ufr/${module}/latest.json`);
  if (!blobs.length) return null;
  const latest = await privateBlobJson(blobs[0].url, token);
  if (!latest?.blobUrl) return null;
  return privateBlobJson(latest.blobUrl, token);
}

async function writeVersion(module, payload, audit) {
  const token = blobToken();
  const reference = { blobUrl: payload.blobUrl, version: payload.version, updated: payload.updated, updatedBy: payload.updatedBy };
  if (!token) { memoryFallback[module] = { latest: reference, versions: { ...(memoryFallback[module]?.versions ?? {}), [payload.version]: reference }, history: [...(memoryFallback[module]?.history ?? []), audit] }; return; }
  await putBlob(`ufr/${module}/latest.json`, reference, true);
  await putBlob(`ufr/${module}/audit/${payload.version}.json`, audit, false);
}

async function readHistory(module) {
  if (!MODULES.includes(module)) throw new Error('Módulo inválido.');
  const token = blobToken();
  if (!token) return memoryFallback[module]?.history ?? [];
  const blobs = await listBlobs(`ufr/${module}/audit/`);
  return Promise.all(blobs.map((blob) => privateBlobJson(blob.url, token)));
}

async function restoreVersion(module, version) {
  if (!MODULES.includes(module) || !version) throw new Error('Versão inválida.');
  const token = blobToken();
  if (!token) { const versionEntry = memoryFallback[module]?.versions?.[version]; if (!versionEntry) throw new Error('Versão não encontrada.'); memoryFallback[module].latest = versionEntry; return; }
  const audits = await listBlobs(`ufr/${module}/audit/${version}.json`);
  if (!audits.length) throw new Error('Versão não encontrada.');
  const audit = await privateBlobJson(audits[0].url, token);
  if (!audit.blobUrl) throw new Error('Referência da versão não encontrada.');
  const reference = { blobUrl: audit.blobUrl, version };
  await putBlob(`ufr/${module}/latest.json`, reference, true);
}

async function deleteCurrent(module) {
  if (!MODULES.includes(module)) throw new Error('Módulo inválido.');
  const token = blobToken();
  if (!token) { delete memoryFallback[module]; return; }
  const blobs = await listBlobs(`ufr/${module}/latest.json`);
  if (blobs.length) await del(blobs.map((blob) => blob.url), { token });
}

async function listBlobs(prefix) {
  return (await list({ prefix, limit: 1000, token: blobToken() })).blobs;
}

async function putBlob(pathname, value, overwrite) {
  await put(pathname, JSON.stringify(value), { access: 'private', addRandomSuffix: false, allowOverwrite: overwrite, contentType: 'application/json', token: blobToken() });
}

async function privateBlobJson(url, token) {
  const result = await fetch(url, { cache: 'no-store', headers: { authorization: `Bearer ${token}` } });
  if (!result.ok) throw new Error(`Falha ao ler blob privado (${result.status}).`);
  return result.json();
}
