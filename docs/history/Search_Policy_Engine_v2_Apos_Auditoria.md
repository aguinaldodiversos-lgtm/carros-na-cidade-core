> **STATUS: HISTÓRICO — NÃO NORMATIVO**
>
> Este documento registra o estado das decisões em 07/09/2026, antes da implementação das fases F1 e F2.
> Existia apenas fora do git até 2026-09-10. Algumas regras foram posteriormente substituídas — inclusive o
> comportamento inicial da página de cidade (§12–13) e a política de descoberta e relaxação (§17–18).
> As substituições estão em `docs/Search_Policy_Decisions_2026-09.md`.
> A futura especificação normativa será a v3. Até sua criação e commit, este documento permanece apenas
> como fonte histórica para a consolidação.
> Não utilizar como especificação de implementação. Não editar: correções vão na futura v3.

# Carros na Cidade — Search Policy Engine v2.0
## Especificação revisada após auditoria do HEAD

**Data:** 07/09/2026  
**Status:** arquitetura funcional formalizada; implementação ainda não autorizada  
**Base técnica considerada:** auditoria somente leitura do HEAD `feat/catalogo-shell-largo-comprar @ 7ee7599c`  
**Objetivo:** consolidar uma arquitetura inteligente, profissional e escalável de busca, território e ranking comercial, aproveitando a infraestrutura já existente e evitando reconstruções futuras.

---

# 1. Resumo executivo

A auditoria mostrou que o Carros na Cidade já possui boa parte da infraestrutura necessária:

- ranking comercial 4/3/2/1 já é data-driven;
- Destaque ativo já eleva o anúncio à camada 4 por `highlight_until`;
- busca livre já usa PostgreSQL Full Text Search (`tsvector`, `plainto_tsquery`, `ts_rank`);
- filtro multi-cidade por `city_slugs[]` já existe;
- `region_memberships.distance_km` já armazena distância entre cidades;
- cache já varia por território e `q`;
- cidades ativas possuem coordenadas;
- paginação e filtros já estão centralizados no backend.

Portanto, o novo sistema não deve reconstruir o portal. Ele deve acrescentar uma camada explícita de política entre a intenção do usuário e a busca já existente.

O núcleo passa a ser:

```text
INTENÇÃO
↓
CONTEXTO DE BUSCA
↓
ESCOPO GEOGRÁFICO
↓
LIQUIDEZ
↓
CANDIDATOS ELEGÍVEIS
↓
PESO COMERCIAL
↓
DISTÂNCIA
↓
ROTAÇÃO / DIVERSIDADE
↓
FACETAS
↓
PAGINAÇÃO
↓
FRONTEND
```

A principal correção conceitual em relação à primeira especificação é:

> **Território é filtro de elegibilidade, não chave de ordenação.**

Depois que um anúncio está dentro do território permitido, a prioridade comercial vence a distância:

```text
Destaque 4
> Pró 3
> Start 2
> Grátis 1
```

A distância organiza anúncios de mesmo peso.

---

# 2. Princípios invariáveis

## 2.1 Existência da cidade — NÃO ALTERAR

A existência da página pública de uma cidade depende exclusivamente de anúncios `ACTIVE` próprios daquela cidade.

```text
0 ACTIVE próprios
→ página pública da cidade não existe

>= 1 ACTIVE próprio
→ página pública da cidade existe
```

Anúncios vizinhos:

- não criam uma cidade;
- não mantêm uma cidade existente;
- não afetam a regra de existência;
- não mudam canonical, H1 ou identidade territorial.

Essa regra permanece completamente separada do Search Policy Engine.

## 2.2 Indexação e existência continuam separadas

A regra atual deve permanecer independente:

```text
>= 1 ACTIVE próprio
→ cidade existe

limiar de indexação
→ regra SEO separada
```

No estado atual auditado, o limiar padrão de indexação é 3 anúncios próprios.

Esse projeto não altera essa política sem decisão específica posterior.

## 2.3 Uma única página territorial por cidade

Exemplo:

```text
/carros-em/braganca-paulista-sp
```

A página continua representando Bragança Paulista mesmo quando o usuário amplia a descoberta para cidades vizinhas.

Raio altera o conjunto de anúncios.

Raio não altera a identidade da página.

---

# 3. Separação fundamental: produto x geografia

Toda busca deve possuir dois eixos independentes.

## Produto

```text
query
marca
modelo comercial
versão
ano
preço
quilometragem
carroceria
câmbio
combustível
abaixo da FIPE
vendedor
...
```

## Geografia

```text
cidade de origem
fonte da localização
modo geográfico
raio solicitado
raio efetivo
UF explícita
Brasil explícito
```

Regra:

