# Relatório de verificação: Lastro

Modelo: relatório de verificação e checklist de publicação do guia de desenvolvimento. Registra o que passou, o que falhou e o que **não foi verificado**.

## Identificação

- Projeto: `islan-max/lastro` (responsável: islan-max / bazhish).
- Versão: `main` no commit do PR #12 (site publicado a partir dele).
- Ambiente: pré-publicação (Windows com Chrome instalado; GitHub Actions, Ubuntu, Chromium do Playwright) **e endereço final** https://islan-max.github.io/lastro/ (GitHub Pages).
- Data e executor: 05/11/2026, agente de IA com a conta do responsável.
- Escopo: código, 32 testes de unidade, 50 testes de navegador (local, CI e **contra o endereço publicado**), CI, Lighthouse no endereço publicado. **Fora do alcance desta verificação:** o Worker de cotações **não foi implantado** (falta o token da brapi e a conta Cloudflare do responsável), então nenhuma cotação real foi obtida.
- Módulos consultados: S01, S04, S06, S07, S08, S09, Q01, Q02, I01, D01 (aplicáveis); S02, S03, S05, V01–V03 (N/A ou mínimo, abaixo).

`T:` teste de unidade (`npm test`). `E:` teste de navegador (`e2e/`, Playwright + axe). `CI:` GitHub Actions. `I:` inspeção do código.

## Evidências por controle

