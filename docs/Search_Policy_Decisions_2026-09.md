# Search Policy Engine — Registro de decisões (setembro/2026)

Fonte de primeira mão: decisões do dono do produto, posteriores à especificação v2.0
(`docs/history/Search_Policy_Engine_v2_Apos_Auditoria.md`). Onde este registro contradiz a v2.0,
este registro vence. Onde a v2.0 não é citada, a decisão é nova.
A partir de DEC-25, docs/F2_GATE_SQL.md não é fonte normativa; é evidência histórica.

Este arquivo é fonte normativa para a v3 (`docs/Search_Policy_Engine_v3_Consolidado.md`). Os relatórios F1/F2 são evidência de implementação,
não fonte de norma, mesmo onde reproduzem estas decisões.

Formato de cada entrada: enunciado · relação com a v2.0 · status · data.

---

## Decisões de produto

### DEC-01

DEC-01 — A cidade existe no catálogo se, e somente se, tiver ≥ 1 anúncio ACTIVE próprio (da própria cidade, não do território). · Confirma v2.0 §2.1. · Vigente · 2026-09.

### DEC-02

DEC-02 — Cidade com 0 ACTIVE próprio responde 404 na rota territorial. Anúncios de cidades vizinhas não criam existência. · Confirma v2.0 §2.1. · Vigente · 2026-09.

### DEC-03

DEC-03 — `/carros-em/[cidade]` nasce em perfil BROWSE_CITY com modo AUTO_RADIUS. O AUTO escolhe o menor território que atinge liquidez útil: se a própria cidade tem estoque suficiente, o raio efetivo é 0 km; senão, expande para 25, 50 ou 75 km, nessa ordem, parando no primeiro que atinge o alvo. Isso não altera existência (DEC-01), canonical nem identidade territorial da página. Quando o raio efetivo for maior que 0, a página declara o raio ao usuário — o copy não pode apresentar como "carros em X" um conjunto que inclui cidades vizinhas. · Substitui v2.0 §12 (EXACT_CITY para "carros em cidade") e §13 (0 km implícito na abertura). Mantém v2.0 §52 (copy reflete a realidade). · Vigente · 2026-09.

### DEC-04

DEC-04 — AUTO usa sempre o menor território necessário para atingir o alvo de liquidez do perfil. Nunca "o maior possível". · Confirma v2.0 §16. · Vigente · 2026-09.

### DEC-05

DEC-05 — Escolha manual de raio ou escopo sempre vence o AUTO. O usuário pode retomar o controle em qualquer ponto. · Confirma v2.0 §50. · Vigente · 2026-09.

### DEC-06

DEC-06 — Território é resolvido por `distance_km`, atravessa fronteira de UF, e não usa `layer` como critério de inclusão. · Confirma v2.0 §8 e §9. · Vigente · 2026-09.

### DEC-07

DEC-07 — Peso comercial (Destaque 4 > Pró 3 > Start 2 > Grátis 1) vence distância; distância só ordena entre anúncios de mesmo peso; peso nunca inclui anúncio fora do território. · Confirma v2.0 §29–§32. · Vigente · 2026-09.

### DEC-08

DEC-08 — CandidateScope é a fonte única: grid, contagem total e facetas saem das mesmas regras de elegibilidade e produto. As projeções derivadas, inclusive facetas self-excluding e relaxações, podem remover deliberadamente uma única restrição para responder à sua própria pergunta, sem criar um universo territorial ou de produto independente. · Confirma e explicita v2.0 §39–§40. · Vigente · 2026-09.

### DEC-09

DEC-09 — `commercial_model` é dimensão de produto de primeira classe (faceta, filtro por igualdade case-insensitive, peso A no vetor de busca). · Confirma v2.0 §23–§24. · Vigente · 2026-09.

### DEC-10

DEC-10 — Preferências explícitas do usuário (preço, ano, câmbio, km, modelo) não autorizam o sistema a fazer concessões silenciosas ilimitadas para atingir o alvo. · Nova. · Vigente · 2026-09.

### DEC-11

DEC-11 — Quando o resultado fica abaixo do alvo de liquidez após o AUTO ter construído o território inicial útil (DEC-03/DEC-04), o sistema não expande mais sozinho: entra em Guided Relaxation. Ele calcula o efeito de cada concessão possível — distância (inclusive o degrau de 150 km), preço, ano, câmbio, quilometragem — e apresenta as opções; o usuário escolhe. Em particular, o degrau de 150 km deixa de ser expansão automática dos perfis de busca e passa a ser uma concessão de distância oferecida como as demais. · Substitui v2.0 §17 (150 como degrau automático de busca de produto) e §18 na parte em que o AUTO expandia até o teto antes de parar. · Vigente · 2026-09.

