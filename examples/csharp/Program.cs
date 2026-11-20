#:property JsonSerializerIsReflectionEnabledByDefault=true
#:property NoWarn=IL2026;IL3050
using System;
using System.Linq;
using System.Text.Json;

// ─────────────────────────────────────────────────────────────────────────────
// 数据契约：对应 spec/schema.json 的 records
// ─────────────────────────────────────────────────────────────────────────────
public record User(string name, int age);
public record Product(string name, int price);

// ─────────────────────────────────────────────────────────────────────────────
// 以下三个方法由展开器生成，等价于依次执行：
//   node expander/cli.mjs expand examples/sum.luc      --target csharp --schema spec/schema.json
//   node expander/cli.mjs expand examples/adults.luc   --target csharp --schema spec/schema.json
//   node expander/cli.mjs expand examples/cheapest.luc --target csharp --schema spec/schema.json
// 手改会被下次展开覆盖；要改行为，改 .luc 或 operators.yaml。
// ─────────────────────────────────────────────────────────────────────────────
public static class Pipelines
{
    public static int SumTotal(int[] numbers)
    {
        var total = numbers.Aggregate(0, (acc, item) => acc + item);
        return total;
    }

    public static int AdultCount(User[] users)
    {
        var adults = users.Where(x => x.age >= 18).Count();
        return adults;
    }

    public static Product[] CheapestProducts(Product[] products)
    {
        var cheapest = products.OrderBy(x => x.price).Take(3).ToArray();
        return cheapest;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// 宿主侧调用示例（真实运行：dotnet run examples/csharp/Program.cs）
// ─────────────────────────────────────────────────────────────────────────────
public static class Program
{
    public static void Main()
    {
        var numbers = new[] { 1, 2, 3, 4 };
        Console.WriteLine($"SumTotal(numbers: [1,2,3,4])        -> {Pipelines.SumTotal(numbers)}");

        var users = new[]
        {
            new User("A", 17),
            new User("B", 20),
            new User("C", 30),
        };
        Console.WriteLine($"AdultCount(users: A17,B20,C30)       -> {Pipelines.AdultCount(users)}");

        var products = new[]
        {
            new Product("a", 30),
            new Product("b", 10),
            new Product("c", 20),
            new Product("d", 5),
        };
        Console.WriteLine($"CheapestProducts(products: 30,10,20,5) -> {JsonSerializer.Serialize(Pipelines.CheapestProducts(products))}");
    }
}
