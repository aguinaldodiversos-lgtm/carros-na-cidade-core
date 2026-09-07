# Fase H1.5 — Saneamento da Infraestrutura de Testes

> Execução: 2026-09-07 · Continuação da homologação de 2026-09-06.
> Objetivo: transformar a suíte automatizada num **sinal confiável**.
> Nenhuma regra de negócio foi alterada. `BUG-SEO-01` foi apenas **confirmado**, não corrigido.

---

## 1. Estado inicial (Passo 0)

```
$ git diff --stat
(vazio — nenhum arquivo versionado modificado)
```

`git status --short` e `git ls-files --others --exclude-standard` no início listaram apenas
arquivos **untracked**. Os 12 arquivos criados pela homologação anterior foram conferidos um a um
antes de qualquer alteração — todos presentes, nenhum apagado:

| Arquivo                                                                    | Bytes  |
| -------------------------------------------------------------------------- | ------ |
| `frontend/app/simulador-financiamento/route.test.ts`                       | 4.364  |
| `frontend/app/tabela-fipe/route.test.ts`                                   | 7.330  |
| `frontend/components/financing/FinancingSimulator.test.tsx`                | 6.565  |
| `frontend/e2e/ops-viewport-overflow.spec.ts`                               | 11.742 |
| `frontend/e2e/seo-sitemap-urls.spec.ts`                                    | 7.871  |
| `frontend/e2e/session-persistence-gates.spec.ts`                           | 5.327  |
| `frontend/lib/admin/server-admin-session.test.ts`                          | 8.311  |
| `frontend/lib/favorites/local-favorites.test.ts`                           | 7.292  |
| `tests/auth/auth-service-contract.test.js`                                 | 11.469 |
| `tests/auth/verify-document-contract.test.js`                              | 13.720 |
| `tests/integration/payments-boost-webhook-idempotency.integration.test.js` | 17.924 |
| `reports/homologacao-automatizada-pre-lancamento-2026-09-06.md`            | 66.427 |

---

## 2. Node utilizado

| Item        | Valor                                                                            |
| ----------- | -------------------------------------------------------------------------------- |
| Node        | **v20.20.2** (`engines: >=20 <21` ✔)                                            |
| npm         | 10.8.2 (o que acompanha o Node 20.20.2)                                          |
| Origem      | zip portátil oficial `node-v20.20.2-win-x64.zip` de `nodejs.org`                 |
| Verificação | SHA-256 conferido contra `SHASUMS256.txt` do próprio release: `dc3700fd…bf77` ✔ |
| Instalação  | **nenhuma** — extraído na pasta temporária da sessão e usado via `PATH` local    |

A máquina só tinha Node v25.9.0. A homologação anterior rodou nela; esta rodou **inteira** em Node 20,
como o `engines` exige e como o CI executa.

---

## 3. Arquivos alterados nesta fase

### Alterados (versionados)

| Arquivo                                                                    | O quê                                                                                                                      |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `frontend/playwright.config.ts`                                            | chama o guard de alvo e a detecção de ambiente preparado no load                                                           |
| `frontend/e2e/helpers.ts`                                                  | `requireSeededApi`/`requireSeededLogin`; `WIZARD_STEP_LABELS` + `wizardStepContainer`; `USERS` endurecido contra env vazia |
| `frontend/e2e/full-flow.spec.ts`                                           | **10 `test.skip` removidos** → 0                                                                                           |
| `frontend/e2e/publish-wizard.ts`                                           | locator do passo 1 do wizard                                                                                               |
| `frontend/e2e/main-flow.spec.ts`                                           | desambiguação de "Meus anúncios"                                                                                           |
| `scripts/e2e-seed.mjs`                                                     | +238 linhas: contas, admin, estoque, fotos, marcador                                                                       |
| `package.json`                                                             | `test:integration`, `test:integration:quarantine`, `test:integration:all`, `ci:integration`, `ci:integration:quarantine`   |
| `.github/workflows/ci.yml`                                                 | suíte de integração completa; contas do seed em vez de secrets; `E2E_SEEDED=1`; `AUTH_SESSION_SECRET` removido             |
| `docs/testing/e2e.md`                                                      | guard, contrato de skip, tabela do que o seed cria                                                                         |
| `tests/integration/ads-opportunity.integration.test.js`                    | fixture: `city_id` + `slug`                                                                                                |
| `tests/integration/ads-ranking-base-city-boost.integration.test.js`        | fixture: `city_id` + `slug` + `cityId` que faltava no INSERT                                                               |
| `tests/integration/purchase-intent-offers-concurrency.integration.test.js` | fixture: `blocked_reason_code`                                                                                             |
| `tests/integration/sale-request-offers-concurrency.integration.test.js`    | fixture: rodada 1 + `round_id` na réplica sem lock                                                                         |