> **Produto determina relevância. Geografia determina quem é territorialmente elegível.**

---

# 4. Novo conceito central: SearchContext

O backend deve trabalhar conceitualmente com um único contexto de busca.

```text
SearchContext

intent:
    type
    specificity
    geo_strength

product:
    q
    brand
    commercial_model
    raw_model
    version
    year_from
    year_to
    price_min
    price_max
    mileage_max
    transmission
    fuel
    body_type
    below_fipe
    seller_kind
    ...

geo:
    origin_city_id
    origin_city_slug
    location_source
    mode
    requested_radius_km
    effective_radius_km
    user_geo_explicit

ranking:
    policy_version
    commercial_weight_enabled
    distance_enabled
    rotation_enabled
    diversity_enabled

pagination:
    page
    page_size
```

Os nomes acima são conceituais. Não é obrigatório renomear estruturas atuais apenas para coincidir com esta especificação.

---

# 5. Fontes de localização e precedência

A auditoria encontrou um risco real: a cidade inferida do texto pode sobrescrever o `city_slug` da rota.

Isso deve ser eliminado com uma política explícita de precedência.

Ordem recomendada:

```text
1. USER_SELECTED
2. EXPLICIT_QUERY
3. CITY_PAGE
4. GEOLOCATION
5. SESSION_DEFAULT
```

Definições:

- `USER_SELECTED`: cidade/raio escolhido manualmente no filtro;
- `EXPLICIT_QUERY`: localização escrita na busca;
- `CITY_PAGE`: cidade determinada pela URL atual;
- `GEOLOCATION`: localização autorizada pelo navegador;
- `SESSION_DEFAULT`: última localização válida da sessão.

Regra:

> Uma fonte de menor prioridade nunca pode sobrescrever silenciosamente uma fonte de maior prioridade.

---

# 6. Modos geográficos formais

O Search Policy Engine deve possuir modos explícitos.

| Modo | Significado |
|---|---|
| `EXACT_CITY` | somente a cidade-base |
| `AUTO_RADIUS` | motor escolhe o menor raio útil |
| `MANUAL_RADIUS` | usuário definiu explicitamente o raio |
| `STATE` | usuário escolheu uma UF |
| `NATIONAL` | usuário escolheu Brasil |

`STATE` e `NATIONAL` não são expansões automáticas normais.

---

# 7. Raio territorial normal

Na experiência territorial de cidade:

```text
0 km
25 km
50 km
75 km
```

## 0 km

```text
Apenas [cidade]
```

## 25 / 50 / 75 km

Incluem cidades cuja distância geográfica real em relação à cidade-base esteja dentro do limite.

A fronteira de UF não participa dessa decisão.

---

# 8. Fronteira estadual deve deixar de limitar o raio

A auditoria comprovou que `region_memberships` atualmente não possui relações cross-UF.

Isso é incompatível com o produto.

Casos reais:

```text
Bragança-SP ↔ Extrema-MG
Atibaia-SP ↔ Extrema-MG
```

formam um mercado regional real.

Regra definitiva:

> **Raio geográfico atravessa UF.**

`SP`, `MG`, `RJ` etc. são atributos administrativos; não devem funcionar como barreira automática em `AUTO_RADIUS` ou `MANUAL_RADIUS`.

---

# 9. `distance_km` é a verdade geográfica; `layer` não é

A estrutura atual possui:

```text
layer 0 = self
layer 1 = até 30 km
layer 2 = 30–60 km
layer 3 = 60–100 km
```

Isso não corresponde aos raios do produto:

```text
0 / 25 / 50 / 75 / 150
```

Portanto:

> O Search Policy Engine deve selecionar cidades por `distance_km`, não por `layer`.

Exemplo:

```text
distance_km <= effective_radius_km
```

`layer` pode permanecer por compatibilidade ou otimização, mas não deve ser a regra funcional.

---

# 10. Estrutura geográfica recomendada

A infraestrutura atual pode ser reaproveitada.

Conceitualmente:

```text
region_memberships

base_city_id
member_city_id
distance_km
layer    -- legado / auxiliar
```

A geração futura deve:

- remover o bloqueio por UF;
- incluir relações até o maior raio útil da política;
- preservar self-row;
- possuir índice eficiente por `base_city_id + distance_km`.

Para a política v1, recomenda-se cobertura pré-computada de pelo menos 150 km.

---

# 11. Não calcular distância anúncio por anúncio

O anúncio pertence a uma cidade.

Logo, para descoberta territorial:

```text
distância do anúncio
≈ distância entre cidade de origem e cidade do anúncio
```

Isso permite:

- consulta simples;
- cache eficiente;
- ranking previsível;
- menor custo que cálculo geográfico por anúncio.

