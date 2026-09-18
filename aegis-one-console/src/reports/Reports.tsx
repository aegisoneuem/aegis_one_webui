import { useEffect, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Button } from '../components/ui/button';
import { PhosphorIcon } from '../components/identity';
import { templates, initialSchedules, type Schedule, type ReportEvent, type Frequency, type ExportFormat } from './data';
import { exportReport } from './export';
interface SavedReport {
  id: string;
  name: string;
  template: string;
  columns: string[];
  query: string;
}
interface Stored {
  schedules: Schedule[];
  events: ReportEvent[];
  custom: SavedReport[];
  widgets: string[];
}
const key = 'aegis-reports-approved-v1';
const newSchedule = (): Schedule => ({
  id: crypto.randomUUID(),
  name: '',
  template: 'patch-compliance',
  email: '',
  frequency: 'Weekly',
  format: 'CSV',
  next: '',
  last: '',
  paused: false
});
const date = (s: string) => s ? new Date(s).toLocaleString() : '—';
export function Reports() {
  const [store, setStore] = useState<Stored>(() => {
    try {
      const s = JSON.parse(localStorage.getItem(key) || 'null') as Stored;
      if (s && Array.isArray(s.schedules) && Array.isArray(s.events) && Array.isArray(s.custom) && Array.isArray(s.widgets)) return s;
    } catch {/* Use source defaults when browser storage is unavailable. */}
    return {
      schedules: initialSchedules,
      events: [],
      custom: [],
      widgets: ['patch-compliance', 'device', 'dex']
    };
  });
  const [section, setSection] = useState('schedule'),
    [search, setSearch] = useState(''),
    [page, setPage] = useState(1),
    [pageSize, setPageSize] = useState(25),
    [collapsed, setCollapsed] = useState<string[]>([]),
    [form, setForm] = useState<Schedule | null>(null),
    [editing, setEditing] = useState(false),
    [message, setMessage] = useState('');
  const [base, setBase] = useState('device'),
    [columns, setColumns] = useState<string[]>([]),
    [name, setName] = useState(''),
    [condition, setCondition] = useState(''),
    [field, setField] = useState(''),
    [operator, setOperator] = useState('contains'),
    [applied, setApplied] = useState<{
      field: string;
      value: string;
      operator: string;
    } | null>(null),
    [format, setFormat] = useState<ExportFormat>('CSV');
  const selected = templates.find(t => t.id === (['custom', 'query'].includes(section) ? base : section)) || templates[0];
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(store));
    } catch {
      setMessage('Changes are available for this session; browser storage is unavailable.');
    }
  }, [store]);
  const navigate = (id: string) => {
    setSection(id);
    setSearch('');
    setPage(1);
    setApplied(null);
  };
  const audit = (action: string, schedule: string, detail: string): ReportEvent => ({
    time: new Date().toISOString(),
    action,
    name: schedule,
    detail
  });
  const filtered = store.schedules.filter(s => [s.name, s.email, s.frequency, s.paused ? 'Paused' : 'Scheduled'].join(' ').toLowerCase().includes(search.toLowerCase()));
  const count = Math.max(1, Math.ceil(filtered.length / pageSize)),
    current = Math.min(count, page);
  const sourceRows = selected.id === 'audit' ? store.events.map(e => [date(e.time), e.action, e.name, e.detail]) : selected.rows;
  const indices = section === 'custom' && columns.length ? columns.map(c => selected.columns.indexOf(c)).filter(i => i >= 0) : selected.columns.map((_, i) => i);
  const matchedRows = sourceRows.filter(r => {
    if (section === 'query' && applied) {
      const index = selected.columns.indexOf(applied.field);
      const value = (r[index] || '').toLowerCase();
      return applied.operator === 'equals' ? value === applied.value.toLowerCase() : value.includes(applied.value.toLowerCase());
    }
    return r.join(' ').toLowerCase().includes(search.toLowerCase());
  });
  const reportColumns = indices.map(i => selected.columns[i]),
    reportRows = matchedRows.map(r => indices.map(i => r[i]));
  const saveForm = (event: React.FormEvent) => {
    event.preventDefault();
    if (!form) return;
    setStore(s => ({
      ...s,
      schedules: editing ? s.schedules.map(r => r.id === form.id ? form : r) : [form, ...s.schedules],
      events: [audit(editing ? 'Schedule updated' : 'Schedule created', form.name, `${form.frequency} · ${form.format} · ${form.email}`), ...s.events]
    }));
    setForm(null);
    setMessage('Schedule saved locally. Automatic execution and email delivery require the reporting service.');
    setPage(1);
  };
  const performExport = () => {
    try {
      exportReport(section === 'custom' && name ? name : selected.title, reportColumns, reportRows, format);
      setMessage(format === 'PDF' ? 'Print view opened. Choose Save as PDF in your browser.' : `${reportRows.length} displayed rows exported as ${format}.`);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Could not export the report.');
    }
  };
  const toolbar = <div className="rp-toolbar"><label className="rp-search"><PhosphorIcon name="MagnifyingGlass" size={16} /><input aria-label="Search reports" placeholder={section === 'schedule' ? 'Search schedules, recipients or frequency' : 'Search report rows'} value={search} onChange={e => {
        setSearch(e.target.value);
        setPage(1);
      }} /></label>{search && <Button variant="ghost" onClick={() => setSearch('')}>Clear</Button>}{section === 'schedule' ? <Button className="rp-primary" onClick={() => {
      setEditing(false);
      setForm(newSchedule());
    }}><PhosphorIcon name="Plus" size={16} />Add Schedule Report</Button> : <><select aria-label="Export format" value={format} onChange={e => setFormat(e.target.value as ExportFormat)}>{['CSV', 'XLSX', 'PDF'].map(x => <option key={x}>{x}</option>)}</select><Button variant="outline" disabled={!reportRows.length} onClick={performExport}><PhosphorIcon name="DownloadSimple" size={16} />{format === 'PDF' ? 'Print / PDF' : 'Export'}</Button></>}</div>;
  const reportBody = <><header className="rp-report-head"><h2>{section === 'custom' && name ? name : selected.title}</h2><p>{selected.description}</p></header>{!!selected.metrics.length && <div className="rp-metrics">{selected.metrics.map(([v, l]) => <div key={l}><strong>{v}</strong><span>{l}</span></div>)}</div>}<p className="rp-note">{selected.note}</p><p className="rp-count">{reportRows.length} preview rows{applied ? ` · ${applied.field} ${applied.operator} “${applied.value}”` : ''}</p><div className="rp-table"><table><thead><tr>{reportColumns.map(c => <th key={c}>{c}</th>)}</tr></thead><tbody>{reportRows.map((row, i) => <tr key={i}>{row.map((cell, j) => <td key={j}>{cell}</td>)}</tr>)}</tbody></table>{!reportRows.length && <div className="rp-empty"><PhosphorIcon name="FileText" size={26} /><h3>{search || applied ? 'No matching rows' : 'No records available'}</h3><p>{search || applied ? 'Clear the filter or change the query.' : selected.note}</p>{(search || applied) && <Button variant="outline" onClick={() => {
          setSearch('');
          setApplied(null);
        }}>Clear filters</Button>}</div>}</div></>;
  const baseSelect = <label>Report template<select aria-label="Report template" value={base} onChange={e => {
      setBase(e.target.value);
      setColumns([]);
      setField('');
      setApplied(null);
    }}>{templates.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}</select></label>;
  return <section className="ao-page rp-page" data-screen-label="Reports"><div className="rp-heading"><h1>Reports</h1><p>Schedule, generate and export reports across every module.</p></div>{message && <div className="rp-message" role="status">{message}<button aria-label="Dismiss report notification" onClick={() => setMessage('')}><PhosphorIcon name="X" size={16} /></button></div>}<div className="rp-shell"><nav className="rp-rail" aria-label="Report categories">{[['schedule', 'Schedule Reports'], ['custom', 'Custom Reports'], ['dashboards', 'Custom Dashboards'], ['query', 'Query Reports']].map(([id, label]) => <button key={id} aria-current={section === id ? 'page' : undefined} onClick={() => navigate(id)}>{label}</button>)}{['Patch & Vulnerability', 'Other Reports'].map(group => <div className="rp-group" key={group}><button className="rp-group-title" aria-expanded={!collapsed.includes(group)} onClick={() => setCollapsed(x => x.includes(group) ? x.filter(v => v !== group) : [...x, group])}>{group}<PhosphorIcon name={collapsed.includes(group) ? 'CaretRight' : 'CaretDown'} size={14} /></button>{!collapsed.includes(group) && templates.filter(t => t.group === group).map(t => <button className="rp-subitem" key={t.id} aria-current={section === t.id ? 'page' : undefined} onClick={() => navigate(t.id)}>{t.title.replace(/Report$/, 'Reports')}</button>)}</div>)}</nav><main className="rp-main">
 {section === 'schedule' ? <>{toolbar}<div className="rp-table"><table><thead><tr>{['Status', 'Next Run Time', 'Scheduler Name', 'Email To', 'Last Run Time', 'Frequency', 'Action'].map(x => <th key={x}>{x}</th>)}</tr></thead><tbody>{filtered.slice((current - 1) * pageSize, current * pageSize).map(s => <tr key={s.id}><td><span className={`rp-status ${s.paused ? 'paused' : ''}`}><PhosphorIcon name={s.paused ? 'Clock' : 'CalendarBlank'} size={16} />{s.paused ? 'Paused' : 'Scheduled'}</span></td><td>{s.paused ? '—' : date(s.next)}</td><td><button className="rp-link" onClick={() => navigate(s.template)}>{s.name}</button><small>{s.format}</small></td><td>{s.email}</td><td>{date(s.last)}</td><td>{s.frequency}</td><td><div className="rp-row-actions"><button title="Edit schedule" aria-label={`Edit ${s.name}`} onClick={() => {
                        setEditing(true);
                        setForm({
                          ...s
                        });
                      }}><PhosphorIcon name="GearSix" size={16} /></button><button title={s.paused ? 'Resume schedule' : 'Pause schedule'} aria-label={`${s.paused ? 'Resume' : 'Pause'} ${s.name}`} onClick={() => {
                        setStore(x => ({
                          ...x,
                          schedules: x.schedules.map(r => r.id === s.id ? {
                            ...r,
                            paused: !r.paused
                          } : r),
                          events: [audit(s.paused ? 'Schedule resumed' : 'Schedule paused', s.name, 'Local configuration changed'), ...x.events]
                        }));
                        setMessage(s.paused ? 'Schedule resumed locally.' : 'Schedule paused.');
                      }}><PhosphorIcon name={s.paused ? 'ArrowRight' : 'Clock'} size={16} /></button><button title="View report" aria-label={`View ${s.name}`} onClick={() => navigate(s.template)}><PhosphorIcon name="ArrowUpRight" size={16} /></button></div></td></tr>)}</tbody></table>{!filtered.length && <div className="rp-empty">No schedules match your search.</div>}</div><footer className="rp-pager"><label>Rows per page<select aria-label="Rows per page" value={pageSize} onChange={e => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}>{[25, 50, 100].map(n => <option key={n}>{n}</option>)}</select></label><span>{filtered.length ? (current - 1) * pageSize + 1 : 0}–{Math.min(current * pageSize, filtered.length)} of {filtered.length}</span><Button variant="ghost" aria-label="Previous report page" disabled={current === 1} onClick={() => setPage(current - 1)}><PhosphorIcon name="ArrowLeft" size={15} /></Button><Button variant="ghost" aria-label="Next report page" disabled={current === count} onClick={() => setPage(current + 1)}><PhosphorIcon name="ArrowRight" size={15} /></Button></footer><p className="rp-note rp-footnote">Demo schedules are stored in this browser. No reports or emails are sent automatically.</p></> : section === 'dashboards' ? <><header className="rp-report-head"><h2>Custom Dashboards</h2><p>Choose report summaries to include in your dashboard.</p></header><div className="rp-widget-options">{templates.filter(t => t.metrics.length).map(t => <label key={t.id}><input type="checkbox" checked={store.widgets.includes(t.id)} onChange={e => setStore(s => ({
                ...s,
                widgets: e.target.checked ? [...s.widgets, t.id] : s.widgets.filter(x => x !== t.id)
              }))} />{t.title}</label>)}</div><div className="rp-dashboard">{templates.filter(t => store.widgets.includes(t.id)).map(t => <button key={t.id} onClick={() => navigate(t.id)}><h3>{t.title}</h3>{t.metrics.map(([v, l]) => <div key={l}><strong>{v}</strong><span>{l}</span></div>)}<small>Open report <PhosphorIcon name="ArrowRight" size={14} /></small></button>)}</div>{!store.widgets.length && <div className="rp-empty">Choose at least one summary above.</div>}</> : <>{section === 'custom' && <div className="rp-builder"><h2>Custom Reports</h2><div className="rp-fields">{baseSelect}<label>Report name<input aria-label="Custom report name" value={name} onChange={e => setName(e.target.value)} placeholder="Monthly endpoint review" /></label></div><fieldset><legend>Columns to include</legend><div className="rp-widget-options">{selected.columns.map(c => <label key={c}><input type="checkbox" checked={!columns.length || columns.includes(c)} disabled={columns.length === 1 && columns.includes(c)} onChange={e => {
                    const next = (columns.length ? columns : selected.columns).filter(x => x !== c);
                    setColumns(e.target.checked ? [...next, c] : next.length ? next : [c]);
                  }} />{c}</label>)}</div></fieldset><Button variant="outline" disabled={!name.trim()} onClick={() => {
              const saved: SavedReport = {
                id: crypto.randomUUID(),
                name: name.trim(),
                template: base,
                columns: columns.length ? columns : selected.columns,
                query: search
              };
              setStore(s => ({
                ...s,
                custom: [saved, ...s.custom]
              }));
              setMessage('Custom report saved.');
            }}>Save custom report</Button>{!!store.custom.length && <label>Saved reports<select aria-label="Saved custom reports" defaultValue="" onChange={e => {
                const r = store.custom.find(x => x.id === e.target.value);
                if (r) {
                  setBase(r.template);
                  setColumns(r.columns);
                  setName(r.name);
                  setSearch(r.query);
                }
              }}><option value="" disabled>Choose a saved report</option>{store.custom.map(r => <option value={r.id} key={r.id}>{r.name}</option>)}</select></label>}</div>}{section === 'query' && <form className="rp-builder" onSubmit={e => {
            e.preventDefault();
            setApplied({
              field: field || selected.columns[0],
              value: condition,
              operator
            });
          }}><h2>Query Reports</h2><p>Filter the report snapshot using a field condition.</p><div className="rp-fields">{baseSelect}<label>Field<select aria-label="Query field" value={field || selected.columns[0]} onChange={e => setField(e.target.value)}>{selected.columns.map(c => <option key={c}>{c}</option>)}</select></label><label>Operator<select aria-label="Query operator" value={operator} onChange={e => setOperator(e.target.value)}><option value="contains">Contains</option><option value="equals">Equals</option></select></label><label>Value<input aria-label="Query value" value={condition} required onChange={e => setCondition(e.target.value)} /></label></div><Button type="submit" className="rp-primary">Run query</Button><Button variant="ghost" type="button" onClick={() => {
              setApplied(null);
              setCondition('');
            }}>Reset</Button></form>}{toolbar}{reportBody}</>}
 </main></div><Dialog.Root open={!!form} onOpenChange={open => {
      if (!open) setForm(null);
    }}><Dialog.Portal><Dialog.Overlay className="rp-overlay" /><Dialog.Content className="rp-modal"><Dialog.Title>{editing ? 'Edit schedule report' : 'Add schedule report'}</Dialog.Title><Dialog.Description>Configure the report, recipients and recurring cadence.</Dialog.Description><Dialog.Close asChild><button className="rp-close" aria-label="Close schedule dialog"><PhosphorIcon name="X" size={20} /></button></Dialog.Close>{form && <form onSubmit={saveForm}><label>Scheduler name<input required maxLength={120} value={form.name} onChange={e => setForm({
                ...form,
                name: e.target.value
              })} /></label><label>Report template<select value={form.template} onChange={e => setForm({
                ...form,
                template: e.target.value
              })}>{templates.map(t => <option value={t.id} key={t.id}>{t.title}</option>)}</select></label><label>Email to<input type="email" multiple required value={form.email} onChange={e => setForm({
                ...form,
                email: e.target.value
              })} placeholder="it-ops@company.com" /></label><div className="rp-fields"><label>Frequency<select value={form.frequency} onChange={e => setForm({
                  ...form,
                  frequency: e.target.value as Frequency
                })}>{['One-time', 'Daily', 'Weekly', 'Monthly'].map(f => <option key={f}>{f}</option>)}</select></label><label>Format<select value={form.format} onChange={e => setForm({
                  ...form,
                  format: e.target.value as ExportFormat
                })}>{['PDF', 'XLSX', 'CSV'].map(f => <option key={f}>{f}</option>)}</select></label></div><label>Next run time · browser local time<input required type="datetime-local" value={form.next} onChange={e => setForm({
                ...form,
                next: e.target.value
              })} /></label><p className="rp-note">Configuration is saved locally. Email delivery and scheduled execution require backend integration.</p><footer><Button type="button" variant="outline" onClick={() => setForm(null)}>Cancel</Button><Button type="submit" className="rp-primary">Save schedule</Button></footer></form>}</Dialog.Content></Dialog.Portal></Dialog.Root></section>;
}
