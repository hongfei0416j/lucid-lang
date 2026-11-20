// CI 门禁第三件：端到端 —— 4 个目标的展开产物必须真实编译运行，且输出等于 expected
// 这一步用来证明示例不是"看起来像代码"，而是可执行代码（规避 A4）。
// 工具链缺失的目标记为 SKIP，不伪装成通过。

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TMP = path.join(ROOT, 'tests/.tmp');
const TSC = path.join(ROOT, 'node_modules/typescript/lib/tsc.js');

const schema = JSON.parse(fs.readFileSync(path.join(ROOT, 'spec/schema.json'), 'utf8'));
const { cases } = JSON.parse(fs.readFileSync(path.join(ROOT, 'examples/cases.json'), 'utf8'));

const listElem = (type) => {
  const m = /^List<(.+)>$/.exec(type || '');
  return m ? m[1] : null;
};

function expand(file, target) {
  const r = spawnSync(process.execPath,
    ['expander/cli.mjs', 'expand', `examples/${file}`, '--target', target, '--schema', 'spec/schema.json'],
    { cwd: ROOT, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`expand failed for ${file} (${target}):\n${r.stderr}`);
  return r.stdout.trimEnd();
}

const literal = (v) => (typeof v === 'string' ? JSON.stringify(v) : String(v));
const indent = (text, pad) => text.split('\n').map((l) => (l ? `${pad}${l}` : l)).join('\n');

function hasCommand(cmd, args) {
  return spawnSync(cmd, args, { encoding: 'utf8' }).status === 0;
}

const PYTHON = ['python', 'python3', 'py'].find((c) => hasCommand(c, ['--version'])) || null;

// ── 各目标的宿主装配 ────────────────────────────────────────────────────────

function csharpSource() {
  const csPrim = (t) => ({ Int: 'int', Bool: 'bool', String: 'string' }[t] || t);
  const input = (source, values) => {
    const elem = listElem(schema.sources[source].type);
    const fields = schema.records[elem];
    if (!fields) return `new[] { ${values.map(literal).join(', ')} }`;
    const items = values.map((v) => `new ${elem}(${fields.map((f) => literal(v[f.name])).join(', ')})`);
    return `new[] { ${items.join(', ')} }`;
  };
  const records = Object.entries(schema.records).map(
    ([name, fields]) => `public record ${name}(${fields.map((f) => `${csPrim(f.type)} ${f.name}`).join(', ')});`);
  const methods = cases.map((c) => indent(expand(c.file, 'csharp'), '    '));
  const calls = cases.map((c) =>
    `        Console.WriteLine(JsonSerializer.Serialize(Pipelines.${c.function}(${input(c.source, c.input)})));`);

  return [
    '#:property JsonSerializerIsReflectionEnabledByDefault=true',
    'using System;',
    'using System.Linq;',
    'using System.Text.Json;',
    '',
    ...records,
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
}

function tsSource() {
  const tsPrim = (t) => ({ Int: 'number', Bool: 'boolean', String: 'string' }[t] || t);
  const records = Object.entries(schema.records).map(
    ([name, fields]) => `type ${name} = { ${fields.map((f) => `${f.name}: ${tsPrim(f.type)}`).join('; ')} };`);
  const input = (source, values) => {
    const elem = listElem(schema.sources[source].type);
    const fields = schema.records[elem];
    if (!fields) return `[${values.map(literal).join(', ')}]`;
    const items = values.map((v) => `{ ${fields.map((f) => `${f.name}: ${literal(v[f.name])}`).join(', ')} }`);
    return `[${items.join(', ')}]`;
  };
  const methods = cases.map((c) => expand(c.file, 'typescript'));
  const calls = cases.map((c) => `console.log(JSON.stringify(${c.function}(${input(c.source, c.input)})));`);

  // 类型别名仅用于检查，产物函数签名里已带类型（tsType 保证别名被引用）
  return [
    ...records,
    '',
    ...methods,
    '',
    ...calls,
    '',
  ].join('\n');
}

function pythonSource() {
  const pyPrim = (t) => ({ Int: 'int', Bool: 'bool', String: 'str' }[t] || t);
  const records = Object.entries(schema.records).map(
    ([name, fields]) => ['@dataclass', `class ${name}:`, ...fields.map((f) => `    ${f.name}: ${pyPrim(f.type)}`)].join('\n'));
  const input = (source, values) => {
    const elem = listElem(schema.sources[source].type);
    const fields = schema.records[elem];
    if (!fields) return `[${values.map(literal).join(', ')}]`;
    const items = values.map((v) => `${elem}(${fields.map((f) => literal(v[f.name])).join(', ')})`);
    return `[${items.join(', ')}]`;
  };
  const methods = cases.map((c) => expand(c.file, 'python'));
  const calls = cases.map((c) => `print(_out(${c.function}(${input(c.source, c.input)})))`);

  return [
    'from dataclasses import dataclass, asdict, is_dataclass',
    'import json',
    '',
    ...records,
    '',
    ...methods,
    '',
    'def _out(value):',
    '    if isinstance(value, list):',
    '        return json.dumps([asdict(x) if is_dataclass(x) else x for x in value])',
    '    return json.dumps(value)',
    '',
    ...calls,
    '',
  ].join('\n');
}

function javaSource() {
  const javaPrim = (t) => ({ Int: 'int', Bool: 'boolean', String: 'String' }[t] || t);
  const input = (source, values) => {
    const elem = listElem(schema.sources[source].type);
    const fields = schema.records[elem];
    if (!fields) return `List.of(${values.map(literal).join(', ')})`;
    const items = values.map((v) => `new ${elem}(${fields.map((f) => literal(v[f.name])).join(', ')})`);
    return `List.of(${items.join(', ')})`;
  };

  // expected 是对象数组时，按字段集合反查记录名，生成 JSON 助手
  const outRecords = new Set();
  for (const c of cases) {
    if (!Array.isArray(c.expected) || c.expected.length === 0) continue;
    const keys = Object.keys(c.expected[0]).sort().join(',');
    for (const [name, fields] of Object.entries(schema.records)) {
      if (fields.map((f) => f.name).sort().join(',') === keys) outRecords.add(name);
    }
  }

  const jsonHelpers = [];
  for (const name of outRecords) {
    const fields = schema.records[name];
    jsonHelpers.push(`    static String ${name}Json(${name} x) {`);
    jsonHelpers.push('        StringBuilder sb = new StringBuilder("{");');
    fields.forEach((f, i) => {
      const sep = i === 0 ? '' : ',';
      const value = f.type === 'String' ? `"\\"" + x.${f.name}() + "\\""` : `x.${f.name}()`;
      jsonHelpers.push(`        sb.append("${sep}\\"${f.name}\\":").append(${value});`);
    });
    jsonHelpers.push('        sb.append("}");');
    jsonHelpers.push('        return sb.toString();');
    jsonHelpers.push('    }');
    jsonHelpers.push('');
    jsonHelpers.push(`    static String ${name}ListJson(List<${name}> xs) {`);
    jsonHelpers.push(`        return "[" + xs.stream().map(Main::${name}Json).collect(Collectors.joining(",")) + "]";`);
    jsonHelpers.push('    }');
    jsonHelpers.push('');
  }

  const records = Object.entries(schema.records).map(
    ([name, fields]) => `record ${name}(${fields.map((f) => `${javaPrim(f.type)} ${f.name}`).join(', ')}) {}`);
  const methods = cases.map((c) => indent(expand(c.file, 'java'), '    '));
  const calls = cases.map((c) => {
    const call = `Pipelines.${c.function}(${input(c.source, c.input)})`;
    if (!Array.isArray(c.expected)) return `        System.out.println(${call});`;
    const keys = Object.keys(c.expected[0]).sort().join(',');
    const rec = [...outRecords].find((name) => schema.records[name].map((f) => f.name).sort().join(',') === keys);
    return `        System.out.println(${rec}ListJson(${call}));`;
  });

  return [
    'import java.util.*;',
    'import java.util.stream.*;',
    '',
    'public class Main',
    '{',
    ...jsonHelpers,
    '    public static void main(String[] args)',
    '    {',
    ...calls,
    '    }',
    '}',
    '',
    ...records,
    '',
    'class Pipelines',
    '{',
    methods.join('\n\n'),
    '}',
    '',
  ].join('\n');
}

// ── 目标执行器 ──────────────────────────────────────────────────────────────

const BUILDERS = {
  csharp: {
    available: () => hasCommand('dotnet', ['--version']),
    build(dir) {
      const file = path.join(dir, 'Program.cs');
      fs.writeFileSync(file, csharpSource(), 'utf8');
      return { cmd: 'dotnet', args: ['run', file], cwd: ROOT };
    },
  },
  typescript: {
    available: () => fs.existsSync(TSC),
    build(dir) {
      const file = path.join(dir, 'harness.ts');
      fs.writeFileSync(file, tsSource(), 'utf8');
      const compile = spawnSync(process.execPath,
        [TSC, '--target', 'ES2020', '--module', 'ESNext', '--skipLibCheck', '--outDir', dir, file],
        { cwd: ROOT, encoding: 'utf8' });
      if (compile.status !== 0) {
        throw new Error(`tsc 编译失败:\n${compile.stdout}\n${compile.stderr}`);
      }
      return { cmd: process.execPath, args: [path.join(dir, 'harness.js')], cwd: ROOT };
    },
  },
  python: {
    available: () => PYTHON !== null,
    build(dir) {
      const file = path.join(dir, 'harness.py');
      fs.writeFileSync(file, pythonSource(), 'utf8');
      return { cmd: PYTHON, args: [file], cwd: dir };
    },
  },
  java: {
    available: () => hasCommand('java', ['-version']),
    build(dir) {
      fs.writeFileSync(path.join(dir, 'Main.java'), javaSource(), 'utf8');
      return { cmd: 'java', args: ['Main.java'], cwd: dir };
    },
  },
};

function runTarget(target) {
  const builder = BUILDERS[target];
  if (!builder.available()) {
    console.log(`SKIP  [${target}] 未找到工具链，跳过端到端`);
    return 0;
  }

  const dir = path.join(TMP, target);
  fs.mkdirSync(dir, { recursive: true });
  const { cmd, args, cwd } = builder.build(dir);
  const run = spawnSync(cmd, args, { cwd, encoding: 'utf8', timeout: 300000, shell: false });

  if (run.status !== 0) {
    console.error(`FAIL  [${target}] 编译/运行失败`);
    console.error(run.stdout);
    console.error(run.stderr);
    return 1;
  }

  const lines = run.stdout
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.startsWith('{') || l.startsWith('[') || /^-?\d+$/.test(l));

  let failures = 0;
  cases.forEach((c, i) => {
    const raw = lines[i] ?? '';
    let actual;
    try { actual = JSON.parse(raw); } catch { actual = raw; }
    const ok = JSON.stringify(actual) === JSON.stringify(c.expected);
    if (!ok) failures++;
    console.log(`${ok ? 'PASS' : 'FAIL'}  [${target}] ${c.file} → ${c.function}  期望 ${JSON.stringify(c.expected)} 实际 ${JSON.stringify(actual)}`);
  });
  return failures;
}

fs.rmSync(TMP, { recursive: true, force: true });
fs.mkdirSync(TMP, { recursive: true });

let failures = 0;
for (const target of Object.keys(BUILDERS)) failures += runTarget(target);

console.log(`\nE2E: ${failures === 0 ? 'ALL PASS' : `${failures} FAILURE(S)`}`);
process.exit(failures ? 1 : 0);
