// 极简 YAML 子集解析器：只支持 operators.yaml 用到的形状
//   顶层序列 / "- key: value" / 2 级嵌套映射 / 双引号字符串
// 不引入第三方依赖，保证展开器在任意 Node 18+ 环境可跑。

function splitKV(line) {
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') inQuote = !inQuote;
    else if (ch === ':' && !inQuote) {
      return { k: line.slice(0, i).trim(), v: line.slice(i + 1).trim() };
    }
  }
  return { k: line.trim(), v: '' };
}

function parseValue(raw) {
  if (raw.startsWith('"') && raw.endsWith('"') && raw.length >= 2) {
    return raw.slice(1, -1).replace(/\\"/g, '"').replace(/\\n/g, '\n').replace(/\\\\/g, '\\');
  }
  return raw;
}

export function parseYamlLite(text) {
  const root = [];
  let item = null;
  let nestedKey = null;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/\t/g, '  ');
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const indent = line.length - line.trimStart().length;

    if (indent === 0 && trimmed.startsWith('- ')) {
      item = {};
      root.push(item);
      nestedKey = null;
      const { k, v } = splitKV(trimmed.slice(2));
      item[k] = parseValue(v);
      continue;
    }
    if (!item) throw new Error(`yaml-lite: 顶层必须是序列, 得到 "${trimmed}"`);

    if (indent === 2) {
      const { k, v } = splitKV(trimmed);
      if (v === '') {
        item[k] = {};
        nestedKey = k;
      } else {
        item[k] = parseValue(v);
        nestedKey = null;
      }
      continue;
    }
    if (indent === 4 && nestedKey) {
      const { k, v } = splitKV(trimmed);
      item[nestedKey][k] = parseValue(v);
      continue;
    }
    throw new Error(`yaml-lite: 不支持的缩进 ${indent}: "${trimmed}"`);
  }
  return root;
}
