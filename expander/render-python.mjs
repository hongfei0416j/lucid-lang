// Python 目标渲染器。纯模板替换，无时间/随机/环境读取。
// 模块级只注入 typing.List，记录类型（User/Product）由宿主侧 dataclass 提供。

import { elemOf } from './checker.mjs';
import { buildPipeline } from './render-common.mjs';

const PY_PRIM = { Int: 'int', Bool: 'bool', String: 'str' };
const PRELUDE = 'from typing import List';

export function pyType(type) {
  const elem = elemOf(type);
  if (elem) return `List[${pyType(elem)}]`;
  return PY_PRIM[type] || type;
}

export function renderFunction(fn, registry) {
  const param = fn.params[0];
  const expr = buildPipeline(fn, registry, 'python', param.name);

  return [
    `def ${fn.name}(${param.name}: ${pyType(param.type)}) -> ${pyType(fn.retType)}:`,
    `    ${fn.yield} = ${expr}`,
    `    return ${fn.yield}`,
  ].join('\n');
}

export function renderModule(ast, registry) {
  const body = ast.functions.map((fn) => renderFunction(fn, registry)).join('\n\n');
  return `${PRELUDE}\n\n${body}\n`;
}
