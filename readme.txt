================================================================================
Lucid 0.1  --  AI 写意图，机器写实现
================================================================================

许可 : MIT
环境 : Node.js >= 18
       端到端验证另需 .NET SDK >= 10、Python 3、JDK >= 17
       TypeScript 由 npm install 装入的 typescript 编译校验
目标 : csharp / typescript / python / java

为什么写这个文件
  给不熟悉本项目的人（以及三个月后的自己）一份不依赖 Markdown 渲染的完整说明。
  想直接跑起来，看第 3 节；想知道设计取舍，看第 4、10 节。


--------------------------------------------------------------------------------
1. 一句话
--------------------------------------------------------------------------------
Lucid 是一门极小的"意图语言"。模型只写数据从哪来、依次做什么、产出什么，
本地展开器查表把它变成宿主语言代码。宿主代码不由模型生成。


--------------------------------------------------------------------------------
2. 它解决什么问题
--------------------------------------------------------------------------------
让模型直接写 C#，出错的地方往往不是业务逻辑，而是：

  (1) 样板代码吃掉大量 token，且每次长得都不一样；
  (2) 模型会调用不存在的 API（幻觉），编译器才报错；
  (3) 同一需求两次生成结果不同，无法 code review，也无法回归；
  (4) 隐式类型转换、隐式 IO、隐式依赖被悄悄写进代码。

Lucid 的做法是把这四件事从"模型自觉"改成"系统强制"：

  问题              Lucid 的处理
  ----------------  ------------------------------------------------------------
  样板太多          展开器吸收全部样板，模型只写四行声明
  幻觉 API          算子不在注册表里就直接拒绝（E_TYPE_UNKNOWN_OPERATOR）
  结果不稳定        同一份意图 + 同一份 schema => 展开结果逐字节相同，CI 比对
  错误发现太晚      lex / parse / typecheck / effectcheck 四段，全在展开前


--------------------------------------------------------------------------------
3. 30 秒上手
--------------------------------------------------------------------------------
在项目根目录执行：

  npm install     # 只装 typescript（devDependency，用于 TS 编译检查）
  npm run ci

它会依次做三件事：
  ci:gate        正例必须通过；7 个反例必须按预期错误码被打回
  ci:determinism 每个示例 × 4 个目标各展开两次，逐字节比较
  ci:e2e         展开成 C#/TS/Python/Java，真实编译运行，比对预期输出

手动验证单文件：

  node expander/cli.mjs check  examples/sum.luc --schema spec/schema.json
  node expander/cli.mjs expand examples/sum.luc --target csharp --schema spec/schema.json
  node expander/cli.mjs expand examples/sum.luc --target typescript --schema spec/schema.json
  node expander/cli.mjs expand examples/sum.luc --target python --schema spec/schema.json
  node expander/cli.mjs expand examples/sum.luc --target java --schema spec/schema.json

各目标的类型映射、宿主职责与完整运行命令见 docs/targets.md。


--------------------------------------------------------------------------------
4. 三层结构
--------------------------------------------------------------------------------
  [AI 层]        只写 .luc 意图：fn / from / via / yield / end
       |
       |  契约：Intent AST（JSON 可序列化，结构与算子都固定）
       v
  [展开层]       查 operators.yaml，做纯字符串模板替换，输出宿主代码
       |
       v
  [宿主层]       C# / TypeScript / Python / Java：类型、记录、调用方代码

关键点：AI 层不能写循环、import、类型声明、lambda、赋值。
一旦写了，说明它越过了边界，门禁会把它当作语法/类型错误打回。


--------------------------------------------------------------------------------
5. 一个完整例子
--------------------------------------------------------------------------------
意图文件 examples/adults.luc：

  fn AdultCount(users: List<User>) -> Int pure
  from users
  via filter(age >= 18)
  via reduce(count)
  yield adults
  end

展开为 C#（由 expander 生成，非手写）：

  public static int AdultCount(User[] users)
  {
      var adults = users.Where(x => x.age >= 18).Count();
      return adults;
  }

在 C# 中调用（示例见 examples/csharp/Program.cs）：

  var count = Pipelines.AdultCount(new[] {
      new User("A", 17), new User("B", 20), new User("C", 30)
  });   // 2

同一份意图换 --target，得到语义等价的其它宿主代码：

  TypeScript:
    export function AdultCount(users: User[]): number {
      const adults = users.filter((x) => x.age >= 18).length;
      return adults;
    }

  Python:
    def AdultCount(users: List[User]) -> int:
        adults = len([x for x in users if x.age >= 18])
        return adults

  Java（产物是方法，类与 import 由宿主提供）:
    public static int AdultCount(List<User> users) {
        var adults = (int) users.stream().filter(x -> x.age() >= 18).count();
        return adults;
    }


