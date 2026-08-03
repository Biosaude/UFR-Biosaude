import type { SourceModule } from '../types';
import { resolveRecebidoColumns, resolveUtilizadoColumns } from './workbook';

export interface ModuleFields {
  value?: string;
  date?: string;
  hospital?: string;
  client?: string;
  doctor?: string;
  representative?: string;
  patient?: string;
  brand?: string;
  product?: string;
  topic?: string;
  hospitalState?: string;
  clientState?: string;
}

export function resolveModuleFields(module: SourceModule, columns: string[]): ModuleFields {
  if (module === 'Recebido') {
    const fields = resolveRecebidoColumns(columns);
    return { value: fields.receivedValue, date: fields.receiptDate, hospital: fields.hospital, client: fields.client, doctor: fields.doctor, representative: fields.representative, patient: fields.patient };
  }
  const fields = resolveUtilizadoColumns(columns);
  return { value: fields.totalValue, date: fields.surgeryDate, hospital: fields.hospital, client: fields.billingClient, doctor: fields.doctor, representative: fields.mainRepresentative, patient: fields.patient, brand: fields.brand, product: fields.product, topic: fields.productTopic, hospitalState: fields.hospitalState, clientState: fields.clientState };
}
