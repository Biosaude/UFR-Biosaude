import * as XLSX from 'xlsx';
import type { DataRow, ValidationReport } from '../types';

export const UTILIZADO_COLUMNS = {
  company: 'Empresa',
  scheduleType: 'Tipo Agendamento',
  voucherType: 'Tipo do Vale',
  voucherStatus: 'Situação do Vale',
  surgeryDate: 'Data da Cirurgia',
  hospitalState: 'UF do Hospital',
  totalValue: 'Valor total',
  usedQuantity: 'Quantidade Utilizada',
  hospital: 'Hospital',
  billingClient: 'Cliente de Faturamento',
  clientState: 'UF do Cliente',
  doctor: 'Médico',
  mainRepresentative: 'Representante Principal',
  patient: 'Paciente',
  productCode: 'Código Produto',
  product: 'Produto',
  brand: 'Marca',
  productTopic: 'Tópico do Produto',
} as const;

export const RECEBIDO_COLUMNS = {
  company: 'Empresa', client: 'Nome cliente', hospital: 'Nome hospital', doctor: 'Nome do medico', representative: 'Nome representante', patient: 'Paciente',
  receiptDate: 'Dt.recebimento', receivedValue: 'Vr.recebido', openValue: 'Vr.aberto', discountValue: 'Vr.desconto', interestValue: 'Vr.juros',
  bank: 'Banco', collectionLocation: 'Local cobranca', cashDesk: 'Caixa', code: 'Codigo', invoice: 'Duplicata', installment: 'Parcela',
  issueDate: 'Dt.emissao', inclusionDate: 'Dt.inclusao', dueDate: 'Dt.vencimento', surgeryDate: 'Dt.cirurgia', creditDate: 'Dt.credito',
  invoiceValue: 'Vr.duplicata', representativeCode1: 'Cod.representante 1', representativeCode2: 'Cod.representante 2', hospitalCnpj: 'CNPJ do hospital',
  bankSlip: 'Nr.boleto', fullTitleNumber: 'Numero do titulo completo',
} as const;

export const UTILIZADO_SCHEMA_VERSION = 'utilizado-schema-v2';
const REQUIRED_COLUMNS: UtilizadoColumnKey[] = ['surgeryDate', 'totalValue', 'usedQuantity', 'product', 'hospital', 'billingClient'];

export type UtilizadoColumnKey = keyof typeof UTILIZADO_COLUMNS;
export type UtilizadoColumnMap = Partial<Record<UtilizadoColumnKey, string>>;
export type RecebidoColumnKey = keyof typeof RECEBIDO_COLUMNS;
export type RecebidoColumnMap = Partial<Record<RecebidoColumnKey, string>>;

const normalize = (value: string) => String(value).trim().replace(/\s+/g, ' ').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

export function resolveUtilizadoColumns(columns: string[]): UtilizadoColumnMap {
  const byNormalizedName = new Map(columns.map((column) => [normalize(column), column]));
  return Object.fromEntries(Object.entries(UTILIZADO_COLUMNS).flatMap(([key, expected]) => {
    const original = byNormalizedName.get(normalize(expected));
    return original ? [[key, original]] : [];
  })) as UtilizadoColumnMap;
}

export function resolveRecebidoColumns(columns: string[]): RecebidoColumnMap {
  const available = columns.map((column, index) => ({ original: column, normalized: normalize(column.replace(/_\d+$/, '')), index }));
  return Object.fromEntries(Object.entries(RECEBIDO_COLUMNS).flatMap(([key, expected]) => {
    const match = available.find((column) => column.normalized === normalize(expected));
    return match ? [[key, match.original]] : [];
  })) as RecebidoColumnMap;
}