---

# 12. Classificação da intenção

O motor não deve tratar todas as pesquisas da mesma forma.

## GEO_FORTE

Exemplos:

```text
"carros em Bragança Paulista"
"carros aqui na cidade"
"veículos em Atibaia"
```

Comportamento inicial:

```text
mode = EXACT_CITY
effective_radius = 0
```

## PRODUTO

Exemplos:

```text
"comprar Onix"
"HB20 2020"
"Chevrolet"
"SUV automático"
```

Sem escolha geográfica manual:

```text
mode = AUTO_RADIUS
```

## PRODUTO + GEO

Exemplo:

```text
"HB20 2020 em Bragança Paulista"
```

Comportamento:

```text
origin = Bragança
mode = AUTO_RADIUS
```

O sistema encontra o menor território útil, salvo se o usuário tiver explicitamente limitado a distância.

---

# 13. Distinção crítica: 0 km implícito x 0 km explícito

Essa melhoria evita comportamento contraditório.

## 0 km implícito

O usuário entrou numa página de cidade e ainda não definiu território manualmente.

Exemplo:

```text
/carros-em/braganca-paulista-sp
```

A página começa mostrando Bragança.

Se depois o usuário inicia uma busca de produto, o sistema pode migrar para `AUTO_RADIUS`.

## 0 km explícito

O usuário clicou:

```text
Apenas Bragança
```

Agora existe intenção manual.

Mesmo que ele filtre Onix:

```text
mode = EXACT_CITY
user_geo_explicit = true
```

O sistema não amplia silenciosamente.

Regra:

> **Escolha explícita sempre vence automação.**

---

# 14. Busca principal x refinamento lateral

## Busca principal

Cria ou altera a intenção principal.

Exemplo:

```text
Onix
```

Pode migrar da página territorial para a superfície de busca geral e ativar `AUTO_RADIUS`.

## Filtros laterais

Refinam o SearchContext atual.

Entretanto, se o usuário ainda estiver em território implícito e escolher uma dimensão forte de produto — marca/modelo — a política pode converter o contexto para `AUTO_RADIUS`.

Se o usuário já escolheu manualmente o território, o filtro de produto respeita esse território.

---

# 15. Transição entre página territorial e `/comprar`

Quando o usuário está em:

```text
/carros-em/braganca-paulista-sp
```

e inicia uma busca principal por:

```text
Onix
```

a experiência deve migrar para a superfície transacional geral:

```text
/comprar
```

preservando conceitualmente:

```text
q = onix
origin_city = braganca-paulista-sp
geo_mode = AUTO_RADIUS
location_source = CITY_PAGE
```

Isso evita uma página chamada “Carros em Bragança” exibindo inventário amplo sem correspondência semântica.

---

# 16. AUTO_RADIUS — menor território útil

O motor deve escolher o menor território capaz de entregar uma busca saudável.

Exemplo:

```text
Onix
origem = Atibaia
```

Contagens:

```text
0 km   = 3
25 km  = 7
50 km  = 16
75 km  = 27
150 km = 66
```

Se o alvo for 12:

```text
effective_radius = 50
```

Nunca escolher 75 ou 150 se 50 já forem suficientes.

---

# 17. Degraus de expansão

Política inicial:

```text
0
25
50
75
150 km
```

## 0 / 25 / 50 / 75

Escopo regional normal.

## 150

Escopo de expansão automática especial para buscas de produto com baixa liquidez.

Não precisa aparecer como opção normal da página territorial.

---

# 18. AUTO nunca vira Brasil silenciosamente

Recomendação inicial:

```text
AUTO_RADIUS_MAX = 150 km
```

Se o estoque ainda for pequeno:

```text
Encontramos poucas ofertas em até 150 km.
```

A interface pode oferecer:

```text
Ver ofertas mais distantes
Pesquisar em todo o Brasil
```

Somente uma ação explícita pode transformar a busca em `NATIONAL`.

---

# 19. LiquidityTarget adaptativo

Não deve existir um único número fixo de resultados saudáveis.

A necessidade depende da especificidade.

Exemplo inicial:

| Consulta | Target aproximado |
|---|---:|
| qualquer veículo | 24–40 |
| carroceria | 20–24 |
| marca | 16–20 |
| modelo | 12–16 |
| modelo + ano | 8–12 |
| versão + ano | 4–8 |

Os valores são configuração.

A arquitetura permanece a mesma.

---

# 20. Specificity Score

A política pode calcular a especificidade a partir de:

```text
marca
modelo comercial
versão
ano
preço
carroceria
câmbio
combustível
...
```

Quanto maior a especificidade:

```text
menor LiquidityTarget necessário
```

