// Lucid 词法器。token 对齐策略见 spec/ebnf.md：
//   关键字/算子在 Lucid 里都是普通 identifier，由 parser 按位置识别，
//   因此无特殊符号依赖，BPE 切分稳定（不会出现 "filter_" 这类跨词元粘连）。

export const KEYWORDS = new Set(['fn', 'from', 'via', 'yield', 'end', 'pure']);
export const OPERATOR_NAMES = new Set(['reduce', 'filter', 'map', 'sort', 'take']);
export const COMPARATORS = new Set(['>=', '<=', '==', '>', '<']);

const MULTI_PUNCT = ['->', '>=', '<=', '=='];

export function makeError(code, phase, message, details = {}) {
  return { code, phase, message, ...details };
}

export function tokenize(src) {
  const tokens = [];
  const errors = [];
  let i = 0;
  let line = 1;
  let col = 1;

  const push = (kind, value, l, c) => tokens.push({ kind, value, line: l, col: c });
  const advance = (n) => {
    for (let k = 0; k < n; k++) {
      if (src[i] === '\n') { line++; col = 1; } else { col++; }
      i++;
    }
  };

  while (i < src.length) {
    const ch = src[i];

    if (ch === ' ' || ch === '\t' || ch === '\r') { advance(1); continue; }

    if (ch === '\n') { push('nl', '\n', line, col); advance(1); continue; }

    if (ch === '#') {
      while (i < src.length && src[i] !== '\n') advance(1);
      continue;
    }

    const multi = MULTI_PUNCT.find((p) => src.startsWith(p, i));
    if (multi) { push('punct', multi, line, col); advance(multi.length); continue; }

    if (/[A-Za-z_]/.test(ch)) {
      let j = i;
      while (j < src.length && /[A-Za-z0-9_]/.test(src[j])) j++;
      push('ident', src.slice(i, j), line, col);
      advance(j - i);
      continue;
    }

    if (/[0-9]/.test(ch) || (ch === '-' && /[0-9]/.test(src[i + 1] || ''))) {
      let j = i;
      if (src[j] === '-') j++;
      while (j < src.length && /[0-9]/.test(src[j])) j++;
      push('number', src.slice(i, j), line, col);
      advance(j - i);
      continue;
    }

    if (ch === '"') {
      let j = i + 1;
      let value = '';
      while (j < src.length && src[j] !== '"') {
        if (src[j] === '\\' && j + 1 < src.length) { value += src[j + 1]; j += 2; continue; }
        value += src[j];
        j++;
      }
      if (j >= src.length) {
        errors.push(makeError('E_LEX_UNTERMINATED_STRING', 'lex',
          `字符串未闭合（第 ${line} 行第 ${col} 列）`, { line, col }));
        break;
      }
      push('string', value, line, col);
      advance(j + 1 - i);
      continue;
    }

    if ('(),:<>='.includes(ch)) { push('punct', ch, line, col); advance(1); continue; }

    errors.push(makeError('E_LEX_UNEXPECTED_CHAR', 'lex',
      `意外字符 '${ch}'（第 ${line} 行第 ${col} 列）`, { line, col, char: ch }));
    advance(1);
  }

  tokens.push({ kind: 'eof', value: '<eof>', line, col });
  return { tokens, errors };
}
