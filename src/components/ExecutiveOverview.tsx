import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { AlertTriangle, Download, LayoutDashboard, TableProperties } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import * as XLSX from 'xlsx';
import type { DataRow, SourceModule, ValidationReport } from '../types';
import { resolveModuleFields } from '../services/moduleConfig';
import { normalizeName, toDate, toNumber } from '../services/workbook';

export interface OverviewModuleData { rows: DataRow[]; columns: string[]; updated: Date; report: ValidationReport; updatedBy?: string; version?: string; fileHash?: string }
type ModuleStore = Partial<Record<SourceModule, OverviewModuleData>>;
const modules: SourceModule[] = ['Utilizado', 'Faturado', 'Recebido'];
const colors: Record<SourceModule, string> = { Utilizado: '#1d527e', Faturado: '#d28b4d', Recebido: '#6f9b80' };

export function ExecutiveOverview({ data, onOpenModule, onFiltersChange, resetSignal }: { data: ModuleStore; onOpenModule: (module: SourceModule) => void; onFiltersChange: (filters: Record<string, string[]>) => void; resetSignal: number }) {
  const [commonPeriod, setCommonPeriod] = useState(true);
  const [year, setYear] = useState('Todos');
  const [quarter, setQuarter] = useState('Todos');
  const [month, setMonth] = useState('Todos');
  const [dimensionFilters, setDimensionFilters] = useState<Record<string, string>>({});
  const prepared = useMemo(() => modules.map((module) => prepareModule(module, data[module])).filter((item) => item.loaded), [data]);
  const common = useMemo(() => commonRange(prepared), [prepared]);
  const years = useMemo(() => [...new Set(prepared.flatMap((item) => item.dates.map((date) => date.getFullYear())))].sort((a, b) => a - b), [prepared]);
  const commonDimensions = useMemo(() => dimensionOptions(prepared), [prepared]);
  useEffect(() => { setYear('Todos'); setQuarter('Todos'); setMonth('Todos'); setDimensionFilters({}); }, [resetSignal]);
  useEffect(() => {
    const filters: Record<string, string[]> = {};
    if (year !== 'Todos') filters.year = [year];
    if (quarter !== 'Todos') filters.quarter = [quarter];
    if (month !== 'Todos') filters.month = [month];
    Object.entries(dimensionFilters).forEach(([key, value]) => { if (value !== 'Todos') filters[key] = [value]; });
    onFiltersChange(filters);
  }, [year, quarter, month, dimensionFilters, onFiltersChange]);
  const executiveOverviewData = useMemo(() => modules.map((module) => {
    const source = prepareModule(module, data[module]);
    if (!source.loaded) return source;
    const filtered = source.rows.filter((row) => {
      const date = source.fields.date ? toDate(row[source.fields.date]) : null;
      if (year !== 'Todos' && (!date || date.getFullYear() !== Number(year))) return false;
      if (quarter !== 'Todos' && (!date || `Q${Math.floor(date.getMonth() / 3) + 1}` !== quarter)) return false;
      if (month !== 'Todos' && (!date || String(date.getMonth() + 1) !== month)) return false;
      if (commonPeriod && common && prepared.length > 1 && (!date || date < common.start || date > common.end)) return false;
      for (const [key, value] of Object.entries(dimensionFilters)) {
        if (value === 'Todos') continue;
        const column = source.fields[key as keyof typeof source.fields];
        if (column && normalizeName(String(row[column] ?? '')) !== normalizeName(value)) return false;
      }
      return true;
    });
    return calculate(source, filtered);
  }), [data, commonPeriod, common, year, quarter, month, prepared, dimensionFilters]);
  const byModule = Object.fromEntries(executiveOverviewData.map((item) => [item.module, item])) as Record<SourceModule, ReturnType<typeof prepareModule>>;
  const timeline = useMemo(() => buildTimeline(executiveOverviewData), [executiveOverviewData]);
  const differences = [difference('Faturado', 'Utilizado', byModule), difference('Recebido', 'Faturado', byModule), difference('Recebido', 'Utilizado', byModule)];
  const periodLabel = year !== 'Todos' ? year : commonPeriod && common && prepared.length > 1 ? `${formatDate(common.start)} a ${formatDate(common.end)}` : 'Período integral de cada base';
  const exportSummary = (csv = false) => { const rows = executiveOverviewData.map((item) => ({ Módulo: item.module, Valor: item.total, Registros: item.filteredCount, Período: item.period, Atualização: item.updated?.toLocaleString('pt-BR'), Status: item.loaded ? 'Disponível' : 'Aguardando inclusão da base de dados' })); if (csv) { const csvText = XLSX.utils.sheet_to_csv(XLSX.utils.json_to_sheet(rows)); const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([csvText], { type: 'text/csv;charset=utf-8' })); link.download = 'visao-geral-executiva.csv'; link.click(); URL.revokeObjectURL(link.href); return; } const workbook = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), 'Visão Geral'); XLSX.writeFile(workbook, 'visao-geral-executiva.xlsx'); };

  return <main className="dashboard executive-overview">
    <div className="filter-bar overview-filters"><div className="filter-heading"><span>Filtros</span><small>Filtros globais inteligentes</small></div><label><span>Ano</span><select value={year} onChange={(event) => setYear(event.target.value)}><option>Todos</option>{years.map((value) => <option key={value}>{value}</option>)}</select></label><label><span>Trimestre</span><select value={quarter} onChange={(event) => setQuarter(event.target.value)}><option>Todos</option>{[1,2,3,4].map((value) => <option key={value}>{`Q${value}`}</option>)}</select></label><label><span>Mês</span><select value={month} onChange={(event) => setMonth(event.target.value)}><option>Todos</option>{['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'].map((label,index) => <option key={label} value={index+1}>{label}</option>)}</select></label>{commonDimensions.map((dimension) => <label key={dimension.key}><span>{dimension.label}<small title={`Aplicável a ${dimension.applicableModules.join(', ')}`}> {dimension.applicableModules.length}/{prepared.length} bases</small></span><select value={dimensionFilters[dimension.key] ?? 'Todos'} onChange={(event) => setDimensionFilters((current) => ({ ...current, [dimension.key]: event.target.value }))}><option>Todos</option>{dimension.values.map((value) => <option key={value}>{value}</option>)}</select></label>)}<label className="common-period"><input type="checkbox" checked={commonPeriod} onChange={(event) => setCommonPeriod(event.target.checked)}/><span>Período comum entre as bases</span></label><strong>Período analisado: {periodLabel}</strong><div className="overview-export"><button onClick={() => exportSummary()}><Download/> Excel</button><button onClick={() => exportSummary(true)}><Download/> CSV</button><button onClick={() => window.print()}><Download/> PDF</button></div></div>
    {!prepared.length && <div className="overview-empty"><LayoutDashboard/><h2>Aguardando inclusão das bases de dados</h2><p>A Visão Geral será preenchida progressivamente após a importação dos módulos.</p></div>}
    <section className="overview-kpis">{modules.map((module) => <OverviewCard key={module} module={module} item={byModule[module]} onClick={() => onOpenModule(module)}/>)}</section>
    <section className="difference-grid">{differences.map((item) => <DifferenceCard key={item.label} {...item} period={periodLabel}/>)}</section>
    <section className="relation-grid"><Relation label="Relação Faturado / Utilizado" numerator={byModule.Faturado} denominator={byModule.Utilizado} period={periodLabel}/><Relation label="Relação Recebido / Faturado" numerator={byModule.Recebido} denominator={byModule.Faturado} period={periodLabel}/><Relation label="Relação Recebido / Utilizado" numerator={byModule.Recebido} denominator={byModule.Utilizado} period={periodLabel}/></section>
    <section className="panel overview-chart"><div className="panel-title"><div><h3>Evolução agregada por período de referência disponível</h3><p>Comparação agregada entre bases • Faturado por Data da Cirurgia • Recebido por Dt.recebimento</p></div><span className="aggregate-badge">Análise agregada</span></div>{timeline.length ? <ResponsiveContainer width="100%" height={330}><BarChart data={timeline}><CartesianGrid vertical={false} stroke="#e8edf0"/><XAxis dataKey="period"/><YAxis tickFormatter={(value) => `${value / 1000000} mi`}/><Tooltip formatter={(value) => money(Number(value))}/><Legend/>{modules.map((module) => data[module] && <Bar key={module} dataKey={module} fill={colors[module]} radius={[3,3,0,0]}/>)}</BarChart></ResponsiveContainer> : <Unavailable/>}</section>
    <section className="overview-lower"><article className="panel flow-panel"><div className="panel-title"><div><h3>Visão agregada do fluxo financeiro</h3><p>Comparação entre as bases disponíveis no período selecionado</p></div></div><div className="flow-steps">{modules.map((module, index) => { const item = byModule[module]; const previous = index ? byModule[modules[index - 1]] : null; return <div key={module} style={{'--module-color': colors[module]} as CSSProperties}><span>{module}</span><strong>{item?.loaded ? money(item.total) : 'Aguardando inclusão da base de dados'}</strong><small>{previous?.loaded && item?.loaded && previous.total !== 0 ? `${((item.total! / previous.total!) * 100).toLocaleString('pt-BR', {maximumFractionDigits:1})}% da etapa anterior` : 'Comparação não disponível'}</small></div>; })}</div></article><article className="panel executive-summary"><div className="panel-title"><div><h3>Resumo Executivo</h3><p>Frases geradas exclusivamente por cálculos objetivos</p></div></div>{prepared.length ? <ul>{executiveOverviewData.filter((item) => item.loaded).map((item) => <li key={item.module}>No período analisado, o valor {item.module.toLowerCase()} foi de <strong>{money(item.total)}</strong>, em {item.filteredCount?.toLocaleString('pt-BR')} registros.</li>)}{differences.filter((item) => item.value !== null).map((item) => <li key={item.label}>A diferença agregada {item.label} foi de <strong>{money(item.value)}</strong>.</li>)}</ul> : <Unavailable/>}</article></section>
    <section className="panel overview-alerts"><div className="panel-title"><div><h3>Alertas Executivos</h3><p>Condições objetivas identificadas nas bases</p></div></div><div>{modules.filter((module) => !data[module]).map((module) => <span key={module}><AlertTriangle/>A base {module} ainda não foi carregada.</span>)}{executiveOverviewData.filter((item) => item.loaded && item.missingDates).map((item) => <span key={item.module}><AlertTriangle/>Existem {item.missingDates?.toLocaleString('pt-BR')} registros de {item.module} sem data de referência.</span>)}{prepared.length > 1 && commonPeriod && <span><AlertTriangle/>A comparação atual utiliza apenas o período comum entre as bases.</span>}</div></section>
    <section className="panel overview-table"><div className="panel-title"><div><h3>Tabela Executiva Resumida</h3><p>Rastreabilidade por módulo e atualização</p></div><TableProperties/></div><div className="table-scroll"><table><thead><tr><th>Módulo</th><th>Valor</th><th>Registros</th><th>Período</th><th>Arquivo / aba</th><th>Última atualização</th><th>Status</th></tr></thead><tbody>{executiveOverviewData.map((item) => <tr key={item.module}><td>{item.module}</td><td>{item.loaded ? money(item.total) : 'Aguardando inclusão da base de dados'}</td><td>{item.loaded ? item.filteredCount?.toLocaleString('pt-BR') : '—'}</td><td>{item.period ?? 'Informação não disponível na base de dados'}</td><td>{item.report ? `${item.report.fileName} • ${item.report.sheetName}` : '—'}</td><td>{item.updated?.toLocaleString('pt-BR') ?? '—'}</td><td>{item.loaded ? 'Disponível' : 'Aguardando base'}</td></tr>)}</tbody></table></div></section>
  </main>;
}