O sistema deixa de depender de regras especiais para cada carro.

---

# 21. Liquidity Quality Score — evolução profissional

Em escala, quantidade sozinha não basta.

O motor deve poder evoluir para avaliar:

```text
quantidade de anúncios
+
número de vendedores
+
diversidade de versões
+
diversidade de preço
+
qualidade/freshness
-
duplicidade
-
concentração excessiva
```

Exemplo:

```text
12 anúncios de 1 loja
```

não têm a mesma qualidade que:

```text
12 anúncios de 6 vendedores
```

A versão inicial pode usar quantidade; o contrato deve permitir evolução sem reescrita.

---

# 22. Histerese de liquidez para evitar comportamento instável

Uma melhoria adicional é evitar que pequenas oscilações de estoque façam o raio mudar excessivamente.

Exemplo:

```text
target modelo = 12
```

Não é desejável:

```text
12 anúncios → 50 km
11 anúncios → 75 km
12 anúncios → 50 km
```

em mudanças frequentes.

Pode existir uma margem configurável:

```text
target = 12
expand_below = 10
contract_above = 14
```

Isso é especialmente útil se o alcance automático for persistido por sessão.

Não é obrigatório no MVP, mas a arquitetura deve permitir.

---

# 23. Produto comercial normalizado

A auditoria encontrou um problema estrutural:

```text
ads.model
```

guarda a descrição FIPE completa, por exemplo:

```text
ONIX SEDAN Plus LT 1.0 12V Flex 4p Mec.
```

Isso não deve ser tratado como “modelo comercial”.

O SearchContext deve distinguir:

```text
brand = Chevrolet
commercial_model = Onix
raw_model = descrição FIPE
version = configuração/versão quando disponível
```

---

# 24. Aproveitar a derivação já existente

A rota SEO existente já utiliza lógica equivalente a:

```text
deriveCommercialModel
commercialModelSlug
```

Essa inteligência deve ser reaproveitada para:

- faceta Modelo;
- parser da busca;
- Specificity Score;
- LiquidityTarget;
- páginas SEO;
- sugestões;
- analytics.

Não é necessário, inicialmente, criar uma grande tabela de catálogo FIPE nova apenas para resolver o Search Policy Engine.

---

# 25. Evolução futura da taxonomia

Quando houver escala, recomenda-se migrar de derivação em runtime para uma taxonomia normalizada.

Possível projeção futura:

```text
ad_vehicle_taxonomy

ad_id
brand_normalized
commercial_model
version_normalized
fipe_code
year_model
```

Isso não é requisito da primeira implementação.

É uma evolução de performance e consistência.

---

# 26. Busca textual atual deve ser preservada

A auditoria confirmou uma boa base:

```text
search_vector
@@ plainto_tsquery('portuguese', q)
```

com:

```text
ts_rank
GIN index
```

Não deve ser substituída por `ILIKE`.

---

# 27. Melhorias futuras de normalização de query

Problema conhecido:

```text
HB20
```

e:

```text
HB 20
```

podem produzir comportamento diferente.

Melhorias possíveis:

- normalização de tokens;
- aliases;
- sinônimos;
- trigram apenas como fallback;
- dicionário de modelos comerciais.

Essas melhorias são independentes da implantação territorial e não precisam entrar na primeira fase.

---

# 28. Correspondência de produto precede monetização

Busca:

```text
Onix
```

deve formar candidatos Onix.

Um Spin Destaque não deve vencer um Onix gratuito.

Regra:

```text
produto correto
↓
território elegível
↓
peso comercial
```

Recomendações alternativas podem aparecer em bloco separado.

---

# 29. Ranking comercial — regra definitiva

A fórmula atual deve ser preservada conceitualmente:

```text
effective_weight =
MAX(
    highlight ativo ? 4 : 0,
    peso do plano
)
```

Pesos:

```text
Destaque = 4
Pró      = 3
Start    = 2
Grátis   = 1
```

---

# 30. Peso comercial vence distância

Após definir os candidatos territorialmente elegíveis:

```text
ORDER BY
effective_weight DESC,
distance_km ASC,
...
```

Exemplo:

```text
Destaque Bragança 22 km   peso 4
Pró Atibaia 0 km          peso 3
Grátis Atibaia 0 km       peso 1
```

Ordem:

```text
1. Destaque Bragança
2. Pró Atibaia
3. Grátis Atibaia
```

Essa regra protege o valor econômico dos planos.

---

# 31. Peso nunca fura o território

Exemplo:

```text
raio manual = 25 km
Destaque = 80 km
```

O Destaque não é elegível.

Portanto:

> **Território decide quem participa. Peso decide a prioridade entre quem participa.**

