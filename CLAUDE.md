# Lastro: instruções para agentes

Carteira e alertas de preço da B3, local-first (sem conta; nada do usuário no servidor). Documentação e interface em português do Brasil. Só soluções gratuitas; sem IA. **Não é recomendação de investimento** e os preços têm atraso: os dois avisos ficam sempre visíveis.

## Guia de desenvolvimento

Guia local do mantenedor: `Documents/Obsidian Vault/IA/guia-desenvolvimento-ia/README.md` (fora do repositório).
Leia o fluxo de trabalho e, antes de alterar uma funcionalidade, os módulos indicados pelos gatilhos do índice.
Registre contexto, decisões e resultados em `docs/CONTEXTO.md` e `docs/VERIFICACAO.md`, sem segredos ou dados pessoais.
Antes de publicar, percorra o checklist de publicação e justifique itens não aplicáveis.
Informe o que foi verificado, o que falhou e o que depende de acesso ou teste posterior.

## Regras do projeto

- Fluxo: issue, branch, PR, CI verde, merge squash. Nunca commit direto na `main`. Commits de PR levam `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` (coautoria liberada neste repositório).
- Dinheiro sempre em centavos inteiros; só `site/js/moeda.js` converte de/para texto. Quantidades inteiras.
- Núcleo de cálculo puro em `site/js/` (sem DOM nem rede), testado com `npm test` (node:test).
- Dados do usuário (quantidades, preços, datas) nunca saem do navegador; ao servidor vão só símbolos. Token da brapi só como segredo do Worker, nunca no git.
- DOM montado com `textContent`/`createElement` (sem `innerHTML` com dado do usuário). Entrada importada é não confiável: valide em `armazenamento.js`.
- Todo preço mostra origem (simulado / atrasado ~30 min / fechamento) e horário.
