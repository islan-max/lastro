# Contexto do projeto (modelo contexto-projeto do guia)

## Produto e ambientes

- Nome, objetivo e responsável: **Lastro**, carteira e alertas de preço da B3 para quem acompanha ações e FIIs sem querer planilha nem app com anúncios e recomendações. Responsável: islan-max (bazhish).
- Tipo: aplicação web estática (local-first) + um Cloudflare Worker de cache de cotações.
- Público e dispositivos esperados: investidor pessoa física brasileiro, celular e desktop, teclado e leitor de tela como requisito de acessibilidade (WCAG 2.2 AA).
- Fluxos essenciais e critérios de sucesso: lançar compra/venda/provento; ver posição, preço médio, resultado não realizado, realizado e proventos; criar alerta de preço e ser avisado com a página aberta; exportar e importar os dados; usar o modo demonstração sem rede. Sucesso = números conferidos por teste e fluxos usáveis só com teclado.
- Conteúdo público, privado e administrativo: tudo público (código e site). Os dados da carteira ficam só no navegador de quem usa. Não há área administrativa.
- Domínios e ambientes: GitHub Pages (`https://islan-max.github.io/lastro/`) e Worker em `workers.dev` (endereço: desconhecido até o deploy).
- Escopo autorizado: o usuário aprovou o plano e o nome em 29/10/2026 e pediu para continuar em 05/11/2026.

## Implementação real

- Repositório: https://github.com/islan-max/lastro (MIT). Instruções locais: `CLAUDE.md`.
- Runtime: HTML, CSS e JavaScript (ES modules) sem framework nem bundler; Node 24 só para testes e ferramentas.
- Comandos: `npm test` (node:test).
- Autenticação, papéis, banco, upload: nenhum (N/A).
- Hospedagem e publicação: GitHub Pages por workflow; Worker por `wrangler` (login do usuário).
- Serviços externos: **brapi** (cotações atrasadas, plano gratuito, token no Worker); Cloudflare (Worker e KV, plano gratuito).
- Variáveis sensíveis: `BRAPI_TOKEN` (segredo do Worker; nunca no git).

## Dados e operação

- Dados coletados: nenhum no servidor além dos símbolos pedidos ao Worker (sem identificação). Carteira, alertas e preferências ficam no `localStorage`.
- Cookies e medição: nenhum cookie, nenhum analytics.
- Indexação: página única pública, título e descrição; sem Search Console.
- Limites de custo, tráfego e disponibilidade: brapi gratuito = 15.000 requisições/mês, 1 ativo por requisição, 1 requisição simultânea, ~30 min de atraso, histórico de 3 meses. Cloudflare Workers gratuito (limites diários a reconferir na documentação oficial).
- Backup e reversão: o usuário exporta o JSON; o site volta para o commit anterior pelo Pages.
- Requisitos adicionais: avisar sempre que não é recomendação de investimento e que os dados têm atraso.

## Seleção e decisões

| Módulo | Aplicável? | Motivo ou gatilho encontrado |
| --- | --- | --- |
| S01 | Sim | Token da brapi no Worker; Git público |
| S02 | N/A | Sem contas nem sessões |
| S03 | N/A | Sem banco de dados (KV só guarda cache de preços) |
| S04 | Sim | Formulários e importação de JSON/CSV são entrada não confiável |
| S05 | N/A | O arquivo importado é lido no navegador e nunca enviado |
| S06 | Sim | Respostas e logs do Worker não podem conter dados da carteira |
| S07 | Sim | HTTPS, CSP e cabeçalhos no Pages e no Worker |
| S08 | Sim | Limite por visitante e teto da cota da brapi no Worker |
| S09 | Sim | Ferramentas de desenvolvimento (Playwright, axe, wrangler) |
| Q01 | Sim | Celular, teclado, formulários, 404 |
| Q02 | Sim | Página leve, sem bibliotecas no navegador |
| I01 | Sim | Deploy gratuito, cota e reversão |
| V01–V03 | Mínimo | Título, descrição, favicon e prévia; sem SEO ativo |
| D01 | Sim | Sem cookies e sem analytics; só `localStorage` |

| Decisão | Justificativa | Evidência/fonte | Data |
| --- | --- | --- | --- |
| Local-first, sem conta | Custo zero e nenhum dado pessoal no servidor | plano aprovado | 29/10/2026 |
| Cache de cotações num Worker | A brapi gratuita dá 1 ativo por requisição e 15.000/mês | brapi.dev/pricing | 29/10/2026 |
| Preços em centavos inteiros | Evita erro de ponto flutuante | `site/js/moeda.js` | 05/11/2026 |
| Alerta com a página fechada fica fora do v1 | As opções gratuitas exigiriam guardar limites no servidor | `docs/LIMITES.md` | 29/10/2026 |
| Sem IA | Desnecessária; GitHub Models foi descontinuado | pedido do usuário | 29/10/2026 |