---

# 32. Distância organiza anúncios do mesmo peso

Exemplo:

```text
Destaque Bragança 0 km
Destaque Atibaia 18 km
Destaque Campinas 54 km
```

Ordem:

```text
0
18
54
```

A cidade-base não possui prioridade absoluta.

Ela ganha naturalmente em distância quando o peso é igual.

---

# 33. Não restaurar o sorter histórico distance-first

Código histórico tinha:

```text
distance
↓
highlight
```

como prioridade.

Isso não corresponde à regra comercial atual.

Não deve ser restaurado.

---

# 34. Rotação justa

Dentro de anúncios equivalentes:

```text
mesmo peso
mesma cidade / mesma distância
```

a ordenação deve evitar privilégio permanente.

A rotação deve ser:

- determinística;
- estável durante uma janela;
- compatível com cache;
- não aleatória por refresh.

Exemplo:

```text
rotation_window = 24h
```

---

# 35. Diversidade entre vendedores

Uma loja não deve monopolizar uma sequência inteira de anúncios equivalentes quando existem alternativas do mesmo nível.

A diversidade pode atuar depois de:

```text
peso
distância
```

Como anúncios da mesma cidade compartilham a mesma distância, existe espaço natural para alternância entre vendedores equivalentes.

A política deve ser configurável e ativada apenas quando houver liquidez suficiente.

---

# 36. Ranking recomendado

Pipeline formal:

```text
1. status / disponibilidade
2. correspondência com produto
3. território elegível
4. effective_commercial_weight DESC
5. distance_km ASC
6. diversity / rotation
7. quality / freshness
8. desempate determinístico
```

---

# 37. Nada de re-sort pós-paginação

A auditoria confirmou reordenação regional em JS após `LIMIT/OFFSET`.

Isso deve desaparecer.

Correto:

```text
candidatos
↓
ranking completo no backend/SQL
↓
LIMIT / OFFSET
↓
frontend
```

Incorreto:

```text
LIMIT / OFFSET
↓
reordenar página atual
```

---

# 38. Paginação deve ser estável

O ranking precisa possuir um desempate final determinístico.

Exemplo:

```text
rotation_key
created_at
id
```

A ordem exata será definida na implementação.

Objetivo:

- página 1 não muda arbitrariamente;
- página 2 não repete card da página 1;
- refresh não embaralha o catálogo;
- cache produz experiência estável.

---

# 39. Facetas devem usar o mesmo universo do grid

A auditoria confirmou divergência atual.

A nova regra:

> Todas as facetas visíveis devem ser calculadas sobre o mesmo Candidate Set da listagem, removendo apenas o próprio filtro quando necessário para UX de faceta.

Exemplo:

```text
Onix
até 50 km
preço <= 80 mil
```

Grid e facetas precisam usar o mesmo escopo territorial e de produto.

---

# 40. Facetas do tipo self-excluding

Uma evolução profissional é permitir que cada faceta ignore apenas a si própria.

Exemplo:

Usuário selecionou:

```text
Automático
```

A faceta “Câmbio” ainda pode mostrar:

```text
Automático (7)
Manual (9)
```

enquanto Marca, Modelo, Ano etc. continuam respeitando `Automático`.

Isso produz filtros mais úteis sem quebrar coerência.

Pode ser implementado progressivamente.

---

# 41. Cache atual deve ser aproveitado

A auditoria confirmou que território e `q` já participam da cache key.

Novos parâmetros relevantes devem entrar na allowlist:

```text
geo_mode
origin_city
radius
policy_version
```

A chave deve usar a SearchContext normalizada, evitando diferenças semânticas irrelevantes.

---

# 42. Cache em camadas

## Proximidade entre cidades

TTL longo.

## Contagem de liquidez

TTL curto/moderado.

## Resultado/facetas

TTL curto, dependente da volatilidade do estoque.

## Search Policy

Configuração versionada, praticamente estática por deploy.

---

# 43. Policy Version

Toda busca deve poder carregar:

```text
search_policy_version = v1
```

Futuras mudanças:

```text
v2
v3
```

podem alterar:

- target de liquidez;
- raio máximo;
- diversidade;
- rotação;
- thresholds;
- normalização.

Sem reconstruir endpoints ou frontend.

---

# 44. Observabilidade desde o início

Eventos recomendados:

```text
search.started
search.intent_resolved
search.scope_resolved
search.auto_radius_selected
search.radius_expanded
search.radius_manual
search.zero_results
search.results_served
search.result_clicked
vehicle.viewed
lead.created
whatsapp.clicked
```

Contexto:

```text
query
commercial_model
specificity_score
origin_city
location_source
geo_mode
requested_radius
effective_radius
result_count
seller_count
commercial_weight
distance
position
policy_version
```

---

# 45. Motor adaptativo baseado em dados no futuro

Após acumular dados suficientes, o `AUTO_RADIUS` pode considerar comportamento real por categoria.

Exemplo hipotético:

```text
Onix → compradores convertem mais em até 40 km
Strada → até 80 km
Porsche → até 180 km
```

Isso deve alterar parâmetros do `Scope Resolver`, não a arquitetura.

Não usar machine learning antes de volume suficiente.

---

# 46. IA generativa fora do caminho crítico

LLM não deve decidir:

- elegibilidade territorial;
- peso comercial;
- paginação;
- expiração do Destaque;
- regras de cidade.

O núcleo precisa ser:

- determinístico;
- explicável;
- testável;
- barato;
- reproduzível.

IA pode auxiliar em linguagem natural e recomendações futuras.

---

# 47. Otimização comercial do peso

A auditoria mostrou que a fórmula atual exige vários JOINs em listagens e contagens.

Não é necessário alterar isso imediatamente.

Estratégia escalável futura:

```text
base_commercial_weight
+
highlight_until
```

com:

```text
effective_weight =
MAX(base_commercial_weight, highlight_active ? 4 : 0)
```

O peso-base pode ser projetado/denormalizado quando métricas mostrarem que os JOINs se tornaram gargalo.

Não criar job obrigatório apenas para expirar Destaque; `highlight_until` deve continuar sendo a verdade temporal.

---

# 48. Read model de busca — opção futura

Se o catálogo crescer muito, pode ser criada uma projeção própria para busca:

```text
ad_search_projection

ad_id
city_id
commercial_model
brand_normalized
base_commercial_weight
highlight_until
search_vector
status
...
```

Atualizada em eventos de:

- publicação;
- edição;
- mudança de plano;
- mudança de destaque;
- mudança de status.

Isso reduz JOINs no caminho crítico sem alterar o Search Policy Engine.

Não é requisito do MVP.

---

# 49. UX de expansão automática

O sistema deve explicar o que fez.

Exemplos:

```text
16 Onix encontrados em até 50 km de Atibaia
```

ou:

```text
Poucas opções em Bragança.
Ampliamos a busca para 50 km.
```

Controle:

```text
○ Apenas Atibaia
○ 25 km
● 50 km  — automático
○ 75 km
```

---

# 50. Usuário sempre pode retomar controle

Ao clicar em qualquer raio:

```text
AUTO_RADIUS
↓
MANUAL_RADIUS
```

O motor deixa de expandir.

Pode existir uma ação:

```text
Usar alcance automático
```

para reativar a inteligência.

---

# 51. Página territorial não precisa de rota regional

A rota:

```text
/carros-usados/regiao/[slug]
```

não deve ser dependência do novo sistema.

Ela pode permanecer temporariamente por compatibilidade.

Decisão:

- não apagar sem auditoria de referências externas;
- não usar como núcleo da nova navegação;
- manter noindex/canonical atual até estratégia posterior.

---

# 52. Copy territorial precisa refletir a realidade

Hoje existe texto fixo semelhante a:

```text
Ofertas em {cidade} e região
```

mesmo quando apenas a cidade é carregada.

Nova regra:

## EXACT_CITY

```text
Ofertas em Bragança Paulista
```

## AUTO/MANUAL 25+

```text
Ofertas em Bragança Paulista e cidades próximas
```

## Busca de produto

```text
Onix encontrados em até 50 km de Bragança Paulista
```

---

# 53. SEO

Parâmetros transacionais:

```text
q
raio
sort
filtros
scope
```

não devem criar automaticamente novas landings indexáveis.

A política SEO atual de canonical/noindex deve ser preservada e apenas estendida para reconhecer novos parâmetros.

---

# 54. Modelo de URL conceitual

Exemplos:

## Territorial

```text
/carros-em/braganca-paulista-sp
```

## Territorial manual

```text
/carros-em/braganca-paulista-sp?raio=25
```

## Produto

```text
/comprar?q=onix&origem=braganca-paulista-sp
```

## Produto + raio manual

```text
/comprar?q=onix&origem=braganca-paulista-sp&raio=25
```

A nomenclatura real dos parâmetros deve ser definida após revisão da política de URL existente.

---

# 55. Fluxo de execução recomendado

```text
REQUEST
↓
1. Parse / normalize
↓
2. Resolve intent
↓
3. Resolve product dimensions
↓
4. Resolve location source
↓
5. Resolve geo mode
↓
6. Evaluate liquidity
↓
7. Resolve effective radius
↓
8. Resolve eligible city_slugs
↓
9. Build candidate SQL
↓
10. Apply commercial ranking
↓
11. Apply distance
↓
12. Apply rotation/diversity
↓
13. Calculate facets/count
↓
14. Paginate
↓
15. Cache
↓
16. Render
↓
17. Emit telemetry
```

