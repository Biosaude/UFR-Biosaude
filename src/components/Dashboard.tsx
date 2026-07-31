import { useMemo, useState } from 'react';
import { BarChart3, Building2, ChevronDown, Download, Search, Stethoscope, Tags, UserRound, UsersRound, WalletCards } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import * as XLSX from 'xlsx';
import type { DataRow } from '../types';
import { normalizeName, toDate, toNumber } from '../services/workbook';

const aliases: Record<string, string[]> = {
  value: ['valor utilizado', 'vl utilizado', 'utilizado', 'valor'], date: ['data utilizacao', 'data utilização', 'data'],
  client: ['cliente'], hospital: ['hospital'], doctor: ['medico', 'médico'], representative: ['representante'], brand: ['marca'],
};
const filterLabels = ['Ano', 'Trimestre', 'Mês', 'GR', 'UF Hospital', 'UF Cliente', 'Marca', 'Tópico Produto', 'Cliente', 'Hospital', 'Médico', 'Representante', 'Tipo Cirurgia', 'Tipo Vale', 'Situação Vale', 'Tipo Agendamento'];
const colors = ['#1d527e', '#4d7899', '#7699af', '#98b1be', '#d59053', '#79a28c'];

export function Dashboard({ rows, columns }: { rows: DataRow[]; columns: string[] }) {
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const find = (key: string) => columns.find((column) => aliases[key]?.some((alias) => normalizeName(column) === normalizeName(alias) || normalizeName(column).includes(normalizeName(alias))));
  const valueCol = find('value'); const dateCol = find('date');
  const metrics = useMemo(() => {
    const distinct = (key: string) => { const col = find(key); return col ? new Set(rows.map((r) => r[col]).filter((v) => v !== null && v !== '')).size : null; };
    const values = valueCol ? rows.map((row) => toNumber(row[valueCol])).filter((v): v is number => v !== null) : [];
    return { total: values.length ? values.reduce((a, b) => a + b, 0) : null, average: values.length ? values.reduce((a, b) => a + b, 0) / values.length : null, client: distinct('client'), hospital: distinct('hospital'), doctor: distinct('doctor'), representative: distinct('representative'), brand: distinct('brand') };
  }, [rows, columns]); // eslint-disable-line react-hooks/exhaustive-deps
  const timeline = useMemo(() => {
    if (!dateCol || !valueCol) return [];
    const grouped = new Map<string, { name: string; value: number; quantity: number }>();
    rows.forEach((row) => { const date = toDate(row[dateCol]); const value = toNumber(row[valueCol]); if (!date || value === null) return; const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`; const current = grouped.get(key) ?? { name: new Intl.DateTimeFormat('pt-BR', { month: 'short', year: '2-digit' }).format(date), value: 0, quantity: 0 }; current.value += value; current.quantity++; grouped.set(key, current); });
    return [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, item]) => item);
  }, [rows, dateCol, valueCol]);
  const participation = useMemo(() => aggregate(rows, find('brand'), valueCol).slice(0, 6), [rows, columns]); // eslint-disable-line react-hooks/exhaustive-deps
  const ranking = useMemo(() => aggregate(rows, find('hospital') ?? find('client'), valueCol).slice(0, 5), [rows, columns]); // eslint-disable-line react-hooks/exhaustive-deps
  const searched = rows.filter((row) => !query || Object.values(row).some((value) => String(value ?? '').toLowerCase().includes(query.toLowerCase())));
  const money = (value: number | null) => value === null ? 'Informação não disponível na base de dados' : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  const download = () => { const ws = XLSX.utils.json_to_sheet(searched); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Utilizado'); XLSX.writeFile(wb, 'utilizado-filtrado.xlsx'); };

  return <main className="dashboard">
    <div className="filter-bar"><div className="filter-heading"><span>Filtros</span><small>Refine sua análise</small></div>{filterLabels.slice(0, 7).map((label) => <button className="filter-chip" key={label}>{label}<span>Todos</span><ChevronDown size={14}/></button>)}<button className="more-filter">+ 9 filtros</button></div>
    <section className="kpi-grid">
      <Kpi icon={<WalletCards/>} label="Valor utilizado" value={money(metrics.total)}/><Kpi icon={<BarChart3/>} label="Registros" value={rows.length.toLocaleString('pt-BR')}/><Kpi icon={<UsersRound/>} label="Clientes" value={show(metrics.client)}/><Kpi icon={<Building2/>} label="Hospitais" value={show(metrics.hospital)}/><Kpi icon={<Stethoscope/>} label="Médicos" value={show(metrics.doctor)}/><Kpi icon={<UserRound/>} label="Representantes" value={show(metrics.representative)}/><Kpi icon={<Tags/>} label="Marcas" value={show(metrics.brand)}/><Kpi icon={<WalletCards/>} label="Valor médio" value={money(metrics.average)}/>
    </section>
    <section className="visual-grid">
      <article className="panel timeline"><PanelTitle eyebrow="EVOLUÇÃO TEMPORAL" title="Utilizado ao longo do tempo" action="Mensal"/>{timeline.length ? <ResponsiveContainer width="100%" height={250}><BarChart data={timeline}><CartesianGrid vertical={false} stroke="#e8edf0"/><XAxis dataKey="name" axisLine={false} tickLine={false}/><YAxis axisLine={false} tickLine={false} tickFormatter={(v) => `${v/1000}k`}/><Tooltip formatter={(v) => money(Number(v))}/><Bar dataKey="value" fill="#1d527e" radius={[5,5,0,0]}/></BarChart></ResponsiveContainer> : <Unavailable/>}</article>
      <article className="panel"><PanelTitle eyebrow="PARTICIPAÇÃO" title="Composição por marca" action="Marca"/>{participation.length ? <div className="donut-wrap"><ResponsiveContainer width="55%" height={220}><PieChart><Pie data={participation} dataKey="value" nameKey="name" innerRadius={62} outerRadius={90} paddingAngle={2}>{participation.map((_, i) => <Cell key={i} fill={colors[i]}/>)}</Pie><Tooltip formatter={(v) => money(Number(v))}/></PieChart></ResponsiveContainer><div className="legend">{participation.map((item, i) => <span key={item.name}><i style={{background:colors[i]}}/>{item.name}<b>{money(item.value)}</b></span>)}</div></div> : <Unavailable/>}</article>
      <article className="panel ranking"><PanelTitle eyebrow="RANKING EXECUTIVO" title={find('hospital') ? 'Hospitais em destaque' : 'Clientes em destaque'} action="Top 5"/>{ranking.length ? <div className="ranking-list">{ranking.map((item, index) => <div key={item.name}><b>{String(index+1).padStart(2,'0')}</b><span>{item.name}</span><strong>{money(item.value)}</strong><i style={{width:`${(item.value/ranking[0].value)*100}%`}}/></div>)}</div> : <Unavailable/>}</article>
    </section>
    <section className="panel table-panel"><div className="table-toolbar"><PanelTitle eyebrow="BASE ANALÍTICA" title="Detalhamento dos registros"/><div className="table-actions"><label><Search size={15}/><input placeholder="Pesquisar na tabela" value={query} onChange={(e) => {setQuery(e.target.value); setPage(1);}}/></label><button className="secondary-button" onClick={download}><Download size={15}/> Exportar</button></div></div><div className="table-scroll"><table><thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead><tbody>{searched.slice((page-1)*10,page*10).map((row, i) => <tr key={i}>{columns.map((column) => <td key={column}>{display(row[column])}</td>)}</tr>)}</tbody></table></div><div className="pagination"><span>{searched.length.toLocaleString('pt-BR')} registros</span><div><button disabled={page===1} onClick={() => setPage(page-1)}>Anterior</button><b>{page}</b><button disabled={page*10>=searched.length} onClick={() => setPage(page+1)}>Próxima</button></div></div></section>
  </main>;
}

function aggregate(rows: DataRow[], dimension?: string, valueCol?: string) { if (!dimension || !valueCol) return []; const map = new Map<string, number>(); rows.forEach((row) => { const name = row[dimension]; const value = toNumber(row[valueCol]); if (name !== null && value !== null) map.set(String(name), (map.get(String(name)) ?? 0) + value); }); return [...map].map(([name,value]) => ({name,value})).sort((a,b)=>b.value-a.value); }
function show(value: number | null) { return value === null ? 'Informação não disponível na base de dados' : value.toLocaleString('pt-BR'); }
function display(value: DataRow[string]) { if (value === null) return <span className="empty-cell">Não disponível</span>; if (value instanceof Date) return new Intl.DateTimeFormat('pt-BR').format(value); return String(value); }
function Kpi({icon,label,value}:{icon:React.ReactNode;label:string;value:string}) { return <article className="kpi"><div className="kpi-icon">{icon}</div><span>{label}</span><strong className={value.startsWith('Informação')?'unavailable-value':''}>{value}</strong><small>Fonte: base Utilizado</small></article>; }
function PanelTitle({eyebrow,title,action}:{eyebrow:string;title:string;action?:string}) { return <div className="panel-title"><div><span>{eyebrow}</span><h3>{title}</h3></div>{action&&<button>{action}<ChevronDown size={14}/></button>}</div>; }
function Unavailable(){return <div className="unavailable">Informação não disponível na base de dados</div>}
