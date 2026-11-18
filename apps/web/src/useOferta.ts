import { useEffect, useState } from "react";
import { api } from "./api";
import type { Cotacao, Saldo } from "./types";

type Oferta = {
  cotacao?: Cotacao;
  saldo?: Saldo;
  consultandoPreco: boolean;
  consultandoEstoque: boolean;
};

/** A displayed quote never outlives the server's validity window. */
export function useOferta(sku: string, revisao = 0) {
  const [oferta, setOferta] = useState<Oferta>({
    consultandoPreco: true,
    consultandoEstoque: true,
  });
  useEffect(() => {
    let ativa = true;
    let tentativa = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    setOferta({ consultandoPreco: true, consultandoEstoque: true });

    function atualizar() {
      clearTimeout(timer);
      const atual = ++tentativa;
      const inicio = performance.now();
      const inicioCivil = Date.now();
      const vigente = () => ativa && atual === tentativa;
      setOferta((anterior) => ({
        saldo: anterior.saldo,
        consultandoPreco: true,
        consultandoEstoque: !anterior.saldo,
      }));
      api
        .cotar([{ sku, quantidade: 1 }])
        .then((cotacao) => {
          if (!vigente()) return;
          // Subtract the entire round trip, conservatively including time before
          // calculation. Clock skew between browser and server cannot extend it.
          const duracao =
            Date.parse(cotacao.validaAte) - Date.parse(cotacao.calculadaEm);
          const decorrido = Math.max(
            performance.now() - inicio,
            Date.now() - inicioCivil,
          );
          const restante = duracao - decorrido;
          const valida = Number.isFinite(restante) && restante > 0;
          setOferta((anterior) => ({
            ...anterior,
            cotacao: valida ? cotacao : undefined,
            consultandoPreco: false,
          }));
          // An already expired response must not cause an immediate fetch loop.
          timer = setTimeout(atualizar, valida ? restante : 30_000);
        })
        .catch(() => {
          if (!vigente()) return;
          setOferta((anterior) => ({
            ...anterior,
            cotacao: undefined,
            consultandoPreco: false,
          }));
          timer = setTimeout(atualizar, 30_000);
        });
      api
        .saldo(sku)
        .then((saldo) => {
          if (vigente())
            setOferta((anterior) => ({
              ...anterior,
              saldo,
              consultandoEstoque: false,
            }));
        })
        .catch(() => {
          if (vigente())
            setOferta((anterior) => ({
              ...anterior,
              saldo: undefined,
              consultandoEstoque: false,
            }));
        });
    }

    function retomar() {
      if (document.visibilityState === "visible") atualizar();
      else {
        ++tentativa;
        clearTimeout(timer);
        setOferta((anterior) => ({
          ...anterior,
          cotacao: undefined,
          consultandoPreco: true,
        }));
      }
    }

    atualizar();
    document.addEventListener("visibilitychange", retomar);
    window.addEventListener("pageshow", retomar);
    return () => {
      ativa = false;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", retomar);
      window.removeEventListener("pageshow", retomar);
    };
  }, [sku, revisao]);
  return { ...oferta, preco: oferta.cotacao?.linhas[0] };
}
