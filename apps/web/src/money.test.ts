import { describe, expect, it } from "vitest";
import { moeda, precoEmCentavos, precoParaInput } from "./money";
describe("dinheiro na fronteira da interface", () => {
  it("preserva centavos decimais até o limite seguro sem arredondamento binário", () => {
    expect(precoEmCentavos("70368744177664.01")).toBe(7036874417766401);
    expect(precoEmCentavos("90071992547409,91")).toBe(9007199254740991);
    expect(precoParaInput(7036874417766401)).toBe("70368744177664.01");
    expect(moeda(7036874417766401)).toBe("R$ 70.368.744.177.664,01");
    expect(precoEmCentavos("199,9")).toBe(19990);
  });
  it("recusa frações extras, notação exponencial, zero e valores além do limite", () => {
    for (const input of ["1.001", "1e3", "0", "-1", "90071992547409.92"])
      expect(() => precoEmCentavos(input)).toThrow();
  });
});
