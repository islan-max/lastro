# Publicação do Lastro (tudo gratuito)

## Site (GitHub Pages) — automático

O workflow `.github/workflows/pages.yml` publica a pasta `site/` a cada merge na `main`. Endereço: `https://islan-max.github.io/lastro/`.
Reversão: reverta o commit na `main` (o Pages publica de novo) ou rode o workflow numa versão anterior.

## Cotações reais (Cloudflare Worker) — passos do mantenedor

Requer: conta gratuita da brapi (token) e conta gratuita da Cloudflare. **O token nunca vai para o Git.**

1. Crie o token em https://brapi.dev (plano Gratuito) e leia os termos de uso.
2. Instale e entre: `npx wrangler login` (abre o navegador).
3. Dentro de `worker/`:
   ```bash
   npx wrangler kv namespace create COTACOES
   ```
   Cole o `id` mostrado em `worker/wrangler.toml` (o id do KV não é segredo).
4. Guarde o token como segredo do Worker (o comando pede o valor, que não fica em arquivo):
   ```bash
   npx wrangler secret put BRAPI_TOKEN
   ```
5. Publique:
   ```bash
   npx wrangler deploy
   ```
   O comando mostra o endereço `https://lastro-cotacoes.<sua-conta>.workers.dev`.
6. Em `site/index.html`, preencha `<meta name="lastro-worker" content="https://lastro-cotacoes.<sua-conta>.workers.dev">` e acrescente o mesmo endereço em `connect-src` na CSP da mesma página. Abra um PR com essa mudança.
7. Confira no site publicado: botão “Preços: atrasados (reais)” no topo, preço com horário e “atrasada ~30 min”, e o fallback para a demonstração.

### Conferências depois do deploy

```bash
curl -s "https://lastro-cotacoes.<sua-conta>.workers.dev/saude"
curl -s "https://lastro-cotacoes.<sua-conta>.workers.dev/cotacoes?s=PETR4"
```

Teste também um FII (por exemplo `HGLG11`): o plano gratuito pode não cobrir; o resultado vai em `docs/VERIFICACAO.md`.

### Uso e reversão

- Cota: o painel da brapi mostra o uso do mês; o Worker para de buscar em 12.000.
- Reversão: `npx wrangler rollback` (ou publique a versão anterior). Para desligar as cotações reais, esvazie o `<meta name="lastro-worker">`: o site volta a funcionar só em demonstração.
- Rotação do token: gere outro na brapi e rode `npx wrangler secret put BRAPI_TOKEN` de novo.
