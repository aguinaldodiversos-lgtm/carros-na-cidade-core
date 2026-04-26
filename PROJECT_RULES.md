# PROJECT RULES — CARROS NA CIDADE

## Identidade do projeto

Carros na Cidade é um portal automotivo regional com foco em:

- SEO massivo por cidade
- páginas territoriais indexáveis
- experiência premium de marketplace
- arquitetura escalável
- integração com backend Node.js + Express
- frontend Next.js App Router
- padrão visual profissional de alto nível

Este projeto não é um site simples.
Ele é um portal de grande porte preparado para escalar cidade por cidade e dominar buscas locais no segmento automotivo.

---

## Objetivo principal

Construir o portal automotivo regional mais bem estruturado tecnicamente do Brasil, com:

- busca inteligente
- páginas indexáveis em escala
- forte SEO local
- experiência premium
- arquitetura limpa
- integração robusta com backend
- governança rígida de IA

---

## Escala pretendida

O projeto deve suportar:

- 5.500+ páginas dinâmicas indexáveis na primeira fase
- expansão futura para 20.000+ páginas
- 100k+ anúncios
- múltiplas cidades, marcas e modelos
- crescimento nacional por clusters regionais

---

## Stack oficial

### Frontend

- Next.js 14
- App Router
- TypeScript
- Tailwind CSS

### Backend

- Node.js
- Express
- PostgreSQL
- Redis

---

## Arquitetura obrigatória

### Estrutura base

- `app/`
- `components/`
- `lib/`
- `hooks/`

### Organização conceitual

- `app/` = rotas e composição das páginas
- `components/` = componentes visuais e blocos reutilizáveis
- `lib/` = integração, tipos, SEO, filtros, busca e dados
- `hooks/` = hooks reutilizáveis

---

## Shell público oficial

### Regra obrigatória

O shell público oficial está no `app/layout.tsx`.

### Portanto

- Nenhuma página pública pode renderizar `Header` ou `Footer` localmente
- O header oficial deve vir de `components/shell/PublicHeader.tsx`
- O footer oficial deve vir de `components/shell/PublicFooter.tsx`

### Proibido

- Criar `Header/Footer` dentro de páginas públicas
- Criar uma segunda família de shell
- Duplicar estrutura visual global

---

## Rotas públicas oficiais

### Home

- `/`

### Listagem principal

- `/anuncios`
- `/comprar` pode existir como alias operacional, mas não deve virar arquitetura paralela

### Páginas territoriais

- `/cidade/[slug]`
- `/cidade/[slug]/marca/[brand]`
- `/cidade/[slug]/marca/[brand]/modelo/[model]`
- `/cidade/[slug]/oportunidades`
- `/cidade/[slug]/abaixo-da-fipe`

### Detalhe do veículo

- Rota oficial e canônica: `/veiculo/[slug]`

### Regra obrigatória

- Cards e links de anúncio devem apontar prioritariamente para `/veiculo/[slug]`

---

## Integração oficial com backend

### Home pública

- `GET /api/public/home`

### Busca/listagem

- `GET /api/ads/search`

### Facets

- `GET /api/ads/facets`

### Autocomplete

- `GET /api/ads/autocomplete`
- `GET /api/ads/autocomplete/semantic`

### Detalhe do anúncio

- `GET /api/ads/:identifier`

### Territorial

- `GET /api/public/cities/:slug`
- `GET /api/public/cities/:slug/brand/:brand`
- `GET /api/public/cities/:slug/brand/:brand/model/:model`
- `GET /api/public/cities/:slug/opportunities`
- `GET /api/public/cities/:slug/below-fipe`

### Regra obrigatória

Novas integrações devem usar a camada `lib/*`. **A pasta `services/` é considerada legado em migração** — ver [docs/SERVICES_MIGRATION_MAP.md](docs/SERVICES_MIGRATION_MAP.md).

#### Proibido (a partir de 2026-04-24)

- ❌ Criar novos arquivos em `frontend/services/`
- ❌ Adicionar novas funções a arquivos existentes em `frontend/services/` (apenas correções de bug são permitidas)
- ❌ Importar de `services/` em código novo — usar o equivalente em `lib/` quando existir

#### Migração planejada (PRs 0.4A → 0.4D)

A pasta `services/` será extinta em 4 sub-PRs:

- **0.4A** — Inventário (entregue: [SERVICES_MIGRATION_MAP.md](docs/SERVICES_MIGRATION_MAP.md))
- **0.4B** — `marketService`, `planService`, `planStore` → `lib/market/`, `lib/plans/`, `lib/account/`, `lib/validation/`
- **0.4C** — `aiService`, `vehicleService`, `adService` → `lib/ai/`, consolidação em `lib/vehicle/`, `lib/ads/`
- **0.4D** — `authService`, `sessionService` → `lib/auth/`, `lib/session/` (último, com testes específicos de auth/cookie/isolamento)

---

## Regras de frontend

- Frontend deve ser server-first sempre que possível
- Client Components só devem ser usados para interações reais
- Filtros devem refletir query params
- Paginação deve refletir query params
- Ordenação deve refletir query params
- A URL é a fonte de verdade dos filtros
- Nada de duplicação de fetch sem necessidade
- Nada de componentes concorrentes para a mesma função

---

## Card oficial de anúncio

Deve existir um card oficial reutilizável para:

- home
- listagem
- vitrines
- páginas territoriais

O card deve conter:

- imagem real
- badge discreta
- título forte
- preço destacado
- localização
- informações rápidas
- CTA claro
- link correto para `/veiculo/[slug]`

### Proibido

- placeholders como solução final
- múltiplos cards competindo pela mesma função
- visual fraco ou genérico

---

## SEO técnico

### Obrigatório

- `generateMetadata` nas páginas estratégicas
- JSON-LD desacoplado
- canonical correto
- heading hierarchy correta
- breadcrumb coerente
- URL limpa
- conteúdo territorial coerente
- consistência entre rota, título, descrição e conteúdo

### Páginas prioritárias

- home
- `/anuncios`
- páginas territoriais
- `/veiculo/[slug]`

---

## Visual e UX

O portal deve transmitir:

- mercado sério
- confiança
- organização
- sofisticação
- tecnologia
- padrão de grande marketplace automotivo

### Proibido

- visual de dashboard genérico
- aparência de template barato
- poluição visual
- excesso de animação
- componentes sem hierarquia clara

---

## Regras para IA de desenvolvimento

### Antes de gerar qualquer código

Sempre verificar:

1. rota oficial
2. componente oficial
3. fetch oficial
4. card oficial
5. shell oficial
6. regra de SSR/client
7. metadata/SEO
8. se já existe estrutura semelhante

### Proibido para IA

- inventar estrutura paralela
- criar novo shell
- criar nova família de cards
- criar novos padrões sem necessidade
- ignorar as regras deste arquivo
- reintroduzir arquitetura antiga
- usar mock em páginas públicas se já houver backend

---

## Critério de qualidade

Todo código novo deve buscar:

- consistência arquitetural
- legibilidade
- reuso
- integração real com backend
- SEO correto
- padrão premium
- baixa chance de retrabalho