### Novos

| Arquivo                                          | O quê                                                            |
| ------------------------------------------------ | ---------------------------------------------------------------- |
| `frontend/test/guards/production-target.ts`      | guard de alvo (produção/staging/local)                           |
| `frontend/test/guards/production-target.test.ts` | 33 testes do guard                                               |
| `frontend/test/guards/seed-state.ts`             | marcador de "ambiente E2E preparado"                             |
| `frontend/test/guards/seed-state.test.ts`        | 15 testes do marcador                                            |
| `scripts/run-integration-tests.mjs`              | runner da suíte de integração completa, com quarentena declarada |
| `frontend/e2e/.gitignore`                        | ignora `.seed-state.json` (artefato local do seed)               |

---

## 4. Guard contra produção (item 1)

`frontend/test/guards/production-target.ts`, chamado por `playwright.config.ts` **antes de carregar
qualquer spec**.

**A parte que importa:** o guard resolve `process.env` **e** os arquivos `.env*` do frontend, na mesma
ordem de precedência que o `next dev` usa. Olhar só para `process.env` deixaria passar exatamente o
cenário perigoso — `process.env` limpo + `.env.local` apontando para produção, que é o estado padrão de
quem clona o repositório.

Variáveis inspecionadas: `NEXT_PUBLIC_API_URL`, `E2E_BACKEND_API_URL`, `BACKEND_API_URL`,
`AUTH_API_BASE_URL`, `API_URL`, `PLAYWRIGHT_BASE_URL`, `BASE_URL`, `NEXT_PUBLIC_SITE_URL`.

Hosts bloqueados: `carrosnacidade.com` (e subdomínios, incluindo `www`) e
`carros-na-cidade-core.onrender.com`. Comparação por **sufixo de domínio**, não `includes` —
`carrosnacidade.com.atacante.net` é recusado como desconhecido, não tratado como produção conhecida.

Permitidos: `localhost`, `127.0.0.1`, `0.0.0.0`, `[::1]`, redes privadas, `*.local` e qualquer host
contendo `staging`. **Contrato reutilizado**, não inventado: são os mesmos `SAFE_PATTERNS` e a mesma
válvula `ALLOW_PRODUCTION=true` de `scripts/staging-antifraud-smoke.mjs`.

Host desconhecido também aborta — fail-closed. A suíte cria contas; presumir "deve ser seguro" é o
erro que o guard existe para impedir.

### Prova de que funciona

```
$ (sem overrides) npx playwright test --list
ProductionTargetError: [e2e-guard] A suíte E2E é DESTRUTIVA (cadastra usuários, publica anúncios) e
o ambiente aponta para alvo não permitido:
  • NEXT_PUBLIC_API_URL = https://carros-na-cidade-core.onrender.com  (producao)
  • BACKEND_API_URL     = https://carros-na-cidade-core.onrender.com  (producao)
  • AUTH_API_BASE_URL   = https://carros-na-cidade-core.onrender.com  (producao)
  • API_URL             = https://carros-na-cidade-core.onrender.com  (producao)

$ (com overrides locais) npx playwright test --list
Total: 278 tests in 34 files
```

**48 testes** cobrem o guard e o marcador (`production-target.test.ts` 33 + `seed-state.test.ts` 15),
incluindo o caso do `.env.local` real do repositório lido do disco.

---

## 5. Mudanças no seed (itens 3 e 5)

`scripts/e2e-seed.mjs` ganhou 238 linhas. Tudo **sintético**; nada de produção. Idempotente: reexecutar
devolve o mesmo estado, sem duplicatas (UPDATE-primeiro, depois INSERT).

