import type { SubqQuestion } from '../types/subq';

export interface ApiSnippets {
  curl: string;
  python: string;
  typescript: string;
}

const SUBQ_ENDPOINT = 'https://api.subq.ai/v1/systemone';
const SUBQ_MODEL = 'subq-snap-1.2';

function escapeSingleQuotedShell(value: string): string {
  return value.replace(/'/g, "'\\''");
}

function toPythonLiteral(value: unknown, indent = 0): string {
  const pad = '    '.repeat(indent);
  const childPad = '    '.repeat(indent + 1);

  if (value === null || value === undefined) return 'None';
  if (typeof value === 'boolean') return value ? 'True' : 'False';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'None';
  if (typeof value === 'string') return JSON.stringify(value);

  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    const items = value.map((item) => `${childPad}${toPythonLiteral(item, indent + 1)}`);
    return `[\n${items.join(',\n')},\n${pad}]`;
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) return '{}';
    const lines = entries.map(
      ([k, v]) => `${childPad}${JSON.stringify(k)}: ${toPythonLiteral(v, indent + 1)}`,
    );
    return `{\n${lines.join(',\n')},\n${pad}}`;
  }

  return JSON.stringify(String(value));
}

export function buildApiSnippets(payload: {
  model?: 'subq-snap-1.2';
  state: string | Record<string, unknown>;
  questions: Record<string, SubqQuestion>;
}): ApiSnippets {
  const bodyObj = {
    model: SUBQ_MODEL,
    state: payload.state,
    questions: payload.questions,
  };

  const jsonPretty = JSON.stringify(bodyObj, null, 2);

  const curl = [
    `curl -sS -X POST "${SUBQ_ENDPOINT}" \\`,
    `  -H "Authorization: Bearer $SUBQ_API_KEY" \\`,
    `  -H "Content-Type: application/json" \\`,
    `  -d '${escapeSingleQuotedShell(jsonPretty)}'`,
  ].join('\n');

  const pythonPayload = toPythonLiteral(bodyObj);

  const python = [
    'import os',
    'import requests',
    '',
    `payload = ${pythonPayload}`,
    '',
    'response = requests.post(',
    `    "${SUBQ_ENDPOINT}",`,
    '    headers={',
    '        "Authorization": f"Bearer {os.environ[\'SUBQ_API_KEY\']}",',
    '        "Content-Type": "application/json",',
    '    },',
    '    json=payload,',
    '    timeout=60,',
    ')',
    'response.raise_for_status()',
    'print(response.json())',
  ].join('\n');

  const typescript = [
    `const payload = ${jsonPretty};`,
    '',
    `const response = await fetch("${SUBQ_ENDPOINT}", {`,
    '  method: "POST",',
    '  headers: {',
    '    Authorization: `Bearer ${process.env.SUBQ_API_KEY ?? ""}`,',
    '    "Content-Type": "application/json",',
    '  },',
    '  body: JSON.stringify(payload),',
    '});',
    '',
    'if (!response.ok) {',
    '  throw new Error(`SubQ HTTP ${response.status}: ${await response.text()}`);',
    '}',
    '',
    'const data = await response.json();',
    'console.log(data);',
  ].join('\n');

  return { curl, python, typescript };
}
