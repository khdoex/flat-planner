// Stable JSON layout for files under data/: one furniture item, dim or wall per line,
// so git diffs show exactly what moved.

const WIDTH = 260;

function flatValue(v: unknown): boolean {
  if (v === null || typeof v !== 'object') return true;
  if (Array.isArray(v)) return v.every((x) => x === null || typeof x !== 'object' || (Array.isArray(x) && x.every((y) => typeof y !== 'object')));
  return Object.values(v as object).every((x) => x === null || typeof x !== 'object' || (Array.isArray(x) && x.every((y) => typeof y !== 'object')));
}

function inline(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(inline).join(', ')}]`;
  return `{${Object.entries(v as object).map(([k, x]) => `${JSON.stringify(k)}: ${inline(x)}`).join(', ')}}`;
}

function fmt(v: unknown, ind: string): string {
  const one = inline(v);
  if (v === null || typeof v !== 'object' || (flatValue(v) && one.length + ind.length <= WIDTH)) return one;
  const next = ind + '  ';
  if (Array.isArray(v)) return `[\n${v.map((x) => next + fmt(x, next)).join(',\n')}\n${ind}]`;
  const entries = Object.entries(v as object);
  return `{\n${entries.map(([k, x]) => `${next}${JSON.stringify(k)}: ${fmt(x, next)}`).join(',\n')}\n${ind}}`;
}

export function formatJson(v: unknown): string {
  return fmt(v, '') + '\n';
}
