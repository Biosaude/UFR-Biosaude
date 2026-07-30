import * as XLSX from 'xlsx';
import type { DataRow, ValidationReport } from '../types';

const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
const findColumn = (columns: string[], terms: string[]) => columns.find((column) => terms.some((term) => normalize(column).includes(term)));

export async function inspectWorkbook(file: File): Promise<{ rows: DataRow[]; report: ValidationReport }> {
  const started = performance.now();
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
  const sheetName = workbook.SheetNames.find((name) => normalize(name) === 'utilizado');
  if (!sheetName) throw new Error('A aba obrigatória “Utilizado” não foi encontrada.');

  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[sheetName], { defval: null, raw: true });
  const columns = raw.length ? Object.keys(raw[0]) : [];
  const rows = raw.map((row) => Object.fromEntries(columns.map((column) => [column, validCell(row[column])]))) as DataRow[];
  const dateColumn = findColumn(columns, ['data', 'date']);
  const valueColumn = findColumn(columns, ['valor utilizado', 'utilizado', 'valor']);
  const emptyCells = rows.reduce((total, row) => total + columns.filter((column) => row[column] === null || row[column] === '').length, 0);
  const fingerprints = rows.map((row) => JSON.stringify(row));
  const duplicateRows = fingerprints.length - new Set(fingerprints).size;
  const invalidDates = dateColumn ? rows.filter((row) => row[dateColumn] !== null && !toDate(row[dateColumn])).length : 0;
  const invalidValues = valueColumn ? rows.filter((row) => row[valueColumn] !== null && typeof toNumber(row[valueColumn]) !== 'number').length : 0;
  const dates = dateColumn ? rows.map((row) => toDate(row[dateColumn])).filter((date): date is Date => !!date).sort((a, b) => +a - +b) : [];
  const errors: string[] = [];
  if (!rows.length) errors.push('A aba Utilizado não possui registros.');
  if (!columns.length) errors.push('Não foi possível identificar colunas na aba Utilizado.');

  return {
    rows,
    report: {
      fileName: file.name, sheetNames: workbook.SheetNames, rowCount: rows.length, columns,
      emptyCells, duplicateRows, invalidDates, invalidValues,
      period: dates.length ? `${formatDate(dates[0])} a ${formatDate(dates.at(-1)!)}` : null,
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
  const clean = value.replace(/R\$\s?/g, '').replace(/\./g, '').replace(',', '.').trim();
  const parsed = Number(clean);
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