| Recurso                                                  | Antes                         | Depois                          |
| -------------------------------------------------------- | ----------------------------- | ------------------------------- |
| `testa@carrosnacidade.com` / `SenhaTesteA123!` (USERS.A) | **não existia**               | PF verificado + advertiser      |
| `testb@carrosnacidade.com` / `SenhaTesteB123!` (USERS.B) | **não existia**               | PF verificado + advertiser      |
| `admin.mod@example.com` / `Admin@12345`                  | **não existia**               | `role = 'admin'`                |
| `cnpj@carrosnacidade.com`                                | senha divergente do spec      | alinhada a `Admin@12345`        |
| Anúncios ativos em Atibaia                               | **3**                         | **11**                          |
| Anúncios com foto                                        | **0** (`images = '[]'` nos 4) | 3 fotos cada                    |
| Slugs de `vehicle-detail-premium`                        | ausentes                      | 3 slugs com **5 / 1 / 0** fotos |
| Marcador de ambiente preparado                           | —                             | `frontend/e2e/.seed-state.json` |

O seed **falha** se Atibaia terminar com menos de 6 anúncios ativos. A suíte de grid exige mais de 4
cards; um seed magro produzia 11 vermelhos que não falavam sobre o grid.

As fotos apontam para arquivos reais em `frontend/public/images/` — servidos pelo próprio Next. Nenhuma
URL externa: teste de galeria não pode depender de rede de terceiros.

---

## 6. Fim do skip silencioso (item 2 — BUG-CI-01)

### O mecanismo

1. `scripts/e2e-seed.mjs` escreve `frontend/e2e/.seed-state.json` com o banco que semeou.
2. `playwright.config.ts` lê o marcador e liga `E2E_SEEDED=1` **se o banco conferir** (marcador de outro
   banco não conta). O CI define a variável diretamente.
3. `requireSeededApi` / `requireSeededLogin` (`frontend/e2e/helpers.ts`): ambiente declarado como
   preparado → **lança**; ambiente não preparado → pula com instrução no lugar do enigma.

### O resultado

| Métrica                             | Antes      | Depois     |
| ----------------------------------- | ---------- | ---------- |
| `test.skip(` em `full-flow.spec.ts` | **10**     | **0**      |
| Testes SKIPPED em `full-flow`       | **6 de 9** | **0 de 9** |
| Testes que realmente executaram     | 3          | **9**      |

### A causa raiz, encontrada e fechada

`.github/workflows/ci.yml` passava `TEST_USER_A_EMAIL: ${{ secrets.E2E_USER_A_EMAIL }}`. Com o secret
ausente o valor chega como **string vazia**, e `process.env.X ?? "default"` **não** substitui `""` —
`USERS.A.email` virava `""`, o login falhava, o teste pulava e o job publicava "E2E full-flow passed".

Duas correções: as contas passaram a vir do seed (secrets removidos do workflow) e `USERS` agora usa
`trim() ||` em vez de `??`.

---

## 7. Locators corrigidos (item 4)

Nenhuma alteração de UI foi feita para satisfazer teste. Todos os pontos abaixo passaram a usar âncoras
que já existiam no produto.

| Onde                                    | Antes                                                                            | Depois                                                                                | Por quê                                                                        |
| --------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `helpers.ts` ×2, `publish-wizard.ts` ×1 | H1 `"Dados do veículo"`                                                          | `[data-testid="wizard-step-container"][data-step="1"]` + `STEP_LABELS[0]` = "Veículo" | a string não existe no produto; o container é estrutural                       |
| `main-flow.spec.ts`                     | `heading /Meus anúncios/`                                                        | `heading level: 1`                                                                    | casava H1 **e** H2 → "resolved to 2 elements"                                  |
| `full-flow.spec.ts`                     | `getByText(/Olá,/).or(heading …)`                                                | idem + `.first()`                                                                     | mesma violação de strict mode                                                  |
| `publish-wizard.ts` passo 1             | `allSelects.nth(2..5)`                                                           | `getByLabel(/^Versão/)`, `/^Cor/`, `/^Câmbio/`, `/^Carroceria/` …                     | a Fase B acrescentou 3 campos obrigatórios e os índices deslizaram             |
| `publish-wizard.ts` passos 2–5          | H1 "Informações do anúncio", "Opcionais", "Condições", "Destaque", "Finalização" | `data-step` 2…5                                                                       | o wizard tem **5** passos, não 7 (StepReview fundiu Destaque + Finalização)    |
| `publish-wizard.ts` publicar            | `button /Publicar anúncio/`                                                      | `data-testid="review-primary-cta"`                                                    | o rótulo muda com o card comercial escolhido                                   |
| `publish-wizard.ts` fotos               | clicava "Continuar" logo após `setInputFiles`                                    | espera a resposta do upload **e** a miniatura                                         | corrida: o wizard recusava — corretamente — com "Adicione pelo menos uma foto" |
| `publish-wizard.ts` contato             | preenchia `(11) 99999-9999` / `(11) 3333-3333`                                   | removido                                                                              | campos do antigo `StepFinalize`; o contato vem do perfil                       |
| `full-flow.spec.ts` teste 2             | sonda de login deixava cookie                                                    | limpa o estado após a sonda                                                           | autenticado, `/login` redireciona e o formulário nunca aparece                 |

