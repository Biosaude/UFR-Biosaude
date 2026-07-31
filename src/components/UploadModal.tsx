import { AlertTriangle, CheckCircle2, FileSpreadsheet, LoaderCircle, X } from 'lucide-react';
import type { ValidationReport } from '../types';

interface Props { open: boolean; report: ValidationReport | null; loading: boolean; error: string | null; onClose: () => void; onFile: (file: File) => void; onConfirm: () => void; }

export function UploadModal({ open, report, loading, error, onClose, onFile, onConfirm }: Props) {
  if (!open) return null;
  return <div className="modal-backdrop" role="dialog" aria-modal="true"><div className="modal">
    <div className="modal-header"><div><p className="eyebrow">ATUALIZAÇÃO SEGURA</p><h2>Atualizar base de dados</h2></div><button className="icon-button" onClick={onClose} aria-label="Fechar"><X/></button></div>
    {!report && <label className="drop-zone">
      {loading ? <><LoaderCircle className="spin"/><strong>Validando arquivo…</strong></> : <><FileSpreadsheet/><strong>Selecione a planilha .xlsx</strong><span>A base só será aplicada após sua confirmação.</span></>}
      <input type="file" accept=".xlsx" disabled={loading} onChange={(event) => event.target.files?.[0] && onFile(event.target.files[0])}/>
    </label>}
    {error && <div className="error-box"><AlertTriangle/><span>{error}</span></div>}
    {report && <>
      <div className="file-summary"><FileSpreadsheet/><div><strong>{report.fileName}</strong><span>{report.rowCount.toLocaleString('pt-BR')} registros • {report.columns.length} colunas</span></div><CheckCircle2 className="success"/></div>
      <div className="validation-grid">
        <Validation label="Aba processada" value={report.sheetName} good/>
        <Validation label="Período" value={report.period ?? 'Informação não disponível na base de dados'}/>
        <Validation label="Valor total" value={formatMoney(report.totalValue)}/>
        <Validation label="Quantidade utilizada total" value={formatCount(report.totalQuantity)}/>
        <Validation label="Empresas" value={formatCount(report.distinct.companies)}/>
        <Validation label="Hospitais" value={formatCount(report.distinct.hospitals)}/>
        <Validation label="Clientes" value={formatCount(report.distinct.clients)}/>
        <Validation label="Médicos" value={formatCount(report.distinct.doctors)}/>
        <Validation label="Representantes" value={formatCount(report.distinct.representatives)}/>
        <Validation label="Marcas" value={formatCount(report.distinct.brands)}/>
        <Validation label="Produtos" value={formatCount(report.distinct.products)}/>
        <Validation label="Tópicos do produto" value={formatCount(report.distinct.productTopics)}/>
        <Validation label="Valores zerados" value={report.zeroValues.toLocaleString('pt-BR')}/>
        <Validation label="Valores negativos" value={report.negativeValues.toLocaleString('pt-BR')}/>
        <Validation label="Campos vazios" value={report.emptyCells.toLocaleString('pt-BR')}/>
        <Validation label="Duplicidades excedentes" value={report.duplicateRows.toLocaleString('pt-BR')}/>
        <Validation label="Grupos de duplicidade" value={report.duplicateGroups.toLocaleString('pt-BR')}/>
        <Validation label="Datas inválidas" value={report.invalidDates.toLocaleString('pt-BR')}/>
        <Validation label="Valores inválidos" value={report.invalidValues.toLocaleString('pt-BR')}/>
      </div>
      <div className="notice"><AlertTriangle/> Duplicidades e campos vazios são apenas sinalizados. Nenhum registro será alterado ou removido.</div>
      <div className="modal-actions"><button className="secondary-button" onClick={onClose}>Cancelar</button><button className="primary-button" disabled={!!report.errors.length} onClick={onConfirm}>Confirmar atualização</button></div>
    </>}
  </div></div>;
}

function Validation({ label, value, good }: { label: string; value: string; good?: boolean }) { return <div className="validation"><span>{label}</span><strong className={good ? 'success-text' : ''}>{value}</strong></div>; }
function formatMoney(value: number | null) { return value === null ? 'Informação não disponível na base de dados' : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value); }
function formatCount(value: number | null) { return value === null ? 'Informação não disponível na base de dados' : value.toLocaleString('pt-BR'); }
