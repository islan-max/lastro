# Lastro

Carteira de ações e FIIs da B3 que fica **no seu navegador**: lance compras, vendas e proventos, veja posição, preço médio e resultado, e receba um aviso quando um ativo cruzar o preço que você escolheu. Sem conta, sem anúncios, sem recomendação.

**Use agora:** https://islan-max.github.io/lastro/

> **Lastro não é recomendação de investimento** nem consultoria: só organiza o que você lança. **Os preços têm atraso** (cerca de 30 minutos) e, fora do pregão, mostram o último fechamento; no modo demonstração são simulados. Tudo isso fica visível na tela o tempo todo.

Feito por bazhish. Código aberto (MIT).

## O que dá para fazer

- **Lançar** compras, vendas e proventos (dividendo, JCP, rendimento de FII), com taxas.
- **Ver** valor de mercado, custo, resultado não realizado, resultado das vendas, proventos e retorno total, por ativo e na carteira.
- **Alertas de preço** “igual ou acima / igual ou abaixo de” com aviso na página e notificação do navegador (**só com a página aberta**).
- **Exportar** tudo em JSON (backup) e os lançamentos em CSV; **importar** o JSON de volta.
- **Modo demonstração**: carteira de exemplo e preços simulados, funciona sem internet e mesmo quando a cota de cotações acaba.
- Tema claro, escuro ou do sistema; uso só com teclado; zoom e telas pequenas.

## Como usar (3 passos)

1. Abra o site e clique em **“carregue uma carteira de exemplo”** para conhecer, ou em “Lançar operação” para começar a sua.
2. Informe tipo, ativo (ex.: `PETR4`, `HGLG11`), data, quantidade, preço por unidade e taxas. Quantidade é número inteiro; preço no formato `30,50`.
3. Em “Alertas de preço” escolha o ativo, “acima” ou “abaixo” e o preço. Se quiser, ative as notificações do navegador.

**Faça backup:** seus dados ficam só neste navegador. Em “Seus dados” use **Exportar tudo (JSON)** de vez em quando. Limpar os dados do site, usar outro navegador ou aparelho, ou o modo privado, apaga ou isola a carteira, e ninguém consegue recuperá-la.

### Como os números são calculados

- **Preço médio:** custo total (quantidade × preço + taxas) ÷ quantidade, ponderado pelas compras.
- **Venda:** o resultado usa o preço médio na hora da venda, descontadas as taxas; o custo restante continua com o mesmo preço médio.
- **Resultado não realizado:** valor atual − custo da posição aberta.
- **Retorno total:** (não realizado + resultado das vendas + proventos) ÷ tudo o que foi comprado. Não considera *quando* cada compra foi feita (não é TWR/XIRR) nem imposto.
- Uma venda maior que a posição na data é recusada.

Veja o que **não** é tratado (desdobramentos, imposto de renda, feriados, alerta com a página fechada etc.) em [docs/LIMITES.md](docs/LIMITES.md).

## Privacidade

Sem conta, sem cookies, sem analytics. Seus lançamentos e alertas ficam no `localStorage` do seu navegador. Com as cotações atrasadas ativas, **só os símbolos** (ex.: PETR4) são pedidos a um servidor de cache; quantidades, preços pagos, datas e alertas nunca saem do navegador. Detalhes na [página de privacidade](https://islan-max.github.io/lastro/privacidade.html).

## Como funciona por dentro

```
site/     página estática (HTML, CSS e JavaScript sem framework) → GitHub Pages
worker/   Cloudflare Worker: cache compartilhado das cotações da brapi (token só no Worker)
tests/    testes do cálculo, do armazenamento e do Worker (node:test)
e2e/      Playwright + axe: acessibilidade nos temas claro e escuro, teclado, reflow, fluxos
docs/     CONTEXTO, VERIFICACAO, LIMITES, DEPLOY
```

- O cálculo é puro (`site/js/carteira.js`) e usa **centavos inteiros**.
- Cotações: [brapi](https://brapi.dev), plano gratuito (atrasado ~30 min, 15.000 consultas/mês, 1 ativo por consulta). O Worker guarda um preço por ativo por cerca de 30 minutos para todo mundo, para não estourar a cota. Dados cortesia da brapi.
- O modo demonstração porta o provedor simulado do laboratório do projeto: o preço é função só do símbolo e do tempo, sem rede.

## Rodar e testar localmente

Requer Node 22+.

```bash
npm test                    # cálculo, armazenamento e Worker
cd e2e && npm ci && npx playwright install chromium && npm test
node e2e/servidor.js        # serve o site em http://localhost:4173/lastro/
```

No Windows, com o Chrome instalado: `LASTRO_BROWSER=chrome npm test` dentro de `e2e/`.

## Qualidade e verificação

O relatório do que passou, falhou e **não foi verificado** está em [docs/VERIFICACAO.md](docs/VERIFICACAO.md). Publicação do site e do Worker: [docs/DEPLOY.md](docs/DEPLOY.md). Fluxo do projeto: issue → branch → PR → CI verde → merge squash.

## Licença

MIT. Sem garantias: use por sua conta e risco e confira seus números com a corretora.