function prepareModule(module: SourceModule, data?: OverviewModuleData) { const fields = data ? resolveModuleFields(module, data.columns) : {}; const dates = data && fields.date ? data.rows.map((row) => toDate(row[fields.date!])).filter((date): date is Date => !!date) : []; return { module, loaded: !!data, rows: data?.rows ?? [], fields, dates, total: null as number | null, filteredCount: data?.rows.length ?? null, period: data?.report.period ?? null, updated: data?.updated, updatedBy: data?.updatedBy, version: data?.version, report: data?.report, missingDates: data?.report.missingDates ?? null }; }
function calculate(source: ReturnType<typeof prepareModule>, rows: DataRow[]) { const values = source.fields.value ? rows.map((row) => toNumber(row[source.fields.value!])).filter((value): value is number => value !== null) : []; return { ...source, rows, total: values.length ? values.reduce((sum, value) => sum + value, 0) : null, filteredCount: rows.length }; }
function commonRange(items: ReturnType<typeof prepareModule>[]) { const ranged = items.filter((item) => item.dates.length); if (ranged.length < 2) return null; const start = new Date(Math.max(...ranged.map((item) => +new Date(Math.min(...item.dates.map(Number)))))); const end = new Date(Math.min(...ranged.map((item) => +new Date(Math.max(...item.dates.map(Number)))))); return start <= end ? { start, end } : null; }
function dimensionOptions(items: ReturnType<typeof prepareModule>[]) {
  if (!items.length) return [];
  const candidates = [{ key: 'company', label: 'Empresa' }, { key: 'hospital', label: 'Hospital' }, { key: 'client', label: 'Cliente' }, { key: 'doctor', label: 'Médico' }, { key: 'representative', label: 'Representante' }, { key: 'patient', label: 'Paciente' }, { key: 'brand', label: 'Marca' }, { key: 'product', label: 'Produto' }, { key: 'productCode', label: 'Código Produto' }, { key: 'topic', label: 'Tópico do Produto' }, { key: 'hospitalState', label: 'UF do Hospital' }, { key: 'clientState', label: 'UF do Cliente' }];
  return candidates.flatMap((candidate) => {
    const applicable = items.filter((item) => item.fields[candidate.key as keyof typeof item.fields]);
    if (!applicable.length) return [];
    const values = new Map<string, string>();
    applicable.forEach((item) => { const column = item.fields[candidate.key as keyof typeof item.fields]!; item.rows.forEach((row) => { if (row[column] !== null && String(row[column]).trim()) values.set(normalizeName(String(row[column])), String(row[column])); }); });
    return values.size ? [{ ...candidate, values: [...values.values()].sort((a, b) => a.localeCompare(b, 'pt-BR')), applicableModules: applicable.map((item) => item.module) }] : [];
  });
}
function buildTimeline(items: ReturnType<typeof prepareModule>[]) { const map = new Map<string, Record<string, string | number>>(); items.filter((item) => item.loaded && item.fields.date && item.fields.value).forEach((item) => item.rows.forEach((row) => { const date = toDate(row[item.fields.date!]); const value = toNumber(row[item.fields.value!]); if (!date || value === null) return; const key = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}`; const entry = map.get(key) ?? { period: new Intl.DateTimeFormat('pt-BR',{month:'short',year:'2-digit'}).format(date) }; entry[item.module] = Number(entry[item.module] ?? 0) + value; map.set(key, entry); })); return [...map.entries()].sort(([a],[b]) => a.localeCompare(b)).map(([,value]) => value); }
function difference(a: SourceModule, b: SourceModule, data: Record<SourceModule, ReturnType<typeof prepareModule>>) { const first=data[a], second=data[b]; const value=first?.loaded&&second?.loaded&&first.total!==null&&second.total!==null?first.total-second.total:null; return { label:`${a} x ${b}`, formula:`${a} − ${b}`, value }; }
function OverviewCard({module,item,onClick}:{module:SourceModule;item:ReturnType<typeof prepareModule>;onClick:()=>void}) { return <button className={`overview-card ${module.toLowerCase()}`} onClick={onClick}><span>{`Valor ${module}`}</span><strong>{item?.loaded ? money(item.total) : 'Aguardando inclusão da base de dados'}</strong><small>{item?.period ?? 'Base não carregada'}</small><em>Fonte: módulo {module}</em><b>Ver detalhes →</b></button>; }
function DifferenceCard({label,formula,value,period}:{label:string;formula:string;value:number|null;period:string}) { return <article><span>Diferença {label}</span><strong className={value !== null && value < 0 ? 'negative-value':''}>{value === null?'Informação não disponível na base de dados':money(value)}</strong><small>{formula} • {period}</small></article>; }
function Relation({label,numerator,denominator,period}:{label:string;numerator:ReturnType<typeof prepareModule>;denominator:ReturnType<typeof prepareModule>;period:string}) { const value=numerator?.loaded&&denominator?.loaded&&numerator.total!==null&&denominator.total!==null&&denominator.total!==0?(numerator.total/denominator.total)*100:null; return <article><span>{label}</span><strong>{value===null?'Informação não disponível na base de dados':`${value.toLocaleString('pt-BR',{maximumFractionDigits:2})}%`}</strong><small>{period}</small></article>; }
function money(value:number|null){return value===null?'Informação não disponível na base de dados':new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(value)}
function formatDate(date:Date){return new Intl.DateTimeFormat('pt-BR').format(date)}
function Unavailable(){return <div className="unavailable">Informação não disponível na base de dados</div>}
