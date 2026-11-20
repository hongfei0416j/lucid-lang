// =============================================================================
// Lucid TypeScript 宿主样例（真实可运行）
//
// 下面三个 export function 由展开器生成，等价于依次执行：
//   node expander/cli.mjs expand examples/sum.luc      --target typescript --schema spec/schema.json
//   node expander/cli.mjs expand examples/adults.luc   --target typescript --schema spec/schema.json
//   node expander/cli.mjs expand examples/cheapest.luc --target typescript --schema spec/schema.json
// 手改会被下次展开覆盖；要改行为，改 .luc 或 operators.yaml。
//
// 运行（仓库根目录）：
//   npx tsc examples/typescript/main.ts --target ES2020 --module ESNext --outDir tests/.tmp/example-ts
//   node tests/.tmp/example-ts/main.js
// =============================================================================

// ── 数据契约：对应 spec/schema.json 的 records（由宿主提供）─────────────────
type User = { name: string; age: number };
type Product = { name: string; price: number };

// ── 以下三个函数由展开器生成 ────────────────────────────────────────────────
export function SumTotal(numbers: number[]): number {
  const total = numbers.reduce((acc, item) => acc + item, 0);
  return total;
}

export function AdultCount(users: User[]): number {
  const adults = users.filter((x) => x.age >= 18).length;
  return adults;
}

export function CheapestProducts(products: Product[]): Product[] {
  const cheapest = [...products].sort((a, b) => a.price - b.price).slice(0, 3);
  return cheapest;
}

// ── 宿主侧调用示例 ─────────────────────────────────────────────────────────
const numbers = [1, 2, 3, 4];
console.log(`SumTotal(numbers: [1,2,3,4])        -> ${SumTotal(numbers)}`);

const users: User[] = [
  { name: "A", age: 17 },
  { name: "B", age: 20 },
  { name: "C", age: 30 },
];
console.log(`AdultCount(users: A17,B20,C30)       -> ${AdultCount(users)}`);

const products: Product[] = [
  { name: "a", price: 30 },
  { name: "b", price: 10 },
  { name: "c", price: 20 },
  { name: "d", price: 5 },
];
console.log(`CheapestProducts(products: 30,10,20,5) -> ${JSON.stringify(CheapestProducts(products))}`);
