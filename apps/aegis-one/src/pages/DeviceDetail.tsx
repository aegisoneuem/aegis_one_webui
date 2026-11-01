import { useNavigate, useParams } from 'react-router-dom';
import { Button, Card, ErrorState, PageHeader, Skeleton, StatusPill, Tabs } from '@aegis/ui';
import { useResource } from '../app/useListController';
import { useCan } from '../app/auth';
import { bytes, dateTime, duration, humanise, num, pct, relative, toneFor } from '../app/format';
import { segment } from '../app/safeNavigate';
import type { Device } from '../api/types';
import styles from './DeviceDetail.module.css';

type SoftwareRow = {
  id: string;
  title: string;
  publisher: string;
  version: string;
  latestVersion: string;
  outdated: boolean;
  installedAt: string;
};
type PatchRow = {
  id: string;
  title: string;
  kb: string | null;
  severity: string;
  state: string;
  updatedAt: string;
};
type VulnRow = {
  id: string;
  title: string;
  severity: string;
  cvss: number;
  exploited: boolean;
  state: string;
  fixedBy: string;
};
type Diagnostics = {
  posture: {
    diskFreePct: number;
    diskTotalGb: number;
    ramGb: number;
    agentVersion: string;
    lastSeenAt: string;
    dexScore: number;
    configPassPct: number;
    encrypted: boolean;
    rebootPending: boolean;
  };
  recentJobs: {
    jobId: string;
    name: string;
    kind: string;
    state: string;
    exitCode: number | null;
    durationMs: number | null;
    finishedAt: string | null;
  }[];
  logBundles: {
    id: string;
    fileTypes: string[];
    status: string;
    sizeBytes: number;
    collectedAt: string;
  }[];
};

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'software', label: 'Software' },
  { id: 'patches', label: 'Patches' },
  { id: 'vulnerabilities', label: 'Vulnerabilities' },
  { id: 'diagnostics', label: 'Diagnostics' },
];

/**
 * One endpoint, in detail.
 *
 * The tab is a URL segment rather than component state, so a link to a
 * device's vulnerabilities opens on that tab.
 */
export default function DeviceDetail() {
  const { deviceId = '', tab = 'overview' } = useParams();
  const navigate = useNavigate();
  const canRunScripts = useCan('liveops:run');
  const canDeploy = useCan('deployments:create');

  const device = useResource<Device>(`/devices/${deviceId}`);

  if (device.error) {
    return (
      <ErrorState
        title="Device not found"
        description="It may have been retired, or it may be outside the zones you can see."
        retryLabel="Back to Devices"
        onRetry={() => void navigate('/devices')}
      />
    );
  }

  if (device.isLoading || !device.data) {
    return <Skeleton className={styles.summary} />;
  }

  const d = device.data;

  return (
    <div className={styles.page}>
      <PageHeader
        title={d.hostname}
        description={`${d.osName} ${d.osVersion} · ${d.zoneName} · last seen ${relative(d.lastSeenAt).toLowerCase()}`}
        actions={
          <>
            <StatusPill dot tone={toneFor(d.status)}>
              {humanise(d.status)}
            </StatusPill>
            {canRunScripts ? (
              <Button
                size="sm"
                onClick={() => void navigate(`/liveops?deviceIds=${segment(d.id)}`)}
              >
                Run script
              </Button>
            ) : null}
            {canDeploy ? (
              <Button
                size="sm"
                variant="primary"
                onClick={() => void navigate(`/deployments/new?deviceIds=${segment(d.id)}`)}
              >
                New action
              </Button>
            ) : null}
          </>
        }
      />

      <div className={styles.summary}>
        <Fact label="Primary user" value={`${d.primaryUserName} (${d.primaryUser})`} />
        <Fact label="Department" value={d.department} />
        <Fact label="Model" value={d.model} />
        <Fact label="Serial" value={d.serial} mono />
        <Fact label="IP address" value={d.ip} mono />
        <Fact label="Agent" value={d.agentVersion} />
        <Fact label="Enrolled" value={dateTime(d.enrolledAt)} />
        <Fact label="Compliance" value={pct(d.compliancePct, 0)} />
      </div>

      <Tabs
        label="Device sections"
        value={tab}
        onChange={(next) => void navigate(`/devices/${segment(deviceId)}/${segment(next)}`)}
        tabs={TABS}
      />

      <div className={styles.tabBody}>
        {tab === 'overview' ? <OverviewTab device={d} /> : null}
        {tab === 'software' ? <SoftwareTab deviceId={deviceId} /> : null}
        {tab === 'patches' ? <PatchesTab deviceId={deviceId} /> : null}
        {tab === 'vulnerabilities' ? <VulnerabilitiesTab deviceId={deviceId} /> : null}
        {tab === 'diagnostics' ? <DiagnosticsTab deviceId={deviceId} /> : null}
      </div>
    </div>
  );
}

