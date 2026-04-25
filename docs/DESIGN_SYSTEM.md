# DESIGN_SYSTEM — Carros na Cidade

| Campo | Valor |
|---|---|
| **Versão** | 2 (PR D — primitivos implementados, aditivo) |
| **Data** | 2026-04-24 |
| **Branch** | `claude/sad-elbakyan-8155e1` |
| **Status** | ✅ PR D — 11 primitivos disponíveis em `components/ui/`. **Nenhuma página atualizada ainda** (PRs E, F, G em diante). |
| **Referência** | [DIAGNOSTICO_REDESIGN.md](./DIAGNOSTICO_REDESIGN.md) §9 |
| **Imagens de referência** | `frontend/public/images/` — pagina Comprar Estadual.png, pagina Comprar na cidade.png, banner-home.png, blog.png, pagina-simulador-de-financiamento.png |
| **Tokens alterados em PR D** | **Nenhum** — `tailwind.config.ts` e `globals.css` não foram tocados. Os primitivos usam apenas tokens existentes (`primary`, `cnc-*`). Cores propostas em §1.2 entram quando forem efetivamente usadas (PR G). |

---

## 0. Princípios

1. **Mobile-first sempre**. Todo componente é desenhado primeiro no mobile (375×812), depois adaptado.
2. **Reconstrução, nunca duplicação**. Se um componente novo é necessário, é **variante de um existente** ou **substituto consolidado**, nunca um paralelo.
3. **Server-first**. `"use client"` apenas em componentes com interação real (input, modal, drawer, drag, etc.).
4. **Tokens primeiro, valores hardcoded nunca**. Toda cor, tamanho, raio e sombra vem do design system.
5. **Identidade automotiva regional**. Visual sério, comercial, premium — sem cara de rede social genérica.

---

## 1. Identidade visual

### 1.1. Cores existentes consolidadas

Tokens já presentes em `frontend/tailwind.config.ts` + `frontend/app/globals.css`. **Nesta v1, mantemos os tokens existentes**. PR D pode propor reorganização.

| Token Tailwind | CSS var | Hex | Uso |
|---|---|---|---|
| `primary` | `--cnc-primary` | `#0e62d8` | CTAs, links, ativos |
| `primary-strong` | `--cnc-primary-strong` | `#0c4fb0` | Hover de CTA |
| `primary-soft` | `--cnc-primary-soft` | `#eaf2ff` | Backgrounds suaves de destaque |
| `cnc-bg` | `--cnc-bg` | `#f2f3f7` | Fundo geral da página |
| `cnc-surface` | `--cnc-surface` | `#ffffff` | Fundo de card / surface |
| `cnc-line` | `--cnc-line` | `#dde2ec` | Bordas padrão |
| `cnc-line-strong` | `--cnc-line-strong` | `#cfd6e4` | Bordas de input em foco |
| `cnc-text` | `--cnc-text` | `#161f34` | Texto principal |
| `cnc-text-strong` | `--cnc-text-strong` | `#0f172a` | Títulos h1/h2 |
| `cnc-muted` | `--cnc-muted` | `#5d667d` | Labels e meta |
| `cnc-muted-soft` | `--cnc-muted-soft` | `#7c879f` | Hints e secundário |
| `cnc-success` | `--cnc-success` | `#0f9f6e` | "Abaixo da FIPE", verificado, **WhatsApp** |
| `cnc-danger` | `--cnc-danger` | `#d14343` | Erros, urgência, "Imperdível" |
| `cnc-warning` | `--cnc-warning` | `#d18a12` | Alertas, atenção |
| `cnc-footer-a` | `--cnc-footer-a` | `#152954` | Footer gradiente topo |
| `cnc-footer-b` | `--cnc-footer-b` | `#0e1b3b` | Footer gradiente fundo |

### 1.2. Cores faltantes (a criar no PR D)

Análise das mockups indica necessidade de:

| Token proposto | Uso | Hex sugerido |
|---|---|---|
| `cnc-accent-orange` | Selo "Ofertas da semana", urgência leve | `#ef6c1c` |
| `cnc-accent-purple` | Badge "DESTAQUE", "Top oferta" (referência mockup home) | `#6b46c1` |
| `success-bg` | Fundo do badge "Abaixo da FIPE" | `#e6f7f1` |
| `danger-bg` | Fundo de selo de urgência | `#fde8e8` |

### 1.3. Tipografia

Configuração atual (manter):
- `font-sans`: `var(--font-sans), system-ui, sans-serif`
- Carregamento via `next/font/google` no layout root
- `font-feature-settings: "cv02", "cv03", "cv04", "cv11"` ativadas

Escala (Tailwind) — **a usar como contrato**:

| Token | rem | px | Line-height | Uso |
|---|---|---|---|---|
| `text-xs` | 0.75 | 12 | 1.35rem | Meta, timestamps, badges |
| `text-sm` | 0.875 | 14 | 1.5rem | Labels, secondary text |
| `text-base` | 1.0 | 16 | 1.75rem | Corpo de texto |
| `text-lg` | 1.125 | 18 | 1.8rem | Subtítulos |
| `text-xl` | 1.25 | 20 | 1.9rem | Títulos de seção |
| `text-2xl` | 1.5 | 24 | 2rem | h2 |
| `text-3xl` | 1.875 | 30 | 2.25rem | h1 mobile / h2 desktop |
| `text-4xl` | 2.25 | 36 | 2.7rem | h1 desktop |
| `text-5xl` | 3.0 | 48 | 3.15rem | Hero display |

Letter-spacing extras:
- `tracking-tighter` (-0.04em) — display
- `tracking-tight` (-0.025em) — h1
- `tracking-normalish` (-0.01em) — body (default)
- `tracking-wideish` (0.02em) — small caps / labels

### 1.4. Raio (border-radius)

| Token | Valor | Uso |
|---|---|---|
| `rounded-sm` | 0.125rem (2px) | Badges minúsculos |
| `rounded` | 0.25rem (4px) | Inputs pequenos |
| `rounded-md` | 0.375rem (6px) | Chips |
| `rounded-lg` | 0.5rem (8px) | Cards padrão |
| `rounded-xl` | 0.75rem (12px) | Cards destaque |
| `rounded-xl2` | 1rem (16px) | Hero, painéis principais |
| `rounded-xl3` | 1.5rem (24px) | Banners promocionais |
| `rounded-xl4` | 2rem (32px) | Cards premium grandes |
| `rounded-full` | 9999px | Avatares, atalhos circulares |

### 1.5. Sombra (box-shadow)

| Token | Valor | Uso |
|---|---|---|
| `shadow-card` | `0 2px 18px rgba(20,30,60,0.06)` | Cards padrão |
| `shadow-soft` | `0 10px 30px rgba(15,23,42,0.08)` | Modais, drawers |
| `shadow-premium` | `0 12px 30px rgba(16,28,58,0.12)` | Hero, hover de card destaque |
| `shadow-premium-lg` | `0 18px 42px rgba(16,28,58,0.14)` | Hover desktop, painéis flutuantes |

### 1.6. Espaçamento

Escala Tailwind padrão (4-based): `0.5 / 1 / 1.5 / 2 / 3 / 4 / 5 / 6 / 8 / 10 / 12 / 16 / 20`

**Não criar tokens customizados** sem justificativa. Padronizar uso em:
- Padding interno de card: `p-4` (mobile), `p-6` (desktop)
- Gap entre cards em grid: `gap-4` (mobile), `gap-6` (desktop)
- Padding de seção: `py-8` (mobile), `py-12` (desktop)
- Padding lateral em mobile: `px-4`
- Padding lateral em desktop: `px-6` ou container max-width

### 1.7. Breakpoints (Tailwind padrão)

| Token | px | Uso |
|---|---|---|
| `sm` | 640 | Tablet pequeno |
| `md` | 768 | Tablet |
| `lg` | 1024 | Desktop |
| `xl` | 1280 | Desktop grande |
| `2xl` | 1536 | Wide |
| `8xl` | 1440 (custom) | Container max-width principal |

