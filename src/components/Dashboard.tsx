import { useEffect, useMemo, useRef, useState } from 'react';
import { BarChart3, Building2, Check, ChevronDown, Download, Search, Stethoscope, Tags, UserRound, UsersRound, WalletCards, X } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import * as XLSX from 'xlsx';
import type { DataRow } from '../types';
import { normalizeName, resolveUtilizadoColumns, toDate, toNumber, type UtilizadoColumnKey } from '../services/workbook';

type SelectionState = Record<string, string[]>;
type FilterDefinition = { key: string; label: string; source?: UtilizadoColumnKey; temporal?: 'year' | 'quarter' | 'month'; column?: string };

const filterDefinitions: FilterDefinition[] = [
  { key: 'year', label: 'Ano', temporal: 'year' }, { key: 'quarter', label: 'Trimestre', temporal: 'quarter' }, { key: 'month', label: 'Mês', temporal: 'month' },
  { key: 'hospitalState', label: 'UF Hospital', source: 'hospitalState' },
  { key: 'clientState', label: 'UF Cliente', source: 'clientState' },
  { key: 'brand', label: 'Marca', source: 'brand' },
  { key: 'topic', label: 'Tópico do Produto', source: 'productTopic' },
  { key: 'client', label: 'Cliente', source: 'billingClient' }, { key: 'hospital', label: 'Hospital', source: 'hospital' },
  { key: 'doctor', label: 'Médico', source: 'doctor' }, { key: 'representative', label: 'Representante', source: 'mainRepresentative' },
  { key: 'product', label: 'Produto', source: 'product' },
  { key: 'scheduleType', label: 'Tipo de Agendamento', source: 'scheduleType' },
  { key: 'voucherType', label: 'Tipo do Vale', source: 'voucherType' },
  { key: 'voucherStatus', label: 'Situação do Vale', source: 'voucherStatus' },
  { key: 'surgeryType', label: 'Tipo de Cirurgia', source: 'surgeryType' },
];
const colors = ['#1d527e', '#4d7899', '#7699af', '#98b1be', '#d59053', '#79a28c'];
const months = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

