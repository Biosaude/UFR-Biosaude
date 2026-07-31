import { useEffect, useMemo, useRef, useState } from 'react';
import { BarChart3, Building2, Check, ChevronDown, Download, Search, Stethoscope, Tags, UserRound, UsersRound, WalletCards, X } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import * as XLSX from 'xlsx';
import type { DataRow } from '../types';
import { normalizeName, resolveUtilizadoColumns, toDate, toNumber, type UtilizadoColumnKey } from '../services/workbook';

type SelectionState = Record<string, string[]>;
type MetricKey = 'value' | 'quantity';
type TimeGrain = 'month' | 'quarter' | 'year';
type FilterDefinition = { key: string; label: string; source?: UtilizadoColumnKey; temporal?: 'year' | 'quarter' | 'month'; column?: string };

const filterDefinitions: FilterDefinition[] = [
  { key: 'year', label: 'Ano', temporal: 'year' }, { key: 'quarter', label: 'Trimestre', temporal: 'quarter' }, { key: 'month', label: 'Mês', temporal: 'month' },
  { key: 'company', label: 'Empresa', source: 'company' },
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
];
const colors = ['#1d527e', '#4d7899', '#7699af', '#98b1be', '#d59053', '#79a28c'];
const months = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const filterGroups = [
  { label: 'Tempo', keys: ['year', 'quarter', 'month'] },
  { label: 'Empresa e localização', keys: ['company', 'hospitalState', 'clientState', 'hospital'] },
  { label: 'Comercial', keys: ['representative', 'client', 'doctor'] },
  { label: 'Produto', keys: ['brand', 'product', 'topic'] },
  { label: 'Processo', keys: ['voucherType', 'voucherStatus', 'scheduleType'] },
];