--------------------------------------------------------------------------------
6. 语法速查
--------------------------------------------------------------------------------
模板（每个函数一条管道）：

  fn 函数名(入参: 类型) -> 返回类型 pure
  from 数据源
  via 算子(参数)
  yield 结果名
  end

类型：
  Int   Bool   String   List<T>   Record（记录名来自 spec/schema.json）

算子（v0.1 仅这 5 个）：
  reduce(sum | count | min | max)   折叠为 Int，必须是最后一个算子
  filter(字段 比较符 字面量)        单字段谓词，如 filter(age >= 18)
  map(字段)                         投影为 List<字段类型>
  sort(字段, asc | desc)            字段须为 Int，稳定排序
  take(n)                           取前 n 项，n 为非负整数

禁止：
  if / else / for / while / switch、方法链、中缀运算、赋值、lambda、
  import、类型声明、复合谓词（and/or）、跨表 join。

需要新算子时：先申报（算子名 + 签名 + 展开规则），确认后再实现，
不得在意图里直接使用未注册算子。


--------------------------------------------------------------------------------
7. 错误码速查
--------------------------------------------------------------------------------
  lex            E_LEX_UNEXPECTED_CHAR        文法外字符（如 { }）
                 E_LEX_UNTERMINATED_STRING    字符串未闭合
  parse          E_PARSE_MISSING_CLAUSE        缺 from / yield（例如写了 for）
                 E_PARSE_UNEXPECTED_TOKEN     记号不符合文法
  typecheck      E_TYPE_UNKNOWN_OPERATOR       未注册算子
                 E_TYPE_MISMATCH              类型不符 / reduce 后接算子
                 E_TYPE_UNDEFINED_FIELD       字段不存在
                 E_TYPE_UNKNOWN_SOURCE        数据源未声明
                 E_TYPE_ARITY                 参数数量或形状不对
                 E_TYPE_UNDEFINED_VARIABLE    聚合名 / 排序方向未注册
                 E_TYPE_DUPLICATE_BINDING     yield 名与入参重名
  effectcheck    E_EFFECT_MISSING             缺 effect
                 E_EFFECT_UNKNOWN_EFFECT      声明了 pure 之外的 effect
                 E_EFFECT_PURE_VIOLATION      纯函数里用了非纯算子
  expand         E_EXPAND_RULE                 算子缺目标模板
                 E_EXPAND_UNSUPPORTED_TARGET  目标语言不支持

所有拒绝都发生在"展开之前"，不依赖运行时检查。
错误同时给人类可读文本与机器可解析 JSON（含 phase / line / code）。