---

## 8. Integração: antes e depois (item 6)

### O que estava quebrado, e por quê

| Arquivo                              | Causa (verificada, não inferida)                                                                                              | Resultado             |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| `ads-opportunity`                    | `INSERT INTO advertisers (user_id, name)` — `city_id` e `slug` são NOT NULL desde a baseline 003                              | **corrigido** → 5/5   |
| `ads-ranking-base-city-boost`        | idem + `cityId` era destructurado e **nunca chegava ao INSERT** (SQL com `$1..$6`, lista com 5 valores)                       | **corrigido** → 10/10 |
| `purchase-intent-offers-concurrency` | migration 062 criou `ads_blocked_requires_reason_code`; a fixture gravava `status='blocked'` sem motivo                       | **corrigido** → 15/15 |
| `sale-request-offers-concurrency`    | Fase 4.7 passou a exigir rodada aberta (`getCurrentRound`) e `round_id` NOT NULL; a fixture era anterior ao modelo de rodadas | **corrigido** → 20/20 |
| `seed-cities-geo`                    | **defeito real** — ver BUG-REG-01                                                                                             | quarentena            |
| `migrations-compat`                  | **defeito real** — ver BUG-MIG-01                                                                                             | quarentena            |

Detalhe que vale registrar: em `sale-request-offers-concurrency`, o **teste por mutação** foi quem
avisou. A réplica "sem lock" também deixara de inserir `round_id`, então nenhuma das duas propostas era
gravada e a violação não aparecia — o teste então anunciou _"a versão SEM lock respeitou a regra — o
cenário não é discriminante"_ em vez de passar em silêncio. Era exatamente para isso que ele existia.

### Números

| Recorte                         | Antes                        | Depois                                       |
| ------------------------------- | ---------------------------- | -------------------------------------------- |
| Arquivos executados pelo CI     | **1 de 22** (`ads-pipeline`) | **20 de 22** + 2 em quarentena visível       |
| Arquivos verdes (suíte inteira) | 16 de 22                     | **20 de 22**                                 |
| Testes verdes                   | 312 de 352                   | **348 de 352**                               |
| Conjunto bloqueante do CI       | —                            | **20 arquivos / 339 testes / exit 0 / 140s** |

### Mudanças no CI

- `npm run ci:integration` roda a suíte completa (menos a quarentena) — antes era `ci:integration-ads`,
  um arquivo só.
- Passo extra `continue-on-error: true` roda **a quarentena**, para os dois achados aparecerem em toda
  execução em vez de sumirem da pipeline.
- `scripts/run-integration-tests.mjs` imprime a quarentena com id do achado e motivo a cada execução.
- `--no-file-parallelism`: os arquivos criam e derrubam bancos temporários no mesmo servidor; em paralelo
  se atropelam (8 vermelhos em paralelo vs 6 em série, medido na homologação anterior).

---

## 9. BUG-SEO-01 — **CONFIRMADO** em build de produção (item 7)

Medido **duas vezes**, em `next build` + `next start` e no servidor standalone (`node
.next/standalone/server.js`, que é o que `npm start` executa em produção). Resultado **idêntico**:

```
GET http://127.0.0.1:3000/cidade/atibaia-sp/oportunidades      (sem seguir redirects)

HTTP/1.1 200 OK                                   ← esperado: 308
(sem header Location)                             ← esperado: /cidade/[slug]/abaixo-da-fipe
<title>Carros na Cidade | Marketplace automotivo regional</title>   ← título do LAYOUT RAIZ
<link rel="canonical" href="…/carros-baratos-em/atibaia-sp">        ← canônica de OUTRA página
NEXT_REDIRECT — 2 ocorrências no corpo
16.361 bytes de HTML
```

