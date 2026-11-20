// 类型 / 效果检查器。对应 verification_gate: [语法, 类型, 效果]
// 原则：所有判定都是编译期（展开前）完成的，不靠运行时兜底（规避 A6）。

import { makeError } from './tokenizer.mjs';

export function elemOf(type) {
  const m = /^List<(.+)>$/.exec(type || '');
  return m ? m[1] : null;
}

function recordOf(schema, typeName) {
  return schema.records[typeName] || null;
}

function fieldType(schema, recName, field) {
  const rec = recordOf(schema, recName);
  if (!rec) return null;
  const f = rec.find((x) => x.name === field);
  return f ? f.type : null;
}

function literalType(lit) {
  return lit.kind === 'number' ? 'Int' : 'String';
}

export function check(ast, schema, registry) {
  const errors = [];
  for (const fn of ast.functions) checkFunction(fn, schema, registry, errors);
  return errors;
}

function checkFunction(fn, schema, registry, errors) {
  const fail = (code, phase, message, details) =>
    errors.push(makeError(code, phase, message, { function: fn.name, ...details }));

  // ── 效果检查 ──────────────────────────────────────────────
  if (!fn.effect) {
    fail('E_EFFECT_MISSING', 'effectcheck',
      `函数 '${fn.name}' 缺少 effect 声明（Lucid 要求每个函数显式声明 pure）`, { line: fn.line });
  } else if (fn.effect !== 'pure') {
    fail('E_EFFECT_UNKNOWN_EFFECT', 'effectcheck',
      `函数 '${fn.name}' 声明了未注册的 effect '${fn.effect}'（v0.1 只支持 pure）`,
      { line: fn.line, effect: fn.effect });
  }

  // ── 签名 / 数据源 ─────────────────────────────────────────
  if (fn.params.length !== 1) {
    fail('E_TYPE_ARITY', 'typecheck',
      `函数 '${fn.name}' 必须且只能有 1 个入参（对应一个数据源），实际 ${fn.params.length} 个`,
      { line: fn.line, expected: 1, actual: fn.params.length });
    return;
  }

  const param = fn.params[0];
  const source = schema.sources[fn.source];
  if (!source) {
    fail('E_TYPE_UNKNOWN_SOURCE', 'typecheck',
      `数据源 '${fn.source}' 未在 schema 中声明`, { line: fn.line, source: fn.source });
    return;
  }
  if (param.type !== source.type) {
    fail('E_TYPE_MISMATCH', 'typecheck',
      `入参 '${param.name}' 类型与数据源 '${fn.source}' 不一致：期望 ${source.type}，实际 ${param.type}`,
      { line: fn.line, expected: source.type, actual: param.type });
  }

  // ── 管道类型推导 ──────────────────────────────────────────
  let cur = source.type;
  let reduced = false;

  fn.ops.forEach((op, idx) => {
    const entry = registry.get(op.name);
    if (!entry) {
      fail('E_TYPE_UNKNOWN_OPERATOR', 'typecheck',
        `算子 '${op.name}' 未在 operators.yaml 注册（禁止表外算子）`,
        { line: op.line, op: op.name });
      cur = 'Unknown';
      return;
    }
    if (entry.effect !== 'pure') {
      fail('E_EFFECT_PURE_VIOLATION', 'effectcheck',
        `算子 '${op.name}' 在注册表中标记为 '${entry.effect}'，在 pure 函数中使用构成副作用`,
        { line: op.line, op: op.name });
    }
    if (reduced) {
      fail('E_TYPE_MISMATCH', 'typecheck',
        `算子 '${op.name}' 非法：reduce 之后类型已是标量，不能再接算子`,
        { line: op.line, expected: 'Int', actual: cur });
      return;
    }

    const elem = elemOf(cur);
    const rec = elem ? recordOf(schema, elem) : null;

    switch (op.name) {
      case 'reduce': {
        if (op.args.length !== 1 || op.args[0].kind !== 'ref') {
          fail('E_TYPE_ARITY', 'typecheck', `reduce 需要 1 个聚合名参数，如 reduce(sum)`, { line: op.line });
          cur = 'Unknown'; return;
        }
        const agg = op.args[0].name;
        if (!entry.csharp[agg]) {
          fail('E_TYPE_UNDEFINED_VARIABLE', 'typecheck',
            `reduce 的聚合名 '${agg}' 未注册（可用：${Object.keys(entry.csharp).join(', ')}）`,
            { line: op.line, name: agg });
          cur = 'Unknown'; return;
        }
        if (agg !== 'count' && elem !== 'Int') {
          fail('E_TYPE_MISMATCH', 'typecheck',
            `reduce(${agg}) 要求 List<Int>，实际为 ${cur}`,
            { line: op.line, expected: 'List<Int>', actual: cur });
          cur = 'Unknown'; return;
        }
        cur = 'Int';
        reduced = true;
        return;
      }
      case 'filter': {
        if (op.args.length !== 1 || op.args[0].kind !== 'pred') {
          fail('E_TYPE_ARITY', 'typecheck',
            `filter 需要 1 个单字段谓词参数，如 filter(age >= 18)`, { line: op.line });
          cur = 'Unknown'; return;
        }
        const pred = op.args[0];
        if (!rec) {
          fail('E_TYPE_MISMATCH', 'typecheck',
            `filter 要求 List<Record>，实际为 ${cur}`, { line: op.line, expected: 'List<Record>', actual: cur });
          cur = 'Unknown'; return;
        }
        const ft = fieldType(schema, elem, pred.field);
        if (!ft) {
          fail('E_TYPE_UNDEFINED_FIELD', 'typecheck',
            `字段 '${pred.field}' 在记录 '${elem}' 中不存在`, { line: op.line, source: elem, field: pred.field });
          return;
        }
        if (literalType(pred.literal) !== ft) {
          fail('E_TYPE_MISMATCH', 'typecheck',
            `谓词字面量类型与字段 '${pred.field}' 不一致：期望 ${ft}，实际 ${literalType(pred.literal)}`,
            { line: op.line, expected: ft, actual: literalType(pred.literal) });
        }
        return;
      }
      case 'map': {
        if (op.args.length !== 1 || op.args[0].kind !== 'ref') {
          fail('E_TYPE_ARITY', 'typecheck', `map 需要 1 个字段名参数，如 map(name)`, { line: op.line });
          cur = 'Unknown'; return;
        }
        if (!rec) {
          fail('E_TYPE_MISMATCH', 'typecheck',
            `map 要求 List<Record>，实际为 ${cur}`, { line: op.line, expected: 'List<Record>', actual: cur });
          cur = 'Unknown'; return;
        }
        const ft = fieldType(schema, elem, op.args[0].name);
        if (!ft) {
          fail('E_TYPE_UNDEFINED_FIELD', 'typecheck',
            `字段 '${op.args[0].name}' 在记录 '${elem}' 中不存在`,
            { line: op.line, source: elem, field: op.args[0].name });
          return;
        }
        cur = `List<${ft}>`;
        return;
      }
      case 'sort': {
        if (op.args.length !== 2 || op.args[0].kind !== 'ref' || op.args[1].kind !== 'ref') {
          fail('E_TYPE_ARITY', 'typecheck', `sort 需要 2 个参数：字段名与方向，如 sort(price, asc)`, { line: op.line });
          cur = 'Unknown'; return;
        }
        const fieldArg = op.args[0];
        const dirArg = op.args[1];
        if (!rec) {
          fail('E_TYPE_MISMATCH', 'typecheck',
            `sort 要求 List<Record>，实际为 ${cur}`, { line: op.line, expected: 'List<Record>', actual: cur });
          cur = 'Unknown'; return;
        }
        const ft = fieldType(schema, elem, fieldArg.name);
        if (!ft) {
          fail('E_TYPE_UNDEFINED_FIELD', 'typecheck',
            `字段 '${fieldArg.name}' 在记录 '${elem}' 中不存在`,
            { line: op.line, source: elem, field: fieldArg.name });
          return;
        }
        if (ft !== 'Int') {
          fail('E_TYPE_MISMATCH', 'typecheck',
            `sort 字段 '${fieldArg.name}' 必须是 Int，实际为 ${ft}`, { line: op.line, expected: 'Int', actual: ft });
        }
        if (!entry.csharp[dirArg.name]) {
          fail('E_TYPE_UNDEFINED_VARIABLE', 'typecheck',
            `排序方向 '${dirArg.name}' 未注册（可用：asc, desc）`, { line: op.line, name: dirArg.name });
        }
        return;
      }
      case 'take': {
        if (op.args.length !== 1 || op.args[0].kind !== 'number') {
          fail('E_TYPE_ARITY', 'typecheck', `take 需要 1 个非负整数字面量，如 take(3)`, { line: op.line });
          cur = 'Unknown'; return;
        }
        const n = op.args[0].value;
        if (!Number.isInteger(n) || n < 0) {
          fail('E_TYPE_MISMATCH', 'typecheck',
            `take 的参数必须是 >= 0 的整数，实际为 ${n}`, { line: op.line, expected: 'Int>=0', actual: String(n) });
        }
        return;
      }
      default:
        fail('E_TYPE_UNKNOWN_OPERATOR', 'typecheck',
          `算子 '${op.name}' 未在 operators.yaml 注册`, { line: op.line, op: op.name });
        cur = 'Unknown';
    }
  });

  // ── 返回类型 ──────────────────────────────────────────────
  if (cur !== 'Unknown' && cur !== fn.retType) {
    fail('E_TYPE_MISMATCH', 'typecheck',
      `函数 '${fn.name}' 返回类型不匹配：声明 ${fn.retType}，管道推出 ${cur}`,
      { line: fn.line, expected: fn.retType, actual: cur });
  }

  // ── 绑定名 ────────────────────────────────────────────────
  if (fn.params.some((p) => p.name === fn.yield)) {
    fail('E_TYPE_DUPLICATE_BINDING', 'typecheck',
      `yield 绑定名 '${fn.yield}' 与入参重名`, { line: fn.line, name: fn.yield });
  }
}
