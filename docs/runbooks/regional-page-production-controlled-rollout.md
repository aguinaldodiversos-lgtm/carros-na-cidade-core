# Ativação Controlada da Página Regional em Produção

> **Status:** runbook executável. Cobre Fase C do
> [`regional-page-rollout.md`](regional-page-rollout.md) (ativação em
> produção mantendo `noindex,follow`, sem sitemap, sem self-canonical).
>
> **Premissa explícita:** o portal está em desenvolvimento e **não há
> staging separado**. A validação é feita direto em produção atrás da
> feature flag `REGIONAL_PAGE_ENABLED`, com rollback por flag em
> ≤ 1 minuto.
>
> **Não cobre Fase D.** Sitemap continua dormente, robots permanece
> `noindex,follow`, canonical continua apontando para a cidade-base.
> Promover para Fase D (indexação) exige aprovação SEO formal +
> auditoria das 7 rotas territoriais existentes — escopo separado.

---

## 0. Pré-requisitos

- Branch `main` atualizada (último commit deve incluir migration 027 e o
  smoke `smoke:regional-page`).
- Acesso ao painel Render dos services `carros-na-cidade-portal`
  (frontend) e `carros-na-cidade-api` (backend) — nomes podem variar.
- Acesso ao Postgres de produção (Render Shell ou `psql` direto via
  connection string).
- `INTERNAL_API_TOKEN` igual nos dois services (já validado em rollouts
  anteriores).
- Node 20+ no laptop para rodar o smoke.

---

## 1. Pré-checks (executar ANTES de mexer em qualquer flag)

### 1.1 Confirmar branch e deploy

```powershell
git fetch origin main
git log -1 --oneline origin/main
```

```bash
git fetch origin main
git log -1 --oneline origin/main
```

O último commit deve ser o do smoke (`feat(smoke): smoke HTTP da Pagina
Regional para Fase B em staging`) ou posterior. Se não for, garantir que
o último deploy do Render reflete `main`.

### 1.2 Confirmar que a flag está ausente/false em produção

No painel Render do service do **frontend**:
- Settings → Environment → Variables.
- Confirmar que `REGIONAL_PAGE_ENABLED` está **ausente** OU igual a
  qualquer valor diferente da string exata `"true"` (`"false"`, `"True"`,
  vazio, etc. — todos resolvem para flag desligada por contrato estrito).

### 1.3 Confirmar que a rota retorna 404 com flag desligada

Smoke automatizado contra produção com `EXPECT_FLAG=off`:

```powershell
$env:STAGING_PUBLIC_BASE_URL="https://carros-na-cidade-portal.onrender.com"
$env:ALLOW_PRODUCTION="true"
$env:EXPECT_FLAG="off"
npm run smoke:regional-page
```

```bash
STAGING_PUBLIC_BASE_URL=https://carros-na-cidade-portal.onrender.com \
  ALLOW_PRODUCTION=true \
  EXPECT_FLAG=off \
  npm run smoke:regional-page
```

**Esperado:** PASS de 404 para `atibaia-sp`, `campinas-sp`, `sao-paulo-sp`
e para o slug inexistente. Se vier 200 em qualquer um, a flag já está
ligada — investigar antes de prosseguir.

### 1.4 Confirmar que a migration 027 foi aplicada

A migration roda automaticamente no boot do backend
(`RUN_MIGRATIONS=true` é default). Conferir manualmente no Postgres:

```sql
-- Existência da tabela
SELECT to_regclass('public.platform_settings') AS exists_table;

-- Seed inicial presente
SELECT key, value, description, updated_at
FROM platform_settings
WHERE key = 'regional.radius_km';

-- Histórico de migrations aplicadas
SELECT name, applied_at
FROM schema_migrations
WHERE name LIKE '027_%'
ORDER BY applied_at DESC
LIMIT 1;
```

**Esperado:**
- `exists_table = platform_settings` (não `NULL`).
- 1 linha com `key = regional.radius_km`, `value = 80`.
- `name = 027_platform_settings.sql` aplicada.

Se a migration não rodou (deploy não reiniciou ou
`RUN_MIGRATIONS=false`):