**Não é artefato do `next dev`.** O `redirect()` de Server Component executa depois de o shell do layout
começar a streamar; para o crawler isso é uma página 200, indexável, canonicalizando para outro lugar.

É o **mesmo padrão** que o projeto já corrigiu uma vez: o comentário de
`frontend/lib/city/territorial-index-redirect.ts` descreve exatamente isto em `/tabela-fipe`, e a solução
adotada lá foi trocar `page.tsx` por **Route Handler**. Esta rota não recebeu o mesmo tratamento.

O teste unitário `frontend/app/cidade/[slug]/oportunidades/page.test.ts` continua verde porque chama a
função da página e observa que `redirect()` foi invocado — prova que o **código chama**, não que a
**resposta HTTP** é um redirect.

**Atenuante:** a URL não está em sitemap (`sitemap-transition.test.ts` a exclui), então o alcance é menor
que no caso do `/tabela-fipe`, que estava em `core.xml`.

**Conforme instruído, NÃO foi corrigido.**

---

## 10. Achados novos (registrados, **não corrigidos**)

### BUG-ENV-01 — o caminho crítico depende de object storage (R2) · **bloqueador do gate**

- **Descoberto por:** `full-flow.spec.ts` teste 8, agora que ele **executa** em vez de pular.
- **Cadeia, medida ponta a ponta:**
  1. `POST /api/ads/upload-images` → **500**; log do backend: `[r2] Variável obrigatória ausente: R2_ACCOUNT_ID`
  2. o BFF cai no fallback local: `[upload-draft-photos] local-fs fallback used`, `errorStages: ['backend-proxy']` → responde **200**
  3. `POST /api/painel/anuncios` → **400** _"Não foi possível confirmar as fotos do anúncio."_
- **Não é defeito de produto.** O backend recusa publicar um anúncio cujas fotos ele não consegue
  confirmar — comportamento correto. O que falta é a dependência.
- **Não há driver local:** `src/infrastructure/storage/` só fala R2/S3. Há menção a MinIO em comentário,
  o que sugere o caminho.
- **Remediação sugerida (NÃO implementada):** subir um MinIO em `docker-compose.test.yml` e apontar
  `R2_ENDPOINT` / `R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_BUCKET_NAME` para
  ele, no ambiente local e no job de E2E do CI. Deixei de fazer porque acrescenta um **serviço novo ao
  ambiente oficial de teste** e você pediu para revisar antes de qualquer coisa entrar.

### BUG-REG-01 — cidade criada após a migration 021 nunca ganha self-row · **P1, defeito real**

- **Teste:** `seed-cities-geo.integration.test.js` — _"cidades sem geo continuam só com self-row (layer 0)"_.
- **Obtido:** 0 linhas em `region_memberships` para a cidade nova; esperado 1.
- **Causa (verificada):** a self-row (`base = member`, layer 0) é criada **apenas** pelo backfill único de
  `021_cities_geo_and_region_memberships.sql`. `scripts/build-region-memberships.mjs` só a **preserva**
  (`DELETE … WHERE member_city_id != base_city_id`) e ignora cidades sem lat/long. Nenhum outro ponto do
  código insere layer 0.
- **Alcance:** toda cidade inserida depois daquela migration — pelo seed do IBGE, pelo admin ou pelo seed
  de E2E — fica sem se pertencer à própria região.

### BUG-MIG-01 — migration 027 não sobe em banco legado com `users.id` UUID · **P2, candidato**

- **Teste:** `migrations-compat.integration.test.js` (2 casos).
- **Erro:** `foreign key constraint "platform_settings_updated_by_fkey" cannot be implemented`.
- **Causa:** `027_platform_settings.sql:29` declara `updated_by BIGINT REFERENCES users(id)`; a fixture
  simula um banco legado com `users.id UUID`. BIGINT → UUID é impossível.
- **Por que fica como candidato:** não dá para decidir a partir do código se algum banco real tem
  `users.id` UUID. Reescrever a fixture para um formato que passe seria trocar a pergunta pela resposta.
- **Terceiro caso do mesmo arquivo:** `plan` é NOT NULL hoje, e a fixture insere `plan = NULL` para
  simular o estado pré-020. Também não foi reescrito, pelo mesmo motivo.

### ENV-01 — `loginRateLimit` impede rodar a suíte E2E duas vezes seguidas

