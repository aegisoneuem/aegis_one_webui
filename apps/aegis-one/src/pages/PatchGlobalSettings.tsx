import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Button, ErrorState, Skeleton, useToast } from '@aegis/ui';
import { api, type Page } from '../api/client';
import { num } from '../app/format';
import type { DeviceGroup, Patch, PatchSettings } from '../api/types';
import styles from './PatchGlobalSettings.module.css';

/**
 * Global Settings — the third sub-tab under Patch Policies, restored to the
 * approved v129 layout: System Health Policy, Device Controls, Group
 * Overrides, OS Versions & Upgrades, Default Rings, Maintenance Window &
 * Restarts, and Approval & Third-Party Apps.
 *
 * The reference saves none of this. It says so twice, in its own words —
 * "Saved in this browser (preview)" — because nothing in a static mock can
 * persist. These settings are saved on the server instead: a patch default
 * that lives in one administrator's browser is not an estate-wide default,
 * and the next administrator to open the page would see something different.
 *
 * The three thresholds at the top are the point of the panel. They store the
 * rule, not a verdict, and the four counters beside them are counted against
 * the estate — change a threshold, save, and the counters move.
 */

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

const RESTART_LABEL: Record<string, string> = {
  prompt: 'Prompt the user, force at deadline',
  automatic: 'Restart Automatically Inside the Window',
  never: 'Never Restart Automatically',
};

type Draft = Omit<PatchSettings, 'osVersions'>;

/**
 * The editable part of the settings. `osVersions` is what the estate runs —
 * read from the devices, not something an administrator sets — so it never
 * enters the form.
 */
function toDraft(settings: PatchSettings): Draft {
  return structuredClone({
    health: settings.health,
    deviceControls: settings.deviceControls,
    groupOverrides: settings.groupOverrides,
    majorVersions: settings.majorVersions,
    rings: settings.rings,
    maintenance: settings.maintenance,
    approval: settings.approval,
  });
}