```bash
# No Render Shell do backend, ou local com env de produção:
npm run db:migrate
```

### 1.5 Confirmar quantas cidades estão sem coordenadas geográficas

Crítico: se houver buracos grandes, o haversine (raio 80 km) cai no
fallback `region_memberships` (≤60 km hardcoded), e a Página Regional
não vai refletir o raio configurado.

```sql
SELECT COUNT(*) AS cidades_sem_geo
FROM cities
WHERE latitude IS NULL OR longitude IS NULL;

SELECT state, COUNT(*) AS cidades_sem_geo
FROM cities
WHERE latitude IS NULL OR longitude IS NULL
GROUP BY state
ORDER BY cidades_sem_geo DESC
LIMIT 10;
```

**Decisão por resultado:**
- `cidades_sem_geo = 0` → ideal, prosseguir.
- `cidades_sem_geo > 0` mas as 3 cidades do smoke (Atibaia, Campinas,
  São Paulo) têm coordenadas → prosseguir, anotar para popular depois:
  ```sql
  SELECT slug, name, state, latitude, longitude
  FROM cities
  WHERE slug IN ('atibaia-sp', 'campinas-sp', 'sao-paulo-sp');
  ```
  As três precisam ter `latitude` e `longitude` não-nulos.
- Se alguma das 3 estiver sem geo → rodar `npm run seed:cities-geo` no
  backend antes de ligar a flag.

### 1.6 Confirmar `region_memberships` populado (fallback)

```sql
SELECT COUNT(*) AS total_memberships,
       COUNT(*) FILTER (WHERE layer = 1) AS layer_1,
       COUNT(*) FILTER (WHERE layer = 2) AS layer_2
FROM region_memberships;
```

**Esperado:** `total_memberships > 0` e ambas as camadas populadas. Se
zerado, rodar `npm run regions:build` no backend. Sem isso, cidades sem
lat/lon ficam com `members: []`.

### 1.7 Smoke da API interna

Independente da Fase C, valida que o BFF privado está saudável:

```powershell
$env:INTERNAL_API_TOKEN="<token-do-Render>"
$env:API_BASE_URL="https://carros-na-cidade-api.onrender.com"
npm run smoke:regions
```

```bash
INTERNAL_API_TOKEN=<token-do-Render> \
  API_BASE_URL=https://carros-na-cidade-api.onrender.com \
  npm run smoke:regions
```

**Esperado:** 4/4 PASS.

---

## 2. Ativação

### 2.1 Configurar a flag no Render (frontend)

Painel Render → service `carros-na-cidade-portal` → Settings →
Environment → **Add Environment Variable**:

| Key | Value | Sync |
|---|---|---|
| `REGIONAL_PAGE_ENABLED` | `true` | OFF |

**Notas:**
- Valor é a string exata `true` (lowercase, sem aspas, sem espaço).
  Qualquer outro valor (`"True"`, `"1"`, `"yes"`) é tratado como
  desligado (contrato estrito de `isRegionalPageEnabled()`).
- Sync = OFF para evitar replicação acidental para outro environment.
- **Não** prefixar com `NEXT_PUBLIC_*` — vazaria no bundle JS público.

### 2.2 Disparar redeploy

O Render dispara restart automático ao salvar uma env var. Se não
disparar, fazer **Manual Deploy → Deploy latest commit** (ou `Clear
build cache & deploy` se for a primeira vez do binding).

### 2.3 Aguardar deploy concluir

No painel Render → Events: aguardar status **Live** no novo deploy.
Pode levar 2–5 min dependendo do build.

---

## 3. Smoke pós-ativação

```powershell
$env:STAGING_PUBLIC_BASE_URL="https://carros-na-cidade-portal.onrender.com"
$env:ALLOW_PRODUCTION="true"
$env:EXPECT_FLAG="on"
npm run smoke:regional-page
```

```bash
STAGING_PUBLIC_BASE_URL=https://carros-na-cidade-portal.onrender.com \
  ALLOW_PRODUCTION=true \
  EXPECT_FLAG=on \
  npm run smoke:regional-page
```

