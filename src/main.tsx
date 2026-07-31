import { StrictMode, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Clock3, Database, Eraser, RefreshCw, Upload } from 'lucide-react';
import { Dashboard } from './components/Dashboard';
import { EmptyState } from './components/EmptyState';
import { UploadModal } from './components/UploadModal';
import { inspectWorkbook } from './services/workbook';
import type { DataRow, ValidationReport } from './types';
import './styles.css';

export function App() {
  const [rows, setRows] = useState<DataRow[]>([]); const [columns, setColumns] = useState<string[]>([]); const [modal, setModal] = useState(false); const [loading, setLoading] = useState(false); const [error, setError] = useState<string|null>(null); const [pending, setPending] = useState<{rows:DataRow[];report:ValidationReport}|null>(null); const [updated, setUpdated] = useState<Date|null>(null); const [resetSignal, setResetSignal] = useState(0); const hiddenInput = useRef<HTMLInputElement>(null);
  const chooseFile = async (file: File) => { setError(null); setLoading(true); try { if (!file.name.toLowerCase().endsWith('.xlsx')) throw new Error('Formato inválido. Selecione exclusivamente um arquivo .xlsx.'); setPending(await inspectWorkbook(file)); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível validar o arquivo.'); } finally { setLoading(false); } };
  const confirm = () => { if (!pending) return; setRows(pending.rows); setColumns(pending.report.columns); setUpdated(new Date()); setModal(false); setPending(null); };
  const openUpload = () => { setPending(null); setError(null); setModal(true); };
  return <div className="app-shell">
    <header><div className="brand-mark">UFR</div><div className="heading"><p>INTELIGÊNCIA EXECUTIVA</p><h1>Utilizado <i/> <span>Faturado</span> <i/> <span>Recebido</span></h1><h2>Dashboard Executivo</h2><h3>Acompanhamento integrado de Utilizado, Faturado e Recebido.</h3></div><div className="header-actions">{rows.length > 0 && <div className="base-status"><i/><span>Base carregada<strong>{rows.length.toLocaleString('pt-BR')} registros</strong></span></div>}<div className="updated"><Clock3/><span>Última atualização<strong>{updated ? updated.toLocaleString('pt-BR') : 'Informação não disponível na base de dados'}</strong></span></div><button className="icon-button" aria-label="Atualizar" onClick={() => hiddenInput.current?.click()}><RefreshCw/></button><button className="secondary-button" onClick={() => setResetSignal((value) => value + 1)}><Eraser/> Limpar filtros</button><button className="primary-button" onClick={openUpload}><Upload/> Atualizar base</button><input ref={hiddenInput} hidden type="file" accept=".xlsx" onChange={(e)=>e.target.files?.[0]&&chooseFile(e.target.files[0])}/></div></header>
    <nav className="module-nav"><button className="active"><Database/>Utilizado<span>Ativo</span></button><button disabled><Database/>Faturado<span>Aguardando inclusão da base de dados</span></button><button disabled><Database/>Recebido<span>Aguardando inclusão da base de dados</span></button></nav>
    {rows.length ? <Dashboard rows={rows} columns={columns} resetSignal={resetSignal}/> : <EmptyState onUpload={openUpload}/>}<footer>UFR Intelligence <span>•</span> Dados exibidos exclusivamente a partir da base importada</footer>
    <UploadModal open={modal} report={pending?.report??null} loading={loading} error={error} onClose={()=>setModal(false)} onFile={chooseFile} onConfirm={confirm}/>
  </div>;
}

createRoot(document.getElementById('root')!).render(<StrictMode><App/></StrictMode>);
