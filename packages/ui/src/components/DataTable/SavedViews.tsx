import { useState } from 'react';
import { Button } from '../Button/Button';
import { Field } from '../Field/Field';
import { Input } from '../Input/Input';
import { Menu, type MenuEntry } from '../Menu/Menu';
import { Modal } from '../Modal/Modal';
import type { SavedView, TableView } from './types';

export interface SavedViewsProps {
  views: readonly SavedView[];
  activeId: string | null;
  onApply: (view: SavedView) => void;
  /** The layout as it stands, which "Save as" captures. */
  current: TableView;
  onSave?: (name: string, view: TableView) => void;
  onDelete?: (id: string) => void;
  /** True once the active view has been changed but not saved. */
  dirty?: boolean;
}

/**
 * Named column layouts for a table. The view holds only layout — filters stay
 * in the URL, so a link to a filtered list keeps working for someone who does
 * not have the view.
 */
export function SavedViews({
  views,
  activeId,
  onApply,
  current,
  onSave,
  onDelete,
  dirty = false,
}: SavedViewsProps) {
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const active = views.find((v) => v.id === activeId);
  const trimmed = name.trim();

  const entries: MenuEntry[] = [
    { separator: true, label: 'Views' },
    ...views.map((v) => ({
      id: v.id,
      label: v.id === activeId ? `${v.name} ✓` : v.name,
      onSelect: () => onApply(v),
    })),
  ];

  if (onSave) {
    entries.push(
      { separator: true },
      {
        id: 'save-as',
        label: 'Save current layout as…',
        onSelect: () => {
          setName('');
          setError(null);
          setSaving(true);
        },
      },
    );
  }

  if (onDelete && active && !active.system) {
    entries.push({
      id: 'delete',
      label: `Delete "${active.name}"`,
      danger: true,
      onSelect: () => onDelete(active.id),
    });
  }

  const submit = () => {
    if (!trimmed) {
      setError('Give the view a name.');
      return;
    }
    if (views.some((v) => v.name.toLowerCase() === trimmed.toLowerCase())) {
      setError('A view with that name already exists.');
      return;
    }
    onSave?.(trimmed, current);
    setSaving(false);
  };

  return (
    <>
      <Menu items={entries} label="Saved views">
        {(trigger) => (
          // Named for what it is, not for what is currently chosen: the
          // visible text says which view, the name says what the control
          // does.
          <Button size="sm" aria-label="Saved views" {...trigger}>
            {active ? active.name : 'Default view'}
            {dirty ? ' •' : ''}
          </Button>
        )}
      </Menu>

      <Modal
        open={saving}
        onClose={() => setSaving(false)}
        title="Save view"
        description="Saves the current column selection, order and widths. Filters are not part of a view."
        footer={
          <>
            <Button onClick={() => setSaving(false)}>Cancel</Button>
            <Button variant="primary" onClick={submit}>
              Save view
            </Button>
          </>
        }
      >
        <Field label="View name" required error={error}>
          {(field) => (
            <Input
              {...field}
              value={name}
              maxLength={60}
              placeholder="Servers pending restart"
              onChange={(e) => {
                setName(e.target.value);
                setError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submit();
              }}
            />
          )}
        </Field>
      </Modal>
    </>
  );
}