---

# 56. Consulta de liquidez eficiente

Evitar cinco queries completas.

Preferir contagem acumulada por faixas numa operação.

Exemplo:

```text
0 km        3
1–25        4
25–50       9
50–75      11
75–150     30
```

Derivação:

```text
0   = 3
25  = 7
50  = 16
75  = 27
150 = 57
```

O Scope Resolver escolhe o menor raio que satisfaz o target.

---

# 57. Possível score de liquidez v2

Quando houver volume, usar algo como:

```text
LiquidityScore =
  w1 * result_count
+ w2 * unique_sellers
+ w3 * price_diversity
+ w4 * version_diversity
+ w5 * freshness
- w6 * duplicate_concentration
```

Não fixar pesos agora.

A importância é arquitetural: o Scope Resolver recebe um avaliador substituível/versionado.

---

# 58. Piloto recomendado

Cenários de aceitação prioritários:

## Atibaia

- 33 anúncios atuais;
- principal estoque;
- plano Pró ativo;
- valida peso comercial.

## Bragança Paulista

- 1 anúncio próprio;
- valida EXACT_CITY;
- valida expansão para Atibaia.

## Extrema-MG

- valida cross-UF;
- valida remoção da barreira estadual.

## Campinas/Jundiaí

- validam 50/75 km;
- validam expansão progressiva.

---

# 59. Cenários funcionais obrigatórios

## A — cidade pura

```text
/carros-em/braganca-paulista-sp
```

→ somente Bragança inicialmente.

## B — 25 km manual

→ apenas cidades <=25 km.

## C — 50 km manual

→ Extrema pode entrar mesmo sendo MG.

## D — Onix sem raio manual

→ `AUTO_RADIUS`.

## E — Onix + "Apenas Bragança" explícito

→ não expande.

## F — Destaque 20 km vs Pró 0 km

→ Destaque primeiro.

## G — Pró 0 km vs Pró 20 km

→ local primeiro.

## H — anúncio fora do raio

→ nunca entra, independentemente do peso.

## I — poucos resultados até 150 km

→ não vira nacional.

## J — modelo errado com peso maior

→ não entra no conjunto principal.

---

# 60. Testes técnicos obrigatórios

- cidade 0 ACTIVE próprio → 404;
- cidade 1 ACTIVE próprio → existe;
- vizinhas nunca criam cidade;
- cross-UF dentro do raio → elegível;
- `distance_km <= radius`;
- `effective_weight` 4/3/2/1;
- destaque expirado volta ao plano;
- peso vence distância;
- mesmo peso usa distância;
- filtro manual impede AUTO;
- AUTO usa menor raio útil;
- AUTO respeita teto;
- `q` preservado em redirects;
- localização de menor prioridade não sobrescreve explícita;
- facetas usam mesmo candidate set;
- ordenação ocorre antes de LIMIT/OFFSET;
- paginação é estável;
- cache diferencia SearchContext relevante;
- query normalizada preserva semântica.

---

# 61. Governança de branch antes de implementar
> Obsoleto — a governança de branch foi resolvida na F0, em sentido diferente do descrito aqui.

A auditoria revelou:

```text
HEAD = 21 commits à frente de main
produção = main
```

e a Fase 5.0B não está em `main`.

Antes de qualquer alteração:

1. definir qual branch será a fonte real da próxima release;
2. preservar os 21 commits posteriores;
3. não reconstruir a solução sobre `main` apenas porque produção ainda está ali;
4. não fazer cherry-pick/restauração cega de código histórico;
5. usar commits antigos apenas como documentação.

---

# 62. O que NÃO deve ser alterado por este projeto

- regra de existência territorial;
- limiar SEO sem decisão específica;
- canonical territorial;
- sitemap;
- layout aprovado;
- shell 1600;
- comportamento mobile aprovado;
- header;
- fluxo de pagamento;
- módulos legais;
- funcionalidades não relacionadas.

---

# 63. Fases recomendadas de implementação

## Fase 0 — branch/release baseline

Definir a árvore que efetivamente será deployada.

## Fase 1 — fundação de dados geográficos

- rebuild cross-UF;
- cobertura até 150 km;
- índice por distância;
- manter self-row.

## Fase 2 — SearchContext / Scope Resolver

- `location_source`;
- `EXACT/AUTO/MANUAL/STATE/NATIONAL`;
- precedência de localização;
- raio efetivo.

