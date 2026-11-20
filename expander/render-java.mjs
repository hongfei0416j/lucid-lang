// Java 目标渲染器。纯模板替换，无时间/随机/环境读取。
//
// 与 C#/TS/Python 的差异：
//   1. 管道统一在 Stream 上推进，因此起始表达式是 `<入参>.stream()`；
//      返回 List 时由本渲染器在尾部补 `.collect(Collectors.toList())`。
//   2. 记录字段访问用访问器 x.age()（宿主侧为 record 或等价的 getter）。
//   3. 产物只含方法，类与 import 由宿主侧提供（与 C# 产物一致）。

import { elemOf } from './checker.mjs';
import { buildPipeline } from './render-common.mjs';

const JAVA_PRIM = { Int: 'int', Bool: 'boolean', String: 'String' };
const JAVA_BOX = { Int: 'Integer', Bool: 'Boolean', String: 'String' };

function javaElem(type) {
  const elem = elemOf(type);
  if (elem) return `List<${javaElem(elem)}>`;
  return JAVA_BOX[type] || type;
}

export function javaType(type) {
  const elem = elemOf(type);
  if (elem) return javaElem(type);
  return JAVA_PRIM[type] || type;
}

const HOOKS = {
  fieldRef: (field) => `x.${field}()`,
  // Java 的 == 对 String 是引用比较，字符串相等必须走 equals
  predicate: (pred, literal) => {
    const ref = `x.${pred.field}()`;
    if (pred.op === '==' && pred.literal.kind === 'string') return `${ref}.equals(${literal})`;
    return `${ref} ${pred.op} ${literal}`;
  },
};

export function renderFunction(fn, registry) {
  const param = fn.params[0];
  let expr = buildPipeline(fn, registry, 'java', `${param.name}.stream()`, HOOKS);
  if (elemOf(fn.retType)) expr += '.collect(Collectors.toList())';

  return [
    `public static ${javaType(fn.retType)} ${fn.name}(${javaType(param.type)} ${param.name}) {`,
    `    var ${fn.yield} = ${expr};`,
    `    return ${fn.yield};`,
    `}`,
  ].join('\n');
}

export function renderModule(ast, registry) {
  return ast.functions.map((fn) => renderFunction(fn, registry)).join('\n\n') + '\n';
}