**Mobile-first**: estilo base aplica para mobile; prefixos `sm:`, `md:`, etc. adicionam breakpoint up.

### 1.8. Alturas fixas (contrato — referenciado em PR D)

| Elemento | Mobile | Desktop |
|---|---|---|
| Header | 56px | 72px |
| Bottom navigation | 64px + safe-area | n/a |
| Input | 48px | 40px |
| Button primário | 48px | 44px |
| Chip / FilterChip | 36px | 32px |
| ActionShortcut (atalho circular) | 64px diâmetro + label | 80px + label |

`--header-height: 78px` (CSS var) atual contradiz alturas acima (56/72). **PR D harmoniza** — ou ajustar var, ou ajustar contrato. Em v1 desta especificação, **prevalecem 56/72**.

---

## 2. Primitivos (lista fechada)

Componentes base. Vivem em `frontend/components/ui/` (a criar no PR D). **Nenhum componente novo de domínio pode existir sem usar estes primitivos**.

### 2.1. Lista oficial

| Primitivo | Propósito | Variantes |
|---|---|---|
| `<Button>` | Ação primária/secundária | `primary`, `secondary`, `ghost`, `destructive`, `whatsapp`, `link` |
| `<Input>` | Entrada de texto | `default`, `search`, `error`, `password` |
| `<Select>` | Seleção de opção | `default`, `native` (mobile-friendly), `searchable` |
| `<Chip>` | Pílula clicável | `filter` (toggle), `removable`, `static` |
| `<Badge>` | Selo informativo (não clicável) | `info`, `success`, `danger`, `warning`, `premium`, `neutral` |
| `<Card>` | Container genérico | `default`, `elevated`, `flat`, `interactive` |
| `<SectionHeader>` | Título + "ver todos" + ícone | `default`, `with-icon`, `compact` |
| `<BottomNav>` | Navegação inferior mobile | `default`, `with-fab` |
| `<SearchBar>` | Campo de busca + botão de filtros | `default`, `sticky`, `compact` |
| `<FilterChip>` | Filtro aplicado em listagem | `active`, `removable` |
| `<ActionShortcut>` | Atalho circular tipo "stories" | `default`, `highlight`, `muted` |
| `<VehicleImage>` | Imagem de anúncio (com fallback) | `card`, `gallery`, `thumb`, `hero` |
| `<AdCard>` | Card de anúncio canônico (§3) | 8 variantes |
| `<ArticleCard>` | Card de blog | `default`, `featured`, `compact` |
| `<TrustStrip>` | Faixa de confiança | `compact` (4 colunas), `full` (com texto) |
| `<EmptyState>` | Estado vazio reutilizável | `default`, `error`, `not-found` |
| `<Spinner>` / `<Skeleton>` | Loading | tamanhos `sm`, `md`, `lg` |

### 2.2. Regras arquiteturais

1. **Não criar `<MyButton>` local se `<Button>` atende**. Use props primeiro.
2. **Variantes são props, não arquivos**. `<AdCard variant="grid">`, não `<AdCardGrid>`.
3. **Toda interação visível** (hover, focus, active, disabled) é coberta no primitivo. Páginas não estilizam estados.
4. **Acessibilidade no primitivo**: `aria-*`, `role`, foco navegável por teclado, contrast ratio AA.
5. **Sem CSS inline ou `style={{...}}`** em componentes de sistema. Apenas Tailwind.
6. **Servidor por padrão**. `"use client"` só quando o primitivo precisar (ex: `<Select searchable>`, `<BottomNav>`, `<SearchBar>`).

---

## 3. `<AdCard>` — Especificação resumida

