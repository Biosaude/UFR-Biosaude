import * as XLSX from 'xlsx';
import type { DataRow, ValidationReport } from '../types';

export const UTILIZADO_COLUMNS = {
  scheduleType: 'Tipo Agendamento',
  voucherType: 'Tipo do Vale',
  voucherStatus: 'Situação do Vale',
  surgeryDate: 'Data da Cirurgia',
  hospitalState: 'UF do Hospital',
  totalValue: 'Valor total',
  hospital: 'Hospital',
  billingClient: 'Cliente de Faturamento',
  clientState: 'UF do Cliente',
  clientCode: 'Código Cliente',
  doctor: 'Médico',
  mainRepresentative: 'Representante Principal',
  patient: 'Paciente',
  surgeryType: 'Tipo da Cirurgia',
  voucherBillingDate: 'Data Faturamento Vale',
  productCode: 'Código Produto',
  product: 'Produto',
  brand: 'Marca',
  productTopic: 'Tópico do Produto',
} as const;

export type UtilizadoColumnKey = keyof typeof UTILIZADO_COLUMNS;
export type UtilizadoColumnMap = Partial<Record<UtilizadoColumnKey, string>>;

const normalize = (value: string) => String(value).trim().replace(/\s+/g, ' ').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

export function resolveUtilizadoColumns(columns: string[]): UtilizadoColumnMap {
  const byNormalizedName = new Map(columns.map((column) => [normalize(column), column]));
  return Object.fromEntries(Object.entries(UTILIZADO_COLUMNS).flatMap(([key, expected]) => {
    const original = byNormalizedName.get(normalize(expected));
    return original ? [[key, original]] : [];
  })) as UtilizadoColumnMap;
}

export async function inspectWorkbook(file: File): Promise<{ rows: DataRow[]; report: ValidationReport }> {
  const started = performance.now();
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
  const sheetName = workbook.SheetNames.find((name) => name.trim() === 'Utilizado');
  if (!sheetName) throw new Error('A aba obrigatória “Utilizado” não foi encontrada.');

  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[sheetName], { defval: null, raw: true });
  const columns = raw.length ? Object.keys(raw[0]) : [];
  const rows = raw.map((row) => Object.fromEntries(columns.map((column) => [column, validCell(row[column])]))) as DataRow[];
  const mapped = resolveUtilizadoColumns(columns);
  const dateColumn = mapped.surgeryDate;
  const valueColumn = mapped.totalValue;
  const emptyCells = rows.reduce((total, row) => total + columns.filter((column) => row[column] === null || row[column] === '').length, 0);
  const fingerprints = rows.map((row) => JSON.stringify(row));
  const fingerprintCounts = new Map<string, number>();
  fingerprints.forEach((fingerprint) => fingerprintCounts.set(fingerprint, (fingerprintCounts.get(fingerprint) ?? 0) + 1));
  const duplicateGroups = [...fingerprintCounts.values()].filter((count) => count > 1).length;
  const duplicateRows = fingerprints.length - fingerprintCounts.size;
  const invalidDates = dateColumn ? rows.filter((row) => row[dateColumn] !== null && !toDate(row[dateColumn])).length : 0;
  const invalidValues = valueColumn ? rows.filter((row) => row[valueColumn] !== null && typeof toNumber(row[valueColumn]) !== 'number').length : 0;
  const dates = dateColumn ? rows.map((row) => toDate(row[dateColumn])).filter((date): date is Date => !!date).sort((a, b) => +a - +b) : [];
  const monetaryValues = valueColumn ? rows.map((row) => toNumber(row[valueColumn])).filter((value): value is number => value !== null) : [];
  const distinct = (column?: string) => column ? new Set(rows.map((row) => row[column]).filter((value) => value !== null && String(value).trim() !== '')).size : null;
  const errors: string[] = [];
  if (!rows.length) errors.push('A aba Utilizado não possui registros.');
  if (!columns.length) errors.push('Não foi possível identificar colunas na aba Utilizado.');
  if (!dateColumn) errors.push('A coluna obrigatória “Data da Cirurgia” não foi encontrada.');
  if (!valueColumn) errors.push('A coluna obrigatória “Valor total” não foi encontrada.');

  return {
    rows,
    report: {
      fileName: file.name, sheetNames: workbook.SheetNames, rowCount: rows.length, columns,
      emptyCells, duplicateRows, invalidDates, invalidValues,
      period: dates.length ? `${formatDate(dates[0])} a ${formatDate(dates.at(-1)!)}` : null,
      totalValue: monetaryValues.length ? monetaryValues.reduce((sum, value) => sum + value, 0) : null,
      zeroValues: monetaryValues.filter((value) => value === 0).length,
      negativeValues: monetaryValues.filter((value) => value < 0).length,
      missingBillingDates: mapped.voucherBillingDate ? rows.filter((row) => row[mapped.voucherBillingDate!] === null || String(row[mapped.voucherBillingDate!]).trim() === '').length : 0,
      duplicateGroups,
      distinct: {
        hospitals: distinct(mapped.hospital), clients: distinct(mapped.billingClient), doctors: distinct(mapped.doctor),
        representatives: distinct(mapped.mainRepresentative), brands: distinct(mapped.brand), products: distinct(mapped.product),
      },
      errors,
      // retained through the caller to log actual processing, never used as business data
      ...({ processingMs: Math.round(performance.now() - started) } as object),
    },
  };
}

function validCell(value: unknown): DataRow[string] {
  if (value === undefined || value === null || value === '') return null;
  if (value instanceof Date || ['string', 'number', 'boolean'].includes(typeof value)) return value as DataRow[string];
  return String(value);
}

export function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string' || !value.trim()) return null;
  const clean = value.replace(/R\$/gi, '').replace(/\s/g, '').trim();
  if (!clean) return null;
  const direct = Number(clean);
  if (Number.isFinite(direct)) return direct;
  const lastComma = clean.lastIndexOf(',');
  const lastDot = clean.lastIndexOf('.');
  const decimalSeparator = lastComma > lastDot ? ',' : '.';
  const thousandsSeparator = decimalSeparator === ',' ? /\./g : /,/g;
  const normalizedNumber = clean.replace(thousandsSeparator, '').replace(decimalSeparator, '.');
  const parsed = Number(normalizedNumber);
  return Number.isFinite(parsed) ? parsed : null;
}

export function toDate(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(+value)) return value;
  if (typeof value === 'number') {
    const parsed = XLSX.SSF.parse_date_code(value);
    return parsed ? new Date(parsed.y, parsed.m - 1, parsed.d) : null;
  }
  if (typeof value !== 'string') return null;
  const br = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  const date = br ? new Date(+br[3], +br[2] - 1, +br[1]) : new Date(value);
  return Number.isNaN(+date) ? null : date;
}

export const normalizeName = normalize;
export const formatDate = (date: Date) => new Intl.DateTimeFormat('pt-BR').format(date);