### DEC-12

DEC-12 — Relaxação preserva a intenção: relaxar preço, ano, câmbio, km ou distância mantém o mesmo produto. Modelo alternativo nunca é relaxação — é recomendação separada, apresentada como tal. · Nova. · Vigente · 2026-09.

### DEC-13

DEC-13 — As facetas são guiadas pelo estoque e derivadas das mesmas regras do CandidateScope. Uma faceta ativa é calculada de forma self-excluding, removendo apenas a própria restrição para revelar alternativas válidas. Opções com `count = 0` não são oferecidas como novas escolhas; a opção atualmente ativa pode permanecer visível mesmo com zero para explicar o estado e permitir sua remoção. Facetas com baixo poder discriminativo podem permanecer em “Mais filtros”, sem deixar de estar disponíveis ao usuário quando possuírem opções reais. · Nova; deriva de v2.0 §39–§40. · Vigente · 2026-09.

### DEC-14

DEC-14 — Zero conhecido não é oferecido como nova escolha: a UI não oferece filtro, valor de faceta, expansão territorial ou concessão que o sistema já sabe produzir zero resultados adicionais. Restrições e chips já ativos permanecem visíveis mesmo em estado zero, para explicar o estado atual e permitir sua remoção. Estados zero causados por URL antiga, mudança de estoque, cache ou condição concorrente não são tratados como impossíveis: entram no fluxo de recuperação e Guided Relaxation. · Nova. · Vigente · 2026-09.

### DEC-15

DEC-15 — Cidade sem página (0 ACTIVE próprio) pode, no futuro, ser origem de busca geográfica sem ganhar rota territorial. Não altera DEC-01/DEC-02. · Nova. · Prevista, sem fase definida · 2026-09.

### DEC-17

DEC-17 — Os alvos de liquidez por perfil são configuração (`platform_settings`), não constante. Valores iniciais v1: BROWSE_CITY 20 · BROWSE_CATEGORY 16 · SEARCH_BRAND 16 · SEARCH_MODEL 12 · SEARCH_MODEL_YEAR 8 · SEARCH_VERSION 4. Ficam abaixo da faixa sugerida na v2.0 §19 de propósito: com o estoque atual (algumas dezenas de anúncios ativos no total), alvos maiores levariam toda navegação ao raio máximo e destruiriam a territorialidade. Gatilho de revisão: telemetria de `search.executed` indicando catálogo pobre no raio inicial, ou estoque numa origem piloto suficiente para sustentar alvos maiores. · Ajusta v2.0 §19 (faixa sugerida) mantendo o princípio de configurabilidade. · Vigente, transitória · 2026-09.

### DEC-18

DEC-18 — Quando uma busca de produto chega diretamente a /comprar com origem conhecida e sem raio ou escopo manual, o sistema primeiro calcula um território-base de descoberta usando a política BROWSE_CITY daquela origem. Esse baseline é construído antes de permitir que as preferências explícitas de produto provoquem qualquer expansão territorial e fica limitado aos anéis automáticos normais 0/25/50/75 km. Em seguida, os filtros explícitos de produto são aplicados dentro desse território-base. Se o resultado ficar abaixo do target do perfil de produto, entra em Guided Relaxation (DEC-11); o sistema não amplia silenciosamente além do baseline. · Nova; explicita DEC-03/DEC-04/DEC-11 para entrada direta em /comprar. · Vigente · 2026-09.

### DEC-19

DEC-19 — Um raio explicitamente informado pelo usuário e válido para a política é sempre intenção manual e mantém sua medida exata, mesmo quando não corresponde a um dos anéis normalmente oferecidos pela interface. Assim, uma URL legada como raio=40 significa MANUAL_RADIUS de 40 km: não é arredondada para 50 km, não é ignorada e nunca pode voltar silenciosamente para AUTO_RADIUS. A interface principal pode continuar oferecendo apenas 0/25/50/75 km; isso não altera a semântica de valores manuais válidos já recebidos. Guided Relaxation pode oferecer ao usuário uma ampliação posterior, mas nunca aplicá-la sem ação explícita. · Nova; reforça DEC-05 e compatibilidade de URLs/estado explícito. · Vigente · 2026-09.

### DEC-20