## Fase 3 — Liquidity Evaluator

- Specificity Score;
- targets configuráveis;
- menor raio útil;
- teto automático.

## Fase 4 — ranking SQL

- peso 4/3/2/1;
- distância;
- rotação determinística;
- remover re-sort pós-paginação.

## Fase 5 — facetas e paginação

- mesmo Candidate Set;
- counts coerentes;
- paginação estável.

## Fase 6 — taxonomia de produto

- modelo comercial;
- faceta Modelo;
- parser;
- Specificity Score.

## Fase 7 — frontend

- slider 0/25/50/75;
- indicador AUTO;
- mensagens de expansão;
- transição cidade → `/comprar`.

## Fase 8 — telemetria

- eventos de busca;
- métricas de raio;
- métricas de conversão.

## Fase 9 — otimização opcional

- denormalização de peso;
- read model;
- Liquidity Quality Score;
- diversidade avançada.

---

# 64. Arquitetura final

```text
                        USER ACTION
                            │
                            ▼
                    QUERY NORMALIZER
                            │
                            ▼
                     INTENT RESOLVER
                            │
              ┌─────────────┴─────────────┐
              │                           │
        PRODUCT RESOLVER            LOCATION RESOLVER
              │                           │
              └─────────────┬─────────────┘
                            ▼
                      SEARCH CONTEXT
                            │
                            ▼
                       SCOPE RESOLVER
                            │
              ┌─────────────┼──────────────┐
              │             │              │
           EXACT          AUTO           MANUAL
            CITY          RADIUS          RADIUS
                            │
                            ▼
                   LIQUIDITY EVALUATOR
                            │
                            ▼
                  EFFECTIVE RADIUS / SCOPE
                            │
                            ▼
                    ELIGIBLE CITY SET
                            │
                            ▼
                    CANDIDATE SEARCH
                            │
                            ▼
            COMMERCIAL WEIGHT 4 → 3 → 2 → 1
                            │
                            ▼
                       DISTANCE ASC
                            │
                            ▼
                 ROTATION / DIVERSITY
                            │
                            ▼
                   FACETS + COUNT
                            │
                            ▼
                      PAGINATION
                            │
                            ▼
                         CACHE
                            │
                            ▼
                        FRONTEND
                            │
                            ▼
                       TELEMETRY
```

---

# 65. Regra definitiva resumida

> **O Carros na Cidade procura o veículo no menor território capaz de oferecer uma busca útil, sem ultrapassar qualquer limite geográfico explicitamente escolhido pelo usuário.**

> **A fronteira de estado não limita um raio geográfico.**

> **O território define quais anúncios podem participar.**

> **Entre os anúncios elegíveis e corretos para a busca, a prioridade comercial é Destaque 4 > Pró 3 > Start 2 > Grátis 1.**

> **Entre anúncios do mesmo peso, a distância organiza a ordem.**

> **Toda ordenação ocorre antes da paginação.**

> **Facetas, total e grid usam o mesmo universo de candidatos.**

> **À medida que o estoque cresce, o sistema naturalmente se torna mais local sem precisar alterar a arquitetura.**

---

# 66. Checklist curto para ChatGPT / Claude / Codex

Ao receber este documento, qualquer agente deve respeitar:

```text
1. NÃO alterar a regra de existência das cidades.
2. NÃO restaurar código antigo cegamente.
3. Uma cidade = uma página territorial.
4. 0/25/50/75 são os raios regionais normais.
5. AUTO_RADIUS pode usar 150 km como expansão especial configurável.
6. Cross-UF deve funcionar por distância.
7. distance_km é a verdade; layer não é regra de produto.
8. Escolha manual sempre vence AUTO.
9. Diferenciar 0 km implícito de 0 km explícito.
10. Busca de produto pode migrar para /comprar com origem preservada.
11. Produto correto é requisito antes do ranking comercial.
12. Território = elegibilidade, NÃO prioridade absoluta.
13. Peso: Destaque 4 > Pró 3 > Start 2 > Grátis 1.
14. Peso vence distância.
15. Peso nunca fura o território.
16. Mesmo peso → distância ASC.
17. Não restaurar sorter histórico distance-first.
18. Ranking completo acontece antes de LIMIT/OFFSET.
19. Facetas e grid usam o mesmo Candidate Set.
20. Normalizar modelo comercial sem destruir a descrição FIPE.
21. Preservar Full Text Search atual.
22. location_source tem precedência explícita.
23. AUTO nunca vira Brasil silenciosamente.
24. Política deve ser versionável/configurável.
25. Frontend representa o estado; não reconstrói a lógica.
26. Primeiro definir a branch real de release.
```

---

**Fim — Search Policy Engine v2.0**
