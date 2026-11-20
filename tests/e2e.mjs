// CI 门禁第三件：端到端 —— 展开产物必须能在 C# 里真实编译运行，且输出等于 expected
// 这一步用来证明示例不是"看起来像代码"，而是可执行代码（规避 A4）。

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TMP = path.join(ROOT, 'tests/.tmp');

const schema = JSON.parse(fs.readFileSync(path.join(ROOT, 'spec/schema.json'), 'utf8'));
const { cases } = JSON.parse(fs.readFileSync(path.join(ROOT, 'examples/cases.json'), 'utf8'));

function expand(file) {
  const r = spawnSync(process.execPath,
    ['expander/cli.mjs', 'expand', `examples/${file}`, '--target', 'csharp', '--schema', 'spec/schema.json'],
    { cwd: ROOT, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`expand failed for ${file}:\n${r.stderr}`);
  return r.stdout.trimEnd();
}

function csPrimitive(type) {
  return { Int: 'int', Bool: 'bool', String: 'string' }[type] || type;
}

function csValue(v) {
  return typeof v === 'string' ? JSON.stringify(v) : String(v);
}

function csInput(sourceName, values) {
  const list = schema.sources[sourceName].type;
  const elem = /^List<(.+)>$/.exec(list)[1];
  const fields = schema.records[elem];
  if (!fields) return `new[] { ${values.map(csValue).join(', ')} }`;
  const items = values.map((v) => `new ${elem}(${fields.map((f) => csValue(v[f.name])).join(', ')})`);
  return `new[] { ${items.join(', ')} }`;
}

const recordDecls = Object.entries(schema.records).map(
  ([name, fields]) => `public record ${name}(${fields.map((f) => `${csPrimitive(f.type)} ${f.name}`).join(', ')});`
);

const methods = cases.map((c) => expand(c.file).split('\n').map((l) => (l ? `    ${l}` : l)).join('\n'));
const calls = cases.map((c) => {
  const fn = c.function;
  return `        Console.WriteLine(JsonSerializer.Serialize(Pipelines.${fn}(${csInput(c.source, c.input)})));`;
});

const program = [
  '#:property JsonSerializerIsReflectionEnabledByDefault=true',
  'using System;',
  'using System.Linq;',
  'using System.Text.Json;',
  '',
  ...recordDecls,
  '',
  'public static class Pipelines',
  '{',
  methods.join('\n\n'),
  '}',
  '',
  'public static class Program',
  '{',
  '    public static void Main()',
  '    {',
  ...calls,
  '    }',
  '}',
  '',
].join('\n');

fs.rmSync(TMP, { recursive: true, force: true });
fs.mkdirSync(TMP, { recursive: true });
const programPath = path.join(TMP, 'Program.cs');
fs.writeFileSync(programPath, program, 'utf8');

const run = spawnSync('dotnet', ['run', programPath], {
  cwd: ROOT,
  encoding: 'utf8',
  timeout: 300000,
  shell: false,
});

if (run.status !== 0) {
  console.error('FAIL  dotnet run 失败');
  console.error(run.stdout);
  console.error(run.stderr);
  process.exit(1);
}

const lines = run.stdout.split(/\r?\n/).filter((l) => l.trim().startsWith('{') || l.trim().startsWith('[') || /^-?\d+$/.test(l.trim()));
let failures = 0;

cases.forEach((c, i) => {
  const raw = (lines[i] ?? '').trim();
  let actual;
  try { actual = JSON.parse(raw); } catch { actual = raw; }
  const ok = JSON.stringify(actual) === JSON.stringify(c.expected);
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${c.file} → ${c.function}  期望 ${JSON.stringify(c.expected)} 实际 ${JSON.stringify(actual)}`);
});

console.log(`\nE2E: ${failures === 0 ? 'ALL PASS' : `${failures} FAILURE(S)`}`);
process.exit(failures ? 1 : 0);
