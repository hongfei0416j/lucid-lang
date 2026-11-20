// =============================================================================
// Lucid Java 宿主样例（真实可运行，JDK 17+）
//
// 下面三个方法由展开器生成，等价于依次执行：
//   node expander/cli.mjs expand examples/sum.luc      --target java --schema spec/schema.json
//   node expander/cli.mjs expand examples/adults.luc   --target java --schema spec/schema.json
//   node expander/cli.mjs expand examples/cheapest.luc --target java --schema spec/schema.json
// 手改会被下次展开覆盖；要改行为，改 .luc 或 operators.yaml。
//
// 注意：Java 产物只有方法（管道基于 Stream，返回 List 时尾部自动 collect）；
//       类、import、记录类型由宿主提供。
//
// 运行（仓库根目录）：
//   java examples/java/Main.java
// =============================================================================

import java.util.*;
import java.util.stream.*;

public class Main
{
    static String productJson(Product p)
    {
        return "{\"name\":\"" + p.name() + "\",\"price\":" + p.price() + "}";
    }

    public static void main(String[] args)
    {
        System.out.println("SumTotal(numbers: [1,2,3,4])        -> "
                + Pipelines.SumTotal(List.of(1, 2, 3, 4)));

        System.out.println("AdultCount(users: A17,B20,C30)       -> "
                + Pipelines.AdultCount(List.of(new User("A", 17), new User("B", 20), new User("C", 30))));

        List<Product> products = List.of(
                new Product("a", 30),
                new Product("b", 10),
                new Product("c", 20),
                new Product("d", 5));
        String cheapest = Pipelines.CheapestProducts(products).stream()
                .map(Main::productJson)
                .collect(Collectors.joining(",", "[", "]"));
        System.out.println("CheapestProducts(products: 30,10,20,5) -> " + cheapest);
    }
}

// ── 数据契约：对应 spec/schema.json 的 records（由宿主提供）─────────────────
record User(String name, int age) {}
record Product(String name, int price) {}

// ── 以下三个方法由展开器生成 ────────────────────────────────────────────────
class Pipelines
{
    public static int SumTotal(List<Integer> numbers) {
        var total = numbers.stream().mapToInt(Integer::intValue).sum();
        return total;
    }

    public static int AdultCount(List<User> users) {
        var adults = (int) users.stream().filter(x -> x.age() >= 18).count();
        return adults;
    }

    public static List<Product> CheapestProducts(List<Product> products) {
        var cheapest = products.stream().sorted(Comparator.comparingInt((Product x) -> x.price())).limit(3).collect(Collectors.toList());
        return cheapest;
    }
}