Detalhamento completo em [DIAGNOSTICO_REDESIGN.md §10](./DIAGNOSTICO_REDESIGN.md#10-contrato-do-adcard-8-variantes).

### 3.1. Interface

```tsx
<AdCard
  item={BaseAdData}
  variant="compact" | "featured" | "grid" | "carousel" |
          "horizontal" | "related" | "dashboard" | "admin"
  href?={string}      // default: /veiculo/[slug]
  onFavorite?={(adId: string) => void}
  className?={string}
/>
```

### 3.2. Regras invioláveis

- Imagem **sempre** via `<VehicleImage>` (nunca `<img>` ou `next/image` direto).
- Preço **sempre** em `text-primary font-bold`.
- Badge "Abaixo da FIPE" em `bg-success-bg text-cnc-success`.
- Badge de km sobreposto na foto, canto inferior esquerdo.
- Favorito coração canto superior direito (com toggle visual).
- `href` aponta para `/veiculo/[slug]` (rota canônica).
- Server Component por padrão; ilhas Client apenas para favorito interativo.

### 3.3. Substitui (no PR F)

- `components/home/HomeVehicleCard.tsx` (vira adapter → `<AdCard variant="carousel">` ou `"featured"`)
- `components/buy/CatalogVehicleCard.tsx` (vira adapter → `<AdCard variant="grid">`)
- `components/home/sections/VehicleCard.tsx` (deletado — duplicação confirmada via §13)
- `components/ads/CarCard.tsx` e `components/common/VehicleCard.tsx` permanecem como **adapters legados** (recebem dado em formato antigo, normalizam para `BaseAdData`, renderizam `<AdCard>`)

---

## 4. `<VehicleImage>` — Especificação resumida

Detalhamento em [DIAGNOSTICO_REDESIGN.md §8.5](./DIAGNOSTICO_REDESIGN.md#85-contrato-de-imagens) e [§8.5.1](./DIAGNOSTICO_REDESIGN.md#851-bateria-obrigatória-de-testes-de-imagem).

### 4.1. Interface

```tsx
<VehicleImage
  src={string}
  alt={string}
  variant="card" | "gallery" | "thumb" | "hero"
  priority?={boolean}    // default: false
  sizes?={string}        // default por variant
  width={number}
  height={number}
  onError?={() => void}
/>
```

### 4.2. Comportamento crítico

- Falha de carregamento → `<VehicleImagePlaceholder>` (mesmo `width`/`height`, sem layout shift).
- `priority` apenas em imagem acima da dobra (máximo 1-2 por página).
- `sizes` por variant:
  - `card`: `"(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"`
  - `thumb`: `"96px"`
  - `gallery`: `"(max-width: 768px) 100vw, 800px"`
  - `hero`: `"100vw"`

### 4.3. Bateria de testes (PR E)

12 casos `IMG-1` a `IMG-12` no §8.5.1 do diagnóstico. Resumo:

| ID | Cenário | Tipo |
|---|---|---|
| IMG-1 | URL R2 válida | Unit |
| IMG-2 | Upload via `/api/vehicle-images` | E2E |
| IMG-3 | Anúncio sem imagem | Unit |
| IMG-4 | Imagem 404/timeout | Unit + E2E |
| IMG-5 | Fallback sem CLS | E2E |
| IMG-6 | `sizes` ausente | CI lint |
| IMG-7 | Domínio não permitido | Config |
| IMG-8 | SVG bloqueado | Config |
| IMG-9 | Lazy load abaixo da dobra | E2E |
| IMG-10 | `priority` acima da dobra | Unit |
| IMG-11 | `srcset` responsivo | Unit |
| IMG-12 | Galeria swipe sem CLS | E2E |

---

## 5. `<BottomNav>` — Regra de aparição

Detalhamento em [DIAGNOSTICO_REDESIGN.md §11](./DIAGNOSTICO_REDESIGN.md#11-regra-de-bottom-navigation).

### Resumo

| Estado | Páginas |
|---|---|
| **Aparece** | Home, `/anuncios`, `/cidade/**`, `/blog`, `/tabela-fipe`, `/simulador-financiamento`, `/favoritos`, `/dashboard*` |
| **Substituído por `<StickyCTA>`** | `/veiculo/[slug]` (preço + WhatsApp) |
| **Não aparece** | `/login`, `/cadastro`, `/recuperar-senha`, checkout crítico, `/admin/*` |
| **Caso especial** | `/anunciar/novo` — case-by-case, nunca compete com wizard |

### Itens da bottom nav

5 ícones, ordem fixa:

| Posição | Ícone | Rota | Estado ativo |
|---|---|---|---|
| 1 | 🏠 Home | `/` | Quando rota = `/` |
| 2 | 🔍 Buscar | `/anuncios` ou cidade ativa | Quando rota = `/anuncios`, `/cidade/**` |
| 3 | ❤️ Favoritos | `/favoritos` | Quando rota = `/favoritos` |
| 4 | ➕ Anunciar (FAB centralizado) | `/anunciar/novo` | Sempre destaque |
| 5 | 👤 Conta / Menu | `/dashboard` (logado) ou `/login` | Quando rota dashboard |

---

## 6. Mapas de referência visual

### 6.1. Imagens em `frontend/public/images/`

| Arquivo | Tamanho | Uso aprovado | Observação |
|---|---:|---|---|
| `pagina Comprar Estadual.png` | 4.8 MB | Mockup PR J | Referência visual |
| `pagina Comprar na cidade.png` | 2.6 MB | Mockup PR H | Referência visual |
| `banner-home.png` | 2.0 MB | Mockup PR G | **Duplicado** com `home-hero-banner.png` (MD5 idêntico) |
| `home-hero-banner.png` | 2.0 MB | — | **Remover no PR C** após confirmar referências |
| `blog.png` | 1.0 MB | Mockup PR L | Referência visual |
| `pagina-simulador-de-financiamento.png` | 1.0 MB | Mockup PR K | Referência visual |
| `carro_pagina_simulador.png` | 35 KB | Asset PR K | Imagem de carro do simulador |
| `dolphin.webp` | 55 KB | Asset placeholder? | Verificar uso em PR C |
| `gla.avif` | 13 KB | Asset placeholder? | Verificar uso em PR C |
| `icones.png` | 685 KB | — | **Duplicado** com `icons.png` (MD5 idêntico) |
| `icons.png` | 685 KB | Sprite de ícones | Manter um, remover o outro no PR C |
| `logo-carros-na-cidade.png` | 601 KB | Logo oficial — usado | Manter |
| `logo.png` | 2.1 MB | Logo grande — verificar uso | Avaliar tamanho em PR C |

**Ação imediata** (será capturada no PR C com checklist §13):
1. Confirmar nenhum import a `home-hero-banner.png` ou `icones.png` (com 'e').
2. Deletar `home-hero-banner.png` (manter `banner-home.png`).
3. Deletar `icones.png` (manter `icons.png`).
4. Avaliar `dolphin.webp`, `gla.avif`, `logo.png`.

### 6.2. Mockups de referência aprovados

| Mockup | Referência para PR | Características |
|---|---|---|
| `pagina Comprar na cidade.png` | PR H | Cidade com identidade regional, cards locais, filtros |
| `pagina Comprar Estadual.png` | PR J | Catálogo estadual, faixa de SEO |
| `banner-home.png` | PR G | Hero da nova home mobile-first |
| `blog.png` | PR L | Lista do blog estilo editorial |
| `pagina-simulador-de-financiamento.png` | PR K | Simulador com integração de listagem |

---

## 7. PR D — Primitivos implementados

Todos os 11 primitivos esperados foram criados em `frontend/components/ui/`.
**Nenhuma página foi atualizada** — primitivos ficam disponíveis para PRs E, F, G+ usarem.

### 7.1. Inventário de arquivos

| Arquivo | Server/Client | Linhas | Variantes |
|---|---|---:|---|
| `Button.tsx` | Client | ~155 | `primary`, `secondary`, `ghost`, `destructive`, `whatsapp`, `link` × `sm`, `md`, `lg` |
| `Input.tsx` | Client | ~110 | `default`, `search`, `error` |
| `Select.tsx` | Client | ~110 | `default`, `error` (native, mobile-friendly) |
| `Chip.tsx` | Client | ~95 | `filter` (toggle), `removable`, `static` |
| `Badge.tsx` | Server | ~50 | `info`, `success`, `danger`, `warning`, `premium`, `neutral` × `sm`, `md` |
| `Card.tsx` | Server | ~65 | `default`, `elevated`, `flat`, `interactive` × padding `none`, `sm`, `md`, `lg` |
| `SectionHeader.tsx` | Server | ~70 | `default`, `with-icon`, `compact` |
| `BottomNav.tsx` | Client | ~115 | `default`, `with-fab` |
| `SearchBar.tsx` | Client | ~115 | `default`, `sticky`, `compact` |
| `FilterChip.tsx` | Client | ~95 | `active`, `removable` |
| `ActionShortcut.tsx` | Server | ~70 | `default`, `highlight`, `muted` |

**Total**: 11 arquivos, ~1.050 linhas.
**Server Components**: 4 (`Badge`, `Card`, `SectionHeader`, `ActionShortcut`).
**Client Components**: 7 (todos com interação real ou estado de pathname).

### 7.2. Interfaces resumidas

```ts
// Button.tsx
<Button variant="primary" size="md" onClick={...}>Texto</Button>
<Button variant="whatsapp" href="https://wa.me/...">Chamar</Button>
<Button loading iconLeft={<Icon />}>Salvando...</Button>

// Input.tsx
<Input label="Email" type="email" hint="Não será compartilhado" />
<Input variant="search" placeholder="Buscar carros" />
<Input error="Campo obrigatório" />

// Select.tsx
<Select label="Estado" options={[{value:"sp",label:"SP"}]} placeholder="Selecione" />

// Chip.tsx
<Chip variant="filter" selected={true} onClick={...}>SUV</Chip>
<Chip variant="removable" onRemove={...}>Honda</Chip>
<Chip variant="static">Em Atibaia</Chip>

// Badge.tsx
<Badge variant="success">Abaixo da FIPE</Badge>
<Badge variant="premium">Destaque</Badge>

// Card.tsx
<Card variant="elevated" padding="lg" as="article">...</Card>

// SectionHeader.tsx
<SectionHeader
  title="Destaques em Atibaia"
  variant="with-icon"
  icon={<StarIcon />}
  seeAllHref="/anuncios?city=atibaia-sp"
/>

// BottomNav.tsx (apenas em mobile via classe md:hidden)
<BottomNav
  variant="with-fab"
  items={[
    { id:"home", label:"Início", href:"/", icon:<HomeIcon /> },
    { id:"buscar", label:"Buscar", href:"/anuncios", icon:<SearchIcon /> },
    { id:"anunciar", label:"Anunciar", href:"/anunciar/novo", icon:<PlusIcon />, primary:true },
    { id:"favoritos", label:"Favoritos", href:"/favoritos", icon:<HeartIcon />, badge: 2 },
    { id:"conta", label:"Conta", href:"/dashboard", icon:<UserIcon /> },
  ]}
/>

// SearchBar.tsx
<SearchBar
  variant="sticky"
  placeholder="Buscar por marca, modelo ou cidade"
  onSubmit={(value) => router.push(`/anuncios?q=${value}`)}
  filterButton={<Button variant="primary" size="md">Filtros</Button>}
/>

// FilterChip.tsx
<FilterChip variant="removable" label="Preço" value="Até R$ 50 mil" onRemove={...} />
<FilterChip variant="active" label="SUV" />

// ActionShortcut.tsx
<ActionShortcut
  href="/anuncios?type=suv"
  label="SUVs"
  icon={<SuvIcon />}
  variant="highlight"
  hint="42 ofertas"
/>
```

### 7.3. Convenções aplicadas

- **Client/Server**: server-first. `"use client"` apenas em componentes com hook (BottomNav usa `usePathname`), evento (Button onClick), ou estado controlado (Input value).
- **Tailwind 100%**: zero CSS inline, zero CSS modules. Todas as variantes via classes condicionais.
- **Tipos estritos**: cada variant é union literal explícita; nada de `string` solto.
- **Sem ícones embutidos**: cada componente que precisa de ícone (Search no Input, Close no Chip, Chevron no Select) traz a versão mínima inline. Para ícones de domínio (carro, casa, coração) o consumidor passa via prop `icon`/`iconLeft`/`iconRight`.
- **forwardRef** onde fizer sentido (Button, Input, Select, Chip, SearchBar, FilterChip).
- **Acessibilidade**: `aria-pressed` em chips, `aria-current="page"` em BottomNav, `aria-label` em ações sem texto, `aria-invalid` em inputs com erro, `aria-describedby` linkando hint/error.
- **Mobile-first**: tamanhos default são mobile (Input/Button 48px). `md:` reduz no desktop.

### 7.4. Fronteiras entre primitivos com sobreposição aparente

Documenta quando usar cada um quando há ambiguidade.

#### `<Chip>` vs `<FilterChip>`

| Caso | Use |
|---|---|
| Filtro rápido togglável no topo da home ("Até R$ 50 mil", "SUV") com estado próprio gerenciado pela página | **`<Chip variant="filter">`** |
| Filtro removível qualquer (badge de aplicação solta) | **`<Chip variant="removable">`** |
| Tag estática, não clicável (cidade, status) | **`<Chip variant="static">`** |
| Filtro APLICADO mostrado no topo de uma listagem (dentro de uma barra `[X SUV] [X Até 50k] [X Auto]`) | **`<FilterChip variant="removable">`** |
| Filtro ativo mostrado de forma compacta (sem X — clique remove via parent) | **`<FilterChip variant="active">`** |

**Regra**: `Chip` é o primitivo genérico (altura 36px, padding maior). `FilterChip` é especialização visual para barras de filtros aplicados (altura 32px, padding menor, sempre fundo soft) — escolhido porque listagens podem ter 5+ filtros lado-a-lado.

#### `<Input>` vs `<SearchBar>`

| Caso | Use |
|---|---|
| Campo de texto único (email, nome, descrição, valor numérico) | **`<Input>`** |
| Campo de busca isolado dentro de um form maior (ex: filtros laterais com vários campos) | **`<Input variant="search">`** |
| Caixa de busca primária da página, com botão de filtros ao lado, possivelmente sticky no scroll | **`<SearchBar>`** |
| Caixa de busca em header global | **`<SearchBar variant="compact">`** |

**Regra**: `<Input variant="search">` é apenas um Input com ícone de lupa. `<SearchBar>` é um **form completo** (composição de Input + Button) que dispara `onSubmit` e pode hospedar um `filterButton` ao lado.

#### `<Select>` vs autocomplete/combobox

`<Select>` desta versão é **`<select>` nativo**. Razão: melhor UX em mobile (picker do SO), zero JS extra, acessibilidade gratuita.

**Não usar `<Select>` quando**:
- Há mais de ~30 opções e usuário precisa filtrar enquanto digita.
- Backend precisa receber a query do usuário (autocomplete server-side).

**Para esses casos**: aguardar primitivo `<Combobox>` em PR futuro (fora do escopo do PR D conforme aprovação do usuário). Solução temporária: `<Input>` com sugestões via lista controlada pelo parent.

#### `<Button>` vs `<a>` direto

| Caso | Use |
|---|---|
| Ação que dispara handler (submit, abrir modal, salvar) | **`<Button>`** sem `href` |
| Navegação interna (`/anuncios`, `/cidade/...`) com aparência de botão | **`<Button href="/...">`** (renderiza `<Link>`) |
| Navegação externa (WhatsApp, parceiro) com aparência de botão | **`<Button href="https://..." target="_blank">`** |
| Link textual em meio a parágrafo | `<Link>` direto (não usar Button — `variant="link"` é para casos específicos com aparência de link mas espaçamento de botão) |

**Regra**: o Button toma a decisão `<button>` vs `<a>` baseado na presença da prop `href`. Se `href` está presente, automaticamente vira `<Link>` do Next.js (com `target="_blank" rel="noopener"` quando aplicável).

#### `<Card>` vs `<div>` puro

`<Card>` traz: borda + sombra + padding consistentes + border-radius do sistema.

**Use `<Card>` quando** o container precisa de hierarquia visual (anúncio, painel de form, seção destacada).
**Use `<div>` puro quando** o container é apenas estrutural (wrapping para flex/grid/spacing).

#### `<ActionShortcut>` vs `<Button>` circular

| Caso | Use |
|---|---|
| Atalho destacado para uma seção (Comprar, Vender, Blog, Ofertas) com **ícone + label embaixo** | **`<ActionShortcut>`** |
| Botão de ação circular (ex: FAB, fechar modal, voltar) com **só ícone** | `<Button>` com classes para circular ou ícone-only |

`<ActionShortcut>` é **navegação**, não ação. Sempre vira `<Link>` para outra rota.

---

### 7.5. O que NÃO foi feito neste PR (intencional)

- ❌ Substituição de componentes existentes (AdCard, PublicHeader, etc.)
- ❌ Aplicação em qualquer página
- ❌ `<VehicleImage>` (vai no PR E com bateria de 12 testes)
- ❌ `<AdCard>` redesenhado (vai no PR F)
- ❌ `<ArticleCard>` (vai no PR L com blog)
- ❌ `<TrustStrip>` (vai no PR I com detalhe)
- ❌ `<EmptyState>`, `<Spinner>`, `<Skeleton>` (vão conforme demanda real)
- ❌ Adição dos 4 tokens propostos em §1.2 (orange/purple/success-bg/danger-bg) — entram quando forem realmente usados
- ❌ Storybook ou doc visual — primitivos ficam documentados aqui via interfaces resumidas
- ❌ Dark mode

---

## 8. O que ainda está pendente para versões futuras

- Implementação visual real em páginas (PRs E, F, G+)
- Storybook ou doc visual com todos os estados (hover, focus, disabled, error)
- Migração concreta de `globals.css` para reduzir custom CSS
- Decisão final sobre alturas (header 56/72 vs `--header-height: 78px`)
- Adição dos tokens propostos em §1.2 (orange, purple, success-bg, danger-bg)
- Dark mode (a ser decidido)

---

## 9. Critérios de aceitação

### 9.1. Skeleton (PR A — entregue)

- [x] Tokens existentes mapeados e documentados
- [x] Tokens faltantes identificados (4 cores propostas)
- [x] 17 primitivos listados com propósito e variantes
- [x] Regras arquiteturais explícitas (não duplicar, server-first, sem CSS inline)
- [x] `<AdCard>` linkado ao §10 do diagnóstico
- [x] `<VehicleImage>` linkado ao §8.5/§8.5.1 do diagnóstico
- [x] `<BottomNav>` linkado ao §11 do diagnóstico
- [x] Mockups de referência mapeados a PRs
- [x] Imagens duplicadas em `public/images/` flagadas para PR C

### 9.2. Primitivos (PR D — entregue)

- [x] 11 primitivos criados em `frontend/components/ui/`
- [x] Sem alteração em `tailwind.config.ts` (zero impacto em tokens)
- [x] Sem alteração em `globals.css`
- [x] Server-first: 4 dos 11 são Server Components (Badge, Card, SectionHeader, ActionShortcut)
- [x] Sem substituição de componentes existentes (AdCard, PublicHeader etc. intactos)
- [x] Tipos estritos com union literals para variants
- [x] `forwardRef` em primitivos formulario/clicáveis
- [x] Acessibilidade: aria-pressed, aria-current, aria-invalid, aria-describedby
- [x] Mobile-first: alturas default mobile (48px input/button)
- [x] Tailwind 100%, zero CSS inline
- [x] Documentação atualizada com inventário e interfaces resumidas

---

**Fim da v2 do design system. Próximo: PR E (`<VehicleImage>` com bateria de 12 testes).**