export function Dashboard({ rows, columns, resetSignal }: { rows: DataRow[]; columns: string[]; resetSignal: number }) {
  const [selections, setSelections] = useState<SelectionState>({});
  const [showMore, setShowMore] = useState(false);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const columnMap = useMemo(() => resolveUtilizadoColumns(columns), [columns]);
  const dateCol = columnMap.surgeryDate;
  const valueCol = columnMap.totalValue;
  const filters = useMemo(() => filterDefinitions.map((definition) => ({ ...definition, column: definition.temporal ? dateCol : definition.source ? columnMap[definition.source] : undefined })).filter((definition) => !!definition.column), [columnMap, dateCol]);

  useEffect(() => { setSelections({}); setQuery(''); setPage(1); }, [rows, resetSignal]);

  const matches = (row: DataRow, ignoredKey?: string) => filters.every((filter) => {
    if (filter.key === ignoredKey || !selections[filter.key]?.length) return true;
    const value = filterValue(row, filter, dateCol);
    return value !== null && selections[filter.key].includes(value);
  });
  const filteredRows = useMemo(() => rows.filter((row) => matches(row)), [rows, filters, selections]); // eslint-disable-line react-hooks/exhaustive-deps
  const optionsFor = (filter: FilterDefinition) => uniqueOptions(rows.filter((row) => matches(row, filter.key)), filter, dateCol);
  const setFilter = (key: string, values: string[]) => { setSelections((current) => ({ ...current, [key]: values })); setPage(1); };
  const addVisualFilter = (key: string, value: string) => setFilter(key, [value]);

  const metrics = useMemo(() => {
    const distinct = (key: string) => { const column = filters.find((filter) => filter.key === key)?.column; return column ? new Set(filteredRows.map((row) => row[column!]).filter(hasValue)).size : null; };
    const values = valueCol ? filteredRows.map((row) => toNumber(row[valueCol])).filter((value): value is number => value !== null) : [];
    const total = values.length ? values.reduce((sum, value) => sum + value, 0) : null;
    return { total, average: total !== null && filteredRows.length ? total / filteredRows.length : null, client: distinct('client'), hospital: distinct('hospital'), doctor: distinct('doctor'), representative: distinct('representative'), brand: distinct('brand') };
  }, [filteredRows, filters, valueCol]);
  const timeline = useMemo(() => aggregateTimeline(filteredRows, dateCol, valueCol), [filteredRows, dateCol, valueCol]);
  const participation = useMemo(() => aggregate(filteredRows, filters.find((filter) => filter.key === 'brand')?.column, valueCol).slice(0, 6), [filteredRows, filters, valueCol]);
  const rankingFilter = filters.find((filter) => filter.key === 'hospital') ?? filters.find((filter) => filter.key === 'client');
  const ranking = useMemo(() => aggregate(filteredRows, rankingFilter?.column, valueCol).slice(0, 5), [filteredRows, rankingFilter?.column, valueCol]);
  const searched = filteredRows.filter((row) => !query || Object.values(row).some((value) => String(value ?? '').toLowerCase().includes(query.toLowerCase())));
  const money = (value: number | null) => value === null ? 'Informação não disponível na base de dados' : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  const download = () => { const worksheet = XLSX.utils.json_to_sheet(searched); const workbook = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(workbook, worksheet, 'Utilizado'); XLSX.writeFile(workbook, 'utilizado-filtrado.xlsx'); };
  const visibleFilters = filters.slice(0, 7); const additionalFilters = filters.slice(7);

  return <main className="dashboard">
    <div className={`filter-bar ${showMore ? 'expanded' : ''}`}>
      <div className="filter-heading"><span>Filtros</span><small>Filtros disponíveis</small></div>
      <div className="filter-fields">{visibleFilters.map((filter) => <MultiSelect key={filter.key} definition={filter} options={optionsFor(filter)} values={selections[filter.key] ?? []} onChange={(values) => setFilter(filter.key, values)}/>)}</div>
      {!!additionalFilters.length && <button className="more-filter" onClick={() => setShowMore((value) => !value)}>{showMore ? 'Recolher filtros' : `+ ${additionalFilters.length} filtros`}</button>}
      {showMore && <div className="additional-filters">{additionalFilters.map((filter) => <MultiSelect key={filter.key} definition={filter} options={optionsFor(filter)} values={selections[filter.key] ?? []} onChange={(values) => setFilter(filter.key, values)}/>)}</div>}
    </div>
    {!filteredRows.length && <div className="no-results">Nenhum resultado para a seleção atual <button onClick={() => setSelections({})}>Limpar filtros</button></div>}
    <section className="kpi-grid">
      <Kpi icon={<WalletCards/>} label="Valor utilizado" value={money(metrics.total)} tooltip={money(metrics.total)}/><Kpi icon={<BarChart3/>} label="Registros" value={filteredRows.length.toLocaleString('pt-BR')}/><Kpi icon={<UsersRound/>} label="Clientes" value={show(metrics.client)}/><Kpi icon={<Building2/>} label="Hospitais" value={show(metrics.hospital)}/><Kpi icon={<Stethoscope/>} label="Médicos" value={show(metrics.doctor)}/><Kpi icon={<UserRound/>} label="Representantes" value={show(metrics.representative)}/><Kpi icon={<Tags/>} label="Marcas" value={show(metrics.brand)}/><Kpi icon={<WalletCards/>} label="Valor médio" value={money(metrics.average)} tooltip={`Valor médio por registro: ${money(metrics.average)}`}/>
    </section>
    <section className="visual-grid">
      <article className="panel timeline"><PanelTitle eyebrow="EVOLUÇÃO TEMPORAL" title="Utilizado ao longo do tempo" action="Mensal"/>{timeline.length ? <ResponsiveContainer width="100%" height={250}><BarChart data={timeline} onClick={(event) => event?.activePayload?.[0] && addVisualFilter('month', event.activePayload[0].payload.month)}><CartesianGrid vertical={false} stroke="#e8edf0"/><XAxis dataKey="name" axisLine={false} tickLine={false}/><YAxis axisLine={false} tickLine={false} tickFormatter={(value) => `${value / 1000}k`}/><Tooltip formatter={(value) => money(Number(value))}/><Bar dataKey="value" fill="#1d527e" radius={[5, 5, 0, 0]}/></BarChart></ResponsiveContainer> : <Unavailable/>}</article>
      <article className="panel"><PanelTitle eyebrow="PARTICIPAÇÃO" title="Composição por marca" action="Marca"/>{participation.length ? <div className="donut-wrap"><ResponsiveContainer width="55%" height={220}><PieChart><Pie data={participation} dataKey="value" nameKey="name" innerRadius={62} outerRadius={90} paddingAngle={2} onClick={(item) => addVisualFilter('brand', item.name)}>{participation.map((_, index) => <Cell key={index} fill={colors[index]}/>)}</Pie><Tooltip formatter={(value) => money(Number(value))}/></PieChart></ResponsiveContainer><div className="legend">{participation.map((item, index) => <button key={item.name} onClick={() => addVisualFilter('brand', item.name)}><i style={{ background: colors[index] }}/><span>{item.name}</span><b>{money(item.value)}</b></button>)}</div></div> : <Unavailable/>}</article>
      <article className="panel ranking"><PanelTitle eyebrow="RANKING EXECUTIVO" title={rankingFilter?.key === 'hospital' ? 'Hospitais em destaque' : 'Clientes em destaque'} action="Top 5"/>{ranking.length ? <div className="ranking-list">{ranking.map((item, index) => <button key={item.name} onClick={() => rankingFilter && addVisualFilter(rankingFilter.key, item.name)}><b>{String(index + 1).padStart(2, '0')}</b><span>{item.name}</span><strong>{money(item.value)}</strong><i style={{ width: ranking[0].value ? `${(item.value / ranking[0].value) * 100}%` : '0%' }}/></button>)}</div> : <Unavailable/>}</article>
    </section>
    <section className="panel table-panel"><div className="table-toolbar"><PanelTitle eyebrow="BASE ANALÍTICA" title="Detalhamento dos registros"/><div className="table-actions"><label><Search size={15}/><input placeholder="Pesquisar na tabela" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }}/></label><button className="secondary-button" onClick={download}><Download size={15}/> Exportar</button></div></div><div className="table-scroll"><table><thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead><tbody>{searched.slice((page - 1) * 10, page * 10).map((row, index) => <tr key={index}>{columns.map((column) => <td key={column}>{display(row[column])}</td>)}</tr>)}</tbody></table></div><div className="pagination"><span>{searched.length.toLocaleString('pt-BR')} registros</span><div><button disabled={page === 1} onClick={() => setPage(page - 1)}>Anterior</button><b>{page}</b><button disabled={page * 10 >= searched.length} onClick={() => setPage(page + 1)}>Próxima</button></div></div></section>
  </main>;
}