function Fact({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className={styles.fact}>
      <span className={styles.factLabel}>{label}</span>
      <span
        className={mono ? `${styles.factValue} ${styles.mono}` : styles.factValue}
        title={value}
      >
        {value}
      </span>
    </div>
  );
}

function OverviewTab({ device }: { device: Device }) {
  return (
    <div className={styles.diagnosticsGrid}>
      <Card title="Posture">
        <div className={styles.summary}>
          <Fact label="Patch compliance" value={pct(device.compliancePct, 0)} />
          <Fact label="Pending patches" value={num(device.pendingPatches)} />
          <Fact label="Critical CVEs" value={num(device.criticalVulns)} />
          <Fact label="Config checks passing" value={pct(device.configPassPct, 0)} />
          <Fact label="Encryption" value={device.encrypted ? 'Enabled' : 'Not enabled'} />
          <Fact label="Restart pending" value={device.rebootPending ? 'Yes' : 'No'} />
        </div>
      </Card>
      <Card title="Hardware">
        <div className={styles.summary}>
          <Fact label="CPU" value={device.cpu} />
          <Fact label="Memory" value={`${device.ramGb} GB`} />
          <Fact label="Disk" value={`${device.diskTotalGb} GB`} />
          <Fact label="Disk free" value={pct(device.diskFreePct, 0)} />
          <Fact label="MAC address" value={device.mac} mono />
          <Fact label="OS build" value={device.osBuild} mono />
        </div>
      </Card>
      <Card title="Experience">
        <div className={styles.summary}>
          <Fact label="DEX score" value={num(device.dexScore)} />
          <Fact label="Type" value={humanise(device.kind)} />
          <Fact label="Aegis Zone" value={device.zoneName} />
        </div>
      </Card>
    </div>
  );
}

