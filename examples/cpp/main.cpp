// =============================================================================
// Lucid C++ 宿主「参照实现」—— 不是展开器产物
//
// 状态说明（务必先读）：
//   1. v0.1 只注册了 --target csharp（规则 D3：不并行维护第二套模板）。
//      本文件是把同一批意图手工映射成 C++ 的形态参照，不会被 lucid expand 生成。
//   2. 本机 MSVC 工具链不完整（只有 cl.exe，缺 STL 头与 Windows SDK），
//      因此本文件**未经本地编译验证**；语法按 C++17 编写。
//   3. 若以后要把它变成正式目标，走 AGENTS.md §5「换目标语言」：
//      新增 render-cpp.mjs + operators.yaml 的 cpp 模板 + cli 分支 + e2e，不动 AST 与 checker。
//
// 对应的意图源：examples/sum.luc、examples/adults.luc、examples/cheapest.luc
// 预期输出：
//   SumTotal(numbers: [1,2,3,4])           -> 10
//   AdultCount(users: A17,B20,C30)         -> 2
//   CheapestProducts(products: 30,10,20,5) -> [{"name":"d","price":5},{"name":"b","price":10},{"name":"c","price":20}]
// =============================================================================

#include <algorithm>
#include <iostream>
#include <iterator>
#include <numeric>
#include <string>
#include <vector>

// ── 数据契约：对应 spec/schema.json 的 records ──────────────────────────────
struct User
{
    std::string name;
    int age;
};

struct Product
{
    std::string name;
    int price;
};

// ── 以下三个函数：语义与 C# 产物一一对应（不是逐字翻译，是等价映射）─────────

// sum.luc
int SumTotal(const std::vector<int>& numbers)
{
    const int total = std::accumulate(numbers.begin(), numbers.end(), 0);
    return total;
}

// adults.luc
int AdultCount(const std::vector<User>& users)
{
    std::vector<User> adults;
    adults.reserve(users.size());
    std::copy_if(users.begin(), users.end(), std::back_inserter(adults),
                 [](const User& x) { return x.age >= 18; });
    return static_cast<int>(adults.size());
}

// cheapest.luc（先拷贝再排序，保证 pure：不修改入参）
std::vector<Product> CheapestProducts(const std::vector<Product>& products)
{
    std::vector<Product> cheapest = products;
    std::stable_sort(cheapest.begin(), cheapest.end(),
                     [](const Product& a, const Product& b) { return a.price < b.price; });
    if (cheapest.size() > 3u)
    {
        cheapest.resize(3u);
    }
    return cheapest;
}

// ── 宿主侧调用示例 ─────────────────────────────────────────────────────────

static std::string JsonString(const std::string& s)
{
    std::string out = "\"";
    for (const char c : s)
    {
        if (c == '"' || c == '\\')
        {
            out += '\\';
        }
        out += c;
    }
    return out + "\"";
}

static std::string Json(const std::vector<Product>& items)
{
    std::string out = "[";
    for (std::size_t i = 0; i < items.size(); ++i)
    {
        if (i != 0)
        {
            out += ",";
        }
        out += "{\"name\":" + JsonString(items[i].name) +
               ",\"price\":" + std::to_string(items[i].price) + "}";
    }
    return out + "]";
}

int main()
{
    const std::vector<int> numbers{1, 2, 3, 4};
    std::cout << "SumTotal(numbers: [1,2,3,4])           -> "
              << SumTotal(numbers) << '\n';

    const std::vector<User> users{{"A", 17}, {"B", 20}, {"C", 30}};
    std::cout << "AdultCount(users: A17,B20,C30)         -> "
              << AdultCount(users) << '\n';

    const std::vector<Product> products{{"a", 30}, {"b", 10}, {"c", 20}, {"d", 5}};
    std::cout << "CheapestProducts(products: 30,10,20,5) -> "
              << Json(CheapestProducts(products)) << '\n';

    return 0;
}