export function Dashboard({ rows, columns, resetSignal }: { rows: DataRow[]; columns: string[]; resetSignal: number }) {
  const [selections, setSelections] = useState<SelectionState>({});
  const [showMore, setShowMore] = useState(false);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [quantityRange, setQuantityRange] = useState<{ min: string; max: string }>({ min: '', max: '' });
  const [metric, setMetric] = useState<MetricKey>('value');
  const [timeGrain, setTimeGrain] = useState<TimeGrain>('month');
  const [compositionKey, setCompositionKey] = useState('brand');
  const [rankingKey, setRankingKey] = useState('hospital');
  const [rankingLimit, setRankingLimit] = useState(5);
  const columnMap = useMemo(() => resolveUtilizadoColumns(columns), [columns]);
  const dateCol = columnMap.surgeryDate;
  const valueCol = columnMap.totalValue;
  const quantityCol = columnMap.usedQuantity;
  const filters = useMemo(() => filterDefinitions.map((definition) => ({ ...definition, column: definition.temporal ? dateCol : definition.source ? columnMap[definition.source] : undefined })).filter((definition) => !!definition.column), [columnMap, dateCol]);

  useEffect(() => { setSelections({}); setQuantityRange({ min: '', max: '' }); setQuery(''); setPage(1); }, [rows, resetSignal]);

  const matches = (row: DataRow, ignoredKey?: string) => filters.every((filter) => {
    if (filter.key === ignoredKey || !selections[filter.key]?.length) return true;
    const value = filterValue(row, filter, dateCol);
    return value !== null && selections[filter.key].includes(value);
  }) && matchesQuantity(row, quantityCol, quantityRange);
  const filteredRows = useMemo(() => rows.filter((row) => matches(row)), [rows, filters, selections]); // eslint-disable-line react-hooks/exhaustive-deps
  const optionsFor = (filter: FilterDefinition) => uniqueOptions(rows.filter((row) => matches(row, filter.key)), filter, dateCol);
  const setFilter = (key: string, values: string[]) => { setSelections((current) => ({ ...current, [key]: values })); setPage(1); };
  const addVisualFilter = (key: string, value: string) => setFilter(key, [value]);

  const metrics = useMemo(() => {
    const distinct = (key: string) => { const column = filters.find((filter) => filter.key === key)?.column; return column ? new Set(filteredRows.map((row) => row[column!]).filter(hasValue)).size : null; };
    const values = valueCol ? filteredRows.map((row) => toNumber(row[valueCol])).filter((value): value is number => value !== null) : [];
    const total = values.length ? values.reduce((sum, value) => sum + value, 0) : null;
    const quantities = quantityCol ? filteredRows.map((row) => toNumber(row[quantityCol])).filter((value): value is number => value !== null) : [];
    return { total, quantity: quantities.length ? quantities.reduce((sum, value) => sum + value, 0) : null, average: total !== null && filteredRows.length ? total / filteredRows.length : null, client: distinct('client'), hospital: distinct('hospital'), doctor: distinct('doctor'), representative: distinct('representative'), brand: distinct('brand'), company: distinct('company'), product: distinct('product'), topic: distinct('topic') };
  }, [filteredRows, filters, valueCol, quantityCol]);
  const measureCol = metric === 'value' ? valueCol : quantityCol;
  const timeline = useMemo(() => aggregateTimeline(filteredRows, dateCol, measureCol, timeGrain), [filteredRows, dateCol, measureCol, timeGrain]);
  const compositionFilter = filters.find((filter) => filter.key === compositionKey) ?? filters.find((filter) => filter.key === 'brand');
  const participation = useMemo(() => aggregate(filteredRows, compositionFilter?.column, measureCol).slice(0, 6), [filteredRows, compositionFilter?.column, measureCol]);
  const rankingFilter = filters.find((filter) => filter.key === rankingKey) ?? filters.find((filter) => filter.key === 'hospital');
  const ranking = useMemo(() => aggregate(filteredRows, rankingFilter?.column, measureCol).slice(0, rankingLimit), [filteredRows, rankingFilter?.column, measureCol, rankingLimit]);
  const searched = filteredRows.filter((row) => !query || Object.values(row).some((value) => String(value ?? '').toLowerCase().includes(query.toLowerCase())));
  const money = (value: number | null) => value === null ? 'Informação não disponível na base de dados' : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  const number = (value: number | null) => value === null ? 'Informação não disponível na base de dados' : new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(value);
  const formatMeasure = (value: number | null) => metric === 'value' ? money(value) : number(value);
  const download = () => { const worksheet = XLSX.utils.json_to_sheet(searched); const workbook = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(workbook, worksheet, 'Utilizado'); XLSX.writeFile(workbook, 'utilizado-filtrado.xlsx'); };
  const availableGroups = filterGroups.map((group) => ({ ...group, filters: group.keys.map((key) => filters.find((filter) => filter.key === key)).filter(Boolean) as FilterDefinition[] })).filter((group) => group.filters.length);
  const visibleGroups = availableGroups.slice(0, 2); const additionalGroups = availableGroups.slice(2);

  return <main className="dashboard">
    <div className={`filter-bar ${showMore ? 'expanded' : ''}`}>
      <div className="filter-heading"><span>Filtros</span><small>Refine a análise</small></div>
      <div className="filter-fields">{visibleGroups.map((group) => <FilterGroup key={group.label} label={group.label} filters={group.filters} optionsFor={optionsFor} selections={selections} setFilter={setFilter}/>)}</div>
      {!!additionalGroups.length && <button className="more-filter" onClick={() => setShowMore((value) => !value)}>{showMore ? 'Recolher filtros' : `+ ${additionalGroups.reduce((total, group) => total + group.filters.length, 0)} filtros`}</button>}
      {showMore && <div className="additional-filters">{additionalGroups.map((group) => <FilterGroup key={group.label} label={group.label} filters={group.filters} optionsFor={optionsFor} selections={selections} setFilter={setFilter}/>)}{quantityCol && <QuantityRange values={quantityRange} onChange={(values) => { setQuantityRange(values); setPage(1); }}/>}</div>}
    </div>
    {!filteredRows.length && <div className="no-results">Nenhum resultado para a seleção atual <button onClick={() => setSelections({})}>Limpar filtros</button></div>}
    <section className="kpi-section"><div className="section-heading"><h2>Visão executiva</h2><p>Indicadores consolidados para o recorte selecionado</p></div><div className="kpi-groups">
      <KpiGroup label="Principais indicadores" featured><Kpi icon={<WalletCards/>} label="Valor utilizado" value={money(metrics.total)} description="Valor consolidado" tooltip={money(metrics.total)}/><Kpi icon={<Tags/>} label="Quantidade utilizada" value={number(metrics.quantity)} description="Soma das unidades registradas" tooltip="Soma das unidades registradas na coluna Quantidade Utilizada."/><Kpi icon={<BarChart3/>} label="Registros" value={filteredRows.length.toLocaleString('pt-BR')} description="Linhas no recorte"/></KpiGroup>
      <KpiGroup label="Relacionamento"><Kpi icon={<UsersRound/>} label="Clientes" value={show(metrics.client)} description="Contagem distinta"/><Kpi icon={<Building2/>} label="Hospitais" value={show(metrics.hospital)} description="Contagem distinta"/><Kpi icon={<Stethoscope/>} label="Médicos" value={show(metrics.doctor)} description="Contagem distinta"/><Kpi icon={<UserRound/>} label="Representantes" value={show(metrics.representative)} description="Contagem distinta"/></KpiGroup>
      <KpiGroup label="Produto"><Kpi icon={<Tags/>} label="Marcas" value={show(metrics.brand)} description="Contagem distinta"/><Kpi icon={<Tags/>} label="Produtos" value={show(metrics.product)} description="Contagem distinta"/><Kpi icon={<Tags/>} label="Tópicos do produto" value={show(metrics.topic)} description="Contagem distinta"/><Kpi icon={<Building2/>} label="Empresas" value={show(metrics.company)} description="Contagem distinta"/></KpiGroup>
    </div>
    </section>
    <section className="visual-grid">
      <article className="panel timeline"><PanelTitle title={`${metric === 'value' ? 'Valor' : 'Quantidade'} utilizado ao longo do tempo`} description="Evolução baseada na Data da Cirurgia" action={<ChartControls metric={metric} onMetric={setMetric} grain={timeGrain} onGrain={setTimeGrain}/>}/>{timeline.length ? <ResponsiveContainer width="100%" height={312}><BarChart data={timeline}><CartesianGrid vertical={false} stroke="#e8edf0"/><XAxis dataKey="name" axisLine={false} tickLine={false}/><YAxis axisLine={false} tickLine={false} tickFormatter={(value) => metric === 'value' ? `${value / 1000}k` : number(value)}/><Tooltip formatter={(value) => formatMeasure(Number(value))}/><Bar dataKey="value" fill="#1d527e" radius={[5, 5, 0, 0]}/></BarChart></ResponsiveContainer> : <Unavailable/>}</article>
      <article className="panel"><PanelTitle title={`Composição por ${compositionFilter?.label.toLowerCase() ?? 'marca'}`} description={`Participação por ${metric === 'value' ? 'valor' : 'quantidade'} utilizado`} action={<DimensionSelect value={compositionKey} onChange={setCompositionKey} filters={filters}/>}/>{participation.length ? <div className="donut-wrap"><ResponsiveContainer width="55%" height={275}><PieChart><Pie data={participation} dataKey="value" nameKey="name" innerRadius={72} outerRadius={104} paddingAngle={2} onClick={(item) => compositionFilter && addVisualFilter(compositionFilter.key, item.name)}>{participation.map((_, index) => <Cell key={index} fill={colors[index]}/>)}</Pie><Tooltip formatter={(value) => formatMeasure(Number(value))}/></PieChart></ResponsiveContainer><div className="legend">{participation.map((item, index) => <button key={item.name} onClick={() => compositionFilter && addVisualFilter(compositionFilter.key, item.name)}><i style={{ background: colors[index] }}/><span>{item.name}</span><b>{formatMeasure(item.value)}</b></button>)}</div></div> : <Unavailable/>}</article>
      <article className="panel ranking"><PanelTitle description={`Ranking por ${metric === 'value' ? 'valor' : 'quantidade'} utilizado`} title={`${rankingFilter?.label ?? 'Hospital'} em destaque`} action={<RankingControls dimension={rankingKey} onDimension={setRankingKey} limit={rankingLimit} onLimit={setRankingLimit} filters={filters}/>}/>{ranking.length ? <div className="ranking-list">{ranking.map((item, index) => <button key={item.name} onClick={() => rankingFilter && addVisualFilter(rankingFilter.key, item.name)}><b>{String(index + 1).padStart(2, '0')}</b><span>{item.name}</span><strong>{formatMeasure(item.value)}</strong><i style={{ width: ranking[0].value ? `${(item.value / ranking[0].value) * 100}%` : '0%' }}/></button>)}</div> : <Unavailable/>}</article>
    </section>
    <section className="panel table-panel"><div className="table-toolbar"><PanelTitle title="Detalhamento dos registros" description="Base analítica do recorte selecionado"/><div className="table-actions"><label><Search size={15}/><input placeholder="Pesquisar na tabela" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }}/></label><button className="secondary-button" onClick={download}><Download size={15}/> Exportar</button></div></div><div className="table-scroll"><table><thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead><tbody>{searched.slice((page - 1) * 10, page * 10).map((row, index) => <tr key={index}>{columns.map((column) => <td key={column}>{display(row[column])}</td>)}</tr>)}</tbody></table></div><div className="table-totals"><span>Quantidade utilizada <strong>{number(metrics.quantity)}</strong></span><span>Valor total <strong>{money(metrics.total)}</strong></span></div><div className="pagination"><span>{searched.length.toLocaleString('pt-BR')} registros</span><div><button disabled={page === 1} onClick={() => setPage(page - 1)}>Anterior</button><b>{page}</b><button disabled={page * 10 >= searched.length} onClick={() => setPage(page + 1)}>Próxima</button></div></div></section>
  </main>;
}