`loginRateLimit` é 10 tentativas / 15 min por IP, **sem override por env**
(`src/shared/middlewares/rateLimit.middleware.js:72`). Em Playwright todo tráfego sai de 127.0.0.1, então
uma execução consome o orçamento da seguinte: a segunda invocação recebe `HTTP 429` e — corretamente,
agora — **falha** em vez de pular.

Contorno usado nesta fase: reiniciar a API entre execuções (o store do limiter é em memória). Não é
defeito; é uma restrição do ambiente que precisa estar escrita, porque o sintoma (429 em massa) parece
regressão de autenticação.

---

## 11. O caminho crítico executou? (item 10)

**Sim.** É a mudança mais importante desta fase.

|                                      | Antes (2026-09-06)           | Depois (2026-09-07)            |
| ------------------------------------ | ---------------------------- | ------------------------------ |
| `full-flow.spec.ts`                  | 3 PASS · **6 SKIP** · 0 FAIL | **8 PASS · 0 SKIP · 1 FAIL**   |
| "login → wizard → publicar → painel" | **SKIPPED** (verde)          | **EXECUTA** (vermelho honesto) |
| Veredito do job                      | ✅ "E2E full-flow passed"    | ❌ falha, com motivo nomeado   |

O teste do caminho crítico agora percorre: login → wizard passo 1 (marca/modelo/versão/anos/cor/câmbio/
carroceria via FIPE real) → passo 2 (preço/km) → passo 3 (upload de foto) → passo 4 (opcionais) →
passo 5 (UF/cidade, termos) → `POST /api/painel/anuncios`.

Ele para no último passo, com **HTTP 400** — porque o ambiente não tem object storage (BUG-ENV-01).
Isso é o comportamento desejado: **o gate falha em vez de fingir que passou**. Com R2/MinIO
disponível, o teste segue até a persistência e o painel.

---

## 12. Reexecução completa (item 9) — Node v20.20.2

| #   | Suíte                          | Comando                                                        | PASS           | FAIL  | SKIP  | Duração | Exit  |
| --- | ------------------------------ | -------------------------------------------------------------- | -------------- | ----- | ----- | ------- | ----- |
| 1   | Unit backend                   | `vitest run --exclude tests/integration/**`                    | **3.680**      | 0     | 1     | 35s     | **0** |
| 2   | Unit/route frontend            | `vitest run` (em `frontend/`)                                  | **3.687**      | 0     | 0     | 70s     | **0** |
| 3   | Integração (conjunto do CI)    | `npm run test:integration`                                     | **339**        | 0     | 0     | 140s    | **0** |
| 3b  | Integração — quarentena        | `npm run test:integration:quarantine`                          | 9              | **4** | 0     | 18s     | 1     |
| 4   | E2E `@smoke`                   | `playwright test --grep @smoke`                                | 5              | **2** | 0     | 19s     | 1     |
| 5   | E2E full-flow (gate do CI)     | `playwright test e2e/full-flow.spec.ts`                        | **8**          | **1** | **0** | ~40s    | 1     |
| 6   | E2E completo                   | `playwright test`                                              | **224**        | 36    | 9     | 13,1min | 1     |
| 7   | Smoke backend                  | `BASE_URL=…:4000 node scripts/smoke.mjs`                       | 13             | 1     | —     | <1s     | 1     |
| 8   | Smoke contrato público (local) | `BASE_URL=…:3000 node scripts/smoke/public-contract-smoke.mjs` | **84**         | 3     | —     | 8s      | 1     |
| 9   | Build de produção              | `next build` (Node 20)                                         | ✔ 65 páginas  | —     | —     | ~3min   | **0** |
| 10  | Confirmação BUG-SEO-01         | `next start` + standalone                                      | **CONFIRMADO** | —     | —     | —       | —     |

Notas honestas sobre os vermelhos:

- **#3b** é quarentena declarada: 4 falhas = BUG-REG-01 (1) + BUG-MIG-01 (3). Achados reais, não regressão.
- **#4 e #5**: as falhas são **a mesma** — BUG-ENV-01, o `POST /api/painel/anuncios` recusando fotos que
  o backend não conseguiu confirmar sem R2.
- **#7**: a única falha é o kill switch `SITEMAP_PUBLIC_ENABLED` (default `false` → 503). Em produção a
  variável é `true`. Já documentado na homologação anterior como BUG-AMB-02.
