# IMAGES — Componente oficial de imagem de veículos

| Campo           | Valor                                                                                                                                                              |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Versão**      | 1 (PR E entregue)                                                                                                                                                  |
| **Data**        | 2026-04-24                                                                                                                                                         |
| **Branch**      | `claude/sad-elbakyan-8155e1`                                                                                                                                       |
| **Status**      | ✅ PR E — `<VehicleImage>` disponível em `components/ui/`. Não substitui usos existentes ainda (PR F+).                                                            |
| **Referências** | [DIAGNOSTICO_REDESIGN.md §8.5](./DIAGNOSTICO_REDESIGN.md#85-contrato-de-imagens) e [§8.5.1](./DIAGNOSTICO_REDESIGN.md#851-bateria-obrigatória-de-testes-de-imagem) |

---

## 0. Por que existe

Antes do PR E, imagens de anúncios eram renderizadas com:

- `next/image` direto (algumas vezes sem `sizes` → CLS + bandwidth desperdiçado)
- `<img>` cru em alguns lugares (sem otimização)
- Fallback inconsistente quando imagem falhava (broken image, layout shift, ou nada)
- Lógica de URL espalhada em adapters (R2, /uploads, /api/vehicle-images)

O PR E concentra tudo em **um componente oficial**: `<VehicleImage>`. PRs futuros (F em diante) migram usos existentes para ele. Este PR **não** muda nenhuma página — apenas entrega o componente, testes e doc.

---

## 1. Arquivos

| Arquivo                                              | Tipo   | Linhas | Função                                                                |
| ---------------------------------------------------- | ------ | -----: | --------------------------------------------------------------------- |
| `frontend/components/ui/VehicleImage.tsx`            | Client |   ~110 | Wrapper de `next/image` com fallback automático e `sizes` por variant |
| `frontend/components/ui/VehicleImagePlaceholder.tsx` | Server |    ~75 | SVG inline (carro estilizado) com width/height obrigatórios           |
| `frontend/components/ui/VehicleImage.test.tsx`       | Test   |   ~210 | 17 testes unit (IMG-1, IMG-3, IMG-4, IMG-10, IMG-11 + compat)         |
| `frontend/e2e/image-fallback.spec.ts`                | E2E    |    ~60 | IMG-5 + IMG-9 (skip-on-empty)                                         |
| `frontend/scripts/lint-images-sizes.mjs`             | Script |   ~155 | Guardrail IMG-6: detecta `<img>` cru e `<Image>` sem `sizes`          |

Reuso direto (sem duplicação):

- `frontend/lib/images/image-optimization.ts` (`shouldSkipNextImageOptimizer`)
- `frontend/lib/vehicle/detail-utils.ts` (`LISTING_CARD_FALLBACK_IMAGE`)
- `frontend/app/api/vehicle-images/route.ts` (BFF de imagens — não tocado)

---

## 2. API

```tsx
import { VehicleImage } from "@/components/ui/VehicleImage";

<VehicleImage
  src={string | null | undefined}    // qualquer URL (R2, proxy, /uploads, externa, data:)
  alt={string}                       // obrigatório
  width={number}                     // obrigatório (px) — para zero CLS
  height={number}                    // obrigatório (px)
  variant="card" | "gallery" | "thumb" | "hero"  // default: "card"
  sizes?={string}                    // override do default da variant
  priority?={boolean}                // default: false (apenas acima da dobra)
  className?={string}                // classes para o wrapper
  onError?={() => void}              // hook opcional
  fallbackLabel?={string}            // texto do placeholder quando falha
/>
```

### `sizes` por variant (default)

| variant   | sizes                                                      |
| --------- | ---------------------------------------------------------- |
| `card`    | `(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw` |
| `gallery` | `(max-width: 768px) 100vw, 800px`                          |
| `thumb`   | `96px`                                                     |
| `hero`    | `100vw`                                                    |

---

## 3. Compatibilidade garantida

| Cenário                                                                        | Comportamento                                         |
| ------------------------------------------------------------------------------ | ----------------------------------------------------- |
| URL R2 (`https://r2.carrosnacidade.com/...`)                                   | `next/image` otimiza                                  |
| Proxy `/api/vehicle-images?key=...`                                            | `next/image` otimiza (vai por `/_next/image?url=...`) |
| URL legada `/uploads/...`                                                      | `next/image` otimiza                                  |
| URL externa HTTPS                                                              | `next/image` otimiza (passa por `remotePatterns`)     |
| `data:` URI                                                                    | `unoptimized` (sem `/_next/image`)                    |
| `.svg`                                                                         | `unoptimized`                                         |
| Anúncio sem imagem (`src=""` ou `null`)                                        | Placeholder direto (sem nem tentar carregar)          |
| URL `LISTING_CARD_FALLBACK_IMAGE` (sentinel `/images/vehicle-placeholder.svg`) | Placeholder estilizado (não SVG raw)                  |
| Imagem 404 / timeout / erro                                                    | `onError` swap para placeholder mantendo dimensões    |

---

## 4. Bateria de testes IMG-1 a IMG-12

### Status atual (PR E)

| ID         | Cenário                           | Cobertura                                                                           | Status                           |
| ---------- | --------------------------------- | ----------------------------------------------------------------------------------- | -------------------------------- |
| **IMG-1**  | URL R2 válida                     | Unit (`VehicleImage.test.tsx`)                                                      | ✅ PR E                          |
| IMG-2      | Upload via `/api/vehicle-images`  | E2E real (publicar)                                                                 | ⏸ PR M                          |
| **IMG-3**  | Sem imagem (vazio/null/undefined) | Unit, 4 casos                                                                       | ✅ PR E                          |
| **IMG-4**  | Imagem quebrada → fallback        | Unit, com `fireEvent.error`                                                         | ✅ PR E                          |
| **IMG-5**  | Fallback sem CLS                  | E2E (`image-fallback.spec.ts`) — valida width/height inline no placeholder          | ✅ PR E (skip-on-empty até PR G) |
| **IMG-6**  | Lint imagens sem `sizes`          | CI script (`scripts/lint-images-sizes.mjs`) — modo warn neste PR, strict após PR F+ | ✅ PR E                          |
| IMG-7      | Domínio não permitido             | next.config.mjs `remotePatterns`                                                    | ⏸ PR de segurança               |
| IMG-8      | SVG bloqueado                     | next.config.mjs `dangerouslyAllowSVG`                                               | ⏸ PR de segurança               |
| **IMG-9**  | Lazy load abaixo da dobra         | E2E (`image-fallback.spec.ts`)                                                      | ✅ PR E (validação de presença)  |
| **IMG-10** | `priority` acima da dobra         | Unit, valida `fetchpriority="high"` + ausência de `loading="lazy"`                  | ✅ PR E                          |
| **IMG-11** | `srcset` responsivo               | Unit, 4 casos com cada variant                                                      | ✅ PR E                          |
| IMG-12     | Galeria swipe sem CLS             | E2E em `vehicle-detail-premium.spec.ts` (já existe spec)                            | ⏸ PR I (detalhe)                |

**Entregues no PR E**: 7 dos 12 (IMG-1, IMG-3, IMG-4, IMG-5, IMG-6, IMG-9, IMG-10, IMG-11) — somando **17 testes unit + 2 testes E2E**.

**Adiados** (entregue em PR específico cujo escopo natural cobre o caso):

- IMG-2 → PR M (publicar — único momento que upload real acontece)
- IMG-7 / IMG-8 → PR de segurança (mexe em `next.config.mjs`, escopo isolado)
- IMG-12 → PR I (detalhe — única página com galeria)

---

## 5. Decisões intencionais

### 5.1. Não mexer em `next.config.mjs` neste PR

`remotePatterns` atual permite `**` (qualquer host) e `dangerouslyAllowSVG: true`. O diagnóstico recomenda restringir, mas:

- Restrição quebra imagens em produção se algum domínio inesperado estiver em uso.
- Mudança afeta toda a aplicação (todas as `<Image>` existentes).
- Escopo de segurança/infra, não de design system.

**Plano**: PR de segurança dedicado, com:

1. Auditoria dos hosts realmente usados (via Render logs ou snapshot).
2. Restrição gradual de `remotePatterns`.
3. Remoção de `dangerouslyAllowSVG` após confirmar que nenhuma imagem de produção é SVG legítimo.
4. Substituição do `vehicle-placeholder.svg` (servido como SVG file) por nosso `<VehicleImagePlaceholder>` inline.

### 5.2. Não integrar com `AdCard` neste PR

Regra do usuário: _"Não alterar `AdCard` visualmente neste PR, exceto se for estritamente necessário"_. Como a integração não é estritamente necessária (o componente é independente e tem suite de testes própria), fica para **PR F**. Lá, `AdCard` é refatorado em variantes e passa a usar `<VehicleImage>` em todas elas.

### 5.3. Placeholder com SVG inline (não arquivo `.svg`)

`VehicleImagePlaceholder` renderiza SVG inline (sem fetch), evitando:

- Dependência de `dangerouslyAllowSVG` no `next/image`.
- Latência de rede para placeholder.
- Acoplamento a `/images/vehicle-placeholder.svg` (que pode mudar de path).

Inline `style={{width, height}}` é exceção justificada: dimensões dinâmicas vindas de props, Tailwind não cobre todas combinações arbitrárias. Cores/spacing continuam Tailwind.

### 5.4. `onError` é Client (justificado)

`VehicleImage` é Client Component porque precisa de `useState` para registrar erro e fazer swap para placeholder. Sem isso, falha de imagem deixa quadro vazio (CLS) ou broken image.

`VehicleImagePlaceholder` é Server (puro render).

### 5.5. Lint IMG-6 em modo `warn` no PR E

Estado inicial detectou **5 violações pré-existentes**:

- 4 `<img>` cru (componentes legados)
- 1 `<Image>` sem `sizes`

Mantemos modo `warn` (não bloqueia merge) até PRs F+ migrarem esses 5 usos. Trocar para `strict` em PR de cleanup quando o número chegar a 0.

---

## 6. Como usar

### 6.1. Em um card (PR F+)

```tsx
import { VehicleImage } from "@/components/ui/VehicleImage";

<article className="rounded-lg border bg-white">
  <VehicleImage
    src={ad.images?.[0] ?? ad.image_url ?? null}
    alt={`${ad.brand} ${ad.model} ${ad.year}`}
    width={400}
    height={300}
    variant="card"
    className="rounded-t-lg"
  />
  {/* preço, modelo, etc. */}
</article>;
```

### 6.2. Em um hero (PR G — home)

```tsx
<VehicleImage
  src={hero.imageUrl}
  alt="Carro em destaque"
  width={1200}
  height={600}
  variant="hero"
  priority // primeira imagem da página
/>
```

### 6.3. Em galeria (PR I — detalhe)

```tsx
<VehicleImage
  src={photo.url}
  alt={`Foto ${index + 1} do veículo`}
  width={800}
  height={600}
  variant="gallery"
  priority={index === 0} // só a primeira
/>
```

### 6.4. Em thumbnail (PR I — galeria de thumbs)

```tsx
<VehicleImage
  src={photo.url}
  alt={`Miniatura ${index + 1}`}
  width={96}
  height={96}
  variant="thumb"
/>
```

---

## 7. Validações (PR E)

| Comando                                              | Status                                       |
| ---------------------------------------------------- | -------------------------------------------- |
| `npx vitest run components/ui/VehicleImage.test.tsx` | ✅ 17/17 passam                              |
| `npm run lint:images`                                | ⚠️ 5 violações pré-existentes em modo `warn` |
| `npm run lint:guardrails`                            | ✅ inclui images agora                       |
| `npm run typecheck`                                  | (validar no commit)                          |
| `npm run lint`                                       | (validar no commit)                          |
| `npm run build`                                      | (validar no commit)                          |
| `npx playwright test --list`                         | (validar no commit — 56+ testes)             |

---

## 8. Próximos passos

| PR                              | O que faz com `<VehicleImage>`                                                                                                |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| **PR F** (`<AdCard>` unificado) | Substitui imagem dos cards atuais por `<VehicleImage variant="card">`                                                         |
| **PR G** (Home)                 | Hero usa `<VehicleImage variant="hero" priority>`; carrossel usa `card`                                                       |
| **PR I** (Detalhe)              | Galeria principal usa `<VehicleImage variant="gallery">` + thumbnails `<VehicleImage variant="thumb">`. IMG-12 validado aqui. |
| **PR M** (Publicar)             | Preview de fotos no wizard usa `<VehicleImage>`. IMG-2 validado aqui.                                                         |

Após PR F+M, o lint `lint:images` deve voltar a 0 violações e ser elevado para `strict` em CI.

---

**Fim da documentação de imagens.**