| ID | Criticidade | Teste ou inspeção | Esperado | Observado | Estado | Evidência |
| --- | --- | --- | --- | --- | --- | --- |
| S01-01 | Bloqueador | gitleaks no histórico completo | Sem segredos no Git | Sem achados | APROVADO | CI (job `security`) |
| S01-02 | Bloqueador | Inspeção + teste | Token da brapi só como segredo do Worker | Nenhum token no repositório; `wrangler.toml` sem valor; `.dev.vars` e `.env*` ignorados; teste confirma que a resposta do Worker não contém o token. O segredo real ainda não foi configurado | APROVADO (parcial) | I, T `worker.test.js` |
| S04-01 | Bloqueador | E: validação dos formulários | Campos inválidos recusados com mensagem e `aria-invalid` | Símbolo, quantidade, preço, data futura, venda maior que a posição, provento sem valor | APROVADO | E `fluxos.spec.js` |
| S04-02 | Bloqueador | T + E: importação de JSON | Arquivo não confiável não corrompe nem substitui dados | Versão, tipos, símbolo malicioso, ids repetidos, tamanho e itens em excesso recusados; campos extras descartados; confirmação antes de substituir | APROVADO | T `armazenamento.test.js`, E |
| S04-03 | Bloqueador | I + E | Dado do usuário ou do servidor nunca vira HTML | Nenhum `innerHTML`/`eval` no site (busca no código); DOM com `textContent`; teste de XSS e de resposta malformada do Worker | APROVADO | I, E |
| S04-04 | Recomendado | T | CSV sem injeção de fórmula | Células iniciadas por `= + - @` recebem apóstrofo | APROVADO | T |
| S06-01 | Bloqueador | T + I | Worker sem dado pessoal em respostas e logs | Só símbolos e preços; o Worker não registra requisições. Logs da plataforma não inspecionados | APROVADO (parcial) | T, I |
| S07-01 | Bloqueador | `curl` no endereço final | HTTPS, redirecionamento de HTTP e HSTS | `http://` responde 301 para `https://`; resposta com `Strict-Transport-Security: max-age=31556952`; CSP presente no HTML publicado. Cabeçalhos próprios (CSP por cabeçalho, `X-Content-Type-Options`) não são possíveis no Pages | APROVADO (parcial) | `curl -sI` em 05/11/2026 |
| S07-02 | Bloqueador | E: CSP por `<meta>` | App funciona sem script/estilo inline; `default-src 'none'` | A CSP já bloqueou, nos testes, estilo inline injetado; o app roda sob ela. O Pages não permite cabeçalhos próprios: `frame-ancestors` e HSTS próprio não são possíveis | APROVADO (parcial) | E |
| S07-03 | Bloqueador | T: cabeçalhos e CORS do Worker | `nosniff`, `no-referrer`, CORS só para a origem do site | Conferido em teste; **não** conferido no endereço do Worker | APROVADO (parcial) | T |
| S08-01 | Recomendado | T | Limite por visitante | 30/min por IP em memória do isolate do Worker | APROVADO (parcial) | T |
| S08-02 | Bloqueador | T | Cota da brapi protegida | Cache, 1 busca por vez, no máx. 3 por chamada, teto de 12.000/mês e 40/hora, 429 da brapi gera pausa, cache negativo | APROVADO | T |
| S08-03 | Recomendado | I | Visitante mal-intencionado não esgota a cota | Pode gastar o teto do mês com símbolos fora do cache (o teto impede passar do plano; o site cai para a demonstração) | FALHOU (limite documentado) | `docs/LIMITES.md` |
| S09-01 | Bloqueador | `npm audit`, I | Dependências sem vulnerabilidade conhecida | Nenhuma dependência de execução; de teste: Playwright e axe, 0 vulnerabilidades | APROVADO | CI, local |
| S09-02 | Recomendado | I | Actions fixadas por SHA | Todas fixadas | APROVADO | `.github/workflows` |
| Q01-01 | Bloqueador | E (50 testes) | Fluxos essenciais | Compra, venda, venda recusada, provento, exclusão com confirmação, alertas, exportar/importar, apagar tudo, persistência, tema, fonte de preços | APROVADO | E, CI |
| Q01-02 | Bloqueador | E: reflow | Sem rolagem horizontal da página em 320, 375 e 640 px (zoom 200%/400%) | Passou nos dois temas; as tabelas rolam dentro de região focável. Achado corrigido durante o trabalho: texto só-leitor fora da região rolável esticava a página | APROVADO | E `teclado-reflow.spec.js` |
| Q01-03 | Bloqueador | E: teclado | Uso só com teclado, foco visível, alvos ≥ 24 px, diálogo com foco preso e devolvido | Passou. O campo de data usa o controle nativo (vários pontos de parada) | APROVADO | E |
| Q01-04 | Bloqueador | E: axe WCAG 2.0/2.1/2.2 A e AA + boas práticas | Zero violações, temas claro e escuro, todas as telas e estados | Passou: vazio, exemplo, erros de formulário, provento, diálogo aberto, alerta disparado, privacidade, 404, fonte real. Achados corrigidos: aviso fora de região, landmarks duplicados. **Automático cobre só parte dos critérios** | APROVADO (parcial) | E `acessibilidade.spec.js`, `cotacoes-reais.spec.js` |
| Q01-05 | Bloqueador | Leitor de tela real (NVDA/VoiceOver) | Fluxos usáveis | — | NÃO VERIFICADO | pendente: responsável |
| Q01-06 | Recomendado | Aparelho físico | Funciona no celular de verdade | Só viewport emulado | NÃO VERIFICADO | pendente: responsável |
| Q01-07 | Recomendado | E: 404, local e no endereço final | Página 404 com status 404 e axe limpo | Passou nos dois | APROVADO | E |
| Q01-08 | Bloqueador | E (50 testes) contra o endereço final | Mesma suíte passa no site publicado | 50 de 50, Chrome, 05/11/2026 | APROVADO | `LASTRO_URL=https://islan-max.github.io/lastro/ npx playwright test` |
| Q02-01 | Recomendado | Lighthouse 13.6 (móvel, simulado) no endereço final | Desempenho e boas práticas medidos | Desempenho 99, acessibilidade 100, boas práticas 100, SEO 100, CLS 0, LCP 1,0 s. A primeira medição, antes do PR #12, deu desempenho 77 por deslocamento de layout (CLS 0,65: texto do aviso mudava com o JavaScript); corrigido | APROVADO | `lighthouse` em 05/11/2026 |
| I01-01 | Bloqueador | Deploy do site (Pages) | Publicado e funcionando no endereço final | Workflow `pages.yml` publica `site/` a cada merge na `main`; endereço responde 200; `privacidade.html` 200; 404 correto | APROVADO | Actions, `curl` |
| I01-02 | Bloqueador | Deploy do Worker | Cotações reais funcionando | **Não implantado**: precisa do token da brapi e da conta Cloudflare do responsável (passos em `docs/DEPLOY.md`) | NÃO VERIFICADO | pendente: responsável |
| I01-03 | Recomendado | Reversão ensaiada | Voltar a versão anterior | Descrita em `docs/DEPLOY.md`; não ensaiada | NÃO VERIFICADO | pendente |
| D01-01 | Bloqueador | E: privacidade | Sem cookies, sem requisições a outros endereços | Cookies vazios; nenhuma requisição externa (modo demonstração) | APROVADO | E |
| D01-02 | Bloqueador | E: URL do pedido ao Worker | Só símbolos saem do navegador | O pedido tem só `s=SÍMBOLOS`; nenhuma data, quantidade ou preço (Worker simulado por rota) | APROVADO (parcial) | E `cotacoes-reais.spec.js` |
| F-01 | Bloqueador | T: 17 testes do cálculo | Preço médio, realizado, proventos, retornos corretos | Casos conferidos, inclusive arredondamento, venda total sem resíduo, venda antes da compra e ordem por data | APROVADO | T |
| F-02 | Bloqueador | E | “Não é recomendação” e “preços com atraso” sempre visíveis | Região de avisos presente com carteira vazia e cheia | APROVADO | E |
| F-03 | Bloqueador | E | Toda cotação mostra origem e horário | “simulado”, “atrasada ~30 min”, “fechamento”, “desatualizada” | APROVADO | E |
| F-04 | Bloqueador | Cotações reais da brapi com o token | Preço real, horário e atraso corretos | **Nenhuma cotação real foi obtida** | NÃO VERIFICADO | pendente: responsável |
| F-05 | Recomendado | Cotação de FII no plano gratuito | Funciona ou falha de forma tratada | O tratamento de erro por ativo está testado; o comportamento real da brapi não | NÃO VERIFICADO | pendente: responsável |
| F-06 | Bloqueador | Termos de uso da brapi | Cache compartilhado dentro dos termos | Só o resumo foi lido (cache e exibição permitidos; revender/espelhar proibido). O texto integral não abriu na ferramenta | NÃO VERIFICADO | pendente: responsável |
| F-07 | Bloqueador | E | Alerta dispara uma vez, avisa na página e notifica | Passou com `Notification` simulada. **Notificação nativa do sistema não verificada** | APROVADO (parcial) | E |
| F-08 | Recomendado | I | Alerta com a página fechada | Fora do v1 (exigiria guardar limites num servidor) | N/A | `docs/LIMITES.md` |
| F-09 | Recomendado | I | Gráfico de evolução | Cortado do v1 para fechar o prazo | N/A | `docs/LIMITES.md` |