- O item 5 foi executado **com a API reiniciada antes**, para não herdar o `loginRateLimit` gasto pelo
  item 4 (ver ENV-01).

---

## 13. Skips: antes e depois

| Recorte                             | Antes  | Depois |
| ----------------------------------- | ------ | ------ |
| `test.skip(` em `full-flow.spec.ts` | **10** | **0**  |
| SKIP na execução de `full-flow`     | **6**  | **0**  |
| SKIP na suíte E2E completa          | 13     | **9**  |

Os skips que sobram na suíte completa são **condicionais legítimos**, ligados a funcionalidade opcional
declarada — `critical-pj-flow` (placeholder sem credenciais PJ), `seo-jsonld` (depende de
`VEHICLE_SLUG_FOR_E2E`), `comprar-national-catalog` (pula quando o backend não tem estoque). Nenhum deles
está no caminho crítico, e nenhum foi acrescentado nesta fase.

---

## 14. E2E completo: antes e depois

|                 | Antes (2026-09-06) | Depois (2026-09-07) |
| --------------- | ------------------ | ------------------- |
| Total de testes | 272                | **278**             |
| PASS            | 216                | **224**             |
| FAIL            | 38                 | 36                  |
| SKIP            | 13                 | **9**               |
| Não executados  | 5                  | 9                   |

O número de FAIL quase não mudou, e isso **precisa de explicação honesta**: 36 vermelhos não são os
mesmos 38 de antes.

### O que sumiu

| Cluster                                         | Antes            | Depois                         |
| ----------------------------------------------- | ---------------- | ------------------------------ |
| `catalog-city-clean-grid` (seed com 4 anúncios) | **11**           | **0** ✔                       |
| Publicação parando no passo 1 do wizard         | 5 specs travados | wizard percorre os 5 passos ✔ |
| `full-flow` pulando o caminho crítico           | 6 SKIP           | 0 SKIP ✔                      |

### O que apareceu

**14 falhas por HTTP 429** (`loginRateLimit`), porque a suíte completa rodou logo depois do `@smoke` e
do `full-flow` no mesmo IP. Reexecutando isolado com a API reiniciada, esses testes passam — provado
para `session-persistence-gates`: **4 falhas na suíte completa, 6/6 verdes sozinho**.

### Composição real dos 36 vermelhos

| Causa                                                                 | Testes | Classe                              |
| --------------------------------------------------------------------- | ------ | ----------------------------------- |
| `loginRateLimit` 429 (ENV-01)                                         | **14** | ambiental — some com API reiniciada |
| Kill switch `SITEMAP_PUBLIC_ENABLED` (`seo-sitemap`)                  | 7      | ambiental — em produção é `true`    |
| `vehicle-detail-premium` — spec de componente aposentado (BUG-E2E-03) | 4      | infraestrutura de teste             |
| BUG-ENV-01 (publicação sem R2)                                        | ~5     | dependência de ambiente             |
| BUG-SEO-01 + BreadcrumbList (`seo-jsonld`)                            | 3      | achados de produto já registrados   |
| `dealer-sale-*`, `purchase-intents` (dados de feed)                   | 3      | dados de teste                      |

### BUG-E2E-03 — `vehicle-detail-premium.spec.ts` testa um componente que não é mais montado · **P2**

- **Sintoma:** 4 testes esperam `data-ready="true"` em `[data-testid="vehicle-gallery"]`; timeout.
- **Causa (verificada):** a página de veículo renderiza `VehicleGalleryCarousel`
  (`VehicleDetailView.tsx:103`), que expõe **apenas** `data-testid="vehicle-gallery"`. Os demais
  seletores do spec — `vehicle-gallery-main-image`, `-thumb-N`, `-counter`, `-main-trigger`, `-empty` —
  e o próprio `data-ready` existem só em `frontend/components/vehicle/VehicleGallery.tsx`, que é
  **código órfão**: nenhum arquivo o importa.
- **Por que não corrigi:** não é troca de locator. O spec descreve o modelo de interação de outro
  componente (miniaturas, contador "2 de 5", lightbox); reescrevê-lo exigiria decidir o que o carrossel
  atual promete — decisão de produto, não de teste. O seed já provê os três slugs com 5 / 1 / 0 fotos,
  então o cenário está pronto assim que o contrato for definido.

---

