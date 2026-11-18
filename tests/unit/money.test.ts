import { describe, expect, test } from "@jest/globals";
import { discountLine } from "../../packages/kernel";

describe("RNF02 — dinheiro em centavos", () => {
  test("arredonda uma vez por linha e empates para cima", () => {
    expect(discountLine(999, 1, 10)).toEqual({
      subtotal: 999,
      discount: 100,
      total: 899,
    });
    expect(discountLine(50, 1, 1)).toEqual({
      subtotal: 50,
      discount: 1,
      total: 49,
    });
  });
});