export async function inspectWorkbook(file: File, targetModule: 'Utilizado' | 'Faturado' | 'Recebido'): Promise<{ rows: DataRow[]; report: ValidationReport }> {
  let workbook: XLSX.WorkBook;
  try { workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true }); }
  catch { throw new Error('O arquivo não pôde ser lido. A base existente foi preservada; nenhuma alteração foi realizada.'); }
  if (targetModule === 'Faturado') {
    const sheetName = workbook.SheetNames.find((name) => ['faturamento 01', 'faturamento'].includes(normalize(name)));
    if (!sheetName) throw new Error(`Nenhuma aba de Faturamento foi encontrada. Abas localizadas: ${workbook.SheetNames.join(', ') || 'nenhuma'}. A base existente foi preservada; nenhuma alteração foi realizada.`);
    return inspectSheet(file.name, workbook, sheetName, 'Faturado');
  }
  if (targetModule === 'Recebido') {
    const sheetName = workbook.SheetNames.find((name) => normalize(name) === 'planilha1');
    if (!sheetName) throw new Error(`A aba Planilha1 não foi encontrada. Abas localizadas: ${workbook.SheetNames.join(', ') || 'nenhuma'}. A base existente foi preservada; nenhuma alteração foi realizada.`);
    return inspectRecebidoSheet(file.name, workbook, sheetName);
  }
  return inspectUtilizadoWorkbook(file.name, workbook);
}

function inspectRecebidoSheet(fileName: string, workbook: XLSX.WorkBook, sheetName: string): { rows: DataRow[]; report: ValidationReport } {
  const started = performance.now();
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[sheetName], { defval: null, raw: true });
  const columns = raw.length ? Object.keys(raw[0]) : [];
  const rows = raw.map((row) => Object.fromEntries(columns.map((column) => [column, validCell(row[column])]))) as DataRow[];
  const mapped = resolveRecebidoColumns(columns);
  const required = Object.keys(RECEBIDO_COLUMNS) as RecebidoColumnKey[];
  const errors = required.flatMap((key) => mapped[key] ? [] : [`A coluna obrigatória “${RECEBIDO_COLUMNS[key]}” não foi encontrada.`]);
  const values = (key: RecebidoColumnKey) => mapped[key] ? rows.map((row) => toNumber(row[mapped[key]!])).filter((value): value is number => value !== null) : [];
  const dates = mapped.receiptDate ? rows.map((row) => toDate(row[mapped.receiptDate!])).filter((date): date is Date => !!date).sort((a, b) => +a - +b) : [];
  const received = values('receivedValue'); const fingerprintCounts = new Map<string, number>(); rows.forEach((row) => { const value = JSON.stringify(row); fingerprintCounts.set(value, (fingerprintCounts.get(value) ?? 0) + 1); });
  const distinct = (column?: string) => column ? new Set(rows.map((row) => row[column]).filter((value) => value !== null && String(value).trim() !== '')).size : null;
  return { rows, report: { module: 'Recebido', fileName, sheetName, sheetNames: workbook.SheetNames, rowCount: rows.length, columns,
    emptyCells: rows.reduce((total, row) => total + columns.filter((column) => row[column] === null || row[column] === '').length, 0), duplicateRows: rows.length - fingerprintCounts.size,
    duplicateGroups: [...fingerprintCounts.values()].filter((count) => count > 1).length, invalidDates: mapped.receiptDate ? rows.filter((row) => row[mapped.receiptDate!] !== null && !toDate(row[mapped.receiptDate!])).length : 0,
    invalidValues: mapped.receivedValue ? rows.filter((row) => row[mapped.receivedValue!] !== null && toNumber(row[mapped.receivedValue!]) === null).length : 0,
    period: dates.length ? `${formatDate(dates[0])} a ${formatDate(dates.at(-1)!)}` : null, totalValue: received.length ? received.reduce((sum, value) => sum + value, 0) : null, totalQuantity: null,
    totalOpen: sumValues(values('openValue')), totalDiscount: sumValues(values('discountValue')), totalInterest: sumValues(values('interestValue')),
    zeroValues: received.filter((value) => value === 0).length, negativeValues: received.filter((value) => value < 0).length, negativeTotal: received.filter((value) => value < 0).reduce((sum, value) => sum + value, 0), missingDates: mapped.receiptDate ? rows.filter((row) => row[mapped.receiptDate!] === null || row[mapped.receiptDate!] === '').length : rows.length,
    distinct: { hospitals: distinct(mapped.hospital), clients: distinct(mapped.client), doctors: distinct(mapped.doctor), representatives: distinct(mapped.representative), brands: null, products: null, companies: distinct(mapped.company), productTopics: null, productCodes: null, patients: distinct(mapped.patient) }, errors,
    ...({ processingMs: Math.round(performance.now() - started) } as object),
  }};
}

const sumValues = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) : null;

