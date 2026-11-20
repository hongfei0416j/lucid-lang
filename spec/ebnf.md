# Lucid 文法与门禁规格（v0.1）

## 1. EBNF

```ebnf
module      = { function } EOF ;
function    = "fn" IDENT "(" params ")" "->" type { effect } NEWLINE
              "from" IDENT NEWLINE
              { "via" opcall NEWLINE }
              "yield" IDENT NEWLINE
              "end" [ NEWLINE ] ;

params      = param { "," param } ;
param       = IDENT ":" type ;
effect      = "pure" ;

type        = "Int" | "Bool" | "String" | "Record" | IDENT
            | "List" "<" type ">" ;

opcall      = IDENT "(" [ args ] ")" ;
args        = arg { "," arg } ;
arg         = pred | IDENT | NUMBER | STRING ;
pred        = IDENT comparator literal ;
comparator  = ">=" | "<=" | "==" | ">" | "<" ;
literal     = NUMBER | STRING ;
```

说明：

- `function` 的 effect 可省略——省略由 **effectcheck** 报 `E_EFFECT_MISSING`，而不是语法错误。
  这样"缺效果"永远落在效果阶段，错误归因稳定。
- 语法是 LL(1)：`fn` / `from` / `via` / `yield` / `end` 都是行首关键字，看一个记号即可决定分支。
- `pred` 只允许"单字段 比较 字面量"，从文法层面就排除了复合谓词与任意表达式。

## 2. Token 对齐策略

Lucid 不使用符号化 DSL 语法（没有 `|>`、`::`、`=>`），关键字与算子名都是普通 identifier：

| 语法单元 | token 策略 | 理由 |
|---|---|---|
| `fn` `from` `via` `yield` `end` `pure` | single | 高频英文词，BPE 稳定单 token |
| `reduce` `filter` `map` `sort` `take` | single / stable_sequence | 无连字符、无稀有字符，不会跨词元粘连 |
| `sum` `count` `min` `max` `asc` `desc` | single | 同上的高频词 |
| `(` `)` `,` `:` `<` `>` | single | 单字符标点 |
| `->` `>=` `<=` `==` | stable_sequence | 定长双字符，词法器优先匹配，切分唯一 |
| NUMBER | multi | `-?\d+`，前后必有分隔符，不会与标识符粘连 |
| STRING | multi | 双引号包裹，结束符唯一 |
| IDENT | stable_sequence | `[A-Za-z_][A-Za-z0-9_]*`，禁止连字符 |

**稳定性保证**：所有关键字都是 identifier 形态，由**位置**（行首）而非特殊符号区分。
因此即使模型把 `from` 换个大小写或加空格，也是可检测的记号变化，而不是"词元边界漂移"。

## 3. 最小文法注入（M6）

按任务只注入必要产生式，而不是把整份文法塞给模型：

```ebnf
# task = "对一组数字求和"
intent   = "from" IDENT NEWLINE "via" "reduce" "(" "sum" ")" NEWLINE "yield" IDENT NEWLINE "end" ;
```

本任务下 `filter / map / sort / take` **不注入**；解析器对未注入算子直接报
`E_TYPE_UNKNOWN_OPERATOR`，不存在"降级成全量文法"的路径。

## 4. 门禁流水线

```
.luc 源码
  ├─ lex       → E_LEX_*            （不可打印/文法外字符）
  ├─ parse     → E_PARSE_*          （结构缺失、非法记号序列）
  ├─ typecheck → E_TYPE_*           （算子/字段/类型/arity）
  ├─ effectcheck → E_EFFECT_*       （pure 约束）
  └─ expand    → E_EXPAND_*         （模板缺失、目标不支持）
```

实现：`expander/{tokenizer,parser,checker,render-common,render-csharp,render-typescript,render-python,render-java}.mjs`，CLI 见 `expander/cli.mjs`。
所有拦截都在展开**之前**完成，不依赖运行时检查（规避 A6）。

## 5. 确定性契约

- 渲染器只做字符串模板替换 + 尾部类型适配（C# `.ToArray()`、Java `.collect(...)`、TS/Python 无）
- 不读时钟、随机数、环境变量、全局配置；schema 通过 `--schema` 显式传入
- 相同 `(AST, schema, operators.yaml)` → 逐字节相同输出
- CI 验证：`npm run ci:determinism`（展开两次比对 sha256）

## 6. 中间表示（Intent AST）

两层之间唯一契约，JSON 可序列化：

```json
{
  "kind": "module",
  "functions": [
    {
      "kind": "function",
      "name": "AdultCount",
      "params": [{ "name": "users", "type": "List<User>" }],
      "retType": "Int",
      "effect": "pure",
      "source": "users",
      "ops": [
        { "name": "filter", "args": [{ "kind": "pred", "field": "age", "op": ">=", "literal": { "kind": "number", "value": 18 } }] },
        { "name": "reduce", "args": [{ "kind": "ref", "name": "count" }] }
      ],
      "yield": "adults"
    }
  ]
}
```

审计只需看 AST；展开器只消费 AST，不读源码文本。
