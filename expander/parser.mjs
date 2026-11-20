// Lucid 语法分析器（递归下降 / LL(1)）。
// 产出 Intent AST，这是 AI 层与展开层之间唯一的契约形式（见 spec/ebnf.md）。

import { tokenize, makeError, COMPARATORS } from './tokenizer.mjs';

class ParseAbort extends Error {
  constructor(error) { super(error.message); this.error = error; }
}

class Parser {
  constructor(tokens) {
    this.tokens = tokens;
    this.i = 0;
  }

  peek(k = 0) { return this.tokens[Math.min(this.i + k, this.tokens.length - 1)]; }
  next() { return this.tokens[this.i++]; }

  at(kind, value) {
    const t = this.peek();
    return t.kind === kind && (value === undefined || t.value === value);
  }

  fail(expected, actual = this.peek()) {
    throw new ParseAbort(makeError('E_PARSE_UNEXPECTED_TOKEN', 'parse',
      `期望 ${expected}，实际得到 '${actual.value}'（第 ${actual.line} 行）`,
      { line: actual.line, expected, actual: actual.value }));
  }

  expect(kind, value) {
    const t = this.peek();
    if (t.kind !== kind || (value !== undefined && t.value !== value)) this.fail(`${kind}${value ? ` '${value}'` : ''}`);
    return this.next();
  }

  expectKeyword(word) {
    const t = this.peek();
    if (t.kind !== 'ident' || t.value !== word) {
      throw new ParseAbort(makeError('E_PARSE_MISSING_CLAUSE', 'parse',
        `意图缺少 '${word}' 子句（第 ${t.line} 行读到 '${t.value}'）`, { clause: word, line: t.line }));
    }
    return this.next();
  }

  skipNl() { while (this.at('nl')) this.next(); }

  parseModule() {
    const functions = [];
    this.skipNl();
    while (!this.at('eof')) {
      functions.push(this.parseFunction());
      this.skipNl();
    }
    return { kind: 'module', functions };
  }

  parseFunction() {
    const fnToken = this.expect('ident', 'fn');
    const name = this.expect('ident').value;
    this.expect('punct', '(');
    const params = [];
    if (!this.at('punct', ')')) {
      do {
        const pname = this.expect('ident').value;
        this.expect('punct', ':');
        params.push({ name: pname, type: this.parseType() });
        if (!this.at('punct', ',')) break;
        this.next();
      } while (true);
    }
    this.expect('punct', ')');
    this.expect('punct', '->');
    const retType = this.parseType();

    // effect 可省略：省略由 effectcheck 阶段报 E_EFFECT_MISSING，而不是语法错误
    let effect = null;
    if (this.at('ident') && this.peek().value !== 'from') effect = this.next().value;

    this.expect('nl');
    this.skipNl();

    this.expectKeyword('from');
    const source = this.expect('ident').value;
    this.expect('nl');
    this.skipNl();

    const ops = [];
    while (this.at('ident', 'via')) {
      this.next();
      ops.push(this.parseOpCall());
      this.expect('nl');
      this.skipNl();
    }

    this.expectKeyword('yield');
    const yieldName = this.expect('ident').value;
    this.expect('nl');
    this.skipNl();
    this.expect('ident', 'end');
    if (this.at('nl')) this.next();

    return { kind: 'function', name, params, retType, effect, source, ops, yield: yieldName, line: fnToken.line };
  }

  parseType() {
    const t = this.expect('ident');
    if (t.value !== 'List') return t.value;
    this.expect('punct', '<');
    const inner = this.parseType();
    this.expect('punct', '>');
    return `List<${inner}>`;
  }

  parseOpCall() {
    const opToken = this.expect('ident');
    const name = opToken.value;
    this.expect('punct', '(');
    const args = [];
    if (!this.at('punct', ')')) {
      do {
        args.push(this.parseArg());
        if (!this.at('punct', ',')) break;
        this.next();
      } while (true);
    }
    this.expect('punct', ')');
    return { name, args, line: opToken.line };
  }

  parseArg() {
    const t = this.peek();
    if (t.kind === 'number') { this.next(); return { kind: 'number', value: Number(t.value) }; }
    if (t.kind === 'string') { this.next(); return { kind: 'string', value: t.value }; }
    if (t.kind === 'ident') {
      const nxt = this.peek(1);
      if (nxt.kind === 'punct' && COMPARATORS.has(nxt.value)) {
        this.next();
        this.next();
        const lit = this.next();
        if (lit.kind !== 'number' && lit.kind !== 'string') this.fail('字面量', lit);
        return {
          kind: 'pred',
          field: t.value,
          op: nxt.value,
          literal: { kind: lit.kind === 'number' ? 'number' : 'string', value: lit.kind === 'number' ? Number(lit.value) : lit.value },
        };
      }
      this.next();
      return { kind: 'ref', name: t.value };
    }
    this.fail('identifier / number / string');
  }
}

export function parse(src) {
  const { tokens, errors } = tokenize(src);
  if (errors.length) return { ast: null, errors };
  try {
    const ast = new Parser(tokens).parseModule();
    return { ast, errors: [] };
  } catch (e) {
    if (e instanceof ParseAbort) return { ast: null, errors: [e.error] };
    throw e;
  }
}