DEC-20 — A avaliação de liquidez territorial usa contagens de candidatos agrupadas por cidade e associadas ao distance_km exato entre a origem e cada cidade. As cidades são ordenadas por distância e suas contagens são acumuladas até atingir o LiquidityTarget aplicável ao contexto avaliado. A distância exata em que o acumulado atinge o target é required_distance_km. Em modo automático, essa distância é convertida para o menor anel permitido que a contenha, produzindo effective_radius_km; o conjunto final inclui todos os candidatos elegíveis dentro desse anel, não apenas as cidades estritamente necessárias para alcançar matematicamente o target. Os anéis são política/UX; distance_km continua sendo a verdade geográfica. MANUAL_RADIUS mantém o raio exato solicitado e não sofre snap para anel. · Confirma e explicita o princípio de menor território útil da v2.0 §16 e a verdade geográfica da v2.0 §9, sem transformar layer ou bucket em regra funcional. · Vigente · 2026-09.

### DEC-21

DEC-21 — Guided Relaxation procura, para cada dimensão relaxável ativa, a menor concessão útil que efetivamente acrescenta resultados conhecidos, em vez de aplicar cegamente um percentual ou degrau fixo quando o estoque permite uma concessão menor. Para preço, procura o menor novo teto que desbloqueia candidatos e o apresenta com arredondamento amigável configurável que continue incluindo o candidato que justificou a sugestão; para ano, procura o ano imediatamente menos restritivo que acrescenta candidatos; para quilometragem, procura o menor limite superior útil, também sujeito a arredondamento amigável configurável; para distância, procura o primeiro anel permitido acima do território atual que acrescenta resultados, podendo chegar a 150 km; para câmbio, pode remover a restrição quando isso acrescentar candidatos. Uma alternativa cujo delta conhecido seja zero não é apresentada, conforme DEC-14. · Nova; detalha DEC-11 e DEC-14. · Vigente · 2026-09.

As relaxações não são ordenadas apenas por delta_count. Cada alternativa recebe uma avaliação determinística de benefício versus custo da concessão (relaxation_score conceitual), considerando pelo menos o número de resultados acrescentados e a magnitude relativa da mudança pedida ao comprador. Custos, arredondamentos e pesos são configuração versionável de política, não lógica espalhada pelo frontend. Uma concessão grande, como 25 → 150 km, não vence automaticamente uma concessão pequena apenas por acrescentar mais veículos. O sistema apresenta no máximo as melhores opções definidas pela política — inicialmente até três — e nenhuma é aplicada sem ação explícita do usuário. Modelo alternativo continua fora deste mecanismo, conforme DEC-12. Nenhum modelo de linguagem participa desse cálculo. · Nova; complementa DEC-11/DEC-12. · Vigente · 2026-09.

### DEC-22

DEC-22 — Preço é filtro primário permanente. A dimensão de preço permanece disponível no conjunto principal de filtros independentemente de entropia, ganho de informação ou poder discriminativo calculado para o SearchContext. A política adaptativa pode determinar quais outras dimensões ocupam os filtros principais e quais ficam em "Mais filtros", mas não pode rebaixar preço por esse critério. Counts, faixas e disponibilidade continuam derivados do CandidateScope e sujeitos a DEC-13/DEC-14. · Decide o que o gate deixou em aberto em D6. · Vigente · 2026-09.

### DEC-23

DEC-23 — AUTO abaixo do alvo termina no último território que acrescenta candidatos. Quando nenhum anel automático normal (0/25/50/75) atinge o LiquidityTarget, required_distance_km = null. O effective_radius_km não é elevado ao teto de 75 km por ter sido avaliado: corresponde ao menor anel que contém integralmente o conjunto final de candidatos, isto é, o último anel cuja inclusão efetivamente acrescentou candidatos. Anéis posteriores com delta zero não ampliam o território efetivo. Se nenhum anel externo acrescenta nada, effective_radius_km = 0. Em seguida, o SearchContext entra em Guided Relaxation. · Substitui a proposta do gate (D5) que exemplificava raio efetivo no teto sem atingir o alvo. Refina DEC-03 e DEC-20. · Vigente · 2026-09.

### DEC-24

DEC-24 — Faixa válida de raio explícito. Um raio explícito válido é um inteiro de quilômetros entre 0 e 150, inclusive; o máximo corresponde à cobertura pré-computada de region_memberships (v2.0 §10). Valores de 1 a 150 produzem MANUAL_RADIUS e preservam exatamente a medida informada, sem snap para anéis de UX. raio=0 é escolha geográfica explícita e produz EXACT_CITY com user_geo_explicit = true e expansão automática bloqueada. Valores negativos, não numéricos, fracionários ou superiores a 150 não são raios manuais válidos e nunca são silenciosamente arredondados para um valor aceito; o tratamento de UX/API do valor inválido não é definido nesta decisão. Com raio explícito válido presente, DEC-18 não se aplica: vale DEC-24 e DEC-05. · Delimita DEC-19; refina v2.0 §7 e §13. · Vigente · 2026-09.

### DEC-25

