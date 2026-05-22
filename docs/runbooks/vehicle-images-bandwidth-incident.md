# Incidente — outbound bandwidth do frontend (Render)

**Data:** 2026-05-13
**Severidade:** P1 (Render Billing acendendo overage de bandwidth).
**Status do fix:** correção completa neste commit.

## Sintoma

Render Billing mostrou consumo extremo de **Outbound Bandwidth**, quase todo em "HTTP Responses". O portal tem volume real de visitas baixíssimo (ainda em desenvolvimento), então o consumo era anormal — só faz sentido se o origin estiver servindo bytes pesados em loop.

## Causa raiz

Três caminhos somados estavam canalizando bytes de imagem pelo Render:

1. **`/api/vehicle-images` streamando bytes** ([frontend/app/api/vehicle-images/route.ts](../../frontend/app/api/vehicle-images/route.ts)).

   - Para `?key=` lia o R2 via BFF (`readImageFromR2Direct`) e devolvia o buffer.
   - Para `?src=` lia disco local + backend e devolvia o blob.
   - Resultado: cada imagem de anúncio ia para o R2/backend, atravessava o Render como response, e saía pelo origin.

2. **Otimizador `/_next/image` aberto para qualquer HTTPS** ([frontend/next.config.mjs](../../frontend/next.config.mjs)).

   - `remotePatterns` incluía `{ hostname: "**" }`.
   - O componente `<VehicleImage>` chamava `next/image` sem `unoptimized` para URLs do R2, do backend e do próprio proxy `/api/vehicle-images`.
   - Resultado: caminho duplo — browser → `/_next/image?url=...` → Render busca do R2/proxy → Render reotimiza → Render serve. Bandwidth contado duas vezes.

3. **Normalização forçava `/uploads/` para o proxy** ([frontend/lib/vehicle/detail-utils.ts](../../frontend/lib/vehicle/detail-utils.ts)).
   - `normalizeVehicleImageUrl` converte `/uploads/...` para `/api/vehicle-images?src=...` incondicionalmente.
   - Anúncios cuja URL canônica é `/uploads/...` eram servidos pelo Render mesmo quando havia URL pública R2 disponível em outro campo.

Combinação: cada visita (humana ou bot) que carregava um card ou galeria detonava 4-30 requests de imagem, todas pelo origin do Render.

## O que foi corrigido

| Arquivo                                                                                      | Mudança                                                                                                                                                                                                                                                                                                                                                                                                   |
| -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [frontend/app/api/vehicle-images/route.ts](../../frontend/app/api/vehicle-images/route.ts)   | **Caminho padrão agora é 302 redirect.** `?key=` → `R2_PUBLIC_BASE_URL`/`NEXT_PUBLIC_R2_PUBLIC_BASE_URL`. `?src=` ou `?key=` sem base → 302 para `/images/vehicle-placeholder.svg`. Streaming só atrás de `VEHICLE_IMAGE_PROXY_FALLBACK_ENABLED=true` (default false). Diagnósticos JSON em stdout atrás de `IMAGE_PROXY_DIAGNOSTICS_ENABLED=true`.                                                       |
| [frontend/lib/images/image-optimization.ts](../../frontend/lib/images/image-optimization.ts) | `shouldSkipNextImageOptimizer` agora pula `/api/vehicle-images`, `/uploads/`, `/_next/image`, `/images/`, host R2 público (lido de `NEXT_PUBLIC_R2_PUBLIC_BASE_URL`), e qualquer `*.onrender.com`. Mantém otimização só para SVG/data:/hosts externos legítimos (Unsplash).                                                                                                                               |
| [frontend/lib/vehicle/detail-utils.ts](../../frontend/lib/vehicle/detail-utils.ts)           | `buildVehicleImageProxyUrlFromStorageKey` agora gera URL absoluta direta no CDN quando `NEXT_PUBLIC_R2_PUBLIC_BASE_URL` está setado. `normalizeVehicleImageUrl` re-hidrata `/api/vehicle-images?key=...` persistido em DB para CDN direto em runtime. Conversão `/uploads/` → proxy passou a respeitar `PUBLIC_EMIT_LEGACY_IMAGE_PROXY` (default false em prod): em prod, `/uploads/` cai no placeholder. |
| [frontend/next.config.mjs](../../frontend/next.config.mjs)                                   | Removido `{ hostname: "**" }`. Apenas `images.unsplash.com` e `localhost` permanecem.                                                                                                                                                                                                                                                                                                                     |
| [frontend/lib/config/feature-flags.ts](../../frontend/lib/config/feature-flags.ts)           | Documentadas três novas envs: `publicR2BaseUrl`, `vehicleImageProxyFallback`, `imageProxyDiagnostics`.                                                                                                                                                                                                                                                                                                    |
| [frontend/components/ui/VehicleImage.tsx](../../frontend/components/ui/VehicleImage.tsx)     | Sem mudança de lógica: já consumia `shouldSkipNextImageOptimizer`. Comentário atualizado.                                                                                                                                                                                                                                                                                                                 |

## Fluxos

### Antes (origin Render servia bytes)