**Esperado (todos PASS):**
- status `200` para os 3 slugs default
- robots `noindex,follow` em todas as 3
- canonical → `/carros-em/<slug>` em todas as 3 (não self-canonical)
- conteúdo essencial presente (título "região de", nome cidade, raio em km)
- anúncios renderizados OU fallback profissional
- chips de cidades vizinhas (ou suprimidos com motivo se cidade
  isolada)
- 404 para slug inexistente

**Se algum FAIL:** ir direto para a seção 5 (Rollback) e investigar
sem deixar a página exposta.

### 3.1 Smoke do admin (opcional, valida o painel)

Sem PATCH (só lê):

```powershell
$env:STAGING_PUBLIC_BASE_URL="https://carros-na-cidade-portal.onrender.com"
$env:STAGING_BASE_URL="https://carros-na-cidade-api.onrender.com"
$env:STAGING_ADMIN_EMAIL="<seu-email-admin>"
$env:STAGING_ADMIN_PASSWORD="<senha>"
$env:ALLOW_PRODUCTION="true"
npm run smoke:regional-page
```

```bash
STAGING_PUBLIC_BASE_URL=https://carros-na-cidade-portal.onrender.com \
  STAGING_BASE_URL=https://carros-na-cidade-api.onrender.com \
  STAGING_ADMIN_EMAIL=<seu-email-admin> \
  STAGING_ADMIN_PASSWORD=<senha> \
  ALLOW_PRODUCTION=true \
  npm run smoke:regional-page
```

**Esperado:** o step `[admin] login` e `[admin] GET regional-settings`
PASS, mostrando `radius_km=80`.

**Não defina `STAGING_ALLOW_PATCH=true` em produção** sem necessidade
explícita — o round-trip muda o radius e restaura, o que polui o
audit_log e o cache Redis.

---

## 4. Validação manual

Abrir cada URL no browser logado como usuário comum:

- https://carros-na-cidade-portal.onrender.com/carros-usados/regiao/atibaia-sp
- https://carros-na-cidade-portal.onrender.com/carros-usados/regiao/campinas-sp
- https://carros-na-cidade-portal.onrender.com/carros-usados/regiao/sao-paulo-sp

### 4.1 Checklist por cidade

- [ ] Página retorna 200, layout coerente (header, footer, grid de cards
      = mesmo padrão da página de cidade).
- [ ] Título "Carros usados na região de [Cidade]" visível.
- [ ] Subtítulo menciona "em até 80 km" (ou o valor configurado).
- [ ] Chips de cidades vizinhas aparecem; cidade-base destacada com
      selo "base".
- [ ] DevTools → Elements → `<head>`:
  - `<meta name="robots" content="noindex,follow">`
  - `<link rel="canonical" href=".../carros-em/<slug>">` (NÃO
    self-canonical)
- [ ] DevTools → Network → buscar `/api/ads/search`:
  - query string contém `city_slugs=<base>,<vizinha1>,<vizinha2>...`
  - `<base>` é a primeira da lista
  - chips visualmente: anúncios da base aparecem antes dos das
    vizinhas dentro da mesma faixa de plano comercial
