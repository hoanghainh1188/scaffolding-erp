// What an edit changed, field by field (activity-log design D6, D7). Values
// are compared as D18 shows them, sensitive ones only after masking, and
// only the fields that differ come back.
import { MAX_CHANGES } from "./activity";
import { maskBankAccount, maskIdNumber } from "./partner-fields";

export interface FieldChange {
  field: string;
  label: string;
  before: string | null;
  after: string | null;
}

export type Sensitive = "ID_NUMBER" | "BANK_ACCOUNT";

export interface FieldSpec<T> {
  field: string;
  label: string;
  /** The value as D18 writes it; null shows as "–". */
  value: (record: T) => string | null;
  /** Masked before comparing: the raw value never leaves diffFields. */
  sensitive?: Sensitive;
}

const MASKS: Readonly<Record<Sensitive, (raw: string) => string>> = {
  ID_NUMBER: maskIdNumber,
  BANK_ACCOUNT: maskBankAccount,
};

const CHANGED_MARK = " (đã đổi)";

function rawKey(value: string | null): string | null {
  return value === null ? null : value.replace(/\s/g, "");
}

/** The fields of `spec` whose shown value differs between before and after. */
export function diffFields<T>(
  spec: readonly FieldSpec<T>[],
  before: T,
  after: T,
): FieldChange[] {
  return spec.flatMap((entry): FieldChange[] => {
    const from = entry.value(before);
    const to = entry.value(after);
    if (!entry.sensitive) {
      return from === to
        ? []
        : [{ field: entry.field, label: entry.label, before: from, after: to }];
    }
    if (rawKey(from) === rawKey(to)) return [];
    const mask = MASKS[entry.sensitive];
    const shownFrom = from === null ? null : mask(from);
    let shownTo = to === null ? null : mask(to);
    // Same last four digits: still say it changed, without showing more.
    if (shownTo !== null && shownTo === shownFrom) shownTo += CHANGED_MARK;
    return [
      {
        field: entry.field,
        label: entry.label,
        before: shownFrom,
        after: shownTo,
      },
    ];
  });
}

/** True when a change holds a masked personal number (flag SENSITIVE). */
export function touchesSensitive<T>(
  spec: readonly FieldSpec<T>[],
  changes: readonly FieldChange[],
): boolean {
  const sensitive = new Set(
    spec.filter((entry) => entry.sensitive).map((entry) => entry.field),
  );
  return changes.some((change) => sensitive.has(change.field));
}

export interface LineColumn<L> {
  field: string;
  /** "Đơn giá" → "Đơn giá GG-K17". */
  label: string;
  value: (line: L) => string | null;
}

export interface LineSpec<L> {
  /** "lines" → fields "lines.GG-K17.unitPrice". */
  field: string;
  /** "GG-K17", or "GG-CH Chờ sửa" when a code appears per condition. */
  key: (line: L) => string;
  /** A whole line for an added or removed one: "50 cái × 40.000 ₫". */
  whole: (line: L) => string;
  columns: readonly LineColumn<L>[];
}

/**
 * Lines matched by key: an added line is "Dòng PK-KU" – → whole, a removed
 * one whole → –, a kept one each changed column. Order: before's lines,
 * then the added ones.
 */
export function diffLines<L>(
  spec: LineSpec<L>,
  before: readonly L[],
  after: readonly L[],
): FieldChange[] {
  const afterByKey = new Map(after.map((line) => [spec.key(line), line]));
  const beforeKeys = new Set(before.map(spec.key));
  const changes: FieldChange[] = [];
  for (const line of before) {
    const key = spec.key(line);
    const next = afterByKey.get(key);
    if (next === undefined) {
      changes.push({
        field: `${spec.field}.${key}`,
        label: `Dòng ${key}`,
        before: spec.whole(line),
        after: null,
      });
      continue;
    }
    for (const column of spec.columns) {
      const from = column.value(line);
      const to = column.value(next);
      if (from !== to) {
        changes.push({
          field: `${spec.field}.${key}.${column.field}`,
          label: `${column.label} ${key}`,
          before: from,
          after: to,
        });
      }
    }
  }
  for (const line of after) {
    const key = spec.key(line);
    if (beforeKeys.has(key)) continue;
    changes.push({
      field: `${spec.field}.${key}`,
      label: `Dòng ${key}`,
      before: null,
      after: spec.whole(line),
    });
  }
  return changes;
}

/**
 * A derived total ("Tổng tiền hàng của đơn"), added only when something
 * else changed and the total itself moved.
 */
export function withTotal(
  changes: readonly FieldChange[],
  total: Omit<FieldChange, "before" | "after"> & {
    before: string;
    after: string;
  },
): FieldChange[] {
  if (changes.length === 0 || total.before === total.after) return [...changes];
  return [...changes, total];
}

/** At most MAX_CHANGES entries; the rest become "Và N thay đổi khác". */
export function capChanges(changes: readonly FieldChange[]): FieldChange[] {
  if (changes.length <= MAX_CHANGES) return [...changes];
  const kept = changes.slice(0, MAX_CHANGES - 1);
  return [
    ...kept,
    {
      field: "_more",
      label: `Và ${changes.length - kept.length} thay đổi khác`,
      before: null,
      after: null,
    },
  ];
}
