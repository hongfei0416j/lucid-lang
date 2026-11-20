// TypeScript 目标渲染器。纯模板替换，无时间/随机/环境读取。

import { elemOf } from './checker.mjs';
import { buildPipeline } from './render-common.mjs';

const TS_PRIM = { Int: 'number', Bool: 'boolean', String: 'string' };

export function tsType(type) {
  const elem = elemOf(type);
  if (elem) return `${tsType(elem)}[]`;
  return TS_PRIM[type] || type; // 记录名直接映射为宿主声明的 type
}

export function renderFunction(fn, registry) {
  const param = fn.params[0];
  const expr = buildPipeline(fn, registry, 'typescript', param.name);

  return [
    `export function ${fn.name}(${param.name}: ${tsType(param.type)}): ${tsType(fn.retType)} {`,
    `  const ${fn.yield} = ${expr};`,
    `  return ${fn.yield};`,
    `}`,
  ].join('\n');
}

export function renderModule(ast, registry) {
  return ast.functions.map((fn) => renderFunction(fn, registry)).join('\n\n') + '\n';
}
