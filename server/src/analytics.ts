import { parse } from 'csv-parse/sync';
export type Row = Record<string, string>;
export class InputError extends Error {}
export function parseCsv(buffer: Buffer) {
  if (buffer.includes(0)) throw new InputError('Upload a UTF-8 CSV text file.');
  let records: string[][];
  try {
    records = parse(buffer, {
      bom: true,
      skip_empty_lines: true,
      trim: true,
      max_record_size: 100_000,
    });
  } catch {
    throw new InputError(
      'Invalid CSV. Check quotes and ensure every row has the same number of fields.',
    );
  }
  if (records.length < 2) throw new InputError('The CSV needs a header and at least one data row.');
  const [columns, ...values] = records;
  if (columns.length > 40 || values.length > 10000)
    throw new InputError('Use at most 40 columns and 10,000 rows.');
  if (
    columns.some(
      (c) => !c || c.length > 100 || ['__proto__', 'constructor', 'prototype'].includes(c),
    ) ||
    new Set(columns).size !== columns.length
  )
    throw new InputError('Column names must be unique, nonempty, and at most 100 characters.');
  if (values.some((row) => row.some((v) => v.length > 2000)))
    throw new InputError('Each cell must be at most 2,000 characters.');
  const rows = values.map((values) =>
    Object.fromEntries(columns.map((column, i) => [column, values[i]])),
  );
  return { columns, rows };
}
const isNumber = (value: string) =>
  /^[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?$/i.test(value) &&
  Number.isFinite(Number(value)) &&
  Math.abs(Number(value)) <= 1e15;
export function analyze(columns: string[], rows: Row[]) {
  const stats = columns.map((name) => {
    const values = rows.map((row) => row[name]);
    const present = values.filter((value) => value !== '');
    const numeric = present.length > 0 && present.every(isNumber);
    const numbers = numeric ? present.map(Number) : [];
    const sum = numbers.reduce((a, b) => a + b, 0);
    return {
      name,
      type: numeric ? 'number' : 'text',
      missing: values.length - present.length,
      unique: new Set(present).size,
      ...(numeric
        ? { sum, mean: sum / numbers.length, min: Math.min(...numbers), max: Math.max(...numbers) }
        : {}),
    };
  });
  const numericColumns = stats.filter((s) => s.type === 'number').map((s) => s.name);
  const categoryColumns = stats.filter((s) => s.type === 'text').map((s) => s.name);
  return {
    rowCount: rows.length,
    columnCount: columns.length,
    missingCells: stats.reduce((sum, c) => sum + c.missing, 0),
    numericColumns,
    categoryColumns,
    stats,
  };
}
// The same deterministic aggregation powers charts and the assistant's grounded evidence.
export function groupRows(rows: Row[], group: string, metric: string) {
  const buckets = new Map<string, { label: string; value: number; count: number }>();
  for (const row of rows) {
    const label = row[group] || '(missing)';
    const bucket = buckets.get(label) ?? { label, value: 0, count: 0 };
    bucket.count++;
    if (row[metric] !== '') bucket.value += Number(row[metric]);
    buckets.set(label, bucket);
  }
  return [...buckets.values()].sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
}
export type Analytics = ReturnType<typeof analyze>;