DEC-25 — Disposição normativa das propostas D1–D8 do gate (docs/F2_GATE_SQL.md @ 978c6715). Não existiu aprovação em bloco ("SQL OK") das oito; esta decisão as ratifica ou substitui uma a uma, e a partir dela o gate deixa de ser fonte normativa, permanecendo apenas como evidência.
D1 (origem= sem procedência → USER_SELECTED): não ratificada. A presença de origem= numa URL não prova ação manual; a precedência USER_SELECTED exige marcador de procedência. Pendente — a definir antes da F3, que é quem gera as URLs.
D2 (evitar casamento por substring): ratificado o comportamento — casamento locativo/semântico respeita fronteiras de palavra e não interpreta substrings acidentais. A parte "corrigir no caminho novo e manter o parser legado intacto" é estratégia de compatibilidade (ADI-03), não regra da política.
D3 (forma do CandidateScope): ratificado o princípio (DEC-08); a forma SQL é implementação, não norma.
D4 (preço +15% arredondado): superada por DEC-21.
D5 (SEARCH_MODEL automático até 150): superada por DEC-11, DEC-18 e DEC-23.
D6 (preço por entropia): superada por DEC-22.
D7 (liquidez agregada por cidade): ratificada a semântica por DEC-20; a forma SQL não é norma.
D8 (deltas do snapshot +3/+1/R$87k): não normativo; superado por DEC-21.
· Encerra a pendência de aprovação do gate. · Vigente · 2026-09.

### DEC-26

DEC-26 — Política inicial de Guided Relaxation: bandas de custo, boundary real e ordenação. Fixa o que DEC-21 deixou como `pendente` (pesos, custos por dimensão e quantums de arredondamento). DEC-21 **continua vigente** em todos os seus princípios gerais — menor concessão útil, nenhuma concessão autoaplicada, delta zero oculto, custo participando da ordenação, configuração versionada, nenhum modelo de linguagem no cálculo; o que DEC-26 acrescenta é a política concreta que preenche esses princípios, e DEC-21 **não** deve ser lida como se já os contivesse.

**Modelo de custo.** O custo de uma concessão é uma banda ordinal — `PEQUENA`, `MEDIA` ou `GRANDE` —, nunca um peso contínuo entre dimensões incomparáveis. A comparação de custo entre dimensões é categórica: uma concessão de banda menor **nunca** perde para uma de banda maior apenas por acrescentar mais resultados. É o que impede que uma ampliação de 25 km para 150 km vença automaticamente uma pequena concessão de preço, ano ou quilometragem por produzir `delta_result_count` maior.

**Menor concessão útil, dirigida por boundary real.** Para toda dimensão relaxável, o motor procura a menor mudança que efetivamente acrescente candidato, calculada a partir do estoque, e não um degrau fixo cego. Nenhuma concessão com `delta_result_count = 0` é oferecida (DEC-14). Ficam explicitamente superados como política vigente: preço +15% fixo; ano −2 fixo; quilometragem +25% fixa; "próximo anel" de distância quando esse anel não acrescenta resultados; e ordenação apenas por `delta_count`.

**Arredondamento.** Onde há quantum, o valor é sempre arredondado **para cima** a partir do boundary real, e o valor arredondado é simultaneamente o valor aplicado, o valor transportado na URL e o valor exibido ao usuário — os três são o mesmo número. É proibido arredondar para baixo quando isso excluir o candidato que justificou a concessão. A banda de custo é classificada **depois** desse arredondamento, sobre o valor final aplicado, e nunca sobre o boundary bruto: a sequência normativa é boundary real → arredondamento para cima pelo quantum da dimensão → valor final aplicado, transportado na URL e exibido → variação efetiva contra o limite atual → banda. Quando o arredondamento cruza uma fronteira de banda, vale a banda do valor final, porque é essa a concessão que o usuário realmente aceita: teto de preço de R$ 100.000 com boundary útil em R$ 104.800 e quantum de R$ 1.000 produz valor final R$ 105.000, variação efetiva de +5% e banda `PEQUENA`; se o arredondamento produzisse R$ 106.000, a variação efetiva seria de +6% e a banda, `MEDIA`. O mesmo vale para quilometragem — limite de 50.000 km com boundary útil em 59.200 km e quantum de 5.000 km produz 60.000 km, acréscimo efetivo de 10.000 km e banda `PEQUENA` — e para distância, como já mostra o exemplo normativo da concessão de 38,1 km para 40 km. Ano não tem quantum e não sofre essa distinção; câmbio é `GRANDE` por definição qualitativa.

**Fronteiras e quantums iniciais.**