- [ ] Não aparecem cidades de UF diferente da base.
- [ ] Se não houver anúncios → fallback profissional ("Ainda não
      encontramos veículos nesta região...").
- [ ] **Nenhum** card com `R$ 0` ou placeholder falso.

### 4.2 Verificar admin radius

- [ ] `https://carros-na-cidade-portal.onrender.com/admin/regional-settings`
      abre e mostra `radius_km = 80`.
- [ ] Alterar para `50` → "Salvo com sucesso".
- [ ] Recarregar `/carros-usados/regiao/atibaia-sp` (esperar 5 min ou
      forçar revalidação) → lista de cidades encolhe.
- [ ] Restaurar para `80` → "Salvo com sucesso".

> Cache Redis 5 min + cache Next 5 min: a mudança pode levar até ~10
> min para refletir em produção. UI do admin avisa.

### 4.3 Confirmar que sitemap continua dormente

```bash
curl -s https://carros-na-cidade-portal.onrender.com/sitemap.xml | grep -c "carros-usados/regiao"
```

```powershell
(Invoke-WebRequest "https://carros-na-cidade-portal.onrender.com/sitemap.xml").Content | Select-String -Pattern "carros-usados/regiao" | Measure-Object | Select-Object -ExpandProperty Count
```

**Esperado: 0** ocorrências. A rota regional NÃO deve aparecer no
sitemap em Fase C.

### 4.4 Confirmar que CTA cidade → regional aparece

- [ ] `/cidade/atibaia-sp` mostra link "Ver carros na região de Atibaia"
      ao final da página.
- [ ] Clicar abre `/carros-usados/regiao/atibaia-sp` corretamente.

---

## 5. Rollback (≤ 1 min de exposição)

Se qualquer FAIL no smoke ou problema na validação manual:

### 5.1 Desligar a flag

Painel Render → service do frontend → Settings → Environment:
- **Remover** `REGIONAL_PAGE_ENABLED` (preferível) **ou** alterar para
  qualquer valor diferente de `true` (ex.: `false`).

### 5.2 Forçar restart do service

Salvar a alteração dispara restart automático. Se não disparar, **Manual
Deploy → Deploy latest commit**.

### 5.3 Confirmar 404

```powershell
$env:STAGING_PUBLIC_BASE_URL="https://carros-na-cidade-portal.onrender.com"
$env:ALLOW_PRODUCTION="true"
$env:EXPECT_FLAG="off"
npm run smoke:regional-page
```

```bash
STAGING_PUBLIC_BASE_URL=https://carros-na-cidade-portal.onrender.com \
  ALLOW_PRODUCTION=true \
  EXPECT_FLAG=off \
  npm run smoke:regional-page
```

**Esperado:** 404 PASS para os 3 slugs e para o inexistente.

### 5.4 Pós-rollback

- [ ] Flag desligada confirmada por smoke.
- [ ] Documentar o motivo do rollback e o resultado do FAIL para
      diagnóstico (anexar saída do smoke + screenshot da DevTools).
- [ ] Abrir issue/PR de fix antes de tentar de novo.

---

## 6. O que continua proibido durante esta fase

Mesmo com a flag ligada em produção, **NÃO** alterar:

- ❌ Sitemap regional (`/sitemaps/regiao/[state].xml` continua dormente
  ou alimentado apenas com anúncios/cidades, NUNCA com URLs
  `/carros-usados/regiao/...`).
- ❌ Robots da regional (`noindex,follow` permanece — Fase C).
- ❌ Canonical (continua apontando para `/carros-em/<slug>`, NÃO
  self-canonical).
- ❌ Links em home/footer/header apontando para a regional. Único
  ponto de entrada permitido nesta fase é o CTA gated em
  `/cidade/[slug]`.
- ❌ Canonicalização de `/carros-em/[slug]` ou `/cidade/[slug]` para a
  regional.
- ❌ Promoção para Fase D sem aprovação SEO formal e auditoria
  prévia das 7 rotas territoriais existentes.

---

## 7. Quando promover para Fase D

A promoção depende de evidência operacional, não de decisão
unilateral. Critérios mínimos (cumprir TODOS):

1. Smoke `EXPECT_FLAG=on` PASS por pelo menos 7 dias contínuos sem
   regressão.
2. Search Console sem alertas de páginas finas, conteúdo duplicado, ou
   cobertura cruzada com `/carros-em/*`.
3. Auditoria SEO das 7 rotas territoriais
   (`/comprar/cidade/[slug]`, `/cidade/[slug]`, `/carros-em/[slug]`,
   `/cidade/[slug]/oportunidades`, `/cidade/[slug]/abaixo-da-fipe`,
   `/carros-baratos-em/[slug]`, `/carros-automaticos-em/[slug]`)
   completa: cada rota tem canonical único definido, variantes não-
   canônicas com `noindex,follow`, sitemap emitindo somente URLs
   canônicas.
4. Critério de estoque/conteúdo da regional cumprido (definir em PR
   separado: mínimo de N anúncios ativos, mínimo de M cidades-membro
   com estoque).
5. Aprovação SEO formal registrada.

Sem todos os 5 itens: **manter Fase C**.
