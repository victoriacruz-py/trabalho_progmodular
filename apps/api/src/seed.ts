import { Services } from "./composition";
import { DomainError } from "../../../packages/kernel";

/** Explicit development data. Public interfaces preserve all authorization and invariants. */
export async function seedDevelopment(
  services: Services,
  email: string,
  password: string,
) {
  if (process.env.NODE_ENV === "production")
    throw new Error("Dados demonstrativos não são permitidos em produção.");
  try {
    await services.clientes.sessions.provision(
      { nome: "Gestor da loja", email, senha: password },
      ["CLIENTE", "GESTOR", "LOGISTICA"],
    );
  } catch (error) {
    if (!(error instanceof DomainError && error.code === "CONFLITO"))
      throw error;
  }
  const session = await services.clientes.api.autenticar(email, password);
  const ctx = await services.clientes.api.validarSessao(session.token);
  const products: Array<{
    sku: string;
    nome: string;
    marca: string;
    categoria: string;
    preco: number;
    peso: number;
    estoque: number;
    atributos: Record<string, string>;
  }> = [
    {
      sku: "AUR-NB-14",
      nome: "Aurora Book 14",
      marca: "Aurora",
      categoria: "Notebooks",
      preco: 429900,
      peso: 1400,
      estoque: 12,
      atributos: {
        Memória: "16 GB",
        Armazenamento: "512 GB SSD",
        Tela: "14 polegadas",
      },
    },
    {
      sku: "AUR-NB-16",
      nome: "Aurora Pro 16",
      marca: "Aurora",
      categoria: "Notebooks",
      preco: 689900,
      peso: 1800,
      estoque: 7,
      atributos: {
        Memória: "32 GB",
        Armazenamento: "1 TB SSD",
        Tela: "16 polegadas",
      },
    },
    {
      sku: "VEC-TEC-01",
      nome: "Teclado Vector Compact",
      marca: "Vector",
      categoria: "Periféricos",
      preco: 34990,
      peso: 620,
      estoque: 20,
      atributos: { Conexão: "USB-C", Formato: "75%", Layout: "ABNT2" },
    },
    {
      sku: "VEC-MOU-01",
      nome: "Mouse Vector Air",
      marca: "Vector",
      categoria: "Periféricos",
      preco: 19990,
      peso: 80,
      estoque: 25,
      atributos: {
        Conexão: "Sem fio",
        Sensor: "Óptico",
        Resolução: "6.400 DPI",
      },
    },
    {
      sku: "NEX-FON-01",
      nome: "Fone Nexo Studio",
      marca: "Nexo",
      categoria: "Áudio",
      preco: 49990,
      peso: 250,
      estoque: 9,
      atributos: {
        Conexão: "Bluetooth",
        Autonomia: "30 horas",
        Tipo: "Over-ear",
      },
    },
    {
      sku: "NEX-CX-01",
      nome: "Caixa Nexo Mini",
      marca: "Nexo",
      categoria: "Áudio",
      preco: 24990,
      peso: 400,
      estoque: 16,
      atributos: {
        Conexão: "Bluetooth",
        Autonomia: "12 horas",
        Potência: "10 W",
      },
    },
  ];
  try {
    for (const p of products) {
      try {
        await services.catalogo.admin.obterProduto(ctx, p.sku);
      } catch (error) {
        if (!(error instanceof DomainError && error.code === "NAO_ENCONTRADO"))
          throw error;
        await services.catalogo.api.salvarProduto(ctx, {
          sku: p.sku,
          nome: p.nome,
          marca: p.marca,
          categoria: p.categoria,
          descricao: `${p.nome}: tecnologia para acompanhar seu trabalho, suas ideias e seu dia a dia. Produto demonstrativo do primeiro incremento.`,
          imagemUrl: "/product-placeholder.svg",
          atributos: p.atributos,
          pesoGramas: p.peso,
          dimensoesMm: { largura: 300, altura: 30, profundidade: 200 },
          ativo: true,
        });
      }
      try {
        await services.precos.api.calcular([{ sku: p.sku, quantidade: 1 }]);
      } catch (error) {
        if (!(
          error instanceof DomainError && error.code === "PRECO_INDISPONIVEL"
        ))
          throw error;
        await services.precos.api.configurarRegra(ctx, {
          tipo: "PRECO",
          sku: p.sku,
          precoCentavos: p.preco,
        });
      }
      await services.estoque.api.movimentar(
        ctx,
        {
          sku: p.sku,
          tipo: "ENTRADA",
          quantidade: p.estoque,
          justificativa: "Carga demonstrativa inicial",
        },
        "seed-v1-" + p.sku,
      );
    }
  } finally {
    await services.clientes.sessions.revoke(session.token);
  }
  return products.length;
}