- **preço máximo** — banda pela variação relativa ao teto atual: `PEQUENA` até +5%; `MEDIA` acima de 5% e até 10%; `GRANDE` acima de 10%. Quantum R$ 1.000.
- **ano mínimo** — banda pela quantidade de anos cedidos: `PEQUENA` 1 ano; `MEDIA` 2 anos; `GRANDE` 3 anos ou mais. Sem quantum: a concessão usa o próximo ano real disponível que acrescente resultado.
- **quilometragem máxima** — banda pela variação absoluta sobre o limite atual: `PEQUENA` até +10.000 km; `MEDIA` acima de 10.000 e até 25.000 km; `GRANDE` acima de 25.000 km. Quantum 5.000 km.
- **distância** — a concessão territorial **não** depende de presets de `rings_manual`. O motor localiza a menor distância real que inclua o primeiro candidato externo que acrescenta resultado, arredonda para cima ao quantum de 5 km e limita o valor final a 150 km. Banda pelo acréscimo sobre o território atual: `PEQUENA` até +25 km; `MEDIA` acima de 25 e até 50 km; `GRANDE` acima de 50 km. A concessão aceita passa a ser `MANUAL_RADIUS`; 150 km permanece proibido em AUTO (DEC-11, DEC-23). Exemplo normativo: território 25 km, primeiro candidato útil a 38,1 km, concessão final 40 km, acréscimo 15 km, banda `PEQUENA`. Outro: território 25 km, concessão necessária 150 km, acréscimo 125 km, banda `GRANDE`. Não existe lista normativa obrigatória de anéis de concessão.
- **câmbio** — remover a preferência de câmbio é concessão de banda `GRANDE`, por ser mudança qualitativa de preferência e não variação numérica pequena. Não é convertida em peso numérico contínuo.

**Elegibilidade mínima.** Uma concessão pode ser oferecida quando `delta_result_count >= 1`. Esta versão não exige mais de um resultado novo.

**Ordenação.** Na ordem: (1) menor banda de custo; (2) maior `delta_result_count`; (3) maior `delta_seller_count`; (4) maior `delta_city_count`; (5) `priority_order` determinístico. `delta_result_count` é o benefício principal; `delta_seller_count` e `delta_city_count` são desempates sucessivos e **não** entram em um score contínuo nesta versão. Liquidity Quality Score não é implementado aqui.

**`priority_order` inicial.** `price`, `year`, `mileage`, `radius`, `transmission`. Existe apenas como último desempate determinístico e **não** pode superar banda de custo nem benefício.

**Leveza operacional.** A busca normal não consulta automaticamente até 150 km: monta o CandidateScope no território atual e encerra se o alvo foi atingido. Somente quando a Guided Relaxation é necessária a dimensão de distância pode investigar até 150 km. A investigação ampliada é lazy e não vira custo permanente de toda busca.

**Natureza dos valores.** As fronteiras, os quantums, a banda do câmbio, o delta mínimo e o `priority_order` acima são parâmetros iniciais versionados de política, representáveis em `platform_settings.search_policy.relaxations` — não são constantes permanentes do produto. É normativo o conjunto estrutural: as bandas de custo, a ordem de decisão, o princípio do boundary real, o arredondamento para cima, o teto de 150 km para manual e concessão, o delta mínimo e a cadeia de desempates. Os valores podem ser recalibrados com telemetria mediante **nova** decisão normativa; até lá, valem os aqui fixados.

· Refina DEC-21, que segue vigente nos princípios; fixa os valores que ela deixou `pendente`. Preserva DEC-11, DEC-12, DEC-14 e DEC-24. Não altera DEC-22 nem DEC-23. Supera, para a dimensão de distância, a formulação de DEC-21 baseada em "primeiro anel permitido". · Vigente · 2026-09.

### DEC-27

DEC-27 — Granularidade da telemetria. Na fase atual, `search.executed` é evento **de busca**: representa uma execução de busca, não um resultado individual.

**Payload mínimo obrigatório de `search.executed`.** Somente grandezas definidas no nível da busca: (1) consulta; (2) modelo comercial; (3) especificidade; (4) cidade de origem; (5) fonte da localização; (6) modo geográfico; (7) raio solicitado; (8) raio efetivo; (9) contagem de resultados; (10) contagem de vendedores; (11) versão de política. A lista define a semântica; os nomes concretos das chaves podem seguir o contrato existente (por exemplo, `q` para a consulta e `total_count` para a contagem de resultados).

**Modelo comercial (`commercial_model`).** É o modelo comercial estruturado do SearchContext: uma busca estruturada por Onix produz `Onix`; um texto resolvido deterministicamente para Onix produz `Onix`; uma busca sem modelo comercial produz `null`. Nunca é a descrição FIPE, a versão, nem o modelo do primeiro anúncio retornado.