function FilterGroup({ label, filters, optionsFor, selections, setFilter }: { label: string; filters: FilterDefinition[]; optionsFor: (filter: FilterDefinition) => string[]; selections: SelectionState; setFilter: (key: string, values: string[]) => void }) {
  return <div className="filter-group"><span className="filter-group-label">{label}</span><div>{filters.map((filter) => <MultiSelect key={filter.key} definition={filter} options={optionsFor(filter)} values={selections[filter.key] ?? []} onChange={(values) => setFilter(filter.key, values)}/>)}</div></div>;
}

function QuantityRange({ values, onChange }: { values: { min: string; max: string }; onChange: (values: { min: string; max: string }) => void }) {
  return <div className="filter-group quantity-range"><span className="filter-group-label">Quantidade utilizada</span><div><label>Quantidade mínima<input type="number" step="any" value={values.min} onChange={(event) => onChange({ ...values, min: event.target.value })} placeholder="Mínimo"/></label><label>Quantidade máxima<input type="number" step="any" value={values.max} onChange={(event) => onChange({ ...values, max: event.target.value })} placeholder="Máximo"/></label>{(values.min || values.max) && <button onClick={() => onChange({ min: '', max: '' })}>Limpar</button>}</div></div>;
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
function matchesQuantity(row: DataRow, quantityCol: string | undefined, range: { min: string; max: string }) { if (!quantityCol || (!range.min && !range.max)) return true; const value = toNumber(row[quantityCol]); if (value === null) return false; const min = range.min === '' ? null : Number(range.min); const max = range.max === '' ? null : Number(range.max); return (min === null || value >= min) && (max === null || value <= max); }
function aggregateTimeline(rows: DataRow[], dateCol?: string, measureCol?: string, grain: TimeGrain = 'month') { if (!dateCol || !measureCol) return []; const grouped = new Map<string, { name: string; value: number }>(); rows.forEach((row) => { const date = toDate(row[dateCol]); const value = toNumber(row[measureCol]); if (!date || value === null) return; const quarter = Math.floor(date.getMonth() / 3) + 1; const key = grain === 'year' ? String(date.getFullYear()) : grain === 'quarter' ? `${date.getFullYear()}-Q${quarter}` : `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`; const name = grain === 'year' ? key : grain === 'quarter' ? `Q${quarter}/${date.getFullYear()}` : new Intl.DateTimeFormat('pt-BR', { month: 'short', year: 'numeric' }).format(date); const current = grouped.get(key) ?? { name, value: 0 }; current.value += value; grouped.set(key, current); }); return [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, item]) => item); }
function aggregate(rows: DataRow[], dimension?: string, valueCol?: string) { if (!dimension || !valueCol) return []; const map = new Map<string, number>(); rows.forEach((row) => { const name = row[dimension]; const value = toNumber(row[valueCol]); if (hasValue(name) && value !== null) map.set(String(name), (map.get(String(name)) ?? 0) + value); }); return [...map].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value); }
function hasValue(value: DataRow[string] | undefined): value is string | number | boolean | Date { return value !== null && value !== undefined && String(value).trim() !== ''; }
function show(value: number | null) { return value === null ? 'Informação não disponível na base de dados' : value.toLocaleString('pt-BR'); }
function display(value: DataRow[string]) { if (value === null) return <span className="empty-cell">Não disponível</span>; if (value instanceof Date) return new Intl.DateTimeFormat('pt-BR').format(value); return String(value); }
function KpiGroup({ label, children, featured }: { label: string; children: React.ReactNode; featured?: boolean }) { return <div className={`kpi-group ${featured ? 'featured' : ''}`}><span>{label}</span><div>{children}</div></div>; }
function Kpi({ icon, label, value, description, tooltip }: { icon: React.ReactNode; label: string; value: string; description: string; tooltip?: string }) { return <article className="kpi" title={tooltip}><div className="kpi-icon">{icon}</div><span>{label}</span><strong className={value.startsWith('Informação') ? 'unavailable-value' : ''}>{value}</strong><p>{description}</p><small>Fonte: base Utilizado</small></article>; }
function PanelTitle({ title, description, action }: { title: string; description: string; action?: React.ReactNode }) { return <div className="panel-title"><div><h3>{title}</h3><p>{description}</p></div>{action && <div className="panel-controls">{action}</div>}</div>; }
function ChartControls({ metric, onMetric, grain, onGrain }: { metric: MetricKey; onMetric: (value: MetricKey) => void; grain: TimeGrain; onGrain: (value: TimeGrain) => void }) { return <><select value={metric} onChange={(event) => onMetric(event.target.value as MetricKey)}><option value="value">Valor utilizado</option><option value="quantity">Quantidade utilizada</option></select><select value={grain} onChange={(event) => onGrain(event.target.value as TimeGrain)}><option value="month">Mensal</option><option value="quarter">Trimestral</option><option value="year">Anual</option></select></>; }
function DimensionSelect({ value, onChange, filters }: { value: string; onChange: (value: string) => void; filters: FilterDefinition[] }) { return <select value={value} onChange={(event) => onChange(event.target.value)}>{filters.filter((filter) => !filter.temporal).map((filter) => <option key={filter.key} value={filter.key}>{filter.label}</option>)}</select>; }
function RankingControls({ dimension, onDimension, limit, onLimit, filters }: { dimension: string; onDimension: (value: string) => void; limit: number; onLimit: (value: number) => void; filters: FilterDefinition[] }) { return <><DimensionSelect value={dimension} onChange={onDimension} filters={filters}/><select value={limit} onChange={(event) => onLimit(Number(event.target.value))}><option value={5}>Top 5</option><option value={10}>Top 10</option><option value={20}>Top 20</option></select></>; }
function Unavailable() { return <div className="unavailable">Informação não disponível na base de dados</div>; }
