# AGENTS.md

> 给下一次开工的我（或任何模型）：读完这一页即可动手。**不要通读仓库**，按 §3 的表按需读。

## 1. 这是什么

**Lucid**：AI 只写声明式意图（`.luc`），本地展开器查表生成宿主代码（C# / TypeScript / Python / Java）；语法/类型/效果在展开前拦截，产物逐字节可 diff。
它不是代码生成器——判断标准始终是「AI 写什么、脚本写什么、边界在哪」。

## 2. 30 秒验证

```bash
npm run ci             # 全量：门禁 + 确定性 + 4 语言端到端
npm run ci:gate        # 正例必须过 + 反例必须按预期错误码打回
npm run ci:determinism # 同一输入 × 4 目标各展开两次，逐字节比对
npm run ci:e2e         # 展开产物真实编译运行（dotnet / tsc+node / python / java），比对 expected
```

改完任何东西先跑 `npm run ci`，红了就不要报告完成。

## 3. 目录地图（按需读）

| 路径 | 作用 | 什么时候读 |
|---|---|---|
| `docs/cheatsheet.md` | 语法唯一来源 + 错误码速查 | 写 `.luc` 前 |
| `expander/cli.mjs` | `check` / `expand` 入口 | 改命令行为 |
| `expander/tokenizer.mjs` | 词法 + token 对齐 | 改语法 |
| `expander/parser.mjs` | LL(1) 递归下降 → Intent AST | 改语法 |
| `expander/checker.mjs` | 类型 / 效果 / 字段 / arity 判定 | 加算子、加类型 |
| `expander/render-common.mjs` | 算子模板装配（4 个目标共用） | 改展开骨架 |
| `expander/render-csharp.mjs` | AST → C#（纯模板替换） | 改 C# 产物形状 |
| `expander/render-typescript.mjs` | AST → TypeScript | 改 TS 产物形状 |
| `expander/render-python.mjs` | AST → Python | 改 Python 产物形状 |
| `expander/render-java.mjs` | AST → Java（Stream，尾部 collect） | 改 Java 产物形状 |
| `operators.yaml` | 算子唯一注册表（模板 + 签名） | 加算子 |
| `spec/ebnf.md` | 文法、token 策略、最小文法注入 | 改语法 / 改门禁 |
| `spec/rubric.md` | R1–R10 / P1–P4 / D1–D3 / A1–A7 | 审查、定义"完成" |
| `spec/schema.json` | 数据源与字段类型 | 加数据源 / 字段 |
| `prompts/*.md` | 4 个角色指令 + 单模型总控 | 分角色协作 |
| `tests/fixtures/` | 7 个反例 + `expected.json` | 加拦截规则 |
| `examples/csharp/Program.cs` | 完整可运行 C# 宿主样例（records + 生成方法 + Main） | 看宿主侧集成形态 |
| `examples/cpp/main.cpp` | C++ 形态**参照**（手写、非生成、本机未编译验证） | 评估 C++ 宿主时 |
| `docs/history/flume_lds.yaml` | 第一版 TypeScript 设计（历史参考） | 追溯设计决策 |

## 4. 硬不变量（违反即返工）

| # | 规则 | 强制点 |
|---|---|---|
| P1 | `.luc` 无 `import`/`class`/`var`/`=>`/方法链/赋值 | tokenizer 不认 `{ }`；rubric P1 |
| P2 | 拒绝必须发生在 expand 之前 | checker；错误码 `phase` |
| P3 | 展开逐字节确定 | renderer 无时间/随机/env；CI diff |
| P4 | 每函数 `pure` + 单 `from` + 单管道 | checker `E_EFFECT_*` / `E_TYPE_ARITY` |
| D1 | 只 5 个算子，扩展须四件套齐全 | `operators.yaml` + checker |
| D2 | 不优化、不重排、不加解释 | render 只做模板替换 |
| D3 | 只支持注册目标 `csharp` / `typescript` / `python` / `java` | `E_EXPAND_UNSUPPORTED_TARGET` |

## 5. 任务 → 改哪里（注意"必须同步"列）

| 任务 | 改 | 必须同步 |
|---|---|---|
| 加算子 `xxx` | `operators.yaml` 加条目（4 门模板齐全）；`checker.mjs` 加类型分支；`render-common` 通常无需改 | 反例 fixture + `expected.json` + cheatsheet 算子表 |
| 加数据源 | `spec/schema.json` 的 `sources`（需要时 `records`） | 新 `.luc` + `examples/cases.json`，e2e 自动覆盖 |
| 加错误码 | 触发处 push `{code, phase, message}` | 反例 fixture + `expected.json` + cheatsheet 速查表 |
| 改语法 | `tokenizer.mjs` → `parser.mjs` → `spec/ebnf.md` **三处同改** | 全部 fixture 重跑 |
| 换目标语言 | 新增 `render-xxx.mjs`；`operators.yaml` 补该目标模板；`operators.mjs` 的 `TARGETS` 与 `cli.mjs` 的 `RENDERERS` 登记 | 不动 AST 与 checker；`tests/e2e.mjs` 加该语言宿主装配 |

## 6. 踩过的坑（真实）

- `dotnet run file.cs`（.NET 10+ 单文件）默认禁用反射式 JSON：生成的 `Program.cs` 首行必须是 `#:property JsonSerializerIsReflectionEnabledByDefault=true`。
- `expander/yaml-lite.mjs` 只支持：顶层序列、2/4 空格缩进、双引号字符串。别写 flow map 或多行块标量。
- `tests/fixtures/` 是**反例**，`check` 对它们返回 1 是预期行为；判定入口是 `npm run ci:gate`，别把 fixtures 目录塞进"必须通过"的列表。
- tokenizer 不把 `{ }` 当标点：`import { map } ...` 报的是 `E_LEX_UNEXPECTED_CHAR`，不是 parse 错误。
- Java 目标：管道从 `<入参>.stream()` 起步，返回 List 时渲染器补 `.collect(Collectors.toList())`；记录字段是访问器 `x.age()`，字符串 `==` 必须展开成 `.equals`。
- Python 目标：模块只注入 `from typing import List`（兼容 3.8），`User`/`Product` 等记录类型由宿主 dataclass 提供。
- `tests/.tmp/` 是 e2e 构建产物，每次运行自动清空重建。

## 7. 角色分工

四个角色各有独立目标函数，不要用一个 prompt 干完：

```
prompts/author.md（只写意图） → 门禁 → prompts/translate.md（只调 expand） → CI → prompts/review.md（只打分） → 人决定合并
```

单模型时用 `prompts/single-model.md`，禁止自动连跳——自动连跳会让审查顺手"修好"问题，独立性失效。

## 8. 基线状态（2026-11-20）

- 示例 3 个：tokens 23 / 30 / 33，gate 全过
- determinism：4 目标 × 3 示例，共 12 组两次展开 sha256 一致
- e2e：dotnet 11.0.100 / tsc 5.6.3 + node 18 / Python 3.8 / JDK 17 真实编译运行，4×3 输出等于 expected
- 反例：7/7 按预期错误码打回

出问题先跑 `npm run ci`，再对照 §6。