**Contagem de vendedores (`seller_count`).** É o número de vendedores/anunciantes distintos no mesmo CandidateScope e no mesmo território efetivo usados pela contagem de resultados, antes da paginação: mesmos filtros, mesmo SearchContext, mesma elegibilidade, sem ponderação comercial — `COUNT(DISTINCT advertiser_id)` ou equivalente semântico. Não conta apenas os vendedores da página atual e não é derivada da Guided Relaxation.

**Campos por resultado.** `commercial_weight` (peso comercial), `distance` (distância) e `position` (posição) **não** fazem parte do payload mínimo de `search.executed`. Pertencem somente a eventos futuros que identifiquem explicitamente **um resultado individual dentro de um SearchContext** (por exemplo, um evento de interação com um resultado de busca ou uma futura impressão por resultado). Quando esses eventos forem implementados:

- `position` é a posição 1-based daquele resultado na lista efetivamente apresentada naquele SearchContext;
- `commercial_weight` é o peso comercial efetivo daquele anúncio naquele SearchContext, conforme a regra de ranking vigente;
- `distance` é a distância daquele anúncio à origem efetiva daquele SearchContext, conforme a semântica geográfica vigente.

Nunca se emite `position = 1` artificialmente num evento de busca por se ter escolhido o primeiro resultado.

**Sem agregados inventados.** Os três campos não são substituídos em `search.executed` por média, mediana, máximo, mínimo ou valor do primeiro resultado sem nova decisão normativa.

**Contexto completo.** Para ADI-01 e para a v3 §16, após DEC-27, "contexto completo" significa o conjunto mínimo **search-scoped** definido acima e por `V3-INV-052`; não significa a transposição integral do vocabulário de 14 grandezas da v2.0 §44.

**Eventos granulares nesta fase.** A DEC-27 não exige a criação de novos eventos result-scoped na fase atual. O único evento obrigatório continua sendo `search.executed`, nos termos de ADI-01 e `V3-INV-052`. A eventual introdução de eventos result-scoped será objeto de contrato próprio posterior.

**Motivo.** Ambiguidade descoberta pela implementação F2.2-D1. A v2.0 §44 lista um único vocabulário de contexto compartilhado por eventos de granularidades diferentes — vários deles ligados a resultados, e não à busca como um todo (resultados servidos, clique no resultado, visualização do veículo, lead criado, clique de WhatsApp) —, e a v3 §16 havia transportado essa lista integralmente para o único evento vigente, que é por busca. Nenhuma fonte dizia de qual resultado um evento de busca extrairia peso comercial, distância e posição.

**Alternativas consideradas.** (A) usar o primeiro resultado; (B) usar um agregado do conjunto de resultados; (C) mover os campos result-scoped para os eventos por resultado futuros. **Decisão: C.** Razões: evita `position = 1` sem informação; evita agregados arbitrários; respeita a granularidade original dos eventos da v2.0 §44; permite completar `search.executed` com métricas realmente de busca.

· Refina ADI-01, que segue vigente; corrige a granularidade do payload mínimo que a v3 §16 importara integralmente da v2.0 §44, sem reduzir a observabilidade semanticamente útil. Posterior às certificações MET-01 e DEC-26 da v3, que não a cobrem. · Aprovada · Vigente · 2026-09.

### DEC-28

DEC-28 — O território-base de descoberta é **piso, não teto**. A busca de produto com origem conhecida e sem escolha manual constrói o território em duas etapas e fica com a maior delas: (1) o baseline de descoberta da origem, calculado pela política BROWSE_CITY sobre a liquidez **sem** filtro de produto (DEC-18); (2) o território automático do **perfil de produto em jogo**, calculado sobre a liquidez **com** os filtros ativos, usando o alvo e o teto automático desse perfil, pelas mesmas regras de DEC-04 e DEC-20. O resultado é o menor território que atinge o alvo do perfil e nunca menor que o baseline. Continua valendo DEC-23: quando nenhum anel automático atinge o alvo, a expansão termina no último anel que efetivamente acrescentou candidatos, e anéis seguintes com delta zero não ampliam o território. Continuam valendo DEC-10 e DEC-11: acima do teto automático do perfil o sistema não expande sozinho — 150 km permanece concessão de Guided Relaxation —, e a escolha manual de raio ou escopo vence tudo (DEC-05, DEC-24).

