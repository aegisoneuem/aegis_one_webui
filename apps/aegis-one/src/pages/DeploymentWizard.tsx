import { useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  Button,
  Card,
  Checkbox,
  DatePicker,
  Field,
  Input,
  PageHeader,
  Select,
  Stepper,
  Toggle,
  useToast,
} from '@aegis/ui';
import { api, ApiError, type Page } from '../api/client';
import { humanise, num } from '../app/format';
import type { Deployment, DeviceGroup, SoftwareTitle, Zone } from '../api/types';
import styles from './DeploymentWizard.module.css';

/**
 * The six-step action wizard: Content, Targets, Schedule, Network, Options,
 * Review.
 *
 * The step is a URL segment, so a half-finished wizard is a link, and Back
 * moves a step rather than leaving the flow. Targets are described here and
 * resolved by the server — the client never asserts which 12,480 endpoints a
 * filter means.
 */

const STEPS = [
  { id: 'content', label: 'Content' },
  { id: 'targets', label: 'Targets' },
  { id: 'schedule', label: 'Schedule' },
  { id: 'network', label: 'Network' },
  { id: 'options', label: 'Options' },
  { id: 'review', label: 'Review' },
] as const;

type StepId = (typeof STEPS)[number]['id'];

interface WizardState {
  type: string;
  name: string;
  packageId: string;
  groupId: string;
  zone: string;
  deviceIds: string[];
  scheduleMode: 'now' | 'later';
  startAt: string;
  wakeOfflineFirst: boolean;
  preChecks: { freeDiskAtLeast10Pct: boolean; onAcPower: boolean; noPendingRestart: boolean };
  preScript: string;
  postScript: string;
  notes: string;
}

/** Readable names for the pre-check keys the contract uses. */
const PRE_CHECK_LABELS: Record<string, string> = {
  freeDiskAtLeast10Pct: 'At least 10% free disk',
  onAcPower: 'On AC power',
  noPendingRestart: 'No restart already pending',
};

const PRE_POST_STEPS = [
  { value: 'none', label: 'None' },
  { value: 'create-restore-point', label: 'Create a restore point' },
  { value: 'close-outlook-and-teams', label: 'Close Outlook and Teams' },
  { value: 'clear-update-cache', label: 'Clear the update cache' },
  { value: 'suspend-bitlocker-one-restart', label: 'Suspend BitLocker for one restart' },
  { value: 'verify-services-after-install', label: 'Verify services after install' },
  { value: 'send-completion-notice', label: 'Send a completion notice' },
];

