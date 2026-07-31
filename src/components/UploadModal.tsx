import { AlertTriangle, CheckCircle2, FileSpreadsheet, LoaderCircle, X } from 'lucide-react';
import type { SourceModule, ValidationReport } from '../types';

interface Props { open: boolean; targetModule: SourceModule | null; report: ValidationReport | null; loading: boolean; error: string | null; onClose: () => void; onSelectModule: (module: SourceModule) => void; onFile: (file: File) => void; onConfirm: () => void; }

export function UploadModal({ open, targetModule, report, loading, error, onClose, onSelectModule, onFile, onConfirm }: Props) {
  if (!open) return null;
  return <div className="modal-backdrop" role="dialog" aria-modal="true"><div className="modal">
    <div className="modal-header"><div><p className="eyebrow">ATUALIZAÇÃO SEGURA</p><h2>Atualizar base de dados</h2></div><button className="icon-button" onClick={onClose} aria-label="Fechar"><X/></button></div>
    {!targetModule && <div className="module-picker"><p>Qual base deseja atualizar?</p><div><button onClick={() => onSelectModule('Utilizado')}><FileSpreadsheet/><strong>Utilizado</strong><span>Disponível para atualização</span></button><button onClick={() => onSelectModule('Faturado')}><FileSpreadsheet/><strong>Faturado</strong><span>Primeira importação ou atualização</span></button><button disabled><FileSpreadsheet/><strong>Recebido</strong><span>Aguardando definição da estrutura</span></button></div></div>}
    {targetModule && !report && <label className="drop-zone">
      {loading ? <><LoaderCircle className="spin"/><strong>Validando arquivo…</strong></> : <><FileSpreadsheet/><strong>Selecione a planilha .xlsx</strong><span>A base só será aplicada após sua confirmação.</span></>}
      <input type="file" accept=".xlsx" disabled={loading} onChange={(event) => { const file = event.target.files?.[0]; if (file) onFile(file); event.target.value = ''; }}/>
    </label>}
    {error && <div className="error-box"><AlertTriangle/><span>{error}</span></div>}
    {report && <>
      <div className="file-summary"><FileSpreadsheet/><div><strong>{report.fileName}</strong><span>{report.rowCount.toLocaleString('pt-BR')} registros • {report.columns.length} colunas</span></div><CheckCircle2 className="success"/></div>
      <div className="validation-grid">
        <Validation label="Aba processada" value={report.sheetName} good/>
        <Validation label="Período" value={report.period ?? 'Informação não disponível na base de dados'}/>
        <Validation label={report.module === 'Faturado' ? 'Valor faturado total' : 'Valor utilizado total'} value={formatMoney(report.totalValue)}/>
        {report.module === 'Utilizado' && <Validation label="Quantidade utilizada total" value={formatCount(report.totalQuantity)}/>}
        <Validation label="Empresas" value={formatCount(report.distinct.companies)}/>
        <Validation label="Hospitais" value={formatCount(report.distinct.hospitals)}/>
        <Validation label="Clientes" value={formatCount(report.distinct.clients)}/>
        <Validation label="Médicos" value={formatCount(report.distinct.doctors)}/>
        <Validation label="Representantes" value={formatCount(report.distinct.representatives)}/>
        <Validation label="Marcas" value={formatCount(report.distinct.brands)}/>
        <Validation label="Produtos" value={formatCount(report.distinct.products)}/>
        <Validation label="Tópicos do produto" value={formatCount(report.distinct.productTopics)}/>
        {report.module === 'Faturado' && <Validation label="Códigos de produto" value={formatCount(report.distinct.productCodes)}/>}
        {report.module === 'Faturado' && <Validation label="Pacientes" value={formatCount(report.distinct.patients)}/>}
        {report.module === 'Faturado' && <Validation label="Registros sem Data da Cirurgia" value={report.missingDates.toLocaleString('pt-BR')}/>}
        <Validation label="Valores zerados" value={report.zeroValues.toLocaleString('pt-BR')}/>
        <Validation label="Valores negativos" value={report.negativeValues.toLocaleString('pt-BR')}/>
        {report.module === 'Faturado' && <Validation label="Total dos valores negativos" value={formatMoney(report.negativeTotal)}/>}
        <Validation label="Campos vazios" value={report.emptyCells.toLocaleString('pt-BR')}/>
        <Validation label="Duplicidades excedentes" value={report.duplicateRows.toLocaleString('pt-BR')}/>
        <Validation label="Grupos de duplicidade" value={report.duplicateGroups.toLocaleString('pt-BR')}/>
        <Validation label="Datas inválidas" value={report.invalidDates.toLocaleString('pt-BR')}/>
        <Validation label="Valores inválidos" value={report.invalidValues.toLocaleString('pt-BR')}/>
      </div>
      <div className="notice"><AlertTriangle/> Duplicidades e campos vazios são apenas sinalizados. Nenhum registro será alterado ou removido.</div>
      {!!report.errors.length && <div className="error-box"><AlertTriangle/><div><strong>A aba encontrada não contém todas as colunas obrigatórias.</strong>{report.errors.map((message) => <span key={message}>{message}</span>)}<span>A base existente foi preservada; nenhuma alteração foi realizada.</span></div></div>}
      <div className="modal-actions"><button className="secondary-button" onClick={onClose}>Cancelar</button><button className="primary-button" disabled={!!report.errors.length} onClick={onConfirm}>Confirmar atualização</button></div>
    </>}
  </div></div>;
}

function Validation({ label, value, good }: { label: string; value: string; good?: boolean }) { return <div className="validation"><span>{label}</span><strong className={good ? 'success-text' : ''}>{value}</strong></div>; }
function formatMoney(value: number | null) { return value === null ? 'Informação não disponível na base de dados' : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value); }
function formatCount(value: number | null) { return value === null ? 'Informação não disponível na base de dados' : value.toLocaleString('pt-BR'); }
