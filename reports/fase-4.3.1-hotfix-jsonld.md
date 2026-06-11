# Fase 4.3.1 — hotfix de tipos JSON-LD

Data: 2026-06-10
Branch: main

## 1. Causa raiz

**Veículo sem `Product`/`Car`.** O `buildVehicleJsonLd` emitia um nó com
`@type: ["Product","Car"]` (**array**). Consequências:
- O smoke por regex `"@type":"Product"` (e validadores/AI que casam tipo como
  string) **não detectam** o array → o anúncio "some" como Product/Car.
- O único `@type` string sobrando na página era `Thing` (do `WebPage.about`),
  dando a impressão de que o veículo saía só como Thing.

**Abaixo da FIPE sem `BreadcrumbList`/`FAQPage`.** A página
`/carros-baratos-em/[slug]` é renderizada pela factory `createLocalSeoPage`, que
só emitia BreadcrumbList para a variant `"em"` e **não tinha FAQ** — apesar de a
página `baratos` ser canônica de si mesma (tem direito ao próprio breadcrumb).

## 2. Correção

### Veículo ([vehicle-structured-data.ts](frontend/lib/seo/vehicle-structured-data.ts) + [page](frontend/app/veiculo/[slug]/page.tsx))
`buildVehicleJsonLd` agora retorna **dois nós de TIPO ÚNICO**:
- **`Product`** (obrigatório) com `name`, `brand`, `model`, `sku`, `category`
  "Veículo usado", `itemCondition` UsedCondition, `image` (ImageObject + URLs),
  `areaServed` e **`offers` (Offer dentro)**: `price`, `priceCurrency` BRL,
  `availability` InStock, `url`, `seller` (AutoDealer loja / Person particular).
- **`Car`** com specs: `vehicleModelDate`, `mileageFromOdometer`, `fuelType`,
  `vehicleTransmission`, `color`, `bodyType`, `vehicleConfiguration`, `image`.

A página renderiza o array (`schemaVehicle.map(...)`). Resultado: `"@type":"Product"`,
`"@type":"Offer"` e `"@type":"Car"` agora detectáveis; **nunca só Thing**.
§2 respeitado: `price`/`km`/`areaServed` só entram quando há dado real (e a página
exibe esses dados).

### Abaixo da FIPE ([local-seo-metadata.ts](frontend/lib/seo/local-seo-metadata.ts) + [factory](frontend/lib/seo/local-seo-route.tsx))
- Novo `buildBaratosBreadcrumbJsonLd(model)` → **BreadcrumbList** Início → UF →
  "Carros baratos em [Cidade]" (URL self `/carros-baratos-em/[slug]`).
- A factory, **só na variant `baratos`**, emite o breadcrumb + um **FaqBlock
  visível** (`buildBelowFipeFaqEntries`: o que é / por que / golpe / laudo
  cautelar) + **FAQPage** (`buildFaqPageJsonLd`, só porque o FAQ está visível).
- `automaticos` (noindex,follow → consolida em /carros-em) permanece sem
  breadcrumb/FAQ, de propósito.

## 3. Testes

- [vehicle-structured-data.test.ts](frontend/lib/seo/vehicle-structured-data.test.ts)
  reescrito: Product (tipo único), Offer dentro do Product, Car com specs,
  **nunca contém Thing**, ImageObject, AutoDealer/Person, sem-preço, sem-nome → [].
- Novo [local-seo-breadcrumb.test.ts](frontend/lib/seo/local-seo-breadcrumb.test.ts):
  BreadcrumbList de `baratos` (com/sem UF, slug/cidade ausentes → null).
- FAQ de abaixo-da-FIPE já coberto por `faq.test.ts`.
- Frontend completo: **126 arquivos / 1705 testes verdes**. `tsc --noEmit` limpo.
  (Sem mudança de backend nesta 4.3.1.)

## 4. Smoke esperado em produção

```powershell
# Veículo
$html = (Invoke-WebRequest "https://www.carrosnacidade.com/veiculo/<slug>" -UseBasicParsing).Content
[regex]::Matches($html, '"@type"\s*:\s*"[^"]+"') | %{ $_.Value } | Sort-Object -Unique
# Esperado incluir: "@type":"Product"  "@type":"Offer"  "@type":"Car"  "@type":"BreadcrumbList"

# Abaixo da FIPE
$html = (Invoke-WebRequest "https://www.carrosnacidade.com/carros-baratos-em/sao-paulo-sp" -UseBasicParsing).Content
[regex]::Matches($html, '"@type"\s*:\s*"[^"]+"') | %{ $_.Value } | Sort-Object -Unique
# Esperado incluir: "@type":"CollectionPage"  "@type":"ItemList"  "@type":"BreadcrumbList"  "@type":"FAQPage"
```
+ Rich Results Test / Schema Validator nas duas URLs.

## 5. Limitações

- A `areaServed`/cidade no Product depende de a página exibir a cidade (exibe);
  caso um anúncio venha sem cidade, o campo é omitido (não inventa).
- `automaticos` segue sem breadcrumb/FAQ (decisão: é noindex e consolida sinal).

## 6. Veredito

**APROVADO.** Hotfix curto e cirúrgico: Product+Offer+Car detectáveis no veículo
(sem cair em Thing), Breadcrumb + FAQPage na página abaixo da FIPE — coerentes
com o conteúdo visível, testados, sem regressão (suíte frontend verde, tsc limpo).