export default function DeploymentWizard() {
  const { step = 'content' } = useParams<{ step?: StepId }>();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();

  const [state, setState] = useState<WizardState>(() => ({
    type: 'install-software',
    name: '',
    packageId: '',
    groupId: '',
    zone: '',
    deviceIds: params.get('deviceIds')?.split(',').filter(Boolean) ?? [],
    scheduleMode: 'now',
    startAt: '',
    wakeOfflineFirst: false,
    preChecks: { freeDiskAtLeast10Pct: true, onAcPower: false, noPendingRestart: false },
    preScript: 'none',
    postScript: 'none',
    notes: '',
  }));

  const set = <K extends keyof WizardState>(key: K, value: WizardState[K]) =>
    setState((prev) => ({ ...prev, [key]: value }));

  const { data: software } = useQuery({
    queryKey: ['/software', 'wizard'],
    queryFn: ({ signal }) =>
      api.get<Page<SoftwareTitle>>(
        '/software',
        { limit: 200, fields: 'id,title,latestVersion' },
        signal,
      ),
  });
  const { data: groups } = useQuery({
    queryKey: ['/groups', 'wizard'],
    queryFn: ({ signal }) =>
      api.get<Page<DeviceGroup>>('/groups', { limit: 100, fields: 'id,name,memberCount' }, signal),
  });
  const { data: zones } = useQuery({
    queryKey: ['/sites', 'wizard'],
    queryFn: ({ signal }) =>
      api.get<Page<Zone>>('/sites', { limit: 100, fields: 'id,name,deviceCount' }, signal),
  });

  const selectedGroup = groups?.items.find((g) => g.id === state.groupId);
  const selectedZone = zones?.items.find((z) => z.id === state.zone);
  const selectedPackage = software?.items.find((s) => s.id === state.packageId);

  /** Indicative only; the server resolves the real set when the action is created. */
  const estimatedTargets =
    state.deviceIds.length || selectedGroup?.memberCount || selectedZone?.deviceCount || 0;

  const stepState = useMemo(() => {
    const contentDone = Boolean(state.name.trim()) && Boolean(state.packageId);
    const targetsDone = estimatedTargets > 0;
    const scheduleDone = state.scheduleMode === 'now' || Boolean(state.startAt);
    return { contentDone, targetsDone, scheduleDone };
  }, [state, estimatedTargets]);

  const completed = [
    ...(stepState.contentDone ? ['content'] : []),
    ...(stepState.targetsDone ? ['targets'] : []),
    ...(stepState.scheduleDone ? ['schedule'] : []),
    'network',
    'options',
  ];

  const index = STEPS.findIndex((s) => s.id === step);
  const canAdvance =
    (step === 'content' && stepState.contentDone) ||
    (step === 'targets' && stepState.targetsDone) ||
    (step === 'schedule' && stepState.scheduleDone) ||
    step === 'network' ||
    step === 'options';

  const goTo = (id: string) => void navigate(`/deployments/new/${id}`);

  const create = useMutation({
    mutationFn: () =>
      api.post<Deployment>('/deployments', {
        type: state.type,
        name: state.name.trim(),
        content: { packageId: state.packageId },
        targets: {
          ...(state.deviceIds.length ? { deviceIds: state.deviceIds } : {}),
          ...(state.groupId ? { groupIds: [state.groupId] } : {}),
          ...(state.zone ? { zone: state.zone } : {}),
        },
        schedule: {
          mode: state.scheduleMode,
          ...(state.scheduleMode === 'later' && state.startAt
            ? { startAt: new Date(state.startAt).toISOString() }
            : {}),
        },
        network: { wakeOfflineFirst: state.wakeOfflineFirst },
        options: {
          preChecks: state.preChecks,
          preScript: state.preScript,
          postScript: state.postScript,
          ...(state.notes.trim() ? { notes: state.notes.trim() } : {}),
        },
      }),
    onSuccess: (deployment) =>
      void navigate(`/deployments/created/${deployment.id}`, { replace: true }),
    onError: (err) =>
      toast.show({
        tone: 'error',
        title: 'The action could not be created',
        message:
          err instanceof ApiError
            ? `${err.message} Nothing was sent to any endpoint. Reference ${err.requestId}.`
            : 'Nothing was sent to any endpoint.',
      }),
  });

  return (
    <div className={styles.wizard}>
      <PageHeader
        title="New action"
        description="Choose what to deploy, who to deploy it to, and when."
        actions={
          <Button onClick={() => void navigate('/deployments')} disabled={create.isPending}>
            Cancel
          </Button>
        }
      />

      <Stepper
        label="New action"
        steps={STEPS.map((s) => ({
          id: s.id,
          label: s.label,
          ...(s.id === 'content' && selectedPackage ? { hint: selectedPackage.title } : {}),
          ...(s.id === 'targets' && estimatedTargets
            ? { hint: `${num(estimatedTargets)} endpoints` }
            : {}),
          ...(s.id === 'schedule'
            ? { hint: state.scheduleMode === 'now' ? 'Queue now' : state.startAt || 'Not set' }
            : {}),
        }))}
        current={step}
        completed={completed}
        onStepClick={goTo}
      />

      <Card>
        {step === 'content' ? (
          <div className={styles.step}>
            <div className={styles.fields}>
              <Field label="Action type" required>
                {(field) => (
                  <Select
                    {...field}
                    // Exactly the contract's DeploymentType. Offering a type
                    // the API does not define would fail validation only after
                    // the user had filled in the whole wizard.
                    options={[
                      { value: 'install-software', label: 'Install software' },
                      { value: 'update-software', label: 'Update software' },
                      { value: 'uninstall-software', label: 'Uninstall software' },
                      { value: 'repair-software', label: 'Repair software' },
                      { value: 'deploy-patches', label: 'Deploy patches' },
                      { value: 'roll-back-patches', label: 'Roll back patches' },
                      { value: 'remediate-configuration', label: 'Remediate configuration' },
                      { value: 'restart-devices', label: 'Restart devices' },
                      { value: 'vulnerability-scan', label: 'Run a vulnerability scan' },
                      { value: 'refresh-details', label: 'Refresh inventory' },
                      { value: 'collect-logs', label: 'Collect logs' },
                    ]}
                    value={state.type}
                    onChange={(e) => set('type', e.target.value)}
                  />
                )}
              </Field>

              <Field label="Package" required hint="The catalogue entry this action deploys.">
                {(field) => (
                  <Select
                    {...field}
                    placeholder="Choose a package"
                    options={(software?.items ?? []).map((s) => ({
                      value: s.id,
                      label: `${s.title} ${s.latestVersion}`,
                    }))}
                    value={state.packageId}
                    onChange={(e) => {
                      const pkg = software?.items.find((s) => s.id === e.target.value);
                      set('packageId', e.target.value);
                      // Pre-fill the name the way the reference build does, but
                      // leave it editable.
                      if (pkg && !state.name.trim())
                        set('name', `${humanise(state.type)} — ${pkg.title}`);
                    }}
                  />
                )}
              </Field>

              <Field
                label="Action name"
                required
                className={styles.full}
                hint="Shown in Deployments, in Task History and in the audit log."
              >
                {(field) => (
                  <Input
                    {...field}
                    maxLength={120}
                    placeholder="Google Chrome 142.0 — broad ring"
                    value={state.name}
                    onChange={(e) => set('name', e.target.value)}
                  />
                )}
              </Field>
            </div>
          </div>
        ) : null}

        {step === 'targets' ? (
          <div className={styles.step}>
            <div className={styles.fields}>
              <Field label="Device group" showOptional>
                {(field) => (
                  <Select
                    {...field}
                    placeholder="No group"
                    options={(groups?.items ?? []).map((g) => ({
                      value: g.id,
                      label: `${g.name} (${num(g.memberCount)})`,
                    }))}
                    value={state.groupId}
                    onChange={(e) => set('groupId', e.target.value)}
                  />
                )}
              </Field>
              <Field label="Aegis Zone" showOptional>
                {(field) => (
                  <Select
                    {...field}
                    placeholder="All zones"
                    options={(zones?.items ?? []).map((z) => ({
                      value: z.id,
                      label: `${z.name} (${num(z.deviceCount)})`,
                    }))}
                    value={state.zone}
                    onChange={(e) => set('zone', e.target.value)}
                  />
                )}
              </Field>
            </div>

            {state.deviceIds.length > 0 ? (
              <p className={styles.warning}>
                {num(state.deviceIds.length)} endpoints were selected on the Devices list and will
                be targeted directly.
              </p>
            ) : null}

            <div className={styles.targetSummary}>
              <span className={styles.targetCount}>{num(estimatedTargets)}</span>
              <span>
                endpoints match this selection. The exact set is resolved when the action is
                created, so a device that enrols between now and then is included.
              </span>
            </div>
          </div>
        ) : null}

        {step === 'schedule' ? (
          <div className={styles.step}>
            <div className={styles.fields}>
              <Field label="When to run" required>
                {(field) => (
                  <Select
                    {...field}
                    options={[
                      { value: 'now', label: 'Queue now' },
                      { value: 'later', label: 'Schedule for later' },
                    ]}
                    value={state.scheduleMode}
                    onChange={(e) => set('scheduleMode', e.target.value as 'now' | 'later')}
                  />
                )}
              </Field>
              {state.scheduleMode === 'later' ? (
                <Field label="Start on" required hint="Queued at 02:00 in each zone's local time.">
                  {(field) => (
                    <DatePicker
                      {...field}
                      value={state.startAt}
                      onChange={(e) => set('startAt', e.target.value)}
                    />
                  )}
                </Field>
              ) : null}
            </div>
          </div>
        ) : null}

        {step === 'network' ? (
          <div className={styles.step}>
            <Toggle
              checked={state.wakeOfflineFirst}
              onChange={(v) => set('wakeOfflineFirst', v)}
              label="Wake offline computers first (Wake-on-LAN)"
            />
            <p className={styles.reviewValue}>
              Content is distributed through peer cache where the zone has it, so only one copy
              crosses the link to each site.
            </p>
          </div>
        ) : null}

        {step === 'options' ? (
          <div className={styles.step}>
            <div className={styles.checks}>
              <p className={styles.reviewLabel}>Pre-checks</p>
              <Checkbox
                label="At least 10% free disk"
                hint="Skips endpoints that would fail part-way through the install."
                checked={state.preChecks.freeDiskAtLeast10Pct}
                onChange={(e) =>
                  set('preChecks', { ...state.preChecks, freeDiskAtLeast10Pct: e.target.checked })
                }
              />
              <Checkbox
                label="On AC power"
                checked={state.preChecks.onAcPower}
                onChange={(e) =>
                  set('preChecks', { ...state.preChecks, onAcPower: e.target.checked })
                }
              />
              <Checkbox
                label="No restart already pending"
                checked={state.preChecks.noPendingRestart}
                onChange={(e) =>
                  set('preChecks', { ...state.preChecks, noPendingRestart: e.target.checked })
                }
              />
            </div>

            <div className={styles.fields}>
              <Field label="Before the action" showOptional>
                {(field) => (
                  <Select
                    {...field}
                    options={PRE_POST_STEPS}
                    value={state.preScript}
                    onChange={(e) => set('preScript', e.target.value)}
                  />
                )}
              </Field>
              <Field label="After the action" showOptional>
                {(field) => (
                  <Select
                    {...field}
                    options={PRE_POST_STEPS}
                    value={state.postScript}
                    onChange={(e) => set('postScript', e.target.value)}
                  />
                )}
              </Field>
              <Field
                label="Notes"
                showOptional
                className={styles.full}
                hint="Recorded in the audit log."
              >
                {(field) => (
                  <Input
                    {...field}
                    maxLength={1000}
                    placeholder="Change CHG-0048213 approved by the CAB."
                    value={state.notes}
                    onChange={(e) => set('notes', e.target.value)}
                  />
                )}
              </Field>
            </div>
          </div>
        ) : null}

        {step === 'review' ? (
          <div className={styles.step}>
            <div className={styles.review}>
              <ReviewItem label="Action name" value={state.name || 'Not set'} />
              <ReviewItem label="Type" value={humanise(state.type)} />
              <ReviewItem label="Package" value={selectedPackage?.title ?? 'Not set'} />
              <ReviewItem label="Targets" value={`${num(estimatedTargets)} endpoints`} />
              <ReviewItem
                label="Schedule"
                value={
                  state.scheduleMode === 'now' ? 'Queue now' : `From ${state.startAt || 'not set'}`
                }
              />
              <ReviewItem
                label="Wake offline first"
                value={state.wakeOfflineFirst ? 'Yes' : 'No'}
              />
              <ReviewItem
                label="Pre-checks"
                value={
                  Object.entries(state.preChecks)
                    .filter(([, on]) => on)
                    .map(([key]) => PRE_CHECK_LABELS[key] ?? key)
                    .join(', ') || 'None'
                }
              />
              <ReviewItem
                label="Before / after"
                value={`${humanise(state.preScript)} / ${humanise(state.postScript)}`}
              />
            </div>

            {estimatedTargets > 5000 ? (
              <p className={styles.warning}>
                This targets more than 5,000 endpoints. Consider running it against the pilot ring
                first.
              </p>
            ) : null}
          </div>
        ) : null}

        <div className={styles.footer}>
          <Button
            disabled={index === 0 || create.isPending}
            onClick={() => goTo(STEPS[index - 1]?.id ?? 'content')}
          >
            Back
          </Button>
          <div className={styles.footerRight}>
            {step === 'review' ? (
              <Button
                variant="primary"
                loading={create.isPending}
                disabled={!stepState.contentDone || !stepState.targetsDone}
                onClick={() => create.mutate()}
              >
                {state.scheduleMode === 'now' ? 'Queue action now' : 'Schedule action'}
              </Button>
            ) : (
              <Button
                variant="primary"
                disabled={!canAdvance}
                onClick={() => goTo(STEPS[index + 1]?.id ?? 'review')}
              >
                Continue
              </Button>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}

function ReviewItem({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.reviewItem}>
      <span className={styles.reviewLabel}>{label}</span>
      <span className={styles.reviewValue}>{value}</span>
    </div>
  );
}
