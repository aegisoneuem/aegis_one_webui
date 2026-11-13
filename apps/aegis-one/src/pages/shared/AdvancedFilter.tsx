import { useState } from 'react';
import { Button, Modal, Select } from '@aegis/ui';
import styles from './AdvancedFilter.module.css';

/**
 * The rule builder behind "Advanced Filter", as v129 has it: a list of rules
 * that must all match, each a field, an operator and a value.
 *
 * It encodes to the contract's `?filter=` — a JSON array of
 * `{field, op, value}` — which the server parses through the same column and
 * operator allowlist the ordinary query parameters use. The console does not
 * carry its own copy of that allowlist, so a combination the column does not
 * support comes back as a 400 saying which, rather than being guessed at
 * here and quietly dropped.
 */

export interface FilterRule {
  field: string;
  op: FilterRuleOp;
  value: string;
}

export type FilterRuleOp =
  'like' | 'nlike' | 'eq' | 'ne' | 'starts' | 'empty' | 'notEmpty' | 'gte' | 'lte';

/** The reference's own operator list, in its order. */
export const RULE_OPS: readonly { value: FilterRuleOp; label: string; needsValue: boolean }[] = [
  { value: 'like', label: 'contains', needsValue: true },
  { value: 'nlike', label: 'does not contain', needsValue: true },
  { value: 'eq', label: 'is', needsValue: true },
  { value: 'ne', label: 'is not', needsValue: true },
  { value: 'starts', label: 'starts with', needsValue: true },
  { value: 'empty', label: 'is empty', needsValue: false },
  { value: 'notEmpty', label: 'is not empty', needsValue: false },
  { value: 'gte', label: 'is at least', needsValue: true },
  { value: 'lte', label: 'is at most', needsValue: true },
];

const needsValue = (op: FilterRuleOp): boolean =>
  RULE_OPS.find((o) => o.value === op)?.needsValue ?? true;

/** A rule with nothing to say yet, so an empty builder still shows one row. */
const blank = (field: string): FilterRule => ({ field, op: 'like', value: '' });

/** Drops the rules that would do nothing, which is what Apply should send. */
export function usableRules(rules: readonly FilterRule[]): FilterRule[] {
  return rules.filter((r) => r.field !== '' && (!needsValue(r.op) || r.value.trim() !== ''));
}

export interface AdvancedFilterProps {
  open: boolean;
  onClose: () => void;
  /** Every field the grid can filter on, in the grid's own order. */
  fields: readonly { value: string; label: string }[];
  rules: readonly FilterRule[];
  onApply: (rules: FilterRule[]) => void;
}

export function AdvancedFilter({ open, onClose, fields, rules, onApply }: AdvancedFilterProps) {
  const first = fields[0]?.value ?? '';
  /*
   * Seeded once, from the rules in force. The caller remounts this on every
   * open — see the `key` in Devices — so opening always shows what is
   * applied rather than what was left behind, without an effect that writes
   * state during render.
   */
  const [draft, setDraft] = useState<FilterRule[]>(() =>
    rules.length > 0 ? [...rules] : [blank(first)],
  );

  const update = (index: number, patch: Partial<FilterRule>): void =>
    setDraft(draft.map((rule, i) => (i === index ? { ...rule, ...patch } : rule)));

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Advanced Filter"
      description={`All rules must match · ${fields.length} fields`}
      size="md"
      footer={
        <>
          <Button onClick={() => setDraft([blank(first)])}>Clear rules</Button>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            onClick={() => {
              onApply(usableRules(draft));
              onClose();
            }}
          >
            Apply
          </Button>
        </>
      }
    >
      <div className={styles.rules}>
        {draft.map((rule, i) => (
          <div key={i} className={styles.rule}>
            <Select
              size="sm"
              aria-label={`Field for rule ${i + 1}`}
              options={fields}
              value={rule.field}
              onChange={(e) => update(i, { field: e.target.value })}
            />
            <Select
              size="sm"
              aria-label={`Operator for rule ${i + 1}`}
              options={RULE_OPS.map((o) => ({ value: o.value, label: o.label }))}
              value={rule.op}
              onChange={(e) => update(i, { op: e.target.value as FilterRuleOp })}
            />
            {needsValue(rule.op) ? (
              <input
                className={styles.value}
                aria-label={`Value for rule ${i + 1}`}
                placeholder="Value"
                value={rule.value}
                onChange={(e) => update(i, { value: e.target.value })}
              />
            ) : (
              <span className={styles.noValue}>no value needed</span>
            )}
            <button
              type="button"
              className={styles.remove}
              aria-label={`Remove rule ${i + 1}`}
              disabled={draft.length === 1}
              onClick={() => setDraft(draft.filter((_, index) => index !== i))}
            >
              ✕
            </button>
          </div>
        ))}
      </div>
      <Button size="sm" onClick={() => setDraft([...draft, blank(first)])}>
        + Add rule
      </Button>
    </Modal>
  );
}
