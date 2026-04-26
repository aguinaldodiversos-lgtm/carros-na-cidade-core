# Baseline de métricas — 2026-04-24

| Campo              | Valor                                                                                                          |
| ------------------ | -------------------------------------------------------------------------------------------------------------- |
| **Versão**         | 1 (template — coleta pendente)                                                                                 |
| **Data planejada** | 2026-04-24 (PR A)                                                                                              |
| **Branch**         | `claude/sad-elbakyan-8155e1`                                                                                   |
| **Status**         | ⏳ Template — métricas reais pendem de coleta com Lighthouse rodando contra prod (ou staging que reflita prod) |
| **Referência**     | [DIAGNOSTICO_REDESIGN.md](./DIAGNOSTICO_REDESIGN.md) §17                                                       |

---

## 0. Por que este documento existe

Antes de qualquer PR visual (D em diante), precisamos de **baseline de métricas** para:

1. Bloquear PRs que degradem performance (LCP, CLS, TBT, Lighthouse score).
2. Comparar contra contrato de §12 do diagnóstico:
   - LCP < 2.5s
   - CLS < 0.1
   - TBT < 200ms
   - Lighthouse Performance > 80
   - SEO > 95
   - A11y > 90
   - Bundle JS crítico < 200 KB
3. Evidenciar ganhos do redesign para stakeholders.

**Sem este baseline, o contrato de performance (§12) não tem âncora**.

---

## 1. URLs a medir (mínimo 10)

Selecionadas por: tráfego (estimado), criticidade SEO, e cobertura das páginas intocáveis (§5 do diagnóstico).

| #   | URL                                | Por que medir                         | Esperado                             |
| --- | ---------------------------------- | ------------------------------------- | ------------------------------------ |
| 1   | `/`                                | Cabeça de funil                       | LCP < 2.5s, Perf > 75                |
| 2   | `/anuncios`                        | Listagem canônica                     | LCP < 2.5s, Perf > 75                |
| 3   | `/cidade/atibaia-sp`               | Territorial canônica                  | LCP < 2.5s, Perf > 75                |
| 4   | `/cidade/atibaia-sp/marca/honda`   | Territorial profundidade 2            | LCP < 2.8s                           |
| 5   | `/cidade/atibaia-sp/oportunidades` | Territorial alta densidade            | LCP < 2.8s                           |
| 6   | `/veiculo/<slug-real>`             | Página de conversão #1                | LCP < 2.5s, Perf > 80 (alvo crítico) |
| 7   | `/comprar/cidade/atibaia-sp`       | Alias paralelo (a consolidar em PR J) | Medir mas atenção: rota muda         |
| 8   | `/carros-em/atibaia-sp`            | SEO de palavra-chave                  | LCP < 2.5s                           |
| 9   | `/blog`                            | Blog index                            | LCP < 2.5s, Perf > 80                |
| 10  | `/tabela-fipe`                     | Isca digital                          | LCP < 2.5s                           |

**Bonus** (capturar se houver tempo):

| #   | URL                                 | Por quê                                   |
| --- | ----------------------------------- | ----------------------------------------- |
| 11  | `/simulador-financiamento`          | Isca digital                              |
| 12  | `/login`                            | Fluxo crítico de auth                     |
| 13  | `/dashboard/meus-anuncios` (logado) | Painel — exige auth, capturar manualmente |

---

## 2. Como coletar

### 2.1. Ferramenta primária: Lighthouse mobile

**Configuração**:

- Modo: `Mobile`
- Device: `Moto G Power` (default Lighthouse mobile)
- Throttling: `Slow 4G` (default)
- CPU slowdown: 4× (default)
- Categorias: Performance, Accessibility, Best Practices, SEO

**Comando local** (para cada URL):

```
npx lighthouse <URL> \
  --preset=mobile \
  --output=json \
  --output=html \
  --output-path=./reports/lighthouse/<slug>-2026-04-24
```

**Comando CI** (sugestão para `package.json`):

```json
"lh:home": "lighthouse https://carrosnacidade.com/ --preset=mobile --output=json --output-path=./reports/lighthouse/home.json"
```

### 2.2. Ferramenta secundária: bundle analyzer

```bash
ANALYZE=true npm run build
```

Requer adicionar `@next/bundle-analyzer` no `next.config.mjs` (item de PR A — ainda pendente, este doc registra que o analyzer não está configurado).

### 2.3. Métricas de backend (Render)

Coletar manualmente do dashboard Render:

- 429 rate limit (últimos 7 dias)
- 5xx rate (últimos 7 dias)
- Tempo médio de resposta SSR
- Cold start frequency

### 2.4. Métricas de SEO (Search Console)

- Páginas indexadas (total)
- Erros de crawl (últimos 30 dias)
- Páginas com canonical inconsistente

---

## 3. Tabela de baseline (a preencher)

> **Nota**: as células marcadas `TBD` devem ser preenchidas executando Lighthouse em produção. Recomendado: rodar 3× cada URL e usar mediana.

### 3.1. Performance mobile

