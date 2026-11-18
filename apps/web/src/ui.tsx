import { useEffect, useId, useRef } from "react";
import type { ReactNode } from "react";

export function Modal({
  titulo,
  children,
  fechar,
  ampla = false,
}: {
  titulo: string;
  children: ReactNode;
  fechar: () => void;
  ampla?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className={`modal${ampla ? " modal-ampla" : ""}`}
      aria-labelledby={id}
      onClose={fechar}
    >
      <div className="modal-cabecalho">
        <h2 id={id}>{titulo}</h2>
        <button
          className="botao-icone"
          type="button"
          aria-label="Fechar janela"
          onClick={() => ref.current?.close()}
        >
          <Icone nome="fechar" />
        </button>
      </div>
      {children}
    </dialog>
  );
}

export function Aviso({
  children,
  erro = false,
}: {
  children: ReactNode;
  erro?: boolean;
}) {
  return (
    <div
      className={`aviso ${erro ? "aviso-erro" : "aviso-sucesso"}`}
      role={erro ? "alert" : "status"}
    >
      {children}
    </div>
  );
}

export function Icone({
  nome,
}: {
  nome: "pessoa" | "seta" | "fechar" | "caixa" | "sair" | "ajuste";
}) {
  const formas = {
    pessoa: (
      <>
        <circle cx="12" cy="8" r="3.5" />
        <path d="M4.5 21v-3a7.5 7.5 0 0 1 15 0v3" />
      </>
    ),
    seta: (
      <>
        <path d="m9 5 7 7-7 7M4 12h12" />
      </>
    ),
    fechar: <path d="m6 6 12 12M18 6 6 18" />,
    caixa: (
      <>
        <path d="m3 7 9-5 9 5v10l-9 5-9-5V7Zm0 0 9 5 9-5M12 12v10M7.5 4.5l9 5" />
      </>
    ),
    sair: (
      <>
        <path d="M9 3H4v18h5M9 12h12m-5-5 5 5-5 5" />
      </>
    ),
    ajuste: (
      <>
        <path d="M4 6h16M4 12h16M4 18h16" />
        <circle cx="8" cy="6" r="2" />
        <circle cx="16" cy="12" r="2" />
        <circle cx="10" cy="18" r="2" />
      </>
    ),
  };
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      width="22"
      height="22"
      aria-hidden="true"
    >
      {formas[nome]}
    </svg>
  );
}

export function ProdutoArte({
  categoria = "",
  grande = false,
}: {
  categoria?: string;
  grande?: boolean;
}) {
  const audio = /áudio|audio|fone/i.test(categoria);
  const periferico = /perif|teclado|mouse/i.test(categoria);
  return (
    <svg
      className={`produto-arte${grande ? " produto-arte-grande" : ""}`}
      viewBox="0 0 400 280"
      role="img"
      aria-label={
        audio
          ? "Ilustração de fone de ouvido"
          : periferico
            ? "Ilustração de teclado"
            : "Ilustração de notebook"
      }
    >
      <ellipse
        cx="200"
        cy="236"
        rx="145"
        ry="12"
        fill="currentColor"
        opacity=".08"
      />
      {audio ? (
        <g transform="translate(88 18)">
          <path
            d="M26 143V96a86 86 0 0 1 172 0v47"
            fill="none"
            stroke="#27334d"
            strokeWidth="22"
          />
          <path
            d="M30 113V96a82 82 0 0 1 164 0v17"
            fill="none"
            stroke="#a6b1c6"
            strokeWidth="10"
          />
          <rect x="3" y="109" width="55" height="100" rx="23" fill="#384866" />
          <rect x="23" y="113" width="35" height="94" rx="16" fill="#8494b7" />
          <rect
            x="166"
            y="109"
            width="55"
            height="100"
            rx="23"
            fill="#384866"
          />
          <rect x="166" y="113" width="35" height="94" rx="16" fill="#8494b7" />
        </g>
      ) : periferico ? (
        <g transform="translate(42 83) rotate(-8 160 65)">
          <rect width="316" height="126" rx="16" fill="#26324a" />
          <rect x="5" y="5" width="306" height="111" rx="11" fill="#d1d8e6" />
          {Array.from({ length: 48 }, (_, i) => (
            <rect
              key={i}
              x={15 + (i % 12) * 24}
              y={15 + Math.floor(i / 12) * 22}
              width="19"
              height="17"
              rx="3"
              fill={i === 0 ? "#ed866c" : "#f8faff"}
            />
          ))}
          <rect x="88" y="91" width="135" height="17" rx="3" fill="#f8faff" />
        </g>
      ) : (
        <g>
          <path
            d="M84 47h232a9 9 0 0 1 9 9v153H75V56a9 9 0 0 1 9-9"
            fill="#26324a"
          />
          <path d="M87 59h226v139H87z" fill="#5064e8" />
          <path
            d="M87 198V136c45 25 67-89 123-55 38 23 50 88 103 56v61"
            fill="#b4c0ff"
          />
          <path
            d="M87 198v-35c45-35 69 37 114-13 45-48 81 36 112 13v35"
            fill="#8394f4"
          />
          <circle cx="270" cy="92" r="17" fill="#f5c9a4" />
          <path d="m75 209-41 21v9h332v-9l-41-21" fill="#acb7cc" />
          <path d="m75 209-41 21h332l-41-21" fill="#e5eaf3" />
          <path d="M158 210h84l9 10H149z" fill="#c0c9dc" />
          <path d="M34 239h332l-14 7H48z" fill="#7786a3" />
        </g>
      )}
    </svg>
  );
}
