import { groupRows } from '../server/src/analytics.js';
import type { Dataset } from '../server/src/assistant.js';
export function evidenceFor(dataset: Dataset) {
  const { analytics, rows } = dataset;
  // All-row statistics and grouped sums, with explicit limits. No generated SQL or code execution.
  const groups = analytics.categoryColumns.slice(0, 6).flatMap((group) =>
    analytics.numericColumns.slice(0, 6).map((metric) => {
      const values = groupRows(rows, group, metric);
      return {
        group,
        metric,
        operation: 'sum',
        totalGroups: values.length,
        topGroups: values.slice(0, 12),
      };
    }),
  );
  return {
    name: dataset.name,
    statistics: analytics,
    groups,
    sample: rows.slice(0, 8),
    sampleNote:
      'Only the first 8 rows are shown. Statistics cover every row; groups cover the first 6 text and numeric columns and only the top 12 groups.',
  };
}
