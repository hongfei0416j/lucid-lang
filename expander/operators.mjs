// operators.yaml 加载 + 完整性校验（M2：所有算子显式注册，禁止"未定义但可用"）

import fs from 'node:fs';
import { parseYamlLite } from './yaml-lite.mjs';

export function loadRegistry(file) {
  const raw = parseYamlLite(fs.readFileSync(file, 'utf8'));
  const map = new Map();
  for (const entry of raw) {
    const missing = ['name', 'signature', 'effect', 'csharp'].filter((k) => entry[k] === undefined || entry[k] === '');
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
