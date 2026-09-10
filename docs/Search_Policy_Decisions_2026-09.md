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

---

## Adiamentos confirmados

Estes itens NÃO devem ser classificados posteriormente como lacunas da F2.

### ADI-01

ADI-01 — Telemetria: um único evento `search.executed`, com payload de contexto completo, é suficiente na fase atual. Os eventos granulares da v2.0 §44 entram em fase posterior. · 2026-09.

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
