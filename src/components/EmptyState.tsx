import { Database, FileSpreadsheet, ShieldCheck } from 'lucide-react';

export function EmptyState({ onUpload }: { onUpload: () => void }) {
  return <section className="empty-state">
    <div className="empty-illustration"><Database size={34}/><span/><span/></div>
    <p className="eyebrow">BASE DE DADOS</p>
    <h2>Aguardando a base Utilizado</h2>
    <p>Importe uma planilha <strong>.xlsx</strong> com a aba “Utilizado” para habilitar indicadores, gráficos, rankings e a tabela analítica.</p>
    <button className="primary-button" onClick={onUpload}><FileSpreadsheet size={17}/> Selecionar arquivo</button>
    <div className="empty-rules"><span><ShieldCheck size={15}/> Nenhum dado será estimado</span><span>•</span><span>Validação antes da importação</span></div>
  </section>;
}