function SoftwareTab({ deviceId }: { deviceId: string }) {
  const { data, isLoading } = useResource<{ items: SoftwareRow[] }>(
    `/devices/${deviceId}/software`,
  );
  if (isLoading) return <Skeleton className={styles.scroll} />;
  const rows = data?.items ?? [];

  return (
    <div className={styles.scroll}>
      <table className={styles.table}>
        <caption className={styles.factLabel}>{rows.length} installed titles</caption>
        <thead>
          <tr>
            <th scope="col">Title</th>
            <th scope="col">Publisher</th>
            <th scope="col">Installed version</th>
            <th scope="col">Latest</th>
            <th scope="col">Installed</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <th scope="row">{row.title}</th>
              <td>{row.publisher}</td>
              <td className={row.outdated ? styles.outdated : undefined}>{row.version}</td>
              <td>{row.latestVersion}</td>
              <td>{relative(row.installedAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PatchesTab({ deviceId }: { deviceId: string }) {
  const { data, isLoading } = useResource<{ items: PatchRow[] }>(`/devices/${deviceId}/patches`);
  if (isLoading) return <Skeleton className={styles.scroll} />;
  const rows = data?.items ?? [];

  return (
    <div className={styles.scroll}>
      <table className={styles.table}>
        <caption className={styles.factLabel}>{rows.length} applicable patches</caption>
        <thead>
          <tr>
            <th scope="col">Patch</th>
            <th scope="col">Reference</th>
            <th scope="col">Severity</th>
            <th scope="col">State</th>
            <th scope="col">Updated</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <th scope="row">{row.title}</th>
              <td>{row.kb ?? '—'}</td>
              <td>
                <StatusPill tone={toneFor(row.severity)}>{humanise(row.severity)}</StatusPill>
              </td>
              <td>
                <StatusPill dot tone={toneFor(row.state)}>
                  {humanise(row.state)}
                </StatusPill>
              </td>
              <td>{relative(row.updatedAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function VulnerabilitiesTab({ deviceId }: { deviceId: string }) {
  const { data, isLoading } = useResource<{ items: VulnRow[] }>(
    `/devices/${deviceId}/vulnerabilities`,
  );
  if (isLoading) return <Skeleton className={styles.scroll} />;
  const rows = data?.items ?? [];

  return (
    <div className={styles.scroll}>
      <table className={styles.table}>
        <caption className={styles.factLabel}>{rows.length} findings</caption>
        <thead>
          <tr>
            <th scope="col">CVE</th>
            <th scope="col">Title</th>
            <th scope="col">Severity</th>
            <th scope="col" className={styles.numeric}>
              CVSS
            </th>
            <th scope="col">State</th>
            <th scope="col">Fixed by</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <th scope="row">{row.id}</th>
              <td>{row.title}</td>
              <td>
                <StatusPill tone={toneFor(row.severity)}>
                  {row.exploited ? `${humanise(row.severity)} · exploited` : humanise(row.severity)}
                </StatusPill>
              </td>
              <td className={styles.numeric}>{row.cvss.toFixed(1)}</td>
              <td>
                <StatusPill dot tone={toneFor(row.state)}>
                  {humanise(row.state)}
                </StatusPill>
              </td>
              <td>{row.fixedBy}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Diagnostics is read-only: posture, the jobs that have touched this endpoint,
 * and the log bundles collected from it. Nothing here opens a channel to the
 * device.
 */
function DiagnosticsTab({ deviceId }: { deviceId: string }) {
  const { data, isLoading } = useResource<Diagnostics>(`/devices/${deviceId}/diagnostics`);
  if (isLoading || !data) return <Skeleton className={styles.scroll} />;

  return (
    <div className={styles.diagnosticsGrid}>
      <Card title="Current posture">
        <div className={styles.summary}>
          <Fact label="Disk free" value={pct(data.posture.diskFreePct, 0)} />
          <Fact label="Disk size" value={`${data.posture.diskTotalGb} GB`} />
          <Fact label="Memory" value={`${data.posture.ramGb} GB`} />
          <Fact label="Agent" value={data.posture.agentVersion} />
          <Fact label="Last check-in" value={relative(data.posture.lastSeenAt)} />
          <Fact label="Config checks" value={pct(data.posture.configPassPct, 0)} />
        </div>
      </Card>

      <Card title="Recent jobs" subtitle="Script, live-data and log-collection runs">
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">Job</th>
              <th scope="col">Result</th>
              <th scope="col" className={styles.numeric}>
                Duration
              </th>
              <th scope="col">Finished</th>
            </tr>
          </thead>
          <tbody>
            {data.recentJobs.length === 0 ? (
              <tr>
                <td colSpan={4}>No jobs have run against this endpoint.</td>
              </tr>
            ) : (
              data.recentJobs.map((job) => (
                <tr key={`${job.jobId}-${job.finishedAt ?? ''}`}>
                  <th scope="row">{job.name}</th>
                  <td>
                    <StatusPill dot tone={toneFor(job.state)}>
                      {humanise(job.state)}
                    </StatusPill>
                  </td>
                  <td className={styles.numeric}>{duration(job.durationMs)}</td>
                  <td>{relative(job.finishedAt)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>

      <Card title="Log bundles" subtitle="Collected diagnostic archives">
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">Collected</th>
              <th scope="col">Contents</th>
              <th scope="col">Status</th>
              <th scope="col" className={styles.numeric}>
                Size
              </th>
            </tr>
          </thead>
          <tbody>
            {data.logBundles.length === 0 ? (
              <tr>
                <td colSpan={4}>No log bundles have been collected.</td>
              </tr>
            ) : (
              data.logBundles.map((bundle) => (
                <tr key={bundle.id}>
                  <th scope="row">{relative(bundle.collectedAt)}</th>
                  <td>{bundle.fileTypes.map(humanise).join(', ')}</td>
                  <td>
                    <StatusPill dot tone={toneFor(bundle.status)}>
                      {humanise(bundle.status)}
                    </StatusPill>
                  </td>
                  <td className={styles.numeric}>{bytes(bundle.sizeBytes)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