--------------------------------------------------------------------------------
8. 目录说明
--------------------------------------------------------------------------------
  AGENTS.md             AI 入口：目录地图、硬不变量、任务->改哪里、已知坑
  README.md             GitHub 首页
  readme.txt            本文件（纯文本完整说明）
  LICENSE               MIT

  docs/cheatsheet.md    语法与错误码速查（写给模型看的）
  docs/targets.md       目标语言使用手册：类型映射 / 宿主职责 / 运行方式
  docs/history/         历史设计（第一版 TypeScript 方案）

  operators.yaml        算子唯一注册表：签名 + 4 门目标模板
  spec/schema.json      数据源与记录字段类型
  spec/ebnf.md          文法、token 对齐、最小文法注入
  spec/rubric.md        审查判定表（R/P/D/A 四组）

  expander/cli.mjs      命令入口：check / expand
  expander/tokenizer.mjs 词法
  expander/parser.mjs    LL(1) 递归下降 -> Intent AST
  expander/checker.mjs   类型 / 效果 / 字段 / 参数形状
  expander/render-common.mjs   算子模板装配（4 个目标共用）
  expander/render-csharp.mjs   AST -> C#
  expander/render-typescript.mjs  AST -> TypeScript
  expander/render-python.mjs   AST -> Python
  expander/render-java.mjs     AST -> Java（Stream + 尾部 collect）
  expander/yaml-lite.mjs 极简 YAML 读取（零第三方依赖）

  examples/*.luc        三个可运行意图
  examples/cases.json   输入与预期输出
  examples/csharp/      完整可运行 C# 宿主样例
  examples/typescript/  完整可运行 TypeScript 宿主样例（main.ts）
  examples/python/      完整可运行 Python 宿主样例（main.py）
  examples/java/        完整可运行 Java 宿主样例（Main.java，JDK 17+）
  examples/cpp/         C++ 形态参照（手写，未编译验证）

  prompts/author.md     角色：写意图
  prompts/translate.md  角色：只调用 expand 并原样转述
  prompts/review.md     角色：只按 rubric 打分
  prompts/design.md     角色：先证伪再设计
  prompts/single-model.md 单模型时的角色切换总控

  tests/gate.mjs        正例通过 + 反例按码打回
  tests/determinism.mjs 两次展开逐字节一致
  tests/e2e.mjs         真实 dotnet 编译运行并比对
  tests/fixtures/       7 个反例 + expected.json


--------------------------------------------------------------------------------
9. 硬规则（违反即返工）
--------------------------------------------------------------------------------
守住：
  P1  分层边界：.luc 里不得出现宿主语言构造
  P2  编译期拦截：拒绝必须发生在展开前，不许用运行时检查替代
  P3  确定性：展开器不读时间、随机数、环境变量
  P4  纯函数单管道：每函数 pure、单 from、一条管道

放弃：
  D1  表达力：只有 5 个算子，扩展必须先申报并补齐四件套
  D2  优化：不重排、不合并、不内联，可 diff 优先于优雅
  D3  多目标：只维护注册的 4 门目标（csharp/typescript/python/java），
      其它目标一律报 E_EXPAND_UNSUPPORTED_TARGET


--------------------------------------------------------------------------------
10. 为什么不让 AI 直接写 C#
--------------------------------------------------------------------------------
因为"能写"和"写得稳定"是两件事。

  - 模型写意图时，token 消耗约为直接写实现的三分之一到五分之一（示例 23~33 tokens）；
  - 实测（3 个示例均摊）：意图 28 tokens；同一意图生成 C#/TS/Python/Java 分别
    34/36/34/43，四门合计 147 tokens。即单语言省约 24%，四语言省约 81%；
    计入直接开发约 1.4 倍返工系数后，项目级净节省通常 80%~90%
    （对比图见 README 的“Token 成本对比”一节）；
  - 意图是声明式的，没有控制流，因此不存在"循环边界写错"这类问题；
  - 展开是查表，同一意图永远得到同一份代码，code review 只需要看意图；
  - 一旦模型想"帮忙优化"，会被 D2 约束挡住——优化属于展开器和宿主，不属于意图层。

代价也很明确：表达力有限。当前只覆盖过滤、投影、排序、截断、聚合五类操作。
需要更复杂的逻辑时，正确做法是扩展算子表并补测试，而不是让模型回到写宿主代码。


--------------------------------------------------------------------------------
11. 已知限制
--------------------------------------------------------------------------------
  - 算子只有 5 个，不支持 join / group / select / 复合谓词；
  - 目标语言 4 门：csharp / typescript / python / java，每门都在 CI 里真实编译运行；
    examples/cpp/main.cpp 是手写参照，C++ 尚未注册为正式目标；
  - Java 产物只含方法（类与 import 由宿主提供），管道基于 Stream；
  - examples/csharp/Program.cs 使用 .NET 10+ 的单文件指令（#:property）；
  - 未发布到 npm；本地可用 npm link 后以 lucid 命令调用；
  - CI 定义在 .github/workflows/ci.yml（Node 20 + .NET 10 + Python + JDK 17），推送到 GitHub 即自动运行。


--------------------------------------------------------------------------------
12. 路线图
--------------------------------------------------------------------------------
  v0.2  select / group / join（先补类型规则、错误码、反例）
  v0.3  Result<T,E> 与失败路径
  待定  --target cpp / go / rust（需要完整工具链 + e2e 才能进入正式支持）


--------------------------------------------------------------------------------
13. 参与
--------------------------------------------------------------------------------
  1. 先读 AGENTS.md（AI 入口），再读 spec/ebnf.md 与 spec/rubric.md；
  2. 新增算子必须四件套齐全：operators.yaml 模板、checker 类型规则、
     错误码、正反例测试；
  3. 提交前执行 npm run ci，全绿再提 PR；
  4. 不要手改展开产物——改 .luc 或 operators.yaml，让产物重新生成。


--------------------------------------------------------------------------------
14. 许可
--------------------------------------------------------------------------------
MIT。可商用、可修改、可再分发，保留版权与许可声明即可。


================================================================================
问题排查建议：任何异常先跑 npm run ci，再对照 AGENTS.md 第 6 节的"踩过的坑"。
================================================================================
