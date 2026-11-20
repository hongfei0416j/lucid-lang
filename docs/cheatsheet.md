# Lucid 速成卡（唯一语法来源）

Lucid 只表达**数据从哪来、依次做什么、产出什么**。一个函数 = 一条管道。

## 唯一模板

```lucid
fn 函数名(入参: 类型) -> 返回类型 pure
from 数据源
via 算子(参数)
via 算子(参数)
yield 结果名
end
```

- 每行一条子句，不能写在一行里
- `from` 与 `yield` 必填，`via` 可 0..n 个
- `pure` 必填（v0.1 只支持 pure）
- 一个函数只有一个数据源

## 类型

`Int` `Bool` `String` `List<T>` `Record`（记录名如 `User`、`Product`，来自 `spec/schema.json`）

## 算子（只有这 5 个）

| 算子 | 用法 | 结果类型 |
|---|---|---|
| `reduce` | `reduce(sum)` `reduce(count)` `reduce(min)` `reduce(max)` | `Int`，且必须是最后一个 |
| `filter` | `filter(age >= 18)` 单字段谓词 | 同输入 |
| `map` | `map(name)` | `List<字段类型>` |
| `sort` | `sort(price, asc)` / `sort(price, desc)`，字段须为 `Int` | 同输入 |
| `take` | `take(3)`，n 为非负整数字面量 | 同输入 |

表外算子一律被拒（`E_TYPE_UNKNOWN_OPERATOR`）。需要新算子 → 先申报，不要偷偷用。

## 禁止

- `if` / `else` / `for` / `while` / `switch`
- 方法链、中缀运算、赋值、lambda
- `import`、类型声明、变量定义
- 复合谓词（`and` / `or` / 多字段比较）
- 跨源 join（v0.1 未注册）

## 错误码速查

| 阶段 | 错误码 | 含义 |
|---|---|---|
| lex | `E_LEX_UNEXPECTED_CHAR` | 出现文法外字符（如 `{ }`） |
| lex | `E_LEX_UNTERMINATED_STRING` | 字符串未闭合 |
| parse | `E_PARSE_MISSING_CLAUSE` | 缺 `from` / `yield` / `via`（如写了 `for`） |
| parse | `E_PARSE_UNEXPECTED_TOKEN` | 记号不符合文法 |
| typecheck | `E_TYPE_UNKNOWN_OPERATOR` | 用了未注册算子 |
| typecheck | `E_TYPE_MISMATCH` | 类型不匹配 / reduce 后接算子 / 返回类型不符 |
| typecheck | `E_TYPE_UNDEFINED_FIELD` | 字段不在 schema 中 |
| typecheck | `E_TYPE_UNKNOWN_SOURCE` | 数据源未声明 |
| typecheck | `E_TYPE_ARITY` | 参数个数或形状不对 |
| typecheck | `E_TYPE_UNDEFINED_VARIABLE` | 聚合名 / 排序方向未注册 |
| typecheck | `E_TYPE_DUPLICATE_BINDING` | yield 名与入参重名 |
| effectcheck | `E_EFFECT_MISSING` | 缺 effect |
| effectcheck | `E_EFFECT_UNKNOWN_EFFECT` | 声明了 `pure` 之外的 effect |
| effectcheck | `E_EFFECT_PURE_VIOLATION` | 在 pure 函数中用了非 pure 算子 |
| expand | `E_EXPAND_RULE` | 算子缺少目标模板 |
| expand | `E_EXPAND_UNSUPPORTED_TARGET` | 目标语言不支持 |

## 三个可运行样例

```lucid
fn SumTotal(numbers: List<Int>) -> Int pure
from numbers
via reduce(sum)
yield total
end
```

```lucid
fn AdultCount(users: List<User>) -> Int pure
from users
via filter(age >= 18)
via reduce(count)
yield adults
end
```

```lucid
fn CheapestProducts(products: List<Product>) -> List<Product> pure
from products
via sort(price, asc)
via take(3)
yield cheapest
end
```

## 自查（交付前）

```bash
node expander/cli.mjs check examples --schema spec/schema.json
```

## 预算

单函数源码 ≤ 500 token（gate 会打印实际 `tokens`）。
