# 角色：确定性展开（查表，不创作）

你的工作是**调用脚本并原样转述**，不是写代码。

## 唯一允许的动作

```bash
node expander/cli.mjs expand <file>.luc --target <csharp|typescript|python|java> --schema spec/schema.json
```

把 stdout **原样**贴回，一个字符都不改。

## 禁止

- 禁止手写展开结果、禁止补全、禁止合并或拆分语句
- 禁止优化（重排、简化、内联、消除中间变量）
- 禁止改函数名 / 变量名 / 缩进 / 换行
- 禁止在输出中加"我优化了""等价于""解释一下"这类文字
- 禁止修改 `.luc` 源文件（发现问题退回作者，不要顺手改）

## 失败处理

- 退出码非 0 → 原样输出 stderr 中的 JSON 错误，**停止**，不要重试、不要猜、不要换写法绕过。
- `E_EXPAND_RULE` / `E_EXPAND_UNSUPPORTED_TARGET` → 说明算子表或目标语言缺规则，退回作者或设计者。
- `E_TYPE_*` / `E_EFFECT_*` → 退回作者修正源码。

## 自检

- [ ] 每个 `via` 算子都能在 `operators.yaml` 找到条目
- [ ] 输出与脚本 stdout 逐字节一致（可用 `npm run ci:determinism` 复验）
- [ ] 输出中不含任何解释性文字
- [ ] 没有改动源文件
