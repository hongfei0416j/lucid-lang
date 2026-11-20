#!/usr/bin/env node
// Lucid CLI —— 门禁与展开器，模型不参与这一步（对应 workflows 的“系统”环节）
//
//   lucid check  <file|dir...> --schema spec/schema.json [--budget 500]
//   lucid expand <file> --target csharp --schema spec/schema.json
//
// 退出码：0 通过；1 存在错误。stdout 为机器可解析 JSON / 展开代码，stderr 为人类可读信息。

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from './parser.mjs';
import { check } from './checker.mjs';
import { loadRegistry } from './operators.mjs';
import { renderModule } from './render-csharp.mjs';
import { tokenize } from './tokenizer.mjs';

// 相对模块定位，不依赖 cwd —— 全局安装后也能找到算子表
const HERE = path.dirname(fileURLToPath(import.meta.url));
const REGISTRY_PATH = path.resolve(HERE, '..', 'operators.yaml');

function parseArgv(argv) {
  const opts = {};
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) { opts[a.slice(2)] = argv[i + 1]; i++; }
    else positional.push(a);
  }
  return { cmd: positional.shift(), targets: positional, opts };
}

function collectFiles(targets) {
  const files = [];
  for (const t of targets) {
    const st = fs.statSync(t);
    if (st.isDirectory()) {
      fs.readdirSync(t)
        .filter((f) => f.endsWith('.luc'))
        .sort()
        .forEach((f) => files.push(path.join(t, f)));
    } else {
      files.push(t);
    }
  }
  return files;
}

function loadSchema(p) {
  if (!p) throw new Error('缺少 --schema <path>');
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function analyze(file, schema, registry) {
  const src = fs.readFileSync(file, 'utf8');
  const { ast, errors: lexParseErrors } = parse(src);
  const errors = lexParseErrors.length ? lexParseErrors : check(ast, schema, registry);
  const tokens = tokenize(src).tokens.filter((t) => t.kind !== 'nl' && t.kind !== 'eof').length;
  return { file, src, ast, errors, tokens };
}

function main() {
  const { cmd, targets, opts } = parseArgv(process.argv.slice(2));
  const registry = loadRegistry(REGISTRY_PATH);

  if (cmd === 'check') {
    if (!targets.length) {
      console.error('用法: lucid check <file|dir...> --schema <path> [--budget N]');
      process.exit(2);
    }
    const schema = loadSchema(opts.schema);
    const budget = opts.budget ? Number(opts.budget) : null;
    let failed = 0;

    for (const file of collectFiles(targets)) {
      const { errors, tokens } = analyze(file, schema, registry);
      const budgetViolation = budget !== null && tokens > budget;
      const ok = errors.length === 0 && !budgetViolation;
      if (!ok) failed++;

      const record = {
        file: file.split(path.sep).join('/'),
        ok,
        tokens,
        errors,
      };
      if (budgetViolation) {
        record.errors = [...errors, {
          code: 'E_GATE_TOKEN_BUDGET', phase: 'gate',
          message: `源码 ${tokens} tokens 超出预算 ${budget}`, budget,
        }];
      }
      console.log(JSON.stringify(record));
      for (const e of record.errors) {
        console.error(`[${e.code}] ${record.file}: ${e.message}`);
      }
    }
    process.exit(failed ? 1 : 0);
  }

  if (cmd === 'expand') {
    if (targets.length !== 1) {
      console.error('用法: lucid expand <file.luc> --target csharp --schema <path>');
      process.exit(2);
    }
    const target = opts.target || 'csharp';
    const schema = loadSchema(opts.schema);

    if (target !== 'csharp') {
      console.error(JSON.stringify({
        code: 'E_EXPAND_UNSUPPORTED_TARGET', phase: 'expand',
        message: `v0.1 只支持 --target csharp，实际为 '${target}'`,
      }));
      process.exit(1);
    }

    const { ast, errors } = analyze(targets[0], schema, registry);
    if (errors.length) {
      for (const e of errors) console.error(JSON.stringify(e));
      process.exit(1);
    }
    process.stdout.write(renderModule(ast, registry));
    process.exit(0);
  }

  console.error('用法: lucid <check|expand> ...');
  process.exit(2);
}

main();
