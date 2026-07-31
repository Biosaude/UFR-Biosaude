export type CellValue = string | number | boolean | Date | null;
export type DataRow = Record<string, CellValue>;
export type SourceModule = 'Utilizado' | 'Faturado';

export interface DataModule {
  key: 'Utilizado' | 'Faturado' | 'Recebido';
  status: 'active' | 'waiting';
  rows: DataRow[];
  columns: string[];
}

export interface ValidationReport {
  module: SourceModule;
  fileName: string;
  sheetName: string;
  sheetNames: string[];
  rowCount: number;
  columns: string[];
  emptyCells: number;
  duplicateRows: number;
  invalidDates: number;
  invalidValues: number;
  period: string | null;
  totalValue: number | null;
  totalQuantity: number | null;
  zeroValues: number;
  negativeValues: number;
  negativeTotal: number;
  missingDates: number;
  duplicateGroups: number;
  distinct: {
    hospitals: number | null;
    clients: number | null;
    doctors: number | null;
    representatives: number | null;
    brands: number | null;
    products: number | null;
    companies: number | null;
    productTopics: number | null;
    productCodes: number | null;
    patients: number | null;
  };
  errors: string[];
}

export interface UploadLog {
  date: Date;
  user: string;
  fileName: string;
  rows: number;
  processingMs: number;
}
