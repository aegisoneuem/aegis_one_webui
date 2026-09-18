import { Button } from './ui/button';
import { PhosphorIcon } from './identity';
import { PlatformCompliance, StatusDonut, MetricBars } from './charts';
export function Overview({
  view: v
}: {
  view: any;
}) {
  return <section data-screen-label="Overview" className="ao-page clean-overview">
 <div className="overview-heading"><div><h1>Operations overview</h1><p>{v.endpointsLabel} endpoints <span>·</span> Sample environment</p></div><div className="overview-tools"><Button variant="outline" onClick={v.refresh}><PhosphorIcon name="ArrowsClockwise" size={16} />{v.loading ? 'Refreshing…' : 'Refresh'}</Button><Button variant="outline" onClick={v.openCustomize}><PhosphorIcon name="GearSix" size={16} />Customize</Button></div></div>
 <div className="scope-bar"><div><select aria-label="Aegis Zone" value={v.fSite} onChange={v.setSite}>{["All Aegis Zones", 'Mumbai HQ', 'Delhi Branch', 'Jaipur Branch', 'Bengaluru'].map(x => <option key={x}>{x}</option>)}</select><select aria-label="Platform" value={v.fPlat} onChange={v.setPlat}>{['All Platforms', 'Windows', 'macOS', 'Linux'].map(x => <option key={x}>{x}</option>)}</select><select aria-label="Period" value={v.fRange} onChange={v.setRange}>{['Last 7 Days', 'Last 30 Days', 'Last 90 Days'].map(x => <option key={x}>{x}</option>)}</select></div><span className="freshness"><span className="status-dot" />Sample snapshot</span></div>
 <div className="clean-metrics">{v.kpi4.map((k: any, i: number) => <button className="clean-metric" key={k.label} onClick={k.go}><span className="metric-label">{k.label}<PhosphorIcon name={['Heartbeat', 'ShieldCheck', 'Warning', 'ArrowUpRight'][i]} size={17} /></span><span className="metric-value">{k.value}<small>{k.unit}</small></span><span className="metric-trend"><PhosphorIcon name={i === 2 ? 'ArrowDownRight' : 'ArrowUpRight'} size={14} />{k.trend.replace(' this week', '')}<span>vs previous period</span></span></button>)}</div>
 <div className="attention-strip">{v.strip3.map((x: any) => <button key={x.l} onClick={x.go}><span>{x.l}</span><strong style={{
          color: x.c
        }}>{x.v}</strong><PhosphorIcon name="CaretRight" size={13} /></button>)}</div>
 <div className="overview-charts">
 {v.wOn.compliance !== 'none' && <article className="clean-panel"><header><div><h2>Patch compliance</h2><p>By operating system</p></div><span className="chart-target">Target <b>95%</b></span></header><PlatformCompliance items={v.platComp} /></article>}
 {v.wOn.liveops !== 'none' && <article className="clean-panel"><header><div><h2>Operations status</h2><p>Current snapshot</p></div><Button variant="ghost" className="quiet-link" onClick={v.goLiveOps}>View all<PhosphorIcon name="ArrowRight" size={14} /></Button></header><div className="operations-chart"><StatusDonut items={v.liveRing} value={Number(v.liveTotal).toLocaleString()} label="operations" /><div className="clean-legend">{v.liveRing.map((r: any) => <button key={r.label} onClick={r.go}><i style={{
                background: r.c
              }} /><span>{r.label}</span><strong>{Number(r.v).toLocaleString()}</strong></button>)}</div></div></article>}
 </div>
 {v.wOn.activity !== 'none' && <article className="clean-panel activity-panel"><header><div><h2>Recent activity</h2><p>Latest endpoint and deployment events</p></div><Button variant="ghost" className="quiet-link" onClick={v.toggleActAll}>{v.actAll ? 'Show less' : 'View all'}<PhosphorIcon name="ArrowRight" size={14} /></Button></header><div className="activity-table">{v.liveAct.map((a: any, i: number) => <button key={i} onClick={a.go}><span className="activity-icon" style={{
            color: a.c
          }}><PhosphorIcon name={['ShieldCheck', 'Desktop', 'HardDrives', 'Warning', 'ArrowUpRight'][i % 5]} size={18} /></span><b>{a.t}</b><span>{a.m}</span><time>{a.when}</time><PhosphorIcon name="CaretRight" size={14} /></button>)}</div></article>}
 <div className="overview-footer"><Button variant="ghost" onClick={v.toggleMore}><PhosphorIcon name={v.moreOpen ? 'CaretDown' : 'CaretRight'} size={14} />{v.moreOpen ? 'Hide additional insights' : 'More insights'}</Button><span>·</span><Button variant="ghost" onClick={v.goLiveOps}>Open live operations<PhosphorIcon name="ArrowRight" size={14} /></Button></div>
 {v.moreOpen && <div className="additional-insights">
 {v.wOn.sites !== 'none' && <article className="clean-panel"><header><h2>Aegis Zone delivery efficiency</h2></header><MetricBars items={v.siteEff} /></article>}
 {v.wOn.fleet !== 'none' && <article className="clean-panel"><header><h2>Fleet health</h2></header><MetricBars items={v.ringParts4} /></article>}
 {v.wOn.dex !== 'none' && <article className="clean-panel"><header><h2>Endpoint experience</h2></header><MetricBars items={v.dexRing} /></article>}
 {v.wOn.os !== 'none' && <article className="clean-panel"><header><h2>OS lifecycle</h2></header><MetricBars items={v.osLife} /></article>}
 {v.wOn.reliability !== 'none' && <article className="clean-panel"><header><h2>Deployment success rate</h2></header><MetricBars items={v.reliability.map((x: any) => ({
          label: x.name,
          value: x.s + '%',
          color: '#249575',
          go: x.open
        }))} /></article>}
 {v.wOn.funnel !== 'none' && <article className="clean-panel"><header><h2>Exposure to remediation</h2></header><MetricBars items={v.funnel} /><Button variant="outline" className="insight-action" onClick={v.remediate44}>Review ready devices<PhosphorIcon name="ArrowRight" size={14} /></Button></article>}
 </div>}
 </section>;
}