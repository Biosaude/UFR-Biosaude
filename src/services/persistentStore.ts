import type { SourceModule, ValidationReport, DataRow } from '../types';
import { upload } from '@vercel/blob/client';

export interface PersistedModule {
  module: SourceModule;
  rows: DataRow[];
  columns: string[];
  report: ValidationReport;
  updated: Date;
  updatedBy: string;
  version: string;
  fileHash: string;
}

interface StoredPayload extends Omit<PersistedModule, 'updated'> { updated: string }

export async function loadPersistentBases(): Promise<Partial<Record<SourceModule, PersistedModule>>> {
  const response = await fetch('/api/bases');
  if (response.status === 404 || response.status === 503) return {};
  if (!response.ok) throw new Error('Não foi possível consultar as bases persistidas.');
  const manifests = await response.json() as Partial<Record<SourceModule, StoredPayload | { blobUrl: string }>>;
  const entries = await Promise.all(Object.entries(manifests).map(async ([module, item]) => { const stored = 'blobUrl' in item! ? await (await fetch(item.blobUrl, { cache: 'no-store' })).json() as StoredPayload : item as StoredPayload; return [module, { ...stored, updated: new Date(stored.updated) }] as const; }));
  return Object.fromEntries(entries) as Partial<Record<SourceModule, PersistedModule>>;
}

export async function persistBase(input: { module: SourceModule; rows: DataRow[]; columns: string[]; report: ValidationReport; file: File; user: string; adminToken: string }): Promise<PersistedModule> {
  const fileHash = await sha256(input.file);
  const version = `${new Date().toISOString()}-${fileHash.slice(0, 12)}`;
  const payload: StoredPayload = { module: input.module, rows: input.rows, columns: input.columns, report: input.report, updated: new Date().toISOString(), updatedBy: input.user, version, fileHash };
  const blob = await upload(`ufr/${input.module}/versions/${version}.json`, new Blob([JSON.stringify(payload)], { type: 'application/json' }), { access: 'public', handleUploadUrl: '/api/upload', clientPayload: JSON.stringify({ module: input.module, user: input.user, adminToken: input.adminToken }) });
  const response = await fetch(`/api/bases?module=${encodeURIComponent(input.module)}`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${input.adminToken}`, 'x-ufr-user': encodeURIComponent(input.user) }, body: JSON.stringify({ module: input.module, version, fileHash, blobUrl: blob.url, report: input.report, rowCount: input.rows.length, updated: payload.updated, updatedBy: input.user }) });
  if (response.status === 401) throw new Error('Usuário sem autorização para substituir bases.');
  if (!response.ok) throw new Error((await response.json().catch(() => null))?.error ?? 'Não foi possível persistir a base no armazenamento corporativo.');
  return { ...payload, updated: new Date(payload.updated) };
}

async function sha256(file: File) {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
