import type { SourceModule, ValidationReport, DataRow } from '../types';
import { upload } from '@vercel/blob/client';

export interface PersistedModule {
  module: SourceModule;
  rows: DataRow[];
  columns: string[];
  report: ValidationReport;
  updated: Date;
  updatedBy?: string;
  version: string;
  fileHash: string;
  sourceBlobUrl?: string;
  persistence?: 'shared' | 'browser';
}

interface StoredPayload extends Omit<PersistedModule, 'updated'> { updated: string }

export async function loadPersistentBases(): Promise<Partial<Record<SourceModule, PersistedModule>>> {
  try {
    const response = await fetch('/api/bases');
    if (response.status === 404 || response.status === 503) return loadBrowserBases();
    if (!response.ok) throw new Error('Não foi possível consultar as bases persistidas.');
    const manifests = await response.json() as Partial<Record<SourceModule, StoredPayload | { blobUrl: string }>>;
    const entries = await Promise.all(Object.entries(manifests).map(async ([module, item]) => { if ('blobUrl' in item!) throw new Error('Manifesto legado incompatível com armazenamento privado.'); const stored = item as StoredPayload; return [module, { ...stored, updated: new Date(stored.updated), persistence: 'shared' as const }] as const; }));
    const shared = Object.fromEntries(entries) as Partial<Record<SourceModule, PersistedModule>>;
    return mergeLatest(shared, await loadBrowserBases());
  } catch {
    return loadBrowserBases();
  }
}

export async function persistBase(input: { module: SourceModule; rows: DataRow[]; columns: string[]; report: ValidationReport; file: File }): Promise<PersistedModule> {
  const fileHash = await sha256(input.file);
  const version = `${new Date().toISOString()}-${fileHash.slice(0, 12)}`;
  const payload: StoredPayload = { module: input.module, rows: input.rows, columns: input.columns, report: input.report, updated: new Date().toISOString(), version, fileHash };
  try {
    const safeFileName = input.file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const sourceBlob = await upload(`ufr/${input.module}/sources/${version}-${safeFileName}`, input.file, { access: 'private', handleUploadUrl: '/api/blob/upload', clientPayload: JSON.stringify({ module: input.module, artifact: 'source' }) });
    const storedPayload = { ...payload, sourceBlobUrl: sourceBlob.url };
    const blob = await upload(`ufr/${input.module}/versions/${version}.json`, new Blob([JSON.stringify(storedPayload)], { type: 'application/json' }), { access: 'private', handleUploadUrl: '/api/blob/upload', clientPayload: JSON.stringify({ module: input.module, artifact: 'normalized' }) });
    const response = await fetch(`/api/bases?module=${encodeURIComponent(input.module)}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ module: input.module, version, fileHash, blobUrl: blob.url, sourceBlobUrl: sourceBlob.url, report: input.report, rowCount: input.rows.length, updated: payload.updated }) });
    if (!response.ok) throw new Error((await response.json().catch(() => null))?.error ?? 'Não foi possível persistir a base no armazenamento compartilhado.');
    return { ...storedPayload, updated: new Date(payload.updated), persistence: 'shared' };
  } catch (error) {
    throw new Error(error instanceof Error ? `Falha ao persistir no Vercel Blob: ${error.message}. A base anterior foi preservada.` : 'Falha ao persistir no Vercel Blob. A base anterior foi preservada.');
  }
}

async function sha256(file: File) {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

const DATABASE_NAME = 'ufr-dashboard';
const STORE_NAME = 'module-bases';

async function loadBrowserBases(): Promise<Partial<Record<SourceModule, PersistedModule>>> {
  if (!('indexedDB' in globalThis)) return {};
  const database = await openDatabase();
  const rows = await new Promise<PersistedModule[]>((resolve, reject) => { const request = database.transaction(STORE_NAME).objectStore(STORE_NAME).getAll(); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
  database.close();
  return Object.fromEntries(rows.map((row) => [row.module, { ...row, updated: new Date(row.updated), persistence: 'browser' }]));
}

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => { const request = indexedDB.open(DATABASE_NAME, 1); request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME); }; request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
}

function mergeLatest(shared: Partial<Record<SourceModule, PersistedModule>>, browser: Partial<Record<SourceModule, PersistedModule>>) {
  const merged = { ...shared };
  (['Utilizado', 'Faturado', 'Recebido'] as SourceModule[]).forEach((module) => { const local = browser[module]; const remote = shared[module]; if (local && (!remote || local.updated > remote.updated)) merged[module] = local; });
  return merged;
}
