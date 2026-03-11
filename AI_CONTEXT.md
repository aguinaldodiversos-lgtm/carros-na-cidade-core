# AI CONTEXT — CARROS NA CIDADE

## O que é o projeto
Carros na Cidade é um portal automotivo regional de alta escala, voltado para compra, venda e descoberta de veículos com forte foco em SEO local, páginas territoriais e experiência premium.

Este projeto não é apenas um site de anúncios.
Ele faz parte de um ecossistema automotivo mais amplo com visão de crescimento nacional e inteligência operacional.

---

## Visão do produto
Estamos construindo:
- um portal automotivo regional premium
- com páginas dinâmicas por cidade, marca e modelo
- com mais de 5.500 páginas indexáveis na primeira fase
- com expansão futura para 20.000+ páginas
- com capacidade para 100k+ anúncios
- com forte integração entre frontend, backend, SEO e inteligência artificial

---

## Estrutura macro do ecossistema
### Frente 1 — Portal público
Responsável por:
- home premium
- busca/listagem
- páginas territoriais
- detalhe do veículo
- planos
- exploração por cidade e oportunidades
- indexação em escala

### Frente 2 — Inteligência operacional e comercial
Responsável por:
- automação de publicação
- automação comercial
- análise de oportunidades
- classificação de anúncios
- apoio à operação lojista
- leitura de sinais de mercado

---

## Estratégia de crescimento
O crescimento do portal é baseado em:
- SEO local massivo
- geração dinâmica de páginas territoriais
- forte linkagem interna
- busca inteligente
- páginas com real utilidade para o usuário
- expansão cidade por cidade

### Estrutura de páginas indexáveis
Exemplos:
- `/cidade/[slug]`
- `/cidade/[slug]/marca/[brand]`
- `/cidade/[slug]/marca/[brand]/modelo/[model]`
- `/cidade/[slug]/oportunidades`
- `/cidade/[slug]/abaixo-da-fipe`
- `/veiculo/[slug]`
- `/anuncios`

A meta inicial é gerar mais de 5.500 páginas dinâmicas indexáveis com qualidade arquitetural, sem aparência de conteúdo raso ou spam.

---

## Estratégia de IA do projeto
O sistema possui duas IAs controladas por um Orquestrador.

### IA 1 — IA operacional / local
Responsável por:
- tarefas de alto volume
- apoio operacional
- processamento frequente
- classificação
- automações menos custosas
- tarefas repetitivas

### IA 2 — IA premium / estratégica
Responsável por:
- copy premium
- SEO refinado
- análises complexas
- recomendações estratégicas
- inteligência comercial avançada
- tarefas com maior valor agregado

### Orquestrador
Existe um Orquestrador responsável por:
- definir qual IA usar em cada situação
- aplicar regras rígidas
- impedir desvios arquiteturais
- reduzir custo
- manter consistência operacional
- controlar fluxo, prioridade e governança

A IA não deve agir de forma autônoma e caótica.
Ela deve operar como parte de uma arquitetura controlada.

---

## Situação atual do frontend
O frontend passou por geração anterior com IA e acabou criando:
- shell duplicado
- componentes duplicados
- páginas em arquiteturas paralelas
- mistura entre `lib/*` e `services/*`
- inconsistência de rotas
- layout abaixo do padrão desejado

Agora o objetivo é convergir tudo para uma única arquitetura limpa.

---

## Arquitetura correta
A direção correta do frontend é:
- App Router
- server-first
- shell único
- card único
- integração via `lib/*`
- SEO desacoplado
- filtros orientados por URL
- páginas públicas com padrão premium

---

## Decisões já tomadas
- `app/layout.tsx` é o shell público oficial
- `components/shell/PublicHeader.tsx` e `PublicFooter.tsx` são oficiais
- rota oficial do detalhe: `/veiculo/[slug]`
- home pública usa `/api/public/home`
- listagem usa `/api/ads/search`
- facets usa `/api/ads/facets`
- autocomplete usa `/api/ads/autocomplete` e `/api/ads/autocomplete/semantic`
- territorial usa `/api/public/cities/...`
- o módulo territorial é uma das melhores referências arquiteturais atuais

---

## Qualidade esperada
Toda geração de código deve buscar:
- padrão premium
- consistência visual
- integração real
- baixa chance de retrabalho
- escalabilidade
- coerência com SEO massivo
- alinhamento com as regras do projeto

---

## O que a IA deve evitar
- duplicação
- criação de nova arquitetura paralela
- criação de novo shell
- criação de novo card concorrente
- páginas públicas totalmente client-side sem necessidade
- código improvisado
- reintrodução de erros antigos