**Motivo.** A última frase de DEC-18 — "o sistema não amplia silenciosamente além do baseline" — foi escrita para impedir que preferências de produto ampliassem o território sem limite, e vinha sendo lida como teto. Lida assim, ela inverte o princípio de DEC-03/DEC-04: quanto **mais** estoque próprio a cidade de origem tem, **menor** o território da busca de produto, porque o baseline é satisfeito em 0 km por anúncios que nada têm a ver com a busca. Caso observado em produção em 2026-09: origem com 33 anúncios próprios e 3 do modelo procurado ficava em 0 km e não enxergava o 4º anúncio do mesmo modelo a 18,34 km, enquanto uma origem vizinha com 1 anúncio próprio, e por isso com baseline de 25 km, via os 4. A liquidez que decide o território passa a ser a da busca em questão, não a da cidade.

**Raio declarado.** `effective_radius_km` é o menor anel que contém integralmente o conjunto final de candidatos, e `required_distance_km` é `null` quando o alvo não é atingido — ambos apurados sobre a liquidez com filtro de produto, nunca copiados do baseline. Uma busca cujos candidatos estão todos na própria cidade declara 0 km, mesmo que o baseline tenha sido maior. É o que DEC-23 já exigia; esta decisão fecha a divergência entre o território **usado** e o território **declarado**, que é o número que a interface mostra ao usuário (DEC-03).

**Alvos por perfil.** Ajusta DEC-17 nos perfis de produto específico, mantendo a gradação por especificidade e o caráter transitório: SEARCH_MODEL 24 · SEARCH_MODEL_YEAR 16 · SEARCH_VERSION 12. BROWSE_CITY 20, BROWSE_CATEGORY 16 e SEARCH_BRAND 16 permanecem como estão. Continuam sendo configuração (`platform_settings`), não constante, e o gatilho de revisão de DEC-17 continua valendo — com catálogo pobre, alvos desta ordem levam a busca de modelo ao teto automático com frequência, e isso é deliberado enquanto durar a fase de formação de estoque.

**Apresentação.** Quando o raio efetivo é maior que zero, a página declara o raio (DEC-03) e cada resultado exibe a distância até a origem. A ordenação permanece a de DEC-07 — peso comercial primeiro, distância entre anúncios de mesmo peso — em **lista única**: separar os resultados da cidade de origem dos das vizinhas rebaixaria um Destaque vizinho para baixo de um anúncio grátis local, o que DEC-07 proíbe. Resultados obtidos por concessão aceita pelo usuário podem aparecer em bloco próprio e rotulado, porque aí a ampliação foi pedida.

**Fora do escopo.** Esta decisão não altera DEC-01, DEC-02, DEC-07, a página territorial sem busca, facetas, relaxação, SEO ou ranking. Nenhum parâmetro de lançamento — cidade piloto, allowlist de rollout ou raio de prospecção comercial — é norma: são operação, e não entram em `platform_settings` nem nesta política.

· Supera a última frase de DEC-18, preservando o restante dela; reafirma DEC-23 quanto ao raio declarado; ajusta DEC-17 nos três perfis citados. Não altera DEC-03, DEC-04, DEC-05, DEC-07, DEC-10, DEC-11, DEC-20, DEC-24 nem DEC-26. · Vigente · 2026-09.

### DEC-29

DEC-29 — Piso regional recíproco e teto de participação por cidade.

**Piso regional.** Todo território automático parte de um raio mínimo — inicialmente **25 km** —, qualquer que seja o perfil e independentemente de a liquidez local já atingir o alvo. O território final continua sendo o maior entre o piso, o baseline de descoberta e o AUTO do perfil (DEC-28); o piso apenas impede que ele seja menor. Como `region_memberships` é simétrica por construção — distância de A para B é a mesma de B para A —, o piso torna a vizinhança **recíproca**: se B está a 25 km ou menos de A, os anúncios de B aparecem na página de A e os de A na de B, sem depender de qual das duas tem mais estoque.

**Motivo.** Sem piso, a liquidez produz alcance invertido. Uma origem com estoque próprio suficiente fica em 0 km e nunca mostra anúncio de vizinho; a vizinha pequena expande e mostra os anúncios dela. O alcance vai justamente para quem já está no mercado maior e é negado a quem está na cidade menor — que é quem mais precisa dele e de quem se espera que pague por ele. Além disso, o copy territorial "cidade e região" (DEC-03, v2.0 §52) só é verdadeiro quando existe região; com raio 0 permanente, ele é falso por construção.

**Teto de participação por cidade.** Nenhuma cidade **diferente da cidade de origem** ocupa mais que **40%** dos resultados de uma página. O excedente é adiado para as páginas seguintes, de forma determinística, preservando a ordem relativa entre todos os demais anúncios. O teto é regra de **distribuição**, não de truncamento: o adiamento só ocorre quando existem candidatos de outras cidades para ocupar as vagas liberadas. Sem alternativa, o excedente preenche a própria página — uma cidade pequena com um vizinho grande continua entregando a página cheia, em vez de ficar curta por causa do limite. A cidade de origem **não** é limitada: o teto existe para impedir que uma praça externa domine a página territorial, não para rebaixar o estoque da própria cidade. Enquanto nenhuma cidade externa passar do limite, a ordenação é exatamente a de DEC-07.

