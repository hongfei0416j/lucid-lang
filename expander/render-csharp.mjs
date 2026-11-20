// C# 目标渲染器。纯字符串汇编，不含时间戳/随机数/环境读取 → 同输入必然逐字节相同（L2 确定性）。

import { elemOf } from './checker.mjs';
import { buildPipeline } from './render-common.mjs';

const CS_PRIM = { Int: 'int', Bool: 'bool', String: 'string' };

export function csType(type) {
  const elem = elemOf(type);
  if (elem) return `${csType(elem)}[]`;
  return CS_PRIM[type] || type; // 自定义品牌类型名直接映射为 C# record 名
}

export function renderFunction(fn, registry) {
  const param = fn.params[0];
  let expr = buildPipeline(fn, registry, 'csharp', param.name);

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
