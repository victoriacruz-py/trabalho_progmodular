export function precoEmCentavos(value: string): number {
  const match = /^(\d+)(?:[.,](\d{1,2}))?$/.exec(value.trim());
  if (!match)
    throw new Error("Informe um preço positivo com até duas casas decimais.");
  const cents =
    BigInt(match[1]!) * 100n + BigInt((match[2] ?? "").padEnd(2, "0"));
  if (cents <= 0n || cents > BigInt(Number.MAX_SAFE_INTEGER))
    throw new Error("Preço fora do limite permitido.");
  return Number(cents);
}
function parts(centavos: number): [bigint, string] {
  if (!Number.isSafeInteger(centavos) || centavos < 0)
    throw new Error("Valor monetário inválido.");
  const value = BigInt(centavos);
  return [value / 100n, (value % 100n).toString().padStart(2, "0")];
}
export function precoParaInput(centavos: number): string {
  const [whole, fraction] = parts(centavos);
  return `${whole}.${fraction}`;
}
export function moeda(centavos: number): string {
  const [whole, fraction] = parts(centavos);
  return `R$ ${whole.toLocaleString("pt-BR")},${fraction}`;
}
