import { StrictMode, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Clock3, Database, Eraser, RefreshCw, Upload } from 'lucide-react';
import { Dashboard } from './components/Dashboard';
import { EmptyState } from './components/EmptyState';
import { UploadModal } from './components/UploadModal';
import { inspectWorkbook, UTILIZADO_SCHEMA_VERSION } from './services/workbook';
import type { DataRow, SourceModule, ValidationReport } from './types';
import './styles.css';

export function App() {
  const [moduleData, setModuleData] = useState<Partial<Record<SourceModule, { rows: DataRow[]; columns: string[]; updated: Date }>>>({}); const [activeModule, setActiveModule] = useState<SourceModule>('Utilizado'); const [modal, setModal] = useState(false); const [loading, setLoading] = useState(false); const [error, setError] = useState<string|null>(null); const [pending, setPending] = useState<{rows:DataRow[];report:ValidationReport}|null>(null); const [resetSignal, setResetSignal] = useState(0); const hiddenInput = useRef<HTMLInputElement>(null);
  useEffect(() => { const key = 'ufr-utilizado-schema'; if (localStorage.getItem(key) !== UTILIZADO_SCHEMA_VERSION) { localStorage.removeItem('ufr-active-filters'); localStorage.setItem(key, UTILIZADO_SCHEMA_VERSION); setResetSignal((value) => value + 1); } }, []);
  const chooseFile = async (file: File) => { setError(null); setLoading(true); try { if (!file.name.toLowerCase().endsWith('.xlsx')) throw new Error('Formato inválido. Selecione exclusivamente um arquivo .xlsx.'); setPending(await inspectWorkbook(file)); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível validar o arquivo.'); } finally { setLoading(false); } };
  const confirm = () => { if (!pending) return; const module = pending.report.module; setModuleData((current) => ({ ...current, [module]: { rows: pending.rows, columns: pending.report.columns, updated: new Date() } })); setActiveModule(module); setResetSignal((value) => value + 1); setModal(false); setPending(null); };
  const openUpload = () => { setPending(null); setError(null); setModal(true); };
  const activeData = moduleData[activeModule];
  return <div className="app-shell">
    <header><div className="brand-mark">UFR</div><div className="heading"><p>INTELIGÊNCIA EXECUTIVA</p><h1>Utilizado <i/> <span>Faturado</span> <i/> <span>Recebido</span></h1><h2>Dashboard Executivo</h2><h3>Acompanhamento integrado de Utilizado, Faturado e Recebido.</h3></div><div className="header-actions">{activeData && <div className="base-status"><i/><span>Base {activeModule}<strong>{activeData.rows.length.toLocaleString('pt-BR')} registros</strong></span></div>}<div className="updated"><Clock3/><span>Última atualização<strong>{activeData ? activeData.updated.toLocaleString('pt-BR') : 'Informação não disponível na base de dados'}</strong></span></div><button className="icon-button" aria-label="Atualizar" onClick={() => hiddenInput.current?.click()}><RefreshCw/></button><button className="secondary-button" onClick={() => setResetSignal((value) => value + 1)}><Eraser/> Limpar filtros</button><button className="primary-button" onClick={openUpload}><Upload/> Atualizar base</button><input ref={hiddenInput} hidden type="file" accept=".xlsx" onChange={(e)=>e.target.files?.[0]&&chooseFile(e.target.files[0])}/></div></header>
    <nav className="module-nav"><button className={activeModule === 'Utilizado' ? 'active' : ''} disabled={!moduleData.Utilizado} onClick={() => setActiveModule('Utilizado')}><Database/>Utilizado<span>{moduleData.Utilizado ? 'Disponível' : 'Aguardando base'}</span></button><button className={activeModule === 'Faturado' ? 'active' : ''} disabled={!moduleData.Faturado} onClick={() => setActiveModule('Faturado')}><Database/>Faturado<span>{moduleData.Faturado ? 'Disponível' : 'Aguardando base'}</span></button><button disabled><Database/>Recebido<span>Aguardando inclusão da base de dados</span></button></nav>
    {activeData ? <Dashboard rows={activeData.rows} columns={activeData.columns} resetSignal={resetSignal} module={activeModule}/> : <EmptyState onUpload={openUpload}/>}<footer>UFR Intelligence <span>•</span> Dados exibidos exclusivamente a partir da base importada</footer>
    <UploadModal open={modal} report={pending?.report??null} loading={loading} error={error} onClose={()=>setModal(false)} onFile={chooseFile} onConfirm={confirm}/>
  </div>;
}

createRoot(document.getElementById('root')!).render(<StrictMode><App/></StrictMode>);