## 15. Controle de diff (itens 13 e 14)

```
$ git diff --stat
 .github/workflows/ci.yml                           |  53 +++-
 docs/testing/e2e.md                                |  61 ++++
 frontend/e2e/full-flow.spec.ts                     |  59 ++--
 frontend/e2e/helpers.ts                            | 129 +++++++--
 frontend/e2e/main-flow.spec.ts                     |   6 +-
 frontend/e2e/publish-wizard.ts                     | 137 +++++++--
 frontend/playwright.config.ts                      |  33 +++
 package.json                                       |   5 +
 scripts/e2e-seed.mjs                               | 238 +++++++++++++++-
 tests/integration/…4 arquivos de fixture…          |  83 +++--
```

**Nada em `src/`, em componentes/páginas de produto, em migrations, em regra de negócio ou em UI.**
Tudo o que mudou é: spec, helper de teste, fixture, seed de teste, runner de teste, workflow de CI e
documentação de QA — exatamente o diff permitido.

`prettier --check` e `tsc --noEmit` passam em todos os arquivos tocados.

### Artefatos de execução revertidos

Rodar a suíte E2E suja dois lugares. Os dois foram limpos:

- **21 PNGs versionados** em `reports/screenshots/fase-4-11{a,b,c}/` — os specs `dealer-*` e
  `active-buyers` capturam para lá. Restaurados com `git checkout -- reports/screenshots/`.
- **15 fotos** em `frontend/public/uploads/ads/`, gravadas pelo fallback local de upload (o caminho que
  o BFF usa quando o R2 não responde). Removidas. O diretório é versionado no repositório (83 arquivos
  já rastreados), então não foi adicionado ao `.gitignore` — essa é uma decisão do projeto, não desta
  fase.

Fica o registro: **qualquer execução da suíte completa suja esses dois caminhos**, e é fácil commitá-los
sem perceber.

**Não houve commit nem push**, conforme instruído.

---

## 16. Classificação final

### **GO COM PENDÊNCIAS**

O que a fase entregou:

| Objetivo                                         | Estado                                                       |
| ------------------------------------------------ | ------------------------------------------------------------ |
| 1 — impedir E2E acidental contra produção        | ✅ guard ativo, 48 testes, prova de bloqueio e de liberação  |
| 2 — remover skips silenciosos do caminho crítico | ✅ 10 → 0; o gate falha em vez de pular                      |
| 3 — corrigir o seed oficial                      | ✅ contas, admin, 11 anúncios, fotos, marcador               |
| 4 — atualizar locators obsoletos                 | ✅ 9 pontos, todos por âncora semântica/estrutural existente |
| 5 — ambiente oficial sustentar a suíte           | ⚠️ **parcial** — falta object storage (BUG-ENV-01)           |
| 6 — integração completa no CI                    | ✅ 1/22 → 20/22 + quarentena visível                         |
| 7 — confirmar BUG-SEO-01                         | ✅ **CONFIRMADO** em build de produção, não corrigido        |
| 8 — Node 20                                      | ✅ v20.20.2 em toda a validação                              |

**Por que não é GO AUTOMATIZADO:** o caminho crítico executa, mas não termina. Falta a dependência de
object storage (BUG-ENV-01). Enquanto ela não existir no ambiente de teste, o gate do CI ficará
vermelho — o que é **melhor** do que o estado anterior (verde por omissão), mas ainda não é um gate que
se pode exigir de toda PR.

### Fila sugerida

1. **BUG-ENV-01** — MinIO em `docker-compose.test.yml` + `R2_*` apontando para ele (local e CI). É o
   único item entre o estado atual e um gate verde de ponta a ponta.
2. **ENV-01** — decidir como a suíte convive com `loginRateLimit`: reiniciar a API entre execuções no
   CI, ou expor um override por env (mudança de produto, fora desta fase).
3. **BUG-REG-01** — self-row de `region_memberships` para cidades novas (defeito real).
4. **BUG-SEO-01** — aplicar o tratamento de `/tabela-fipe` (Route Handler) a
   `/cidade/[slug]/oportunidades`.
5. **BUG-E2E-03** — definir o contrato do carrossel atual e reescrever `vehicle-detail-premium`; e
   decidir o destino do órfão `VehicleGallery.tsx`.
6. **BUG-MIG-01** — decidir se `users.id` UUID é um cenário real; se não for, aposentar os casos.