```
Browser ──▶ /_next/image?url=/api/vehicle-images?key=K
              └▶ Render (Next optimizer)
                   └▶ /api/vehicle-images?key=K
                       └▶ R2 (readImageFromR2Direct via BFF)  ──▶ bytes
                   ◀── otimiza / cropa ────────────────────── bytes
            ◀── bytes ─────────────────────────────────────── bytes
```

Em cada hop o Render contabiliza outbound bandwidth.

### Agora (zero origin bytes no caminho padrão)

```
Browser ──▶ <img src="https://cdn.carrosnacidade.com/vehicles/abc/foto.webp">
              └▶ Cloudflare CDN ──▶ bytes diretos para o browser
```

Para URLs persistidas em DB como `/api/vehicle-images?key=KEY`:

```
SSR/CSR normalize ──▶ rewrite para https://cdn.../KEY (via detail-utils)
```

Se o normalize falhar (ex.: storage_key ausente):

```
Browser ──▶ /api/vehicle-images?key=KEY
              └▶ Render handler ──▶ 302 https://cdn.../KEY ──▶ Browser
                                                              └▶ Cloudflare CDN
```

Render só vê o 302 (alguns bytes de header). Zero bytes de imagem.

### Fallback de emergência

`VEHICLE_IMAGE_PROXY_FALLBACK_ENABLED=true` reativa o streaming (R2 BFF → Render → browser). Só em incidente de CDN.

## Riscos e fallback

| Risco                                                           | Mitigação                                                                                                                                                                                                                                     |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Anúncios antigos sem `storage_key` mas com `/uploads/...` no DB | Em produção (`legacyImageProxy=false`) renderizam o placeholder. Se necessário, set `PUBLIC_EMIT_LEGACY_IMAGE_PROXY=true` + `VEHICLE_IMAGE_PROXY_FALLBACK_ENABLED=true` temporariamente, e migrar os anúncios para storage_key em background. |
| CDN R2 fora do ar                                               | Set `VEHICLE_IMAGE_PROXY_FALLBACK_ENABLED=true` no Render. Mas o overage de bandwidth volta enquanto estiver ligado.                                                                                                                          |
| `NEXT_PUBLIC_R2_PUBLIC_BASE_URL` esquecido no Render            | `buildVehicleImageProxyUrlFromStorageKey` cai no proxy `/api/vehicle-images?key=...`, que sem fallback responde 302 para placeholder → tudo aparece como "sem foto". Sintoma visível e óbvio em staging.                                      |

## Como validar no navegador

1. Abrir uma página com cards (`/comprar/sp/sao-paulo` ou similar).
2. DevTools → **Elements** → buscar `<img`. Verificar que os `src` apontam para:
   - `https://<cdn>.carrosnacidade.com/...` ✅
   - **não** `/_next/image?...` ❌
   - **não** `/api/vehicle-images?...` ❌ (exceto fallback raro)
3. DevTools → **Network** → filtrar por **Img**. Confirmar que `Domain` é o CDN R2, não o domínio do Render.
4. Para uma imagem que (por bug) caia no `/api/vehicle-images`: deve aparecer como **302** com Location apontando para o CDN.

## Como validar no Render Metrics

1. Render dashboard → frontend service → **Metrics** → **Outbound Bandwidth**.
2. Comparar **Last 1h** vs. **Last 24h** após o deploy. A inclinação tem que cair visivelmente — esperado 80-95% de redução no caminho padrão de imagens.
3. Se subir `IMAGE_PROXY_DIAGNOSTICS_ENABLED=true` por 30 min, os logs do Render devem mostrar **mode: redirect-r2** dominando. **mode: r2-direct-stream** / **backend-stream** / **local-stream** deve aparecer raramente (e zero se `VEHICLE_IMAGE_PROXY_FALLBACK_ENABLED=false`).

## Plano de rollback

| Mudança                                    | Como reverter                                                                                                                                                                                             |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `route.ts` 302 redirect                    | Set `VEHICLE_IMAGE_PROXY_FALLBACK_ENABLED=true` no Render. Volta a streamar — mas o ganho de bandwidth desaparece.                                                                                        |
| `image-optimization.ts` skip otimizer      | `git revert` do commit. Volta `/_next/image` para hosts internos. Não recomendado.                                                                                                                        |
| `detail-utils.ts` redirect /uploads → null | Set `PUBLIC_EMIT_LEGACY_IMAGE_PROXY=true` no Render. Volta a converter `/uploads/` para proxy (que agora responde 302 para placeholder de qualquer jeito, então o efeito visual é o mesmo — placeholder). |
| `next.config.mjs` sem `**`                 | `git revert`. Re-abre o otimizador para qualquer HTTPS. Não recomendado.                                                                                                                                  |

`git revert` do commit inteiro é seguro e completamente reversível — nenhuma das mudanças é destrutiva.

## Lições

- Bandwidth ataca pelo flanco oposto do storage: storage cresce por write; bandwidth cresce por read. Ambos exigem amostragem/redirecionamento agressivo.
- "Origin é proxy de CDN" é o anti-padrão central. Servir 302 e deixar o CDN trabalhar é quase sempre certo.
- `next/image` `hostname: "**"` parece inofensivo no review (nada quebra) mas converte o origin em otimizador de imagens da internet inteira.