export default function PatchGlobalSettings({ canEdit }: { canEdit: boolean }) {
  const toast = useToast();

  const settings = useQuery({
    queryKey: ['/patches/settings'],
    queryFn: ({ signal }) => api.get<PatchSettings>('/patches/settings', undefined, signal),
  });

  /** The rings target device groups, so the picker needs their names. */
  const groups = useQuery({
    queryKey: ['/groups', 'rings'],
    queryFn: ({ signal }) =>
      api.get<Page<DeviceGroup>>('/groups', { limit: '100' }, signal).then((page) => page.items),
  });

  /** The exclusion picker offers the catalogue's own patches. */
  const patches = useQuery({
    queryKey: ['/patches', 'exclusions'],
    queryFn: ({ signal }) =>
      api.get<Page<Patch>>('/patches', { limit: '25' }, signal).then((page) => page.items),
  });

  /*
   * The form is editable, so it holds its own copy, seeded from the server
   * once the settings arrive and again after every save — so Reset returns to
   * what is stored rather than to what was first rendered.
   *
   * Adjusted during render rather than in an effect: an effect would render
   * once with a stale draft and then again with the fresh one, and this
   * console forbids setState inside one for exactly that reason.
   */
  const [source, setSource] = useState<PatchSettings | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  if (settings.data && settings.data !== source) {
    setSource(settings.data);
    setDraft(toDraft(settings.data));
  }

  const save = useMutation({
    mutationFn: () => api.put<PatchSettings>('/patches/settings', draft),
    onSuccess: (saved) => {
      toast.show({
        title: 'Patch settings saved',
        message: `${num(saved.health.highlyVulnerable)} endpoints are highly vulnerable under these thresholds.`,
        tone: 'success',
      });
      void settings.refetch();
    },
    onError: (error) =>
      toast.show({
        title: 'The settings were not saved.',
        message: error instanceof Error ? error.message : undefined,
        tone: 'error',
      }),
  });

  if (settings.error) {
    return (
      <ErrorState
        title="The patch settings could not be loaded"
        description="The estate-wide defaults did not come back."
        retryLabel="Try again"
        onRetry={() => void settings.refetch()}
      />
    );
  }

  if (!settings.data || !draft) return <Skeleton className={styles.skeleton} />;

  const health = settings.data.health;
  const edit = (patch: (d: Draft) => void) => {
    const next = structuredClone(draft);
    patch(next);
    setDraft(next);
  };

  return (
    <div className={styles.settings}>
      {/* --- System Health Policy ------------------------------------- */}
      <section className={styles.panel}>
        <header className={styles.panelHead}>
          <h2 className={styles.panelTitle}>System Health Policy</h2>
          <span className={styles.aside}>Classifies Every Computer by Missing Patches</span>
        </header>

        <div className={styles.thresholds}>
          <label>
            <span>Highly Vulnerable: Missing Critical ≥</span>
            <input
              type="number"
              min={1}
              max={100}
              disabled={!canEdit}
              value={draft.health.highlyVulnerableCritical}
              onChange={(e) =>
                edit((d) => {
                  d.health.highlyVulnerableCritical = Number(e.target.value);
                })
              }
            />
          </label>
          <label>
            <span>Highly Vulnerable: Missing Total ≥</span>
            <input
              type="number"
              min={1}
              max={500}
              disabled={!canEdit}
              value={draft.health.highlyVulnerableTotal}
              onChange={(e) =>
                edit((d) => {
                  d.health.highlyVulnerableTotal = Number(e.target.value);
                })
              }
            />
          </label>
          <label>
            <span>Vulnerable: Missing Total ≥</span>
            <input
              type="number"
              min={1}
              max={500}
              disabled={!canEdit}
              value={draft.health.vulnerableTotal}
              onChange={(e) =>
                edit((d) => {
                  d.health.vulnerableTotal = Number(e.target.value);
                })
              }
            />
          </label>
        </div>

        {/*
         * Counted against the estate under the stored thresholds, not the
         * ones being edited — so the figures describe what is saved.
         */}
        <div className={styles.bands}>
          <div className={styles.bandLead}>
            <span>Healthy</span>
            <strong>{num(health.healthy)}</strong>
          </div>
          <div className={styles.band}>
            <span>Vulnerable</span>
            <strong>{num(health.vulnerable)}</strong>
          </div>
          <div className={styles.band}>
            <span>Highly Vulnerable</span>
            <strong>{num(health.highlyVulnerable)}</strong>
          </div>
          <div className={styles.band}>
            <span>Fleet</span>
            <strong>{num(health.fleet)}</strong>
          </div>
        </div>
      </section>

      <div className={styles.row2}>
        {/* --- Device Controls ----------------------------------------- */}
        <section className={styles.panel}>
          <header className={styles.panelHead}>
            <h2 className={styles.panelTitle}>Device Controls</h2>
          </header>
          <label className={styles.check}>
            <input
              type="checkbox"
              aria-label="Turn Off Built-In Automatic Updates"
              disabled={!canEdit}
              checked={draft.deviceControls.disableBuiltInUpdates}
              onChange={(e) =>
                edit((d) => {
                  d.deviceControls.disableBuiltInUpdates = e.target.checked;
                })
              }
            />
            <span>
              <b>Turn Off Built-In Automatic Updates</b>
              <small>
                Windows Update / softwareupdate install only when an Aegis policy says so.
              </small>
            </span>
          </label>
          <label className={styles.check}>
            <input
              type="checkbox"
              aria-label="Hide Check For Updates From Users"
              disabled={!canEdit}
              checked={draft.deviceControls.hideCheckForUpdates}
              onChange={(e) =>
                edit((d) => {
                  d.deviceControls.hideCheckForUpdates = e.target.checked;
                })
              }
            />
            <span>
              <b>Hide “Check For Updates” From Users</b>
            </span>
          </label>
        </section>

        {/* --- Group Overrides ----------------------------------------- */}
        <section className={styles.panel}>
          <header className={styles.panelHead}>
            <h2 className={styles.panelTitle}>Group Overrides</h2>
          </header>
          <table className={styles.grid}>
            <thead>
              <tr>
                <th scope="col">Group</th>
                <th scope="col">Window</th>
                <th scope="col">Restart</th>
              </tr>
            </thead>
            <tbody>
              {draft.groupOverrides.length === 0 ? (
                <tr>
                  <td colSpan={3} className={styles.empty}>
                    No Overrides
                  </td>
                </tr>
              ) : (
                draft.groupOverrides.map((o) => (
                  <tr key={o.groupId}>
                    <td>{groups.data?.find((g) => g.id === o.groupId)?.name ?? o.groupId}</td>
                    <td>{o.window}</td>
                    <td>{o.restart}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          <div className={styles.panelFoot}>
            <Button
              disabled={!canEdit || (groups.data ?? []).length === 0}
              onClick={() =>
                edit((d) => {
                  const first = groups.data?.[0];
                  if (!first) return;
                  d.groupOverrides.push({
                    groupId: first.id,
                    window: '20:00–02:00',
                    restart: 'Prompt',
                  });
                })
              }
            >
              + Add Override
            </Button>
          </div>
        </section>
      </div>

      {/* --- OS Versions & Upgrades ------------------------------------ */}
      <section className={styles.panel}>
        <header className={styles.panelHead}>
          <h2 className={styles.panelTitle}>OS Versions &amp; Upgrades</h2>
          <span className={styles.aside}>
            Lifecycle text is reference only · verify with the vendor
          </span>
        </header>

        <table className={styles.grid}>
          <thead>
            <tr>
              <th scope="col">OS</th>
              <th scope="col">Version</th>
              <th scope="col" className={styles.numeric}>
                Computers
              </th>
              <th scope="col">Vendor Support</th>
            </tr>
          </thead>
          <tbody>
            {settings.data.osVersions.map((v) => (
              <tr key={`${v.os}-${v.version}`}>
                <td>
                  <b>{v.os}</b>
                </td>
                <td>{v.version}</td>
                <td className={styles.numeric}>{num(v.computers)}</td>
                <td className={v.endOfLife ? styles.bad : undefined}>{v.vendorSupport ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className={styles.row3}>
          {(['windows', 'macos', 'linux'] as const).map((platform) => (
            <div key={platform} className={styles.holdBox}>
              <h3>
                {platform === 'windows' ? 'Windows' : platform === 'macos' ? 'macOS' : 'Linux'}{' '}
                Major Upgrades
              </h3>
              <label>
                <span>Hold New Major Version (days)</span>
                <input
                  type="number"
                  min={0}
                  max={365}
                  disabled={!canEdit}
                  value={draft.majorVersions[platform].holdDays}
                  onChange={(e) =>
                    edit((d) => {
                      d.majorVersions[platform].holdDays = Number(e.target.value);
                    })
                  }
                />
              </label>
              <label>
                <span>Stay On Version (optional)</span>
                <input
                  type="text"
                  maxLength={32}
                  disabled={!canEdit}
                  placeholder={
                    platform === 'windows' ? '24H2' : platform === 'macos' ? '15' : '24.04'
                  }
                  value={draft.majorVersions[platform].stayOnVersion ?? ''}
                  onChange={(e) =>
                    edit((d) => {
                      d.majorVersions[platform].stayOnVersion = e.target.value || null;
                    })
                  }
                />
              </label>
            </div>
          ))}
        </div>
      </section>

      {/* --- Default Rings --------------------------------------------- */}
      <section className={styles.panel}>
        <header className={styles.panelHead}>
          <h2 className={styles.panelTitle}>Default Rings</h2>
          <span className={styles.grow} />
          <Button
            disabled={!canEdit || draft.rings.length >= 8}
            onClick={() =>
              edit((d) => {
                d.rings.push({
                  id: `ring-${d.rings.length + 1}-${Date.now()}`,
                  name: `Ring ${d.rings.length + 1}`,
                  groupId: groups.data?.[0]?.id ?? '',
                  deferDays: 0,
                  deadlineDays: 7,
                  excludedPatchIds: [],
                });
              })
            }
          >
            + Add ring
          </Button>
        </header>

        <div className={styles.rings}>
          {draft.rings.map((ring, i) => (
            <article key={ring.id} className={styles.ring}>
              <header>
                <span className={styles.ringNumber}>{i + 1}</span>
                <input
                  type="text"
                  aria-label={`Ring ${i + 1} name`}
                  maxLength={40}
                  disabled={!canEdit}
                  value={ring.name}
                  onChange={(e) =>
                    edit((d) => {
                      const r = d.rings[i];
                      if (r) r.name = e.target.value;
                    })
                  }
                />
                <Button
                  aria-label={`Remove ${ring.name}`}
                  // The last ring cannot go: a schedule with no ring
                  // deploys to nobody.
                  disabled={!canEdit || draft.rings.length === 1}
                  onClick={() =>
                    edit((d) => {
                      d.rings.splice(i, 1);
                    })
                  }
                >
                  ×
                </Button>
              </header>

              <label className={styles.field}>
                <span>Target Group</span>
                <select
                  disabled={!canEdit}
                  value={ring.groupId}
                  onChange={(e) =>
                    edit((d) => {
                      const r = d.rings[i];
                      if (r) r.groupId = e.target.value;
                    })
                  }
                >
                  {(groups.data ?? []).map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
                <small>
                  {num(groups.data?.find((g) => g.id === ring.groupId)?.members ?? 0)} endpoints
                </small>
              </label>

              <div className={styles.ringDays}>
                <label className={styles.field}>
                  <span>Defer (days)</span>
                  <input
                    type="number"
                    min={0}
                    max={180}
                    disabled={!canEdit}
                    value={ring.deferDays}
                    onChange={(e) =>
                      edit((d) => {
                        const r = d.rings[i];
                        if (r) r.deferDays = Number(e.target.value);
                      })
                    }
                  />
                </label>
                <label className={styles.field}>
                  <span>Deadline (days)</span>
                  <input
                    type="number"
                    min={0}
                    max={180}
                    disabled={!canEdit}
                    value={ring.deadlineDays}
                    onChange={(e) =>
                      edit((d) => {
                        const r = d.rings[i];
                        if (r) r.deadlineDays = Number(e.target.value);
                      })
                    }
                  />
                </label>
              </div>

              <label className={styles.field}>
                <span>Patch All Except</span>
                <select
                  aria-label={`Exclude a patch from ${ring.name}`}
                  disabled={!canEdit}
                  value=""
                  onChange={(e) =>
                    edit((d) => {
                      const r = d.rings[i];
                      if (r && e.target.value && !r.excludedPatchIds.includes(e.target.value)) {
                        r.excludedPatchIds.push(e.target.value);
                      }
                    })
                  }
                >
                  <option value="">+ Exclude Patch</option>
                  {(patches.data ?? []).map((patch) => (
                    <option key={patch.id} value={patch.id}>
                      {patch.kb ?? patch.id} · {patch.title}
                    </option>
                  ))}
                </select>
              </label>

              {ring.excludedPatchIds.length > 0 ? (
                <ul className={styles.excluded}>
                  {ring.excludedPatchIds.map((id) => (
                    <li key={id}>
                      {patches.data?.find((patch) => patch.id === id)?.kb ?? id}
                      <button
                        type="button"
                        aria-label={`Stop excluding ${id}`}
                        disabled={!canEdit}
                        onClick={() =>
                          edit((d) => {
                            const r = d.rings[i];
                            if (r) r.excludedPatchIds = r.excludedPatchIds.filter((x) => x !== id);
                          })
                        }
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}

              {/*
               * What the ring's two numbers mean for a patch released today.
               * Two day-counts are easy to set and hard to picture.
               */}
              <p className={styles.ringEffect}>
                Released today → available in {ring.deferDays} days, installed by day{' '}
                {ring.deferDays + ring.deadlineDays}
              </p>
            </article>
          ))}
        </div>
      </section>

      <div className={styles.row2}>
        {/* --- Maintenance Window & Restarts --------------------------- */}
        <section className={styles.panel}>
          <header className={styles.panelHead}>
            <h2 className={styles.panelTitle}>Maintenance Window &amp; Restarts</h2>
          </header>

          <div className={styles.field}>
            <span>Install on</span>
            <div className={styles.days}>
              {WEEKDAYS.map((day, i) => (
                <button
                  key={day}
                  type="button"
                  aria-pressed={draft.maintenance.days.includes(i)}
                  className={draft.maintenance.days.includes(i) ? styles.dayOn : styles.day}
                  disabled={!canEdit}
                  onClick={() =>
                    edit((d) => {
                      d.maintenance.days = d.maintenance.days.includes(i)
                        ? d.maintenance.days.filter((x) => x !== i)
                        : [...d.maintenance.days, i].sort((a, b) => a - b);
                    })
                  }
                >
                  {day}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.row2tight}>
            <label className={styles.field}>
              <span>From</span>
              <input
                type="time"
                disabled={!canEdit}
                value={draft.maintenance.from}
                onChange={(e) =>
                  edit((d) => {
                    d.maintenance.from = e.target.value;
                  })
                }
              />
            </label>
            <label className={styles.field}>
              <span>To</span>
              <input
                type="time"
                disabled={!canEdit}
                value={draft.maintenance.to}
                onChange={(e) =>
                  edit((d) => {
                    d.maintenance.to = e.target.value;
                  })
                }
              />
            </label>
          </div>

          <label className={styles.field}>
            <span>Restart Behaviour</span>
            <select
              disabled={!canEdit}
              value={draft.maintenance.restartBehaviour}
              onChange={(e) =>
                edit((d) => {
                  d.maintenance.restartBehaviour = e.target.value as
                    'prompt' | 'automatic' | 'never';
                })
              }
            >
              {Object.entries(RESTART_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>

          <label className={styles.check}>
            <input
              type="checkbox"
              aria-label="Wake Offline Devices Before Install"
              disabled={!canEdit}
              checked={draft.maintenance.wakeOnLan}
              onChange={(e) =>
                edit((d) => {
                  d.maintenance.wakeOnLan = e.target.checked;
                })
              }
            />
            <span>
              <b>Wake Offline Devices Before Install (Wake-on-LAN)</b>
            </span>
          </label>

          <label className={styles.field}>
            <span>User Can Postpone</span>
            <select
              disabled={!canEdit}
              value={String(draft.maintenance.userPostponesAllowed)}
              onChange={(e) =>
                edit((d) => {
                  d.maintenance.userPostponesAllowed = Number(e.target.value);
                })
              }
            >
              <option value="0">Not Allowed</option>
              <option value="1">1 time</option>
              <option value="3">3 times</option>
              <option value="5">5 times</option>
            </select>
          </label>
        </section>

        {/* --- Approval & Third-Party Apps ------------------------------ */}
        <section className={styles.panel}>
          <header className={styles.panelHead}>
            <h2 className={styles.panelTitle}>Approval &amp; Third-Party Apps</h2>
          </header>

          <label className={styles.check}>
            <input
              type="checkbox"
              aria-label="Test in the first ring, then auto-approve"
              disabled={!canEdit}
              checked={draft.approval.autoApproveAfterFirstRing}
              onChange={(e) =>
                edit((d) => {
                  d.approval.autoApproveAfterFirstRing = e.target.checked;
                })
              }
            />
            <span>
              <b>Test in the first ring, then auto-approve</b>
              <small>
                Approve for later rings only if the first ring has at least one success and no
                failures.
              </small>
            </span>
          </label>

          <label className={styles.field}>
            <span>Observation period (days)</span>
            <input
              type="number"
              min={0}
              max={90}
              disabled={!canEdit}
              value={draft.approval.observationDays}
              onChange={(e) =>
                edit((d) => {
                  d.approval.observationDays = Number(e.target.value);
                })
              }
            />
          </label>

          <label className={styles.field}>
            <span>Third-Party App Updates</span>
            <select
              disabled={!canEdit}
              value={draft.approval.thirdPartyUpdates}
              onChange={(e) =>
                edit((d) => {
                  d.approval.thirdPartyUpdates = e.target.value as 'approval' | 'automatic';
                })
              }
            >
              <option value="approval">Deploy After Admin Approval</option>
              <option value="automatic">Follow the Ring Schedule Automatically</option>
            </select>
          </label>

          <label className={styles.field}>
            <span>Catalog Sync</span>
            <select
              disabled={!canEdit}
              value={String(draft.approval.catalogSyncHours)}
              onChange={(e) =>
                edit((d) => {
                  d.approval.catalogSyncHours = Number(e.target.value) as 12 | 24;
                })
              }
            >
              <option value="12">Every 12 hours</option>
              <option value="24">Every 24 hours</option>
            </select>
          </label>

          <div className={styles.field}>
            <span>Declined Vendors</span>
            <DeclinedVendors
              vendors={draft.approval.declinedVendors ?? []}
              canEdit={canEdit}
              onChange={(next) =>
                edit((d) => {
                  d.approval.declinedVendors = next;
                })
              }
            />
          </div>
        </section>
      </div>

      <footer className={styles.saveBar}>
        <span>Applies to every patch policy. Saved on the server, for every administrator.</span>
        <Button
          disabled={!canEdit || save.isPending}
          onClick={() => setDraft(toDraft(settings.data))}
        >
          Reset
        </Button>
        <Button
          variant="primary"
          disabled={!canEdit || save.isPending}
          onClick={() => save.mutate()}
        >
          {save.isPending ? 'Saving…' : 'Save Settings'}
        </Button>
      </footer>
    </div>
  );
}

/** The chips and the field that adds one, as the reference prints them. */
function DeclinedVendors({
  vendors,
  canEdit,
  onChange,
}: {
  vendors: string[];
  canEdit: boolean;
  onChange: (next: string[]) => void;
}) {
  const [name, setName] = useState('');

  return (
    <>
      {vendors.length > 0 ? (
        <ul className={styles.vendors}>
          {vendors.map((vendor) => (
            <li key={vendor}>
              {vendor}
              <button
                type="button"
                aria-label={`Stop declining ${vendor}`}
                disabled={!canEdit}
                onClick={() => onChange(vendors.filter((v) => v !== vendor))}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <div className={styles.vendorAdd}>
        <input
          type="text"
          aria-label="Vendor to decline"
          maxLength={64}
          placeholder="Vendor name"
          disabled={!canEdit}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Button
          disabled={!canEdit || !name.trim() || vendors.includes(name.trim())}
          onClick={() => {
            onChange([...vendors, name.trim()]);
            setName('');
          }}
        >
          Decline
        </Button>
      </div>
    </>
  );
}
