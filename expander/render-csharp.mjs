// C# 目标渲染器。纯字符串汇编，不含时间戳/随机数/环境读取 → 同输入必然逐字节相同（L2 确定性）。

import { elemOf } from './checker.mjs';

const CS_PRIM = { Int: 'int', Bool: 'bool', String: 'string' };

export function csType(type) {
  const elem = elemOf(type);
  if (elem) return `${csType(elem)}[]`;
  return CS_PRIM[type] || type; // 自定义品牌类型名直接映射为 C# record 名
}

function fill(template, vars) {
  return template.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? vars[k] : `{${k}}`));
}

function renderLiteral(lit) {
  return lit.kind === 'string' ? JSON.stringify(lit.value) : String(lit.value);
}

export function renderFunction(fn, registry) {
  const param = fn.params[0];
  let expr = param.name;

  for (const op of fn.ops) {
    const entry = registry.get(op.name);
    let template;
    const vars = { prev: expr };

    switch (op.name) {
      case 'reduce':
        template = entry.csharp[op.args[0].name];
        break;
      case 'filter': {
        const pred = op.args[0];
        template = entry.csharp.default;
        vars.field = pred.field;
        vars.op = pred.op;
        vars.literal = renderLiteral(pred.literal);
        break;
      }
      case 'map':
        template = entry.csharp.default;
        vars.field = op.args[0].name;
        break;
      case 'sort':
        template = entry.csharp[op.args[1].name];
        vars.field = op.args[0].name;
        break;
      case 'take':
        template = entry.csharp.default;
        vars.n = String(op.args[0].value);
        break;
      default:
        throw new Error(`E_EXPAND_RULE: 算子 '${op.name}' 无展开规则`);
    }

    if (template === undefined) {
      throw new Error(`E_EXPAND_RULE: 算子 '${op.name}' 缺少目标模板`);
    }
    expr = fill(template, vars);
  }

  if (elemOf(fn.retType)) expr += '.ToArray()';

  return [
    `public static ${csType(fn.retType)} ${fn.name}(${csType(param.type)} ${param.name})`,
    `{`,
    `    var ${fn.yield} = ${expr};`,
    `    return ${fn.yield};`,
    `}`,
  ].join('\n');
}

export function renderModule(ast, registry) {
  return ast.functions.map((fn) => renderFunction(fn, registry)).join('\n\n') + '\n';
}
