# Investigação pré-Fase 1 — Slugs e Redirects

Data: 2026-05-17

---

## 1. Stack confirmada

| Aspecto              | Valor                                                     |
| -------------------- | --------------------------------------------------------- |
| Framework            | Next.js 14.2.35 — **App Router** (`frontend/app/`)        |
| Linguagem            | TypeScript 5.6.3 (strict mode)                            |
| ORM                  | Nenhum — raw SQL + `pg@8.x`                               |
| Banco                | PostgreSQL (Render) — sem PostGIS, sem `earthdistance`    |
| `region_memberships` | Tabela existe (migration 021) com `distance_km` e `layer` |

---

## 2. Formato de slug na tabela `cities` — resultado da query

```
SELECT id, name, slug, state FROM cities
WHERE name IN ('Atibaia', 'São Paulo', 'Campinas') LIMIT 10;
```

| id   | name      | slug         | state |
| ---- | --------- | ------------ | ----- |
| 4761 | Atibaia   | atibaia-sp   | SP    |
| 4822 | Campinas  | campinas-sp  | SP    |
| 5278 | São Paulo | sao-paulo-sp | SP    |

Amostra geral (primeiras 10 linhas, todos os estados):

| id  | name            | slug               | state |
| --- | --------------- | ------------------ | ----- |
| 1   | SÆo Paulo (¹)   | sæo-paulo (¹)      | SP    |
| 2   | Acrelândia      | acrelandia-ac      | AC    |
| 3   | Assis Brasil    | assis-brasil-ac    | AC    |
| 7   | Cruzeiro do Sul | cruzeiro-do-sul-ac | AC    |

> (¹) Linha `id=1` tem encoding corrompido — slug `sæo-paulo` sem sufixo UF.
> É um artefato de seed antigo; o canonical de São Paulo é `id=5278` / `sao-paulo-sp`.

**Conclusão:** o formato padrão do banco é `{nome-normalizado}-{uf}`.  
Exemplo: `atibaia-sp`, `cruzeiro-do-sul-ac`.

---

## 3. Causa raiz do 404 em `/carros-usados/regiao/[slug]`

A rota `frontend/app/carros-usados/regiao/[slug]/page.tsx` **existe** no código.

O 404 vem de dois guards sequenciais em `generateMetadata`:

```typescript
if (!isRegionalPageEnabled()) {
  notFound(); // feature flag REGIONAL_PAGE_ENABLED=false → 404
}
const region = await getRegionByCitySlug(slug);
if (!region) {
  notFound(); // cidade não encontrada no DB → 404
}
```

O flag `REGIONAL_PAGE_ENABLED` provavelmente está `false` em produção (Fase A do runbook).  
Ou seja: `/carros-usados/regiao/atibaia-sp` com slug correto ainda retorna 404 porque o flag está fechado.

---

## 4. Implicações para a nova arquitetura de URL

O spec define a nova URL regional como `/sp/regiao/[ancora]`.  
O `[uf]` já está no path — repetir o UF no slug âncora seria redundante e feio:

```
❌ /sp/regiao/atibaia-sp   (UF duplicado)
✅ /sp/regiao/atibaia      (UF como segmento separado)
```

**Mapeamento de slug:**

- DB slug: `atibaia-sp` (formato atual)
- Âncora na nova URL: `atibaia` (slug sem sufixo UF)
- Transformação: `slug.replace(/-{uf}$/, '')` onde `uf = state.toLowerCase()`

Isso significa que a Fase 2 precisará de uma coluna auxiliar ou de uma função derivada
pra mapear `atibaia-sp` → `atibaia` quando construir as URLs `/sp/regiao/[ancora]`.

---

## 5. Patterns exatos dos redirects — Fase 1

### 5a. Fix urgente: 404 de `/carros-usados/regiao/[cidade]-sp`

Em Next.js, `:cidade-sp` captura tudo antes do literal `-sp`:

- `/carros-usados/regiao/atibaia-sp` → `cidade = "atibaia"`
- `/carros-usados/regiao/sao-paulo-sp` → `cidade = "sao-paulo"`

**Destino temporário (Fase 1):** `/carros-em/:cidade-sp` — página canônica de cidade, já existe e funciona.  
**Por que 302?** Porque em Fase 4 trocaremos para 301 permanente → `/sp/regiao/:cidade`.  
Um 301 agora para `/carros-em/` engessaria o sinal de link equity antes de ter a URL definitiva.

```js
// next.config.mjs — adicionar dentro de redirects()
{
  source: '/carros-usados/regiao/:cidade-sp',
  destination: '/carros-em/:cidade-sp',
  permanent: false,  // 302 temporário; Fase 4 troca por 301 → /sp/regiao/:cidade
},
```

**Validação do pattern:**
| URL de entrada | Captura `cidade` | Destino |
|---|---|---|
| `/carros-usados/regiao/atibaia-sp` | `atibaia` | `/carros-em/atibaia-sp` ✅ |
| `/carros-usados/regiao/sao-paulo-sp` | `sao-paulo` | `/carros-em/sao-paulo-sp` ✅ |
| `/carros-usados/regiao/cruzeiro-do-sul-sp` | `cruzeiro-do-sul` | `/carros-em/cruzeiro-do-sul-sp` ✅ |

### 5b. Outros redirects do spec (Fase 4 — destinos ainda não existem)

Estes ficam para a Fase 4 porque as rotas destino (`/sp`, `/sp/regiao/*`, `/sp/cidade/*`) serão criadas na Fase 3:

```js
// FASE 4 — não adicionar agora
{ source: '/comprar/estado/sp', destination: '/sp', permanent: true },
{ source: '/carros-em/:cidade-sp', destination: '/sp/regiao/:cidade', permanent: true },
{ source: '/cidade/:cidade-sp', destination: '/sp/cidade/:cidade', permanent: true },
{ source: '/carros-usados/regiao/:cidade-sp', destination: '/sp/regiao/:cidade', permanent: true },
```

---

## 6. Anomalia: linha `id=1` com slug corrompido

A cidade `id=1` tem:

- `name = 'SÆo Paulo'` (encoding quebrado)
- `slug = 'sæo-paulo'` (sem sufixo UF, com caracter especial)

Provavelmente é um registro seed antigo que não segue o padrão. O canonical de São Paulo é `id=5278 / sao-paulo-sp`.  
Recomendo investigar em Fase 2 se essa linha causa conflito ou simplesmente é ignorada pelas queries.

---

## 7. Decisão sobre migrar slug para sem sufixo UF

**Recomendação:** manter o formato atual (`atibaia-sp`) no banco por ora.

- Todas as rotas existentes usam esse formato.
- Mudar agora quebraria `/carros-em/`, `/cidade/`, e as queries de cidade.
- A nova arquitetura deriva o âncora-slug na camada de aplicação: `slug.split('-').slice(0,-1).join('-')`.

A migration de slug (se decidida) fica para a Fase 2, com cuidado.

---

## 8. Próximos passos aprovados — aguardando OK

- [ ] Adicionar `redirects()` em `frontend/next.config.mjs` (item 5a acima)
- [ ] Auditar componentes de link interno (footer, header, cards)
- [ ] Adicionar `robots: noindex` em `/comprar/estado/[uf]` e `/comprar/cidade/[slug]` quando há filtros
- [ ] Verificar canonical de `/cidade/[slug]` e `/comprar/cidade/[slug]`
