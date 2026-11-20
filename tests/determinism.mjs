// CI 门禁第二件：展开确定性 —— 同一输入展开两次，必须逐字节相同（L2 承诺）
// 任何时间戳、随机数、环境读取都会让这里变红。4 个目标语言逐一验证。

import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILES = fs.readdirSync(path.join(ROOT, 'examples')).filter((f) => f.endsWith('.luc')).sort();
const TARGETS = ['csharp', 'typescript', 'python', 'java'];

function expand(file, target) {
  const r = spawnSync(process.execPath,
    ['expander/cli.mjs', 'expand', `examples/${file}`, '--target', target, '--schema', 'spec/schema.json'],
    { cwd: ROOT, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`expand failed for ${file} (${target}):\n${r.stderr}`);
  return r.stdout;
}

let failures = 0;
for (const target of TARGETS) {
  for (const file of FILES) {
    const a = expand(file, target);
    const b = expand(file, target);
    const ok = a === b;
    if (!ok) failures++;
    const hash = crypto.createHash('sha256').update(a).digest('hex').slice(0, 12);
    console.log(`${ok ? 'PASS' : 'FAIL'}  [${target}] ${file}  sha256=${hash}  2/2 identical`);
  }
}

console.log(`\nDETERMINISM: ${failures === 0 ? 'ALL PASS' : `${failures} FAILURE(S)`}`);
process.exit(failures ? 1 : 0);
