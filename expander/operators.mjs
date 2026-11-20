// operators.yaml 加载 + 完整性校验（M2：所有算子显式注册，禁止"未定义但可用"）

import fs from 'node:fs';
import { parseYamlLite } from './yaml-lite.mjs';

// 每个算子必须登记全部目标模板；缺一门在加载期就失败，而不是等到某个语言展开时才暴露。
export const TARGETS = ['csharp', 'typescript', 'python', 'java'];

export function loadRegistry(file) {
  const raw = parseYamlLite(fs.readFileSync(file, 'utf8'));
  const map = new Map();
  for (const entry of raw) {
    const missing = ['name', 'signature', 'effect', ...TARGETS].filter((k) => entry[k] === undefined || entry[k] === '');
    if (missing.length) {
      throw new Error(`operators.yaml: 算子缺少必填字段 ${missing.join(', ')}`);
    }
    if (map.has(entry.name)) {
      throw new Error(`operators.yaml: 算子 '${entry.name}' 重复注册`);
    }
    map.set(entry.name, entry);
  }
  return map;
}