---

## 2ª iteração — kill switch global de `next/image` (2026-05-13, mesmo dia)

A validação no DevTools após a 1ª iteração mostrou que imagens R2 **ainda passavam por `/_next/image`** com query `url=https%3A%2F%2Fpub-...r2.dev/...`. Duas razões:

1. **`NEXT_PUBLIC_R2_PUBLIC_BASE_URL` não estava setada no Render.** Apenas `R2_PUBLIC_BASE_URL` (backend) estava. O bundle do client não tinha visão do host R2 e o helper `shouldSkipNextImageOptimizer` não reconhecia `pub-*.r2.dev`.
2. **8 componentes contornam o `VehicleImage` e usam `next/image` direto:** `VehicleGallery`, `MobileHero`, `dashboard/AdCard`, `account/AdsPremiumList`, `impulsionar/[adId]`, `seo/LocalSeoLanding`, `VehicleGalleryLightbox`, `admin/moderation/[id]`. Eles não passam pelo helper de jeito nenhum.

### Correções aplicadas

| Arquivo                                                                                      | Mudança                                                                                                                                                                           |
| -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [frontend/next.config.mjs](../../frontend/next.config.mjs)                                   | **`images.unoptimized = true`** — kill switch global. Qualquer `<Image>` no app renderiza `<img>` com src original, sem prefixo `/_next/image`. Zero bytes pelo origin do Render. |
| [frontend/lib/images/image-optimization.ts](../../frontend/lib/images/image-optimization.ts) | `shouldSkipNextImageOptimizer` agora reconhece qualquer host terminando em `.r2.dev` ou `.r2.cloudflarestorage.com` por padrão, sem depender de env. Defesa em profundidade.      |
| Testes                                                                                       | +5 testes cobrindo o exato sintoma do incidente (`pub-*.r2.dev` sem env, host R2 case-insensitive, kill switch ativo no config).                                                  |

### Trade-off do kill switch

`unoptimized: true` global desliga otimização de variantes responsivas para **todas** as imagens da aplicação, incluindo Unsplash e assets locais. Isso pode aumentar marginalmente o peso de algumas imagens externas (banners CMS, hero), mas:

- O ganho real para imagens internas era pequeno (R2 já entrega WebP otimizado em CDN edge).
- O custo do otimizador era pago em bandwidth do Render, o flanco que estamos protegendo.
- A perda visual é zero — só muda o pipeline.

### Follow-up planejado (não bloqueia o fix)

Para um dia voltar a otimizar imagens externas (Unsplash etc.):

1. Converter os 8 bypasses para usar `<VehicleImage>` ou aplicar `unoptimized={true}` consistentemente:
   - [components/vehicle/VehicleGallery.tsx](../../frontend/components/vehicle/VehicleGallery.tsx) — já tem `unoptimized`, mas vale unificar
   - [components/vehicle/mobile/MobileHero.tsx](../../frontend/components/vehicle/mobile/MobileHero.tsx) — **sem proteção**
   - [components/dashboard/AdCard.tsx](../../frontend/components/dashboard/AdCard.tsx) — `unoptimized={!startsWith("/")}` (R2 ok, legados não)
   - [components/account/AdsPremiumList.tsx](../../frontend/components/account/AdsPremiumList.tsx) — idem
   - [app/impulsionar/[adId]/page.tsx](../../frontend/app/impulsionar/[adId]/page.tsx) — **sem proteção, crítico**
   - [components/seo/LocalSeoLanding.tsx](../../frontend/components/seo/LocalSeoLanding.tsx)
   - [components/vehicle/VehicleGalleryLightbox.tsx](../../frontend/components/vehicle/VehicleGalleryLightbox.tsx)
   - [app/admin/moderation/[id]/page.tsx](../../frontend/app/admin/moderation/[id]/page.tsx)
2. Setar `NEXT_PUBLIC_R2_PUBLIC_BASE_URL` no Render (espelha `R2_PUBLIC_BASE_URL`).
3. Remover `images.unoptimized: true` do next.config — o teste `next.config.test.ts` vai chiar, atualizar nele também.

### Validação final no DevTools

Após este deploy:

- Network → **Img** deve mostrar requests indo para `pub-*.r2.dev` ou domínio R2 público direto.
- Não deve aparecer `/_next/image?...` para nenhuma imagem — nem mesmo Unsplash.
- Não deve aparecer `/api/vehicle-images?...` como caminho padrão (raro fallback ainda possível para anúncios sem `storage_key`).

### Rollback adicional

| Mudança                                           | Como reverter                                                                                                                                                                   |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `images.unoptimized: true`                        | Remover a linha. Voltar a depender só do `shouldSkipNextImageOptimizer` + listar todos os hosts no `remotePatterns`. Não recomendado enquanto os 8 bypasses não forem migrados. |
| Detecção de `.r2.dev`/`.r2.cloudflarestorage.com` | `git revert` do commit. Volta a depender de `NEXT_PUBLIC_R2_PUBLIC_BASE_URL` estar setado.                                                                                      |
