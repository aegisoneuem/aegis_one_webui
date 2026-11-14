import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, ErrorState, useToast } from '@aegis/ui';
import { api } from '../api/client';
import { useCan } from '../app/auth';
import { dateTime, num, relative } from '../app/format';
import { segment } from '../app/safeNavigate';
import type { PeerCache as PeerCacheRow } from '../api/types';
import styles from './PeerCache.module.css';

/**
 * Peer Cache, restored to the approved v129 layout: one table, one row per
 * zone, naming the endpoint currently elected to cache for it.
 *
 * The page that was here listed cache *nodes* — four counters over a grid of
 * appliances called DEL-CACHE-01 — which contradicted the thing it was
 * describing. There are no distribution servers in this product: a regular
 * endpoint agent is elected to cache for its zone, and can be re-elected at
 * any time. So every row here names a real endpoint, and the hostname opens
 * that device.
 */

const AGENT_LABEL: Record<Exclude<PeerCacheRow['agentHealth'], null>, string> = {
  healthy: 'Healthy',
  degraded: 'Degraded',
  unreachable: 'Unreachable',
};

const STATUS_LABEL: Record<PeerCacheRow['status'], string> = {
  healthy: 'Healthy',
  warning: 'Warning',
  disabled: 'Disabled',
};

export default function PeerCache() {
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();
  const canManage = useCan('peercache:manage');
  const [open, setOpen] = useState<string | null>(null);

  const caches = useQuery({
    queryKey: ['/peercache'],
    queryFn: ({ signal }) => api.get<PeerCacheRow[]>('/peercache', undefined, signal),
  });

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ['/peercache'] });

  const reelect = useMutation({
    mutationFn: (zoneId: string) =>
      api.post<PeerCacheRow>(`/peercache/${encodeURIComponent(zoneId)}/elect`, {}),
    onSuccess: (row) => {
      toast.show({
        title: `${row.currentPeer ?? 'A new endpoint'} now caches for ${row.zone}`,
        message: 'It reports a warning until it has transferred something.',
        tone: 'success',
      });
      invalidate();
    },
    onError: (error) =>
      toast.show({
        title: 'The cache could not be re-elected.',
        message: error instanceof Error ? error.message : undefined,
        tone: 'error',
      }),
  });

  const setState = useMutation({
    mutationFn: (vars: { zoneId: string; enabled: boolean }) =>
      api.put<PeerCacheRow>(`/peercache/${encodeURIComponent(vars.zoneId)}/state`, {
        enabled: vars.enabled,
      }),
    onSuccess: (row) => {
      toast.show({
        title: row.enabled
          ? `Peer caching enabled for ${row.zone}`
          : `Peer caching disabled for ${row.zone}`,
        tone: 'success',
      });
      invalidate();
    },
    onError: (error) =>
      toast.show({
        title: 'The zone could not be changed.',
        message: error instanceof Error ? error.message : undefined,
        tone: 'error',
      }),
  });

  if (caches.error) {
    return (
      <ErrorState
        title="Peer cache could not be loaded"
        description="The elected caches did not come back."
        retryLabel="Try again"
        onRetry={() => void caches.refetch()}
      />
    );
  }

  const rows = caches.data ?? [];

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <h1>Peer Cache</h1>
      </header>

      <section className={styles.panel}>
        <div className={styles.tableWrap}>
          <table className={styles.grid}>
            <thead>
              <tr>
                <th scope="col">Aegis Zone</th>
                <th scope="col">Current Peer Cache</th>
                <th scope="col">Agent Health</th>
                <th scope="col">Content Cached</th>
                <th scope="col" className={styles.numeric}>
                  Cache Size
                </th>
                <th scope="col">Last Transfer</th>
                <th scope="col">Status</th>
                <th scope="col">
                  <span className={styles.srOnly}>Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {caches.isPending ? (
                <tr>
                  <td colSpan={8} className={styles.empty}>
                    Loading peer caches…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className={styles.empty}>
                    No zone in your scope has an elected peer cache.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.zoneId}>
                    <td>
                      <b>{row.zone}</b>
                    </td>
                    <td>
                      {row.currentPeer && row.deviceId ? (
                        <button
                          type="button"
                          className={styles.link}
                          onClick={() => void navigate(`/devices/${segment(row.deviceId ?? '')}`)}
                        >
                          {row.currentPeer}
                        </button>
                      ) : (
                        <span className={styles.muted}>None elected</span>
                      )}
                    </td>
                    <td>
                      {row.agentHealth === null ? (
                        <span className={styles.muted}>—</span>
                      ) : (
                        <b
                          className={
                            row.agentHealth === 'healthy'
                              ? styles.good
                              : row.agentHealth === 'degraded'
                                ? styles.warn
                                : styles.bad
                          }
                        >
                          {AGENT_LABEL[row.agentHealth]}
                        </b>
                      )}
                    </td>
                    <td>
                      {row.contentCached.length > 0 ? (
                        row.contentCached.join(', ')
                      ) : (
                        <span className={styles.muted}>—</span>
                      )}
                    </td>
                    <td className={styles.numeric}>
                      {row.cacheSizeGb > 0 ? `${num(row.cacheSizeGb)} GB` : '—'}
                    </td>
                    <td title={row.lastTransfer ? dateTime(row.lastTransfer) : undefined}>
                      {row.lastTransfer ? relative(row.lastTransfer) : '—'}
                    </td>
                    <td>
                      <b
                        className={
                          row.status === 'healthy'
                            ? styles.good
                            : row.status === 'warning'
                              ? styles.warn
                              : styles.muted
                        }
                      >
                        {STATUS_LABEL[row.status]}
                      </b>
                    </td>
                    <td className={styles.actions}>
                      <Button
                        disabled={!canManage || !row.enabled || reelect.isPending}
                        onClick={() => reelect.mutate(row.zoneId)}
                      >
                        Re-elect
                      </Button>
                      <div className={styles.menuWrap}>
                        <Button
                          aria-label={`More actions for ${row.zone}`}
                          aria-expanded={open === row.zoneId}
                          onClick={() => setOpen(open === row.zoneId ? null : row.zoneId)}
                        >
                          ⋯
                        </Button>
                        {open === row.zoneId ? (
                          <ul className={styles.menu}>
                            <li>
                              <button
                                type="button"
                                disabled={!canManage || setState.isPending}
                                onClick={() => {
                                  setOpen(null);
                                  setState.mutate({ zoneId: row.zoneId, enabled: !row.enabled });
                                }}
                              >
                                {row.enabled ? 'Disable' : 'Enable'}
                              </button>
                            </li>
                            <li>
                              <button
                                type="button"
                                disabled={!row.deviceId}
                                onClick={() => {
                                  setOpen(null);
                                  void navigate(`/devices/${segment(row.deviceId ?? '')}`);
                                }}
                              >
                                Activity
                              </button>
                            </li>
                          </ul>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
