// 目标语言共用的管道装配：算子 → 查 operators.yaml 模板 → 占位符替换。
// 只做字符串替换，不含时间戳/随机数/环境读取 → 同输入必然逐字节相同（L2 确定性）。

import { elemOf } from './checker.mjs';

// 默认字段访问与谓词拼法；Java 这类访问器语法由各自渲染器覆盖。
const DEFAULT_HOOKS = {
  fieldRef: (field) => `x.${field}`,
  predicate: (pred, literal) => `x.${pred.field} ${pred.op} ${literal}`,
};

export function fill(template, vars) {
  return template.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? vars[k] : `{${k}}`));
}

export function renderLiteral(lit) {
  return lit.kind === 'string' ? JSON.stringify(lit.value) : String(lit.value);
}

// reduce 按聚合名、sort 按方向选模板；其余算子只有 default。
function templateKey(op) {
  if (op.name === 'reduce') return op.args[0]?.name;
  if (op.name === 'sort') return op.args[1]?.name;
  return 'default';
}

export function buildPipeline(fn, registry, target, initialExpr, hooks = {}) {
  const fieldRef = hooks.fieldRef || DEFAULT_HOOKS.fieldRef;
  const predicate = hooks.predicate || DEFAULT_HOOKS.predicate;
  const rec = elemOf(fn.params[0].type) || '';

  let expr = initialExpr;
  for (const op of fn.ops) {
    const entry = registry.get(op.name);
    if (!entry) throw new Error(`E_EXPAND_RULE: 算子 '${op.name}' 未在 operators.yaml 注册`);

    const key = templateKey(op);
    const template = entry[target] && entry[target][key];
    if (template === undefined) {
      throw new Error(`E_EXPAND_RULE: 算子 '${op.name}' 缺少 ${target} 模板 '${key}'`);
    }

    const vars = { prev: expr, rec };
    if (op.name === 'filter') {
      const pred = op.args[0];
      vars.literal = renderLiteral(pred.literal);
      vars.pred = predicate(pred, vars.literal);
    } else if (op.name === 'map') {
      vars.field = op.args[0].name;
      vars.fieldRef = fieldRef(op.args[0].name);
    } else if (op.name === 'sort') {
      vars.field = op.args[0].name;
      vars.fieldRef = fieldRef(op.args[0].name);
    } else if (op.name === 'take') {
      vars.n = String(op.args[0].value);
    }

    expr = fill(template, vars);
  }
  return expr;
}
