import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  ErrorState,
  Field,
  Input,
  Menu,
  Modal,
  Pagination,
  Select,
  Skeleton,
  useToast,
} from '@aegis/ui';
import { api, type Page } from '../api/client';
import { useListController } from '../app/useListController';
import { useCan } from '../app/auth';
import { num } from '../app/format';
import { segment } from '../app/safeNavigate';
import type { SoftwareCounts, SoftwareTitle } from '../api/types';
import styles from './Software.module.css';

/**
 * The software catalogue, restored to the approved v129 layout: five counters
 * over a card grid, one card per package.
 *
 * A card is a package definition, not an installed title — which is why it
 * reads version, platform, package state and whether an installer has been
 * uploaded, and offers Deploy rather than a count of machines. Every field is
 * one the contract's `SoftwarePackage` declares.
 */

/** v129's cards run three to a row, so the page asks for a round number. */
const PAGE_SIZE = 48;

const TILE_FILTERS: Record<string, Record<string, string>> = {
  all: {},
  added: { installer: 'added' },
  missing: { installer: 'missing' },
  draft: { state: 'draft' },
};

const PLATFORM_LABEL: Record<string, string> = {
  windows: 'Windows',
  macos: 'macOS',
  linux: 'Linux',
  aix: 'AIX',
};