## Itens não aplicáveis

| Módulo ou controle | Justificativa | Base para a conclusão |
| --- | --- | --- |
| S02 Autenticação | Não há contas, sessões nem papéis | `docs/CONTEXTO.md`, código |
| S03 Banco e RLS | Não há banco; o KV do Worker só guarda cache de preços por símbolo | `worker/src/nucleo.js` |
| S05 Uploads | O arquivo importado é lido no navegador e nunca enviado | `site/js/app.js` |
| V01 SEO | Página única com título e descrição; sem estratégia de busca | `site/index.html` |
| V02 Rastreamento | Sem `sitemap`, `robots` nem Search Console no v1 | decisão do escopo |
| V03 Identidade | Favicon e rodapé presentes; sem prévia social (Open Graph) no v1 | `site/` |

## Pendências

| Controle | Impacto | O que falta | Responsável | Próxima ação |
| --- | --- | --- | --- | --- |
| I01-02, F-04, F-05 | Sem cotações reais (o site funciona em demonstração) | Token da brapi + conta Cloudflare; implantar o Worker; testar um FII | responsável | Seguir `docs/DEPLOY.md` |
| F-06 | Risco jurídico/operacional do cache compartilhado | Ler os termos de uso integrais ou perguntar ao suporte da brapi | responsável | Plano B: cada pessoa cola o próprio token (sem Worker) |
| Q01-05, Q01-06 | Acessibilidade não confirmada com tecnologia assistiva real | Teste com NVDA/VoiceOver e com celular | responsável | Executar os fluxos de `README.md` |
| I01-03 | Reversão não ensaiada | Ensaiar (reverter um commit na `main` e ver o Pages republicar) | responsável | — |

## Parecer

- **Site estático (modo demonstração): PUBLICADO E VERIFICADO NO ESCOPO**, em https://islan-max.github.io/lastro/, na versão do PR #12. Escopo da afirmação: o que está nas linhas APROVADO acima, no Chrome, em 05/11/2026.
- **Cotações reais: BLOQUEADO** (não publicadas). O Worker não foi implantado e nenhuma cotação real foi obtida (I01-02, F-04, F-05); os termos da brapi não foram lidos na íntegra (F-06). O `<meta name="lastro-worker">` está vazio, então o site publicado só oferece a demonstração e **não promete** preços reais.
- Justificativa: todos os controles bloqueadores do site estático foram aprovados (alguns apenas em parte, como indicado) e nenhum foi reprovado. Os bloqueadores abertos dependem de contas e leituras que só o responsável pode fazer (I01-02, F-04, F-06, Q01-05).
- Limitações: os testes de acessibilidade automatizados não substituem leitor de tela real; a rede do Worker foi simulada; nenhuma cotação real foi obtida; os termos da brapi não foram lidos na íntegra; só o Chrome foi usado (não Firefox nem Safari).
- Este relatório não declara o produto “seguro”, “acessível” nem “conforme” a qualquer norma além do que cada linha registra.