**Relação com DEC-07.** O teto é a única exceção admitida à ordenação por peso, e é limitada: ele **adia** anúncios excedentes de uma mesma cidade externa, nunca reordena anúncios entre si por outro critério, nunca limita a origem e nunca remove ninguém do conjunto. Fora dessa situação, peso comercial vence distância como sempre.

**Escolha manual continua vencendo.** O piso é um mínimo do modo automático. Raio explícito — inclusive `raio=0`, "apenas esta cidade" — vence o piso e isola a origem (DEC-05, DEC-19, DEC-24). Escopo UF e Brasil seguem exigindo ação explícita.

**Raio declarado.** O piso não altera a regra de DEC-28: `effective_radius_km` descreve o conjunto final de candidatos, não o território consultado. Uma página cujo resultado esteja todo na própria cidade declara 0 km mesmo tendo consultado 25 km. Onde a página exibir contagem — inclusive em metadados de SEO —, o número exibido deve ser o do mesmo conjunto que a página mostra.

**Existência e indexação, inalteradas.** Anúncio de vizinho continua não criando cidade nem mantendo cidade viva (DEC-01, DEC-02), e o limiar de indexação continua contando apenas o estoque próprio. O piso muda o que a página **mostra**, nunca se ela existe.

**Natureza dos valores.** Os 25 km e os 40% são parâmetros iniciais versionados de política, representáveis em `platform_settings`, revisáveis por nova decisão com telemetria — como os alvos de DEC-17. É normativo o conjunto estrutural: existir um piso simétrico, existir um teto por cidade externa, a origem não ser limitada por ele e a escolha manual vencer ambos. Em região de baixa densidade o piso pode não conter nenhuma cidade vizinha, e isso não é erro: o território fica com o que a malha oferece.

· Complementa DEC-28; torna verdadeiro o copy de DEC-03; emenda DEC-07 apenas no caso do teto de participação, nos limites descritos. Não altera DEC-01, DEC-02, DEC-05, DEC-11, DEC-19, DEC-20, DEC-23, DEC-24 nem DEC-26. · Vigente · 2026-09.

---

## Adiamentos confirmados

Estes itens NÃO devem ser classificados posteriormente como lacunas da F2.

### ADI-01

ADI-01 — Telemetria: um único evento `search.executed`, com payload de contexto completo, é suficiente na fase atual. Os eventos granulares da v2.0 §44 entram em fase posterior. · 2026-09.

_Complemento por DEC-27 (2026-09):_ um único `search.executed` continua bastando nesta fase, e os eventos granulares continuam adiados. `commercial_weight`, `distance` e `position` não fazem parte do payload mínimo de `search.executed`; sua eventual obrigatoriedade pertence exclusivamente ao contrato de futuros eventos explicitamente result-scoped. O "payload de contexto completo" do enunciado acima é, após DEC-27, o conjunto mínimo search-scoped definido por `V3-INV-052`, e não a transposição integral das 14 grandezas da v2.0 §44.

### ADI-02

ADI-02 — Rotação justa e diversidade entre vendedores (v2.0 §34–§35) ficam adiados até haver volume que os justifique. · 2026-09.

### ADI-03

ADI-03 — O re-sort no cliente após paginação continua existindo com a flag `off`, de propósito: `off` preserva o comportamento legado. O SQL legado permanece protegido separadamente pelo golden byte a byte. O requisito "sem re-sort pós-paginação" (v2.0 §37) vale para o caminho v1, não para o legado congelado. · 2026-09.

---

## Regras de método

### MET-01

MET-01 — A v3 é escrita sem consultar o código da F2, os testes da F2 e os relatórios da F2 (`docs/F2_RELATORIO.md`, `docs/F2_EXPLAIN_ANALYZE.md`). Fontes permitidas: este registro, `docs/history/Search_Policy_Engine_v2_Apos_Auditoria.md`, e, na tarefa específica de elaboração da v3, somente as partes de `docs/F2_GATE_SQL.md` comprovadamente anteriores à implementação. Cada seção da v3 carrega a proveniência (`v2.0 §N`, `DEC-NN`, `gate`). A comparação da F2 contra a v3 só começa depois de a v3 estar fechada e commitada. · 2026-09.

---

## Nota de numeração

Não há DEC-16.

A regra de método que anteriormente ocupava esse número foi convertida em MET-01.

Mantenha a lacuna da numeração e esta nota para que o histórico não sugira que uma decisão desapareceu.
