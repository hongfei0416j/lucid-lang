// CI 门禁第一件：语法 / 类型 / 效果校验
//  - examples/ 必须全部通过
//  - tests/fixtures/ 必须按预期错误码被打回（证明门禁真的在拦）

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function runCheck(target) {
  const r = spawnSync(process.execPath,
    ['expander/cli.mjs', 'check', target, '--schema', 'spec/schema.json'],
    { cwd: ROOT, encoding: 'utf8' });
  return r.stdout
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

let failures = 0;

// 1) 正例必须通过
const passed = runCheck('examples');
for (const rec of passed) {
  const ok = rec.ok === true;
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  examples/${path.basename(rec.file)}  tokens=${rec.tokens}`);
  if (!ok) console.log('      ', JSON.stringify(rec.errors));
}

// 2) 反例必须按预期错误码打回
const expected = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/fixtures/expected.json'), 'utf8'));
const rejected = runCheck('tests/fixtures');
for (const rec of rejected) {
  const base = path.basename(rec.file);
  const want = expected[base];
  const got = rec.errors[0]?.code;
  const ok = rec.ok === false && got === want;
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  fixtures/${base}  want=${want} got=${got || '(none)'}`);
}

console.log(`\nGATE: ${failures === 0 ? 'ALL PASS' : `${failures} FAILURE(S)`}`);
process.exit(failures ? 1 : 0);
