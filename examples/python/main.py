"""Lucid Python 宿主样例（真实可运行）。

下面三个函数由展开器生成，等价于依次执行：
  node expander/cli.mjs expand examples/sum.luc      --target python --schema spec/schema.json
  node expander/cli.mjs expand examples/adults.luc   --target python --schema spec/schema.json
  node expander/cli.mjs expand examples/cheapest.luc --target python --schema spec/schema.json
手改会被下次展开覆盖；要改行为，改 .luc 或 operators.yaml。

每次展开都会带一行 `from typing import List`，合并到本文件时去重即可。

运行（仓库根目录）：
  python examples/python/main.py
"""

from dataclasses import asdict, dataclass
from typing import List
import json


# ── 数据契约：对应 spec/schema.json 的 records（由宿主提供）─────────────────
@dataclass
class User:
    name: str
    age: int


@dataclass
class Product:
    name: str
    price: int


# ── 以下三个函数由展开器生成 ────────────────────────────────────────────────
def SumTotal(numbers: List[int]) -> int:
    total = sum(numbers)
    return total


def AdultCount(users: List[User]) -> int:
    adults = len([x for x in users if x.age >= 18])
    return adults


def CheapestProducts(products: List[Product]) -> List[Product]:
    cheapest = sorted(products, key=lambda x: x.price)[:3]
    return cheapest


# ── 宿主侧调用示例 ─────────────────────────────────────────────────────────
if __name__ == "__main__":
    numbers = [1, 2, 3, 4]
    print(f"SumTotal(numbers: [1,2,3,4])        -> {SumTotal(numbers)}")

    users = [User("A", 17), User("B", 20), User("C", 30)]
    print(f"AdultCount(users: A17,B20,C30)       -> {AdultCount(users)}")

    products = [
        Product("a", 30),
        Product("b", 10),
        Product("c", 20),
        Product("d", 5),
    ]
    cheapest = json.dumps([asdict(p) for p in CheapestProducts(products)])
    print(f"CheapestProducts(products: 30,10,20,5) -> {cheapest}")