function MultiSelect({ definition, options, values, onChange }: { definition: FilterDefinition; options: string[]; values: string[]; onChange: (values: string[]) => void }) {
  const [open, setOpen] = useState(false); const [search, setSearch] = useState(''); const root = useRef<HTMLDivElement>(null);
  useEffect(() => { const close = (event: MouseEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); }; document.addEventListener('mousedown', close); return () => document.removeEventListener('mousedown', close); }, []);
  const visible = options.filter((option) => normalizeName(option).includes(normalizeName(search)));
  const label = values.length === 0 ? 'Todos' : values.length === 1 ? values[0] : `${values.length} selecionados`;
  return <div className={`multi-select ${open ? 'open' : ''}`} ref={root}>
    <button className="filter-chip" onClick={() => setOpen((value) => !value)} aria-expanded={open}><span className="filter-label">{definition.label}</span><strong title={values.join(', ')}>{label}</strong><ChevronDown size={14}/></button>
    {open && <div className="filter-menu">
      {options.length > 6 && <label className="filter-search"><Search size={14}/><input autoFocus value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Pesquisar"/></label>}
      <button className={`filter-option all ${values.length === 0 ? 'selected' : ''}`} onClick={() => onChange([])}><span>{values.length === 0 && <Check/>}</span>Todos</button>
      <div className="filter-options">{visible.map((option) => { const selected = values.includes(option); return <button className={`filter-option ${selected ? 'selected' : ''}`} key={option} onClick={() => onChange(selected ? values.filter((value) => value !== option) : [...values, option])}><span>{selected && <Check/>}</span>{option}</button>; })}</div>
      {!visible.length && <p className="filter-empty">Nenhum resultado</p>}
      {!!values.length && <button className="clear-selection" onClick={() => onChange([])}><X size={12}/> Limpar seleção</button>}
    </div>}
  </div>;
}

