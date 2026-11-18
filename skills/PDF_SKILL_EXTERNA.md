# Skill PDF com instalação pelo plugin

A skill `anthropic-skills:pdf` foi consultada para identificar o `Trabalho.pdf` recebido. Ela não é necessária para compilar, executar ou testar o e-commerce.

A licença `LICENSE.txt` presente na instalação consultada declara, entre suas restrições:

> Distribute, sublicense, or transfer these materials to any third party

Por esse motivo, **os arquivos dessa skill não foram colocados neste ZIP**. Não se trata de um auxiliar esquecido. A restrição diz respeito à skill, não ao `Trabalho.pdf` fornecido pelo usuário, que está em `referencias/Trabalho.pdf`.

## Instalar na conta de cada integrante

1. Abra o catálogo de plugins do assistente utilizado.
2. Localize o plugin **anthropic-skills**, que fornece a skill **pdf**, e confira sua origem e termos na própria plataforma.
3. Instale-o na conta do integrante, se estiver disponível e autorizado, e inicie uma nova conversa/atualize o catálogo.
4. Peça explicitamente ao assistente para usar `anthropic-skills:pdf` no documento anexado.

O nome visível e a disponibilidade do plugin podem variar por versão/conta. Se ele não estiver disponível, a etapa de leitura de documentos pode ser realizada pelo leitor de PDF habitual; nenhum módulo de negócio depende dessa skill.

O instalador offline deste pacote não tenta baixar, contornar a licença ou instalar esse plugin. `catalogo.json` registra a entrada como `incluida: false` e aponta para estas instruções.