| URL                                | Perf | LCP (s) | CLS | TBT (ms) | FCP (s) | SI (s) | TTI (s) |
| ---------------------------------- | ---: | ------: | --: | -------: | ------: | -----: | ------: |
| `/`                                |  TBD |     TBD | TBD |      TBD |     TBD |    TBD |     TBD |
| `/anuncios`                        |  TBD |     TBD | TBD |      TBD |     TBD |    TBD |     TBD |
| `/cidade/atibaia-sp`               |  TBD |     TBD | TBD |      TBD |     TBD |    TBD |     TBD |
| `/cidade/atibaia-sp/marca/honda`   |  TBD |     TBD | TBD |      TBD |     TBD |    TBD |     TBD |
| `/cidade/atibaia-sp/oportunidades` |  TBD |     TBD | TBD |      TBD |     TBD |    TBD |     TBD |
| `/veiculo/<slug>`                  |  TBD |     TBD | TBD |      TBD |     TBD |    TBD |     TBD |
| `/comprar/cidade/atibaia-sp`       |  TBD |     TBD | TBD |      TBD |     TBD |    TBD |     TBD |
| `/carros-em/atibaia-sp`            |  TBD |     TBD | TBD |      TBD |     TBD |    TBD |     TBD |
| `/blog`                            |  TBD |     TBD | TBD |      TBD |     TBD |    TBD |     TBD |
| `/tabela-fipe`                     |  TBD |     TBD | TBD |      TBD |     TBD |    TBD |     TBD |

### 3.2. SEO mobile

| URL                  | SEO | A11y | Best Practices | Tem `<h1>` único? | Canonical correto? |
| -------------------- | --: | ---: | -------------: | ----------------- | ------------------ |
| `/`                  | TBD |  TBD |            TBD | TBD               | TBD                |
| `/anuncios`          | TBD |  TBD |            TBD | TBD               | TBD                |
| `/cidade/atibaia-sp` | TBD |  TBD |            TBD | TBD               | TBD                |
| `/veiculo/<slug>`    | TBD |  TBD |            TBD | TBD               | TBD                |

### 3.3. Bundle (build local)

| Métrica                           | Valor (TBD)     |
| --------------------------------- | --------------- |
| Total JS bundle (gzip)            | TBD KB          |
| Total JS bundle (raw)             | TBD KB          |
| Largest chunk                     | TBD (nome + KB) |
| First Load JS — `/`               | TBD KB          |
| First Load JS — `/veiculo/[slug]` | TBD KB          |
| First Load JS — `/anuncios`       | TBD KB          |

### 3.4. Backend (últimos 7 dias)

| Métrica                          | Valor (TBD) |
| -------------------------------- | ----------- |
| 429 rate limit total             | TBD         |
| 5xx total                        | TBD         |
| Tempo médio SSR                  | TBD ms      |
| Cold start frequency             | TBD/dia     |
| Hits em rotas inexistentes (404) | TBD         |

### 3.5. SEO global (Search Console)

| Métrica                      | Valor (TBD) |
| ---------------------------- | ----------- |
| Páginas indexadas            | TBD         |
| Páginas excluídas (erro)     | TBD         |
| Cliques (últimos 28 dias)    | TBD         |
| Impressões (últimos 28 dias) | TBD         |
| CTR médio                    | TBD%        |
| Posição média                | TBD         |

---

## 4. Diff contra metas do contrato (§12)

A tabela abaixo é preenchida após coleta. **Cada linha que falhar é dívida técnica conhecida que o redesign deve resolver**.

| Métrica                  | Meta (§12) | Baseline atual | Status | Ação |
| ------------------------ | ---------- | -------------- | ------ | ---- |
| LCP mobile médio         | < 2.5s     | TBD            | TBD    | TBD  |
| CLS mobile médio         | < 0.1      | TBD            | TBD    | TBD  |
| TBT mobile médio         | < 200ms    | TBD            | TBD    | TBD  |
| Lighthouse Performance   | > 80       | TBD            | TBD    | TBD  |
| Lighthouse SEO           | > 95       | TBD            | TBD    | TBD  |
| Lighthouse A11y          | > 90       | TBD            | TBD    | TBD  |
| Bundle JS crítico (gzip) | < 200 KB   | TBD            | TBD    | TBD  |
| 429 rate limit (7d)      | 0          | TBD            | TBD    | TBD  |
| Tempo médio SSR          | < 2s       | TBD            | TBD    | TBD  |
| Taxa de 5xx SSR          | < 0.5%     | TBD            | TBD    | TBD  |

---

## 5. Regras de uso deste baseline

1. **Cada PR visual (D em diante) compara contra esta tabela**.
2. **Regressão de qualquer métrica `> 5%` exige justificativa no PR**.
3. **Regressão `> 15%` bloqueia merge automaticamente**.
4. **Após cada PR, rodar a mesma medição** e atualizar com o novo baseline (criar `baseline-metrics-YYYY-MM-DD.md` para cada release).
5. **Não substituir este arquivo** — ele é histórico. Versões futuras viram arquivos novos com data própria.

---

## 6. Coleta — quem e quando

| Item                                     | Responsável                                                                      | Quando                       |
| ---------------------------------------- | -------------------------------------------------------------------------------- | ---------------------------- |
| Coleta inicial Lighthouse de §3.1 e §3.2 | Operador (manual)                                                                | Antes de fechar PR A         |
| Bundle analysis (§3.3)                   | Adicionar `@next/bundle-analyzer` ao projeto, rodar `ANALYZE=true npm run build` | Em PR B (testes de proteção) |
| Backend metrics (§3.4)                   | Operador puxa do Render                                                          | Antes de PR D                |
| Search Console (§3.5)                    | Operador puxa do GSC                                                             | Antes de PR D                |
| Diff contra metas (§4)                   | Atualizar este doc                                                               | Após coleta                  |

---

## 7. Próximos passos

1. **PR A**: este arquivo entregue como template. Coleta real pode acontecer em paralelo ao review.
2. **PR B**: `@next/bundle-analyzer` adicionado, baseline de bundle preenchido.
3. **PR D em diante**: cada PR atualiza tabela §3 com nova medição comparando contra esta.

---

**Fim do template de baseline.**