function filterValue(row: DataRow, filter: FilterDefinition, dateCol?: string) { if (filter.temporal) { const date = dateCol ? toDate(row[dateCol]) : null; if (!date) return null; if (filter.temporal === 'year') return String(date.getFullYear()); if (filter.temporal === 'quarter') return `Q${Math.floor(date.getMonth() / 3) + 1}`; return months[date.getMonth()]; } const value = filter.column ? row[filter.column] : null; return hasValue(value) ? String(value) : null; }
function uniqueOptions(rows: DataRow[], filter: FilterDefinition, dateCol?: string) { const options = [...new Set(rows.map((row) => filterValue(row, filter, dateCol)).filter((value): value is string => value !== null))]; if (filter.temporal === 'year') return options.sort((a, b) => Number(a) - Number(b)); if (filter.temporal === 'quarter') return options.sort((a, b) => Number(a.slice(1)) - Number(b.slice(1))); if (filter.temporal === 'month') return options.sort((a, b) => months.indexOf(a) - months.indexOf(b)); return options.sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base', numeric: true })); }
function aggregateTimeline(rows: DataRow[], dateCol?: string, valueCol?: string) { if (!dateCol || !valueCol) return []; const grouped = new Map<string, { name: string; month: string; value: number; quantity: number }>(); rows.forEach((row) => { const date = toDate(row[dateCol]); const value = toNumber(row[valueCol]); if (!date || value === null) return; const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`; const current = grouped.get(key) ?? { name: new Intl.DateTimeFormat('pt-BR', { month: 'short', year: '2-digit' }).format(date), month: months[date.getMonth()], value: 0, quantity: 0 }; current.value += value; current.quantity++; grouped.set(key, current); }); return [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, item]) => item); }
function aggregate(rows: DataRow[], dimension?: string, valueCol?: string) { if (!dimension || !valueCol) return []; const map = new Map<string, number>(); rows.forEach((row) => { const name = row[dimension]; const value = toNumber(row[valueCol]); if (hasValue(name) && value !== null) map.set(String(name), (map.get(String(name)) ?? 0) + value); }); return [...map].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value); }
function hasValue(value: DataRow[string] | undefined): value is string | number | boolean | Date { return value !== null && value !== undefined && String(value).trim() !== ''; }
function show(value: number | null) { return value === null ? 'Informação não disponível na base de dados' : value.toLocaleString('pt-BR'); }
function display(value: DataRow[string]) { if (value === null) return <span className="empty-cell">Não disponível</span>; if (value instanceof Date) return new Intl.DateTimeFormat('pt-BR').format(value); return String(value); }
function Kpi({ icon, label, value, tooltip }: { icon: React.ReactNode; label: string; value: string; tooltip?: string }) { return <article className="kpi" title={tooltip}><div className="kpi-icon">{icon}</div><span>{label}</span><strong className={value.startsWith('Informação') ? 'unavailable-value' : ''}>{value}</strong><small>Fonte: base Utilizado</small></article>; }
function PanelTitle({ eyebrow, title, action }: { eyebrow: string; title: string; action?: string }) { return <div className="panel-title"><div><span>{eyebrow}</span><h3>{title}</h3></div>{action && <button>{action}<ChevronDown size={14}/></button>}</div>; }
function Unavailable() { return <div className="unavailable">Informação não disponível na base de dados</div>; }
