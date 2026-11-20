# Lucid 审查 Rubric（v0.1）

审查器只打分，不改写。任一 **HARD** 项失败 → `verdict = "reject"`。

## 检查项

| # | 检查项 | 级别 | 判定方式 | 数据来源 |
|---|---|---|---|---|
| R1 | 源码可通过 lex + parse | HARD | 自动 | `gate` 无 `E_LEX_*` / `E_PARSE_*` |
| R2 | 每个函数有且仅有一个 effect，且为 `pure` | HARD | 自动 | 无 `E_EFFECT_*` |
| R3 | 只使用 `operators.yaml` 注册算子 | HARD | 自动 | 无 `E_TYPE_UNKNOWN_OPERATOR` |
| R4 | 无 `if`/`else`/`for`/`while`/`switch` | HARD | 人工 | 逐行看，evidence 写行号 |
| R5 | 无方法链、无中缀运算、无赋值 | HARD | 人工 | 逐行看，evidence 写行号 |
| R6 | 所有字段存在于 `spec/schema.json` | HARD | 自动 | 无 `E_TYPE_UNDEFINED_FIELD` |
| R7 | 返回类型与管道推出类型一致 | HARD | 自动 | 无 `E_TYPE_MISMATCH` |
| R8 | 存在失败可能时必须显式返回 `Result<T,E>` | SOFT | 人工 | 无失败路径则记 `N/A: <原因>` |
| R9 | 一个函数只做一条管道（单个 `from`） | HARD | 人工 | 数 `from` 出现次数 |
| R10 | 源码 token 数 ≤ `token_budget` | SOFT | 自动 | `gate` 输出中的 `tokens` |

## 反模式（命中任一 → reject）

| # | 反模式 | 快速判定 |
|---|---|---|
| A1 | 伪分层：声称写意图，源码里却有循环/import/类型声明 | 搜 `for`/`while`/`import`/`class` |
| A2 | 错误码装饰：定义了 E_XXX 但没有任何拦截引用它 | 对照 `spec/ebnf.md` 第 4 节 |
| A3 | 样板转嫁：算子的 `expands_to` 是一大段模板而不是规则 | 看 `operators.yaml` |
| A4 | 不可执行示例：展开结果跑不起来 | `npm run ci:e2e` |
| A5 | 全量文法依赖：最小注入片段等于全部文法 | 对照 `spec/ebnf.md` 第 3 节 |
| A6 | 绕过校验：用运行时检查替代编译期拦截 | 看错误码 phase |
| A7 | 魔法算子：行为依赖未声明的全局上下文 | 算子参数是否显式、schema 是否显式传入 |

## 输出约定

```json
{
  "items": [{ "id": "R1", "passed": true, "evidence": "gate: 无错误" }],
  "anti_patterns": [],
  "verdict": "pass",
  "blocking": []
}
```

- `evidence` 必须引用行号或具体错误码，禁止"整体看起来"。
- `verdict` 只有 `pass` / `reject`；`blocking` 列出导致 reject 的 id（`R*` / `P*` / `D*` / `A*`）。
- 审查器不提供修改建议、不输出改写后的源码。

## 项目级约束（P1–P4 守住 / D1–D3 放弃）

这 7 条与 R1–R10 同等对待：必须出现在 `items` 中，失败 → `verdict = "reject"` 并进入 `blocking`。

| # | 约束 | 级别 | 判定方法 |
|---|---|---|---|
| P1 | 分层边界：`.luc` 中无宿主构造（`import`/`class`/`var`/`=>`/方法链/赋值） | HARD | 搜 `import`/`class`/`var`/`=>`，命中即 fail，evidence 写行号 |
| P2 | 编译期闸门：所有拒绝发生在 expand 之前 | HARD | 错误码 `phase` 必须属于 `lex`/`parse`/`typecheck`/`effectcheck` |
| P3 | 确定性：不依赖时间、随机数、环境变量 | HARD | `npm run ci:determinism` 全绿，evidence 引用 sha256 一致 |
| P4 | 纯函数单管道：每函数 `pure`、单 `from`、一条管道 | HARD | 数 `from` 次数 = 1；gate 无 `E_EFFECT_*` |
| D1 | 放弃表达力：只允许 5 个注册算子；扩展须先申报并补齐模板/类型规则/错误码/测试 | HARD | 对照 `operators.yaml`，超范围即 fail |
| D2 | 放弃优化：产物只由算子模板拼装，不得重排/合并/内联/去冗余 | HARD | 展开结果与 `operators.yaml` 模板一一对应 |
| D3 | 放弃多目标：只维护注册表里的 4 个目标（`csharp` / `typescript` / `python` / `java`） | HARD | 非注册目标必须报 `E_EXPAND_UNSUPPORTED_TARGET`；`operators.yaml` 每个算子 4 门模板必须齐全 |