function inspectUtilizadoWorkbook(fileName: string, workbook: XLSX.WorkBook): { rows: DataRow[]; report: ValidationReport } {
  const started = performance.now();
  const sheetName = identifyUtilizadoSheet(workbook);
  if (!sheetName) throw new Error('Nenhuma aba contém as colunas mínimas do módulo Utilizado.');
  return inspectSheet(fileName, workbook, sheetName, 'Utilizado', started);
}

function inspectSheet(fileName: string, workbook: XLSX.WorkBook, sheetName: string, module: 'Utilizado' | 'Faturado', started = performance.now()): { rows: DataRow[]; report: ValidationReport } {

  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[sheetName], { defval: null, raw: true });
  const columns = raw.length ? Object.keys(raw[0]) : [];
  const rows = raw.map((row) => Object.fromEntries(columns.map((column) => [column, validCell(row[column])]))) as DataRow[];
  const mapped = resolveUtilizadoColumns(columns);
  const dateColumn = mapped.surgeryDate;
  const valueColumn = mapped.totalValue;
  const quantityColumn = mapped.usedQuantity;
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
  const quantityValues = quantityColumn ? rows.map((row) => toNumber(row[quantityColumn])).filter((value): value is number => value !== null) : [];
  const distinct = (column?: string) => column ? new Set(rows.map((row) => row[column]).filter((value) => value !== null && String(value).trim() !== '')).size : null;
  const errors: string[] = [];
  if (!rows.length) errors.push('A aba Utilizado não possui registros.');
  if (!columns.length) errors.push('Não foi possível identificar colunas na aba Utilizado.');
  const required = module === 'Faturado' ? (['company', 'surgeryDate', 'productCode', 'brand', 'productTopic', 'product', 'totalValue', 'hospitalState', 'hospital', 'billingClient', 'clientState', 'doctor', 'mainRepresentative', 'patient'] as UtilizadoColumnKey[]) : REQUIRED_COLUMNS;
  required.forEach((key) => { if (!mapped[key]) errors.push(`A coluna obrigatória “${UTILIZADO_COLUMNS[key]}” não foi encontrada.`); });

  return {
    rows,
    report: {
      module, fileName, sheetName, sheetNames: workbook.SheetNames, rowCount: rows.length, columns,
      emptyCells, duplicateRows, invalidDates, invalidValues,
      period: dates.length ? `${formatDate(dates[0])} a ${formatDate(dates.at(-1)!)}` : null,
      totalValue: monetaryValues.length ? monetaryValues.reduce((sum, value) => sum + value, 0) : null,
      totalQuantity: quantityValues.length ? quantityValues.reduce((sum, value) => sum + value, 0) : null,
      totalOpen: null, totalDiscount: null, totalInterest: null,
      zeroValues: monetaryValues.filter((value) => value === 0).length,
      negativeValues: monetaryValues.filter((value) => value < 0).length,
      negativeTotal: monetaryValues.filter((value) => value < 0).reduce((sum, value) => sum + value, 0),
      missingDates: dateColumn ? rows.filter((row) => row[dateColumn] === null || row[dateColumn] === '').length : rows.length,
      duplicateGroups,
      distinct: {
        hospitals: distinct(mapped.hospital), clients: distinct(mapped.billingClient), doctors: distinct(mapped.doctor),
        representatives: distinct(mapped.mainRepresentative), brands: distinct(mapped.brand), products: distinct(mapped.product),
        companies: distinct(mapped.company), productTopics: distinct(mapped.productTopic),
        productCodes: distinct(mapped.productCode), patients: distinct(mapped.patient),
      },
      errors,
      // retained through the caller to log actual processing, never used as business data
      ...({ processingMs: Math.round(performance.now() - started) } as object),
    },
  };
}

function identifyUtilizadoSheet(workbook: XLSX.WorkBook): string | null {
  const exact = workbook.SheetNames.find((name) => normalize(name) === 'utilizado');
  if (exact) return exact;
  const containing = workbook.SheetNames.find((name) => normalize(name).includes('utilizado'));
  if (containing) return containing;
  const validSheets = workbook.SheetNames.filter((name) => {
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[name], { header: 1, raw: true, blankrows: false });
    const headers = (matrix[0] ?? []).map((value) => String(value ?? '')).filter(Boolean);
    const mapped = resolveUtilizadoColumns(headers);
    return REQUIRED_COLUMNS.every((key) => !!mapped[key]);
  });
  return validSheets.length ? validSheets[0] : null;
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
