# 目标语言使用手册

同一份 `.luc` 意图可以用 `--target` 展开成 4 门宿主语言。AST、类型检查、效果检查、错误码对所有目标完全一致，差异只在渲染模板与宿主侧胶水代码。

## 1. 目标一览

| `--target` | 类型映射 | 产物形态 | 宿主必须提供 | 样例 |
|---|---|---|---|---|
| `csharp` | `Int→int` `Bool→bool` `String→string` `List<T>→T[]` | 类内静态方法 | `record` 定义、`using System.Linq` | [examples/csharp/Program.cs](../examples/csharp/Program.cs) |
| `typescript` | `Int→number` `Bool→boolean` `String→string` `List<T>→T[]` | `export function` | 记录 `type` 别名 | [examples/typescript/main.ts](../examples/typescript/main.ts) |
| `python` | `Int→int` `Bool→bool` `String→str` `List<T>→List[T]` | 模块级 `def` + `from typing import List` | 记录 `@dataclass` | [examples/python/main.py](../examples/python/main.py) |
| `java` | `Int→int` `Bool→boolean` `String→String` `List<T>→List<盒装类型>` | 类内静态方法（管道基于 `Stream`） | 类与 `import`、`record` 定义 | [examples/java/Main.java](../examples/java/Main.java) |

未注册目标（如 `--target cpp`）一律报 `E_EXPAND_UNSUPPORTED_TARGET`，不会静默降级。

## 2. 展开与运行

```bash
# 展开（四门任选；省略 --target 默认 csharp）
node expander/cli.mjs expand examples/adults.luc --target typescript --schema spec/schema.json

# C#
dotnet run examples/csharp/Program.cs

# TypeScript（先编译再执行，产物是 ESM）
node node_modules/typescript/lib/tsc.js examples/typescript/main.ts \
  --target ES2020 --module ESNext --outDir tests/.tmp/example-ts
node tests/.tmp/example-ts/main.js

# Python
python examples/python/main.py

# Java（JDK 17+，单文件源码启动，文件名需为 Main.java）
java examples/java/Main.java
```

三个样例的输出应一致（Product 列表的空白格式随语言而异）：

```text
SumTotal(numbers: [1,2,3,4])        -> 10
AdultCount(users: A17,B20,C30)       -> 2
CheapestProducts(products: 30,10,20,5) -> [{"name":"d","price":5},{"name":"b","price":10},{"name":"c","price":20}]
```

## 3. 同一意图的四种产物

```lucid
fn AdultCount(users: List<User>) -> Int pure
from users
via filter(age >= 18)
via reduce(count)
yield adults
end
```

```csharp
public static int AdultCount(User[] users)
{
    var adults = users.Where(x => x.age >= 18).Count();
    return adults;
}
```

```typescript
export function AdultCount(users: User[]): number {
  const adults = users.filter((x) => x.age >= 18).length;
  return adults;
}
```

```python
def AdultCount(users: List[User]) -> int:
    adults = len([x for x in users if x.age >= 18])
    return adults
```

```java
public static int AdultCount(List<User> users) {
    var adults = (int) users.stream().filter(x -> x.age() >= 18).count();
    return adults;
}
```

## 4. 算子在各目标下的展开

模板以 [`operators.yaml`](../operators.yaml) 为唯一来源；下表是按 `filter / map / sort / take / reduce` 归纳的速览（`x` 是宿主侧元素变量名）。

| 算子 | C# | TypeScript | Python | Java |
|---|---|---|---|---|
| `filter(age >= 18)` | `.Where(x => x.age >= 18)` | `.filter((x) => x.age >= 18)` | `[x for x in ys if x.age >= 18]` | `.filter(x -> x.age() >= 18)` |
| `map(name)` | `.Select(x => x.name)` | `.map((x) => x.name)` | `[x.name for x in ys]` | `.map(x -> x.name())` |
| `sort(price, asc)` | `.OrderBy(x => x.price)` | `[...ys].sort((a, b) => a.price - b.price)` | `sorted(ys, key=lambda x: x.price)` | `.sorted(Comparator.comparingInt((Product x) -> x.price()))` |
| `take(3)` | `.Take(3)` | `.slice(0, 3)` | `ys[:3]` | `.limit(3)` |
| `reduce(sum)` | `.Aggregate(0, (acc, item) => acc + item)` | `.reduce((acc, item) => acc + item, 0)` | `sum(ys)` | `.mapToInt(Integer::intValue).sum()` |
| `reduce(count)` | `.Count()` | `.length` | `len(ys)` | `(int) ys.count()` |

`reduce(min/max)` 同理：C# `Min()/Max()`、TS `Math.min(...ys)/Math.max(...ys)`、Python `min(ys)/max(ys)`、Java `.min().orElseThrow()/.max().orElseThrow()`。

## 5. 各目标细节

### C#
- 返回 `List<T>` 时渲染器在尾部补 `.ToArray()`，与宿主 `record` 数组对接。
- 产物是 `public static` 方法，需要宿主类包裹；`using System.Linq` 必须由宿主提供。

### TypeScript
- 产物是 `export function`，数组即 `List<T>`，不再做尾部转换。
- `sort` 模板先 `[...prev]` 复制再排序，保证 pure（不改动入参）。
- `Math.min(...ys)` 对空数组返回 `Infinity`，与 C#/Java 抛异常的行为不同；v0.1 不额外兜底。
- 需要 `typescript` 才能编译产物（仓库已把它列为 devDependency）。

### Python
- 模块级只注入 `from typing import List`（兼容 3.8）；`User`/`Product` 等记录必须由宿主用 `@dataclass` 定义。
- `sorted(...)` 返回新列表，`ys[:n]` 返回切片副本，均不修改入参。
- 多个 `.luc` 合并进同一模块时，`from typing import List` 只保留一行即可。

### Java
- 管道从 `<入参>.stream()` 起步；返回 `List<T>` 时渲染器在尾部补 `.collect(Collectors.toList())`。
- 记录字段使用访问器：`x.age()`，不是 `x.age`。
- 字符串相等 `==` 会展开为 `.equals(...)`，避免 Java 引用比较语义不一致。
- 产物只有方法，类、`import java.util.*` / `java.util.stream.*`、`record` 都归宿主。
- 建议 JDK 17+（`record` + `var`）。

## 6. 新增目标语言

按 [AGENTS.md](../AGENTS.md) §5 的“换目标语言”执行：

1. 新增 `expander/render-<target>.mjs`（类型映射 + 宿主签名 + 尾部适配 + 必要的字段/谓词钩子）。
2. `operators.yaml` 每个算子补该目标的模板；`expander/operators.mjs` 的 `TARGETS` 与 `expander/cli.mjs` 的 `RENDERERS` 登记。
3. `tests/e2e.mjs` 增加该语言的宿主装配与工具链探测（缺工具链时打印 `SKIP`，不算通过）。
4. 同步 `README.md`、`readme.txt`、`docs/cheatsheet.md`、`spec/rubric.md` 的 D3 行。

AST 与 `checker.mjs` 不需要改动。

## 7. 验证

```bash
npm run ci
```

- `ci:gate`：任意目标共用同一套语法/类型/效果判定。
- `ci:determinism`：4 目标 × 3 示例，各展开两次逐字节比对。
- `ci:e2e`：4 目标真实编译运行并比对 expected（dotnet / tsc+node / python / java）。
