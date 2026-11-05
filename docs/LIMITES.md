# Limites conhecidos do Lastro

Lista honesta do que o Lastro **não** faz ou faz só em parte. Atualize quando algo mudar.

## O que o Lastro não é

- **Não é recomendação de investimento** nem consultoria. Ele organiza o que você lança; não indica compra, venda nem carteira.
- **Não é declaração de imposto.** Não calcula imposto de renda, DARF, isenção dos R$ 20 mil, prejuízo compensável, day trade nem come-cotas.

## Preços

- **Atraso:** a brapi, no plano gratuito, atualiza a cada ~30 minutos e não é tempo real. Toda cotação mostra a origem e o horário (“atrasada ~30 min, 13:00”, “fechamento de 04/11/2026”, “simulado”).
- **Fora do pregão** (segunda a sexta, 10h–18h, horário de Brasília; feriados **não** são tratados) o preço mostrado é o último fechamento.
- **Cota:** a brapi gratuita dá 15.000 consultas por mês, 1 ativo por consulta e 1 consulta por vez. O servidor de cache compartilha um preço por ativo entre todos, usa um teto de 12.000 por mês e de 40 por hora; acima disso só serve o último preço conhecido (marcado “desatualizada”) ou avisa que a cota acabou. O **modo demonstração** continua funcionando.
- **FIIs e outros ativos** podem não estar no plano gratuito. Quando o serviço recusa, a linha do ativo mostra “sem preço” e o motivo, sem derrubar o resto.
- **Termos da brapi:** o resumo dos termos permite exibir e guardar em cache os dados para os seus usuários e proíbe revender ou espelhar a API para acesso público. O Lastro usa um cache pequeno (só os ativos pedidos, ~30 min) e credita a brapi, mas **a leitura jurídica final dos termos é do mantenedor** (ver `docs/VERIFICACAO.md`).

## Alertas

- Funcionam **só com a página aberta** (a verificação acontece a cada atualização de preço no navegador). Com a página fechada nada é enviado.
- Opções gratuitas avaliadas para alerta com a página fechada: notificação push (exige guardar o endereço de notificação do navegador e seus limites num servidor) e serviços de aviso como ntfy.sh (exige guardar ativo, limite e um tópico num servidor). As duas quebram a promessa “nada seu no servidor” e ficaram **fora do v1**.
- A notificação do navegador depende da sua permissão e do navegador; no celular muitos só mostram notificação a partir de um service worker, que o Lastro não usa. O aviso dentro da página sempre aparece.
- O preço comparado é o **atrasado**, não o de agora: o alerta dispara quando o preço atrasado cruza o limite.

## Cálculo da carteira

- Preço médio ponderado; as taxas informadas entram no custo da compra e abatem a receita da venda. O resultado das vendas usa o preço médio.
- **Não trata** desdobramento, grupamento, bonificação, subscrição, mudança de código nem fusões. Se o ativo passou por um evento assim, ajuste os lançamentos manualmente.
- Quantidade inteira: o mercado fracionário funciona (1 a 99 unidades), mas não há frações de cota.
- “Retorno total” = (resultado das posições abertas + resultado das vendas + proventos) ÷ tudo o que foi comprado. **Não** é rentabilidade ponderada pelo tempo (TWR) nem taxa interna de retorno (XIRR): não leva em conta quando cada compra foi feita.
- Proventos são lançados por você (valor recebido); o Lastro não os busca nem confere.
- Gráfico de evolução: **não implementado no v1** (cortado para fechar o prazo com acessibilidade e testes).

## Dados e navegador

- Seus dados ficam no `localStorage` do navegador. Modo privado, limpeza de dados do site ou troca de navegador/aparelho **apaga ou isola** a carteira. Exporte um backup (JSON) de tempos em tempos; não há sincronização entre aparelhos.
- A importação aceita só o JSON do próprio Lastro (versão 1), até 5 MB e 20.000 itens; arquivo inválido é recusado sem alterar nada.
- Não há login, então ninguém — nem o mantenedor — consegue recuperar uma carteira perdida.

## Servidor de cotações

- O limite por visitante é um contador **em memória de cada instância** do Worker: com várias instâncias cada uma conta sozinha, então não é um limite global rígido. O que protege a cota são o cache, o teto mensal e o teto por hora.
- Alguém mal-intencionado pode, com muitas consultas a símbolos que não estão em cache, **gastar a cota do mês** (o teto impede passar do plano). Nesse caso o site continua útil em modo demonstração, mas sem cotações reais até a virada do mês.
- O cache fica no Cloudflare KV (plano gratuito: limites diários de leitura e gravação, a conferir na documentação vigente do provedor).

## Acessibilidade

- Testado automaticamente com axe (WCAG 2.2 A/AA) nos temas claro e escuro, teclado, reflow até 320 px e espaçamento de texto. **Não** foi testado com leitor de tela real nem em aparelho físico (ver `docs/VERIFICACAO.md`). O campo de data usa o controle nativo do navegador.