export default function Software() {
  const navigate = useNavigate();
  const canWrite = useCan('software:write');
  const toast = useToast();
  const queryClient = useQueryClient();

  /*
   * One dialog serves Add and Edit. They post to different routes but ask for
   * the same fields, and two forms that must stay identical are one form.
   * `editing` is the package being changed, or null for a new one.
   */
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<SoftwareTitle | null>(null);
  const [draft, setDraft] = useState({
    name: '',
    publisher: '',
    version: '',
    platform: 'windows',
    category: 'Utilities',
  });

  const openEditor = (pkg: SoftwareTitle | null) => {
    setEditing(pkg);
    setDraft({
      name: pkg?.title ?? '',
      publisher: pkg?.publisher ?? '',
      version: pkg?.latestVersion ?? '',
      platform: pkg?.platform ?? 'windows',
      category: pkg?.category ?? 'Utilities',
    });
    setEditorOpen(true);
  };

  const save = useMutation({
    mutationFn: () => {
      const body = {
        name: draft.name.trim(),
        publisher: draft.publisher.trim(),
        version: draft.version.trim(),
        platform: draft.platform,
        category: draft.category,
      };
      /*
       * The write routes return the contract's `SoftwarePackage`, whose
       * fields are `name` and `version`; the list returns the catalogue's
       * own `title` and `latestVersion`. Nothing here reads the response, so
       * the two spellings do not have to be reconciled to save a package —
       * but they should be. See handover question 68.
       */
      return editing
        ? api.patch<unknown>(`/software/${encodeURIComponent(editing.id)}`, body)
        : api.post<unknown>('/software', body);
    },
    onSuccess: () => {
      toast.show({
        title: editing ? `${draft.name} updated` : `${draft.name} added to the catalogue`,
        /*
         * Changing a version invalidates the installer that was built for the
         * old one, so the server drops it — and the card will say "missing".
         * Better to say so here than to let an administrator find out when a
         * deployment refuses to start.
         */
        message:
          editing && draft.version.trim() !== editing.latestVersion
            ? 'The version changed, so the installer has to be uploaded again.'
            : 'It needs an installer before it can be deployed.',
        tone: 'success',
      });
      setEditorOpen(false);
      void queryClient.invalidateQueries({ queryKey: ['/software'] });
    },
    onError: (error) =>
      toast.show({
        title: editing ? 'The package could not be updated.' : 'The package could not be added.',
        message: error instanceof Error ? error.message : undefined,
        tone: 'error',
      }),
  });

  const [tile, setTile] = useState('all');

  const controller = useListController<SoftwareTitle>({
    path: '/software',
    defaultSort: { id: 'title', desc: false },
    defaultPageSize: PAGE_SIZE,
    fixedFilters: TILE_FILTERS[tile] ?? {},
  });

  const counts = controller.envelope['counts'] as SoftwareCounts | undefined;

  /*
   * The category and publisher lists come from the catalogue itself. The
   * contract declares no facet endpoint (see docs/handover-backend.md), and
   * the catalogue is small enough that two fields of every row is one small
   * request — which is not true of Devices, where the same gap is filled with
   * a list the console carries itself.
   */
  const { data: facets } = useQuery({
    queryKey: ['/software', 'facets'],
    queryFn: ({ signal }) =>
      api.get<Page<SoftwareTitle>>(
        '/software',
        { limit: 200, fields: 'id,category,publisher' },
        signal,
      ),
  });

  const { categories, publishers } = useMemo(() => {
    const rows = facets?.items ?? [];
    const distinct = (take: (s: SoftwareTitle) => string) =>
      [...new Set(rows.map(take).filter(Boolean))].sort().map((v) => ({ value: v, label: v }));
    return { categories: distinct((s) => s.category), publishers: distinct((s) => s.publisher) };
  }, [facets]);

  if (controller.error) {
    return (
      <ErrorState
        description="The software catalogue could not be loaded."
        onRetry={controller.error.onRetry}
      />
    );
  }

  const choose = (id: string) => () => setTile(id);

  return (
    <div className={styles.page}>
      <div className={styles.heading}>
        <div>
          <p className={styles.eyebrow}>Aegis One / Endpoint Management</p>
          <h1 className={styles.title}>Software Catalog</h1>
          <p className={styles.subtitle}>
            Add a package, choose computers and track every action in Deployments.
          </p>
        </div>
        <div className={styles.actions}>
          <Button onClick={() => void navigate('/reports')}>Export</Button>
          {/*
           * Import Icons has no endpoint in the contract and no asset store
           * behind it, so it stays disabled rather than being wired to
           * something invented. See the restoration note.
           */}
          <Button disabled title="No icon store is configured">
            Import Icons
          </Button>
          <Button variant="primary" disabled={!canWrite} onClick={() => openEditor(null)}>
            + Add package
          </Button>
        </div>
      </div>

      <div className={styles.kpis}>
        {counts ? (
          <>
            <Kpi
              label="All Packages"
              value={num(counts.all)}
              active={tile === 'all'}
              onClick={choose('all')}
            />
            <Kpi
              label="Installer Added"
              value={num(counts.installerAdded)}
              active={tile === 'added'}
              onClick={choose('added')}
            />
            <Kpi
              label="Installer Missing"
              value={num(counts.installerMissing)}
              active={tile === 'missing'}
              onClick={choose('missing')}
            />
            <Kpi
              label="Draft Packages"
              value={num(counts.draft)}
              active={tile === 'draft'}
              onClick={choose('draft')}
            />
            {/* Publishers is a fact about the catalogue, not a way to narrow it. */}
            <Kpi label="Publishers" value={num(counts.publishers)} />
          </>
        ) : (
          Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className={styles.kpiSkeleton} />)
        )}
      </div>

      <div className={styles.toolbar}>
        <Input
          className={styles.search}
          aria-label="Search software or publisher"
          placeholder="Search software or publisher…"
          value={controller.search}
          onChange={(e) => controller.setSearch(e.target.value)}
        />
        <Select
          aria-label="Category"
          placeholder="All Categories"
          options={categories}
          value={controller.filters['category'] ?? ''}
          onChange={(e) => controller.setFilter('category', e.target.value || undefined)}
        />
        <Select
          aria-label="Publisher"
          placeholder="All Publishers"
          options={publishers}
          value={controller.filters['publisher'] ?? ''}
          onChange={(e) => controller.setFilter('publisher', e.target.value || undefined)}
        />
        <span className={styles.count}>
          {num(controller.rows.length)} of {num(controller.total)} packages
        </span>
      </div>

      {controller.loading ? (
        <div className={styles.grid}>
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className={styles.cardSkeleton} />
          ))}
        </div>
      ) : controller.rows.length === 0 ? (
        <p className={styles.empty}>
          No package matches that search. Clear the category or publisher filter to see the whole
          catalogue.
        </p>
      ) : (
        <ul className={styles.grid}>
          {controller.rows.map((pkg) => (
            <li key={pkg.id}>
              <PackageCard
                pkg={pkg}
                canWrite={canWrite}
                onDeploy={() =>
                  void navigate(
                    `/deployments/new?kind=install-software&package=${encodeURIComponent(segment(pkg.id))}`,
                  )
                }
                onEdit={openEditor}
              />
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        title={editing ? `Edit ${editing.title}` : 'Add a package'}
        description={
          editing
            ? 'Changing the version drops the installer on file, because it was built for the old one.'
            : 'A definition first. The installer is uploaded separately, and the package cannot be deployed until it is.'
        }
        footer={
          <>
            <Button onClick={() => setEditorOpen(false)}>Cancel</Button>
            <Button
              variant="primary"
              loading={save.isPending}
              disabled={!draft.name.trim() || !draft.publisher.trim() || !draft.version.trim()}
              onClick={() => save.mutate()}
            >
              {editing ? 'Save package' : 'Add package'}
            </Button>
          </>
        }
      >
        <div className={styles.editor}>
          <Field label="Name" required>
            {(field) => (
              <Input
                {...field}
                maxLength={120}
                placeholder="Google Chrome"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            )}
          </Field>
          <Field label="Publisher" required>
            {(field) => (
              <Input
                {...field}
                maxLength={120}
                placeholder="Google LLC"
                value={draft.publisher}
                onChange={(e) => setDraft({ ...draft, publisher: e.target.value })}
              />
            )}
          </Field>
          <Field label="Version" required hint="What an endpoint would install.">
            {(field) => (
              <Input
                {...field}
                maxLength={64}
                placeholder="142.0.7204.92"
                value={draft.version}
                onChange={(e) => setDraft({ ...draft, version: e.target.value })}
              />
            )}
          </Field>
          <Field label="Platform" required>
            {(field) => (
              <Select
                {...field}
                options={[
                  { value: 'windows', label: 'Windows' },
                  { value: 'macos', label: 'macOS' },
                  { value: 'linux', label: 'Linux' },
                ]}
                value={draft.platform}
                onChange={(e) => setDraft({ ...draft, platform: e.target.value })}
              />
            )}
          </Field>
        </div>
      </Modal>

      {controller.hasNext || controller.hasPrevious ? (
        <Pagination
          from={controller.from}
          to={controller.to}
          total={controller.total}
          unit="packages"
          pageSize={controller.pageSize}
          onPageSizeChange={controller.setPageSize}
          hasNext={controller.hasNext}
          hasPrevious={controller.hasPrevious}
          onNext={controller.next}
          onPrevious={controller.previous}
        />
      ) : null}

      <div className={styles.footnote}>
        <span>
          Aegis One <i>/</i> Software Catalog
        </span>
        <span>
          {counts
            ? `${num(counts.installerAdded)} ready to deploy · ${num(counts.installerMissing)} awaiting an installer`
            : ''}
        </span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Pieces                                                             */
/* ------------------------------------------------------------------ */

function PackageCard({
  pkg,
  canWrite,
  onDeploy,
  onEdit,
}: {
  pkg: SoftwareTitle;
  canWrite: boolean;
  onDeploy: () => void;
  onEdit: (pkg: SoftwareTitle) => void;
}) {
  const deployable = pkg.installer === 'added';
  return (
    <article className={styles.card}>
      <header className={styles.cardTop}>
        {pkg.logoUrl ? (
          <img className={styles.icon} src={pkg.logoUrl} alt="" width={46} height={46} />
        ) : (
          /*
           * The reference falls back to a lettered tile when a package has no
           * logo, and its own catalogue ships without any: icons are imported
           * by an administrator, which is what Import Icons is for.
           */
          <span className={styles.icon} aria-hidden="true">
            {pkg.title.slice(0, 1).toUpperCase()}
          </span>
        )}
        <div className={styles.cardName}>
          <h2>{pkg.title}</h2>
          <p>{pkg.publisher}</p>
        </div>
      </header>

      <p className={styles.category}>{pkg.category}</p>

      <dl className={styles.meta}>
        <div>
          <dt>Version</dt>
          <dd>{pkg.latestVersion}</dd>
        </div>
        <div>
          <dt>Platform</dt>
          <dd>{PLATFORM_LABEL[pkg.platform] ?? pkg.platform}</dd>
        </div>
        <div>
          <dt>Package status</dt>
          <dd className={pkg.state === 'draft' ? styles.warn : styles.good}>
            {pkg.state === 'draft' ? 'Draft' : 'Published'}
          </dd>
        </div>
        <div>
          <dt>Installer</dt>
          <dd className={deployable ? styles.good : styles.warn}>
            {deployable ? 'Added' : 'Not Added'}
          </dd>
        </div>
      </dl>

      <footer className={styles.cardFoot}>
        <Button
          size="sm"
          variant="primary"
          disabled={!canWrite || !deployable}
          onClick={onDeploy}
          {...(deployable
            ? {}
            : { title: 'An installer has to be uploaded before this package can be deployed' })}
        >
          Deploy
        </Button>
        <Menu
          label={`More actions for ${pkg.title}`}
          items={[
            {
              id: 'edit',
              label: 'Edit Package',
              disabled: !canWrite,
              onSelect: () => onEdit(pkg),
            },
            {
              id: 'uninstall',
              label: `Uninstall (${num(pkg.installCount)})`,
              disabled: !canWrite || pkg.installCount === 0,
              onSelect: onDeploy,
            },
          ]}
        >
          {(trigger) => (
            <Button size="sm" {...trigger}>
              ⋯
            </Button>
          )}
        </Menu>
      </footer>
    </article>
  );
}

function Kpi({
  label,
  value,
  active = false,
  onClick,
}: {
  label: string;
  value: string;
  active?: boolean;
  onClick?: () => void;
}) {
  const content = (
    <>
      <span className={styles.kpiLabel}>{label}</span>
      <span className={styles.kpiValue}>{value}</span>
    </>
  );
  if (!onClick) return <div className={styles.kpi}>{content}</div>;
  return (
    <button
      type="button"
      aria-pressed={active}
      className={active ? styles.kpiActive : styles.kpi}
      onClick={onClick}
    >
      {content}
    </button>
  );
}
