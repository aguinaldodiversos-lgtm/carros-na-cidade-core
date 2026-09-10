# Carros na Cidade — Search Policy Engine v3 (Consolidado)

**STATUS:** NORMATIVA — especificação vigente
**Data:** 2026-09-09
**Última sincronização normativa:** 2026-09-10
**Fontes:** `docs/Search_Policy_Decisions_2026-09.md` @ 893c0f39 (DEC-01…DEC-15, DEC-17…DEC-25, ADI-01…ADI-03, MET-01) · `docs/history/Search_Policy_Engine_v2_Apos_Auditoria.md` (histórico, não normativo). Por DEC-25, `docs/F2_GATE_SQL.md` @ 978c6715 deixou de ser fonte normativa e permanece apenas como evidência histórica.
**Método:** MET-01 — escrita sem consultar código, testes ou relatórios da F2. Cada seção declara sua proveniência.
**Substitui:** a "v2.1 Consolidado", que nunca existiu, e a v2.0 nos pontos em que o registro de decisões a alterou.

---

## Como ler este documento

**Precedência e rótulos.** Duas fontes sustentam este texto, em ordem decrescente de autoridade. `DEC-NN`, `ADI-NN` e `MET-NN` são decisões de primeira mão do dono do produto, registradas em `docs/Search_Policy_Decisions_2026-09.md`; vencem qualquer outra fonte. `v2.0 §N` é a especificação histórica de 07/09/2026, independente do código por construção, e vale onde nenhuma decisão a substitui. O gate de interpretação **não** é mais fonte: DEC-25 dispôs uma a uma das suas oito propostas D1–D8, ratificando algumas e substituindo as demais, e a partir dela o gate é evidência histórica. Onde uma proposta do gate aparece neste documento, ela vem rotulada `gate DN (evidência)` e o que a sustenta é a DEC que a ratificou — nunca o gate por si. `gate §X (evidência)` marca o restante do gate — SQL, contagens, planos e escolhas de implementação: pode ilustrar uma regra que já tem fonte, nunca criar regra de produto. `pendente` marca um ponto sem fonte independente; onde aparece, não há norma, e nenhum conteúdo afirmativo o acompanha. Quando duas fontes se contradizem, a de precedência mais alta vence, a perdedora permanece no texto como evidência de que o conflito foi visto, e a seção registra a resolução na forma `Conflito: … Vale …`.

**Normativo e Futuro.** As seções 1 a 21 e 23 são normativas: obrigatórias para qualquer implementação a partir de agora. A seção 22 reúne o que a v2.0 previu como evolução e que este documento **não** exige das próximas fases — v2.0 §21, §22, §25, §27, §45, §47, §48, §57 e a parte do §46 que admite IA auxiliar em linguagem natural e recomendações. A restrição do §46 de que nenhum modelo de linguagem decide elegibilidade territorial, peso comercial, paginação, expiração de Destaque ou regras de cidade, e de que o núcleo deve ser determinístico, explicável, testável e reproduzível, **não** é futuro: é norma, e está na seção 1.

**O que este documento não é.** Não é uma descrição da implementação. Não afirma nem nega o que a fase F2 fez, deixou de fazer ou fez de outro jeito. A comparação entre esta especificação e a implementação é uma tarefa posterior e separada (MET-01); qualquer divergência encontrada lá é resultado esperado do método, não defeito deste texto.

---

## 1. Princípios invariáveis

**Existência da cidade.** A página pública de uma cidade existe se, e somente se, houver pelo menos um anúncio `ACTIVE` próprio daquela cidade. Com zero `ACTIVE` próprios, a rota territorial deve responder 404. Anúncios de cidades vizinhas não devem criar uma cidade, não devem manter existente uma cidade que perdeu o próprio estoque, e não devem alterar canonical, H1 ou identidade territorial. Esta regra permanece separada do Search Policy Engine: nenhuma decisão de território, raio ou liquidez pode alterá-la.

**Indexação é regra separada.** A existência da cidade e o limiar de indexação SEO devem permanecer políticas independentes. O limiar registrado na fonte histórica é de 3 anúncios próprios, e este documento não o altera. Alterá-lo exige decisão específica posterior.

**Uma página territorial por cidade.** Cada cidade deve ter uma única página territorial. O raio altera o conjunto de anúncios exibidos; não deve alterar a identidade da página, seu canonical nem seu H1.

**Núcleo determinístico, sem modelo de linguagem no caminho crítico.** Nenhum modelo de linguagem deve decidir elegibilidade territorial, peso comercial, paginação, expiração de Destaque ou regras de cidade. O núcleo deve ser determinístico, explicável, testável e reproduzível. A mesma proibição vale explicitamente para o cálculo de relaxações e sua ordenação. "Barato", listado na v2.0 ao lado de determinístico e explicável, é princípio de projeto e não é testável isoladamente — não gera invariante.

**Proveniência:** DEC-01 · DEC-02 · DEC-21 · v2.0 §2.1 · v2.0 §2.2 · v2.0 §2.3 · v2.0 §46 (parte normativa).

---

## 2. Produto × geografia e o SearchContext

Toda busca deve possuir dois eixos independentes. O eixo de **produto** cobre consulta livre, marca, modelo comercial, versão, ano, preço, quilometragem, carroceria, câmbio, combustível, abaixo da FIPE e tipo de vendedor. O eixo de **geografia** cobre cidade de origem, fonte da localização, modo geográfico, raio solicitado, raio efetivo, UF explícita e Brasil explícito.

A regra que separa os eixos é: **produto determina relevância; geografia determina quem é territorialmente elegível.**

O backend deve trabalhar com um contexto de busca único, conceitualmente composto de quatro blocos — `intent` (tipo, especificidade, força geográfica), `product` (as dimensões acima), `geo` (`origin_city_id`, `location_source`, `mode`, `requested_radius_km`, `effective_radius_km`, marca de escolha geográfica explícita) e `ranking` mais `pagination` (versão de política, chaves de peso/distância, página e tamanho de página). Os nomes são conceituais: não é obrigatório renomear estruturas existentes apenas para coincidir com esta especificação.

**Proveniência:** v2.0 §3 · v2.0 §4.

---

## 3. Fontes de localização e precedência

A origem da busca pode vir de mais de uma fonte simultaneamente. A precedência deve ser explícita e é, da mais alta para a mais baixa:

1. `USER_SELECTED` — cidade ou raio escolhidos manualmente no filtro;
2. `EXPLICIT_QUERY` — localização escrita na própria busca;
3. `CITY_PAGE` — cidade determinada pela URL atual;
4. `GEOLOCATION` — localização autorizada pelo navegador;
5. `SESSION_DEFAULT` — última localização válida da sessão.

Uma fonte de menor prioridade nunca deve sobrescrever silenciosamente uma fonte de maior prioridade. Em particular, a cidade inferida do texto livre não deve sobrescrever a cidade da rota.

**Procedência da origem — em aberto.** A proposta do gate D1 (evidência) era tratar como `USER_SELECTED` um parâmetro de origem presente na URL mesmo sem marcador que declarasse sua procedência. DEC-25 **não a ratificou**: a presença do parâmetro não prova ação manual, e a precedência `USER_SELECTED` exige marcador de procedência. Como a decisão está adiada para antes da F3, que é quem gera as URLs, este documento não fixa qual precedência recebe uma origem sem marcador. `pendente`.

**Casamento de localização no texto livre.** DEC-25 ratifica o comportamento: o casamento locativo ou semântico deve respeitar fronteiras de palavra e não deve interpretar substrings acidentais. Isso vale tanto para nomes de cidade quanto para sinônimos de dimensões de produto. A proposta do gate D2 (evidência) registrava dois defeitos verificados nessa forma de casamento: uma consulta de produto sem intenção geográfica resolvendo para uma cidade cujo nome é substring de outra palavra da frase, e um sinônimo de câmbio de duas letras casando por substring dentro de nomes de cidade e de marca. A parte da proposta que mandava corrigir no caminho novo mantendo o caminho legado intacto é **estratégia de compatibilidade** (ADI-03), não regra desta política.

**Proveniência:** v2.0 §5 · DEC-25 · ADI-03 · gate D1 (evidência) · gate D2 (evidência) · `pendente` (precedência de origem sem marcador, até a F3).

---

## 4. Modos geográficos e raios

O motor deve possuir cinco modos geográficos explícitos, e todo contexto de busca deve carregar exatamente um deles:

| Modo            | Significado                             |
| --------------- | --------------------------------------- |
| `EXACT_CITY`    | somente a cidade-base                   |
| `AUTO_RADIUS`   | o motor escolhe o menor território útil |
| `MANUAL_RADIUS` | o usuário definiu explicitamente o raio |
| `STATE`         | o usuário escolheu uma UF               |
| `NATIONAL`      | o usuário escolheu Brasil               |

`STATE` e `NATIONAL` não são expansões automáticas: só devem ser alcançados por ação explícita do usuário.

**Degraus.** Os degraus 0, 25, 50 e 75 km são o escopo regional normal e os presets oferecidos pela interface. O degrau 0 km significa apenas a cidade-base. Os degraus 25, 50 e 75 incluem as cidades cuja distância real até a cidade-base esteja dentro do limite; a fronteira de UF não participa dessa decisão.

**Raio manual arbitrário.** Um raio informado pelo usuário e válido para a política é sempre intenção manual e deve manter sua medida exata, mesmo quando não corresponde a um dos degraus oferecidos. Um valor como 40 km significa `MANUAL_RADIUS` de 40 km: não deve ser arredondado para 50, não deve ser ignorado e nunca deve voltar silenciosamente para `AUTO_RADIUS`. A interface principal pode continuar oferecendo apenas 0/25/50/75; isso não altera a semântica de um valor manual válido já recebido. Guided Relaxation pode oferecer uma ampliação posterior, mas nunca aplicá-la sem ação explícita. _Refina v2.0 §7: os degraus são presets de UX, não o conjunto dos valores válidos._

**Faixa válida do raio explícito.** Um raio explícito válido é um inteiro de quilômetros entre 0 e 150, inclusive; o máximo corresponde à cobertura pré-computada de `region_memberships`. Valores de 1 a 150 produzem `MANUAL_RADIUS` e preservam exatamente a medida informada, sem conversão para os anéis de UX. Um raio explícito de 0 é escolha geográfica explícita e produz `EXACT_CITY`, com marca de escolha geográfica explícita e expansão automática bloqueada. Valores negativos, não numéricos, fracionários ou superiores a 150 **não** são raios manuais válidos e nunca devem ser silenciosamente arredondados para um valor aceito. O tratamento de UX e de API do valor inválido não é definido por nenhuma fonte normativa: `pendente`. _Delimita DEC-19 e refina v2.0 §7 e §13._

**O degrau de 150 km.** _Conflito: v2.0 §17 e §18 tratam 150 km como degrau de expansão automática especial para buscas de produto de baixa liquidez, com teto automático em 150; DEC-11 retira o 150 da expansão automática e o converte em uma concessão de distância oferecida ao usuário como as demais. Vale DEC-11._ O 150 km só deve ser alcançado por Guided Relaxation, nunca por decisão automática do motor. A parte sobrevivente de v2.0 §18 é a proibição de virar Brasil silenciosamente: só ação explícita transforma a busca em `NATIONAL`.

**Cross-UF.** O raio geográfico deve atravessar fronteira de UF. A UF é atributo administrativo e não deve funcionar como barreira em `AUTO_RADIUS` ou `MANUAL_RADIUS`. A inclusão territorial é decidida por `distance_km <= effective_radius_km`, usando `region_memberships.distance_km` como verdade geográfica; `layer` pode permanecer por compatibilidade ou otimização, mas não deve ser critério funcional de inclusão.

**Distância cidade-a-cidade.** A distância de um anúncio, para fins de descoberta territorial e de ordenação, é a distância entre a cidade de origem e a cidade do anúncio. Não deve haver cálculo geográfico por anúncio.

**Proveniência:** DEC-06 · DEC-11 · DEC-19 · DEC-24 · v2.0 §6 · v2.0 §7 · v2.0 §8 · v2.0 §9 · v2.0 §11 · v2.0 §13 · v2.0 §17 · v2.0 §18 · `pendente` (tratamento do raio explícito inválido).

---

## 5. Classificação de intenção, perfis e especificidade

O motor não deve tratar todas as buscas da mesma forma. A v2.0 distingue três classes de intenção: **GEO_FORTE** (a busca nomeia o lugar), **PRODUTO** (a busca nomeia o veículo) e **PRODUTO + GEO** (nomeia os dois). A classe influencia a origem e a especificidade; o comportamento inicial de raio que a v2.0 associava a GEO_FORTE foi substituído — ver seção 7.

A política pode calcular um **Specificity Score** a partir das dimensões de produto presentes (marca, modelo comercial, versão, ano, preço, carroceria, câmbio, combustível). Quanto maior a especificidade, menor o alvo de liquidez necessário. O objetivo é dispensar regras especiais por veículo.

Os perfis nomeados pela fonte normativa são `BROWSE_CITY`, `BROWSE_CATEGORY`, `SEARCH_BRAND`, `SEARCH_MODEL`, `SEARCH_MODEL_YEAR` e `SEARCH_VERSION`. Seus alvos estão na seção 6.

**Teto automático por perfil.** O teto automático de **qualquer** perfil é 75 km: os anéis automáticos são 0/25/50/75, e o 150 km só existe como concessão de Guided Relaxation. A interface não deve listar como anel automático um valor que o motor não honraria. A proposta do gate D5 (evidência) admitia `SEARCH_MODEL` com teto automático de 150 km; DEC-25 a declara **superada** por DEC-11, DEC-18 e DEC-23. O que sobrevive dela é apenas a observação de UX — não oferecer um clique que o motor não cumpre —, e essa observação passa a se apoiar em DEC-11 e DEC-18, não no gate.

**Proveniência:** DEC-11 · DEC-17 · DEC-18 · DEC-23 · DEC-25 · gate D5 (evidência) · v2.0 §12 · v2.0 §20.

---

## 6. `AUTO_RADIUS`: cálculo de liquidez e alvos

**Menor território útil.** Em modo automático, o motor deve escolher o menor território capaz de atingir o alvo de liquidez do perfil. Nunca o maior possível, e nunca um degrau acima do necessário.

**Como a liquidez é avaliada.** A avaliação usa contagens de candidatos agrupadas por cidade, cada uma associada ao `distance_km` exato entre a origem e aquela cidade. As cidades são ordenadas por distância e suas contagens são acumuladas até atingir o `LiquidityTarget` aplicável ao contexto. A distância exata em que o acumulado atinge o alvo é o `required_distance_km`.

**`required_distance_km` e `effective_radius_km` são grandezas distintas.** Em modo automático, o `required_distance_km` é convertido para o menor anel permitido que o contenha, produzindo o `effective_radius_km`. O conjunto final deve incluir **todos** os candidatos elegíveis dentro desse anel, e não apenas as cidades estritamente necessárias para alcançar matematicamente o alvo. Ambas as grandezas devem ser observáveis (seção 16). Os anéis são política e UX; `distance_km` continua sendo a verdade geográfica. Em `MANUAL_RADIUS` não há conversão para anel: o raio exato solicitado é o raio efetivo.

_Refina v2.0 §56: a ideia de acumular contagens por faixa vem do histórico; DEC-20 a substitui por acumulação sobre a distância exata e pela distinção entre distância requerida e raio efetivo._

**Alvos iniciais.** Os alvos de liquidez por perfil são configuração (`platform_settings`), não constante. Os valores iniciais da v1 são:

| Perfil              | Alvo inicial |
| ------------------- | -----------: |
| `BROWSE_CITY`       |           20 |
| `BROWSE_CATEGORY`   |           16 |
| `SEARCH_BRAND`      |           16 |
| `SEARCH_MODEL`      |           12 |
| `SEARCH_MODEL_YEAR` |            8 |
| `SEARCH_VERSION`    |            4 |

_Conflito: v2.0 §19 sugere faixas mais altas (24–40 para "qualquer veículo", 20–24 para carroceria, 16–20 para marca, 12–16 para modelo, 8–12 para modelo + ano, 4–8 para versão + ano); DEC-17 fixa valores abaixo dessa faixa. Vale DEC-17._ Os valores menores são deliberados: com o estoque atual, alvos maiores levariam toda navegação ao raio máximo e destruiriam a territorialidade. A revisão é disparada por telemetria de `search.executed` indicando catálogo pobre no raio inicial, ou por estoque em uma origem piloto suficiente para sustentar alvos maiores. O princípio de configurabilidade da v2.0 §19 permanece; apenas os números mudam. A decisão é declarada transitória.

**Teto do automático.** O motor nunca deve transformar uma busca em `NATIONAL` por conta própria. Alcançado o maior anel automático permitido sem atingir o alvo, o motor para de expandir e entra em Guided Relaxation (seção 9).

**Quando nenhum anel automático atinge o alvo.** O `required_distance_km` deve ser **nulo**: não existe distância em que o acumulado atinja o alvo. O `effective_radius_km` **não** deve ser elevado ao teto de 75 km apenas por esse teto ter sido avaliado. Ele deve corresponder ao menor anel que contém integralmente o conjunto final de candidatos — isto é, ao último anel cuja inclusão efetivamente acrescentou candidatos. Anéis posteriores com delta zero não ampliam o território efetivo. Se nenhum anel externo à cidade-base acrescenta nada, o `effective_radius_km` deve ser 0. Em seguida, o contexto entra em Guided Relaxation (seção 9). _Refina DEC-03 e DEC-20, e substitui a proposta do gate D5 (evidência), que exemplificava raio efetivo no teto sem atingir o alvo._

**Proveniência:** DEC-03 · DEC-04 · DEC-11 · DEC-17 · DEC-20 · DEC-23 · DEC-25 · gate D5 (evidência) · v2.0 §16 · v2.0 §18 · v2.0 §19 · v2.0 §56.

---

## 7. Comportamento inicial da página territorial

A rota `/carros-em/[cidade]` deve nascer no perfil `BROWSE_CITY` em modo `AUTO_RADIUS`. O automático escolhe o menor território que atinge liquidez útil: se a própria cidade tem estoque suficiente, o raio efetivo é 0 km; caso contrário, expande para 25, 50 ou 75 km, nessa ordem, parando no primeiro que atinge o alvo.

Isso **não** altera a existência da cidade (seção 1), o canonical nem a identidade territorial da página.

**Obrigação de declarar o raio.** Quando o raio efetivo for maior que 0, a página deve declarar o raio ao usuário. O texto não pode apresentar como "carros em X" um conjunto que inclui cidades vizinhas.

_Conflito: v2.0 §12 manda a intenção GEO_FORTE abrir em `EXACT_CITY` com raio efetivo 0, e v2.0 §13 descreve a abertura da página de cidade como "0 km implícito" que só migra para `AUTO_RADIUS` quando o usuário inicia uma busca de produto; DEC-03 faz a página nascer em `AUTO_RADIUS`. Vale DEC-03._ Como consequência, o estado "0 km implícito" deixa de existir como estado inicial: o 0 km inicial passa a ser um resultado possível do automático, não um pressuposto.

**O 0 km explícito continua.** Quando o usuário escolhe "apenas esta cidade", existe intenção manual e o modo passa a ser `EXACT_CITY` com marca de escolha explícita. Um raio explícito de 0 recebido pela URL tem exatamente o mesmo efeito (seção 4). A partir daí, nem um filtro de produto nem o automático podem ampliar o território: escolha manual sempre vence o automático, e o usuário pode retomar o controle em qualquer ponto.

**Proveniência:** DEC-03 · DEC-05 · DEC-24 · v2.0 §12 · v2.0 §13.

---

## 8. Entrada direta em `/comprar`

Quando uma busca de produto chega diretamente a `/comprar` com origem conhecida e sem raio ou escopo manual, o motor deve, nesta ordem:

1. calcular um **território-base de descoberta** usando a política `BROWSE_CITY` daquela origem, limitado aos anéis automáticos normais 0/25/50/75 km;
2. aplicar os filtros explícitos de produto **dentro** desse território-base;
3. se o resultado ficar abaixo do alvo do perfil de produto, entrar em Guided Relaxation (seção 9).

O baseline deve ser construído **antes** de permitir que as preferências explícitas de produto provoquem qualquer expansão territorial. O motor não deve ampliar silenciosamente além do baseline.

**Quando não se aplica.** Havendo um raio explícito válido (seção 4), esta seção **não** se aplica: o raio explícito é intenção manual e vence o automático, de modo que o território é o raio informado e não um baseline calculado. Isso vale inclusive para o raio explícito de 0, que produz `EXACT_CITY`.

_Refina v2.0 §12 (intenção PRODUTO sem escolha geográfica manual → `AUTO_RADIUS`) e v2.0 §14–§15 (a busca principal iniciada em uma página de cidade migra para `/comprar` preservando consulta, origem, modo automático e fonte da localização): DEC-18 precisa a ordem das operações — o território-base é construído pela política de navegação da cidade, e só depois o produto é aplicado. A migração descrita em §14–§15 continua válida; o que DEC-18 acrescenta é que o resultado dessa migração não autoriza expansão territorial dirigida pelo produto._

**Proveniência:** DEC-05 · DEC-18 · DEC-24 · v2.0 §12 · v2.0 §14 · v2.0 §15.

---

## 9. Guided Relaxation

**O que dispara.** Quando o resultado fica abaixo do alvo de liquidez depois de o automático ter construído o território inicial útil (seções 6, 7 e 8), o motor **não deve** expandir mais sozinho. Ele deve entrar em Guided Relaxation. Isso inclui o caso em que nenhum anel automático atinge o alvo: o território de partida das concessões é o `effective_radius_km` definido pela seção 6 — o último anel que acrescentou candidatos —, não o teto de 75 km.

**Limite das preferências explícitas.** Preferências explícitas do usuário — preço, ano, câmbio, quilometragem, modelo — não autorizam o motor a fazer concessões silenciosas ilimitadas para atingir o alvo.

**O que o motor calcula.** Para cada dimensão relaxável ativa, o motor deve procurar a **menor concessão útil** que efetivamente acrescenta resultados conhecidos, em vez de aplicar cegamente um percentual ou degrau fixo quando o estoque permite uma concessão menor:

- **preço** — o menor novo teto que desbloqueia candidatos, apresentado com arredondamento amigável configurável que **continue incluindo** o candidato que justificou a sugestão;
- **ano** — o ano imediatamente menos restritivo que acrescenta candidatos;
- **quilometragem** — o menor limite superior útil, também sujeito a arredondamento amigável configurável;
- **distância** — o primeiro anel permitido acima do território atual que acrescenta resultados, podendo chegar a 150 km;
- **câmbio** — a remoção da restrição, quando isso acrescentar candidatos.

**Como as opções são ordenadas.** As relaxações não devem ser ordenadas apenas por quantidade acrescentada. Cada alternativa recebe uma avaliação determinística de benefício versus custo da concessão — um `relaxation_score` conceitual — considerando pelo menos o número de resultados acrescentados e a magnitude relativa da mudança pedida ao comprador. Uma concessão grande, como 25 → 150 km, não deve vencer automaticamente uma concessão pequena apenas por acrescentar mais veículos. Custos, arredondamentos e pesos são configuração versionável de política, não lógica espalhada pelo frontend.

**Valores da política.** As fontes independentes não fixam os pesos, os custos por dimensão nem os quantums de arredondamento amigável. Valor inicial: `pendente`. DEC-21 proíbe supri-los por invenção.

_Conflito: a proposta do gate D4 (evidência) resolvia o degrau de preço pela fórmula fixa `ceil(price_max × 1,15 / 1000) × 1000`, e a do gate D8 (evidência) fixava números de teste derivados dela; DEC-21 exige a menor concessão útil real, com arredondamento amigável configurável, e proíbe o degrau fixo quando o estoque permite uma concessão menor. Vale DEC-21, e DEC-25 declara as duas propostas superadas._ A fórmula de +15% permanece registrada aqui como a proposta anterior do gate, não como norma.

**O que o motor não faz.** Nenhuma alternativa deve ser aplicada sem ação explícita do usuário. Nenhum modelo de linguagem participa do cálculo ou da ordenação. Uma alternativa cujo delta conhecido seja zero não deve ser apresentada (seção 13). O motor deve apresentar no máximo as melhores opções definidas pela política — inicialmente até três.

**O que nunca é relaxação.** Relaxar preço, ano, câmbio, quilometragem ou distância preserva a intenção: o produto continua o mesmo. Modelo alternativo **nunca** é relaxação — é recomendação separada e deve ser apresentada como tal, em bloco distinto. _Refina v2.0 §28, que já mandava recomendações alternativas aparecerem em bloco separado: DEC-12 e DEC-21 tornam a separação obrigatória e a colocam fora do mecanismo de concessões._

_Conflito: v2.0 §17–§18 fazem o automático expandir até o teto de 150 km antes de parar; DEC-11 encerra a expansão automática no território inicial útil e transforma o 150 em concessão oferecida. Vale DEC-11._

**Proveniência:** DEC-10 · DEC-11 · DEC-12 · DEC-14 · DEC-21 · DEC-23 · DEC-25 · gate D4 (evidência) · gate D8 (evidência) · v2.0 §17 · v2.0 §18 · v2.0 §28 · `pendente` (pesos, custos e quantums de arredondamento).

---

## 10. Produto comercial normalizado

O campo que hoje guarda a descrição FIPE completa não deve ser tratado como modelo comercial. O contexto de busca deve distinguir marca, `commercial_model` (o modelo comercial), `raw_model` (a descrição FIPE preservada) e versão, quando disponível.

`commercial_model` é dimensão de produto de primeira classe: deve existir como faceta, como filtro por igualdade **case-insensitive**, e deve receber peso A no vetor de busca textual.

A derivação de modelo comercial já usada pelas rotas SEO deve ser reaproveitada pela faceta Modelo, pelo parser da busca, pelo Specificity Score, pelo alvo de liquidez, pelas sugestões e pela analytics. Não é necessário criar uma tabela de catálogo FIPE nova apenas para atender a esta especificação.

A busca textual existente — vetor de busca com dicionário português, consulta por `plainto_tsquery`, ordenação auxiliar por `ts_rank` e índice GIN — deve ser preservada. Não deve ser substituída por `ILIKE`.

**Proveniência:** DEC-09 · v2.0 §23 · v2.0 §24 · v2.0 §26.

---

## 11. `CandidateScope` como fonte única

O `CandidateScope` é a fonte única de verdade da busca: grid, contagem total e facetas devem sair das **mesmas** regras de elegibilidade e de produto. Não deve existir um universo territorial ou de produto próprio para a contagem, para as facetas ou para as relaxações.

As projeções derivadas — facetas self-excluding e cálculo de relaxações — podem remover deliberadamente **uma única** restrição para responder à sua própria pergunta. Essa remoção controlada é parte do contrato, não uma exceção a ele: o que fica proibido é construir um escopo independente.

**Forma do escopo.** O território deve ser materializado como um conjunto de cidades elegíveis derivado de `region_memberships` por `distance_km <= raio`, e esse mesmo conjunto deve ser compartilhado por todas as consultas do ciclo (grid, contagem, facetas e relaxações). DEC-25 ratifica **o princípio** da proposta do gate D3 pela via de DEC-08: a unicidade do escopo é norma; a forma SQL de passá-lo às consultas é implementação, não norma. O gate D3 (evidência) mediu 82 cidades para 75 km e 223 para 150 km a partir de uma origem piloto — número útil para dimensionamento, não regra.

**Proveniência:** DEC-08 · DEC-25 · gate D3 (evidência) · v2.0 §39.

---

## 12. Ranking

O pipeline de ranking deve ser, nesta ordem: status e disponibilidade; correspondência com o produto; elegibilidade territorial; peso comercial decrescente; distância crescente; rotação e diversidade; qualidade e recência; desempate determinístico final.

**Correspondência de produto precede monetização.** Uma busca por um modelo deve formar candidatos daquele modelo. Um veículo de outro modelo com peso maior não deve entrar no conjunto principal.

**Peso comercial.** O peso efetivo é `MAX(destaque ativo ? 4 : 0, peso do plano)`, com Destaque 4, Pró 3, Start 2 e Grátis 1. O Destaque é temporal: expirado, o anúncio volta ao peso do plano.

**Peso vence distância; distância organiza o mesmo peso.** Entre anúncios territorialmente elegíveis, o peso comercial decide a prioridade; a distância só ordena entre anúncios de mesmo peso. A cidade-base não tem prioridade absoluta: ela vence naturalmente por distância quando o peso é igual.

**Peso nunca fura o território.** Um anúncio fora do território elegível não deve entrar no conjunto, qualquer que seja o seu peso. Território decide quem participa; peso decide a prioridade entre quem participa.

**Não restaurar o ordenador histórico distance-first.** A ordenação que colocava distância antes de destaque não corresponde à regra comercial vigente e não deve ser reintroduzida.

**Rotação e diversidade.** A v2.0 §34 descreve rotação justa entre anúncios equivalentes — determinística, estável durante uma janela, compatível com cache, não aleatória por refresh — e a §35 descreve diversidade entre vendedores atuando depois de peso e distância. _Delimitação por ADI-02: ambas ficam adiadas até haver volume que as justifique. Permanecem descritas, não exigidas._ Isso não é conflito: a v2.0 já as tratava como configuráveis e ativáveis conforme a liquidez.

**Proveniência:** ADI-02 · DEC-07 · v2.0 §28 · v2.0 §29 · v2.0 §30 · v2.0 §31 · v2.0 §32 · v2.0 §33 · v2.0 §34 · v2.0 §35 · v2.0 §36 · v2.0 §38.

---

## 13. Facetas

As facetas devem ser guiadas pelo estoque e derivadas das mesmas regras do `CandidateScope` (seção 11): grid, total e facetas compartilham escopo territorial e de produto.

**Self-excluding.** Uma faceta ativa deve ser calculada removendo apenas a própria restrição, para revelar alternativas válidas. As demais facetas continuam respeitando essa restrição. _Refina v2.0 §40, que tratava o cálculo self-excluding como evolução possível, a ser implementada progressivamente: DEC-13 o torna obrigatório._

**Zero conhecido.** Opções com `count = 0` não devem ser oferecidas como novas escolhas. A opção **atualmente ativa** pode permanecer visível mesmo com zero, para explicar o estado e permitir sua remoção.

**Zero conhecido, regra geral.** A interface não deve oferecer filtro, valor de faceta, expansão territorial ou concessão que o motor já sabe produzir zero resultados adicionais. Restrições e chips já ativos permanecem visíveis mesmo em estado zero, pelo mesmo motivo. Estados zero causados por URL antiga, mudança de estoque, cache ou condição concorrente **não** devem ser tratados como impossíveis: entram no fluxo de recuperação e no Guided Relaxation.

**Facetas de baixo poder discriminativo.** Podem permanecer recolhidas em "Mais filtros", sem deixar de estar disponíveis ao usuário quando possuírem opções reais. Preço é a exceção: ver abaixo.

**Preço é filtro primário permanente.** A dimensão de preço deve permanecer disponível no conjunto principal de filtros **independentemente** de entropia, ganho de informação ou poder discriminativo calculado para o contexto de busca. A política adaptativa pode determinar quais **outras** dimensões ocupam os filtros principais e quais ficam em "Mais filtros", mas não pode rebaixar preço por esse critério. Isso não isenta preço das demais regras: seus counts, faixas e disponibilidade continuam derivados do `CandidateScope` e sujeitos às regras de zero conhecido acima. _A proposta do gate D6 (evidência) deixava preço recolhido por perder em entropia para modelo, marca e ano, e registrava a pergunta como regra de produto em aberto; DEC-22 a decide e DEC-25 declara a proposta superada._

**Instrução E2.** Sem fonte independente; a única fonte conhecida é o relatório da F2, que esta especificação não pode consultar (MET-01). `pendente`.

**Proveniência:** DEC-13 · DEC-14 · DEC-22 · DEC-25 · gate D6 (evidência) · v2.0 §39 · v2.0 §40 · `pendente` (E2).

---

## 14. Paginação e ordenação

A ordenação completa deve ocorrer no backend, antes de `LIMIT`/`OFFSET`. Não deve haver reordenação da página corrente no cliente depois da paginação.

A paginação deve ser estável: a página 1 não muda arbitrariamente, a página 2 não repete card da página 1, um refresh não embaralha o catálogo e o cache produz experiência consistente. Para isso o ranking precisa de um desempate final determinístico; a composição exata da chave de desempate é decidida na implementação, sobre atributos estáveis do anúncio.

_Delimitação por ADI-03: o re-sort no cliente após paginação continua existindo no caminho legado, servido com a flag desligada, de propósito — a flag `off` preserva o comportamento legado, protegido separadamente por golden byte a byte. O requisito de não haver re-sort pós-paginação vale para o caminho novo. Isso não é conflito com v2.0 §37: é a delimitação do seu alcance._

**Proveniência:** ADI-03 · v2.0 §37 · v2.0 §38.

---

## 15. Cache e Policy Version

O cache existente deve ser aproveitado. A chave deve ser construída sobre o contexto de busca normalizado, evitando diferenças semânticas irrelevantes, e deve incluir os parâmetros novos que mudam o resultado: modo geográfico, cidade de origem, raio e versão de política.

O cache deve ser pensado em camadas, com TTLs distintos por natureza do dado: proximidade entre cidades é praticamente estática e admite TTL longo; contagem de liquidez muda com o estoque e admite TTL curto ou moderado; resultado e facetas dependem da volatilidade do estoque e pedem TTL curto; a própria política é configuração versionada, praticamente estática por deploy.

Toda busca deve poder carregar uma `search_policy_version`. Mudanças futuras de alvo de liquidez, raio máximo, diversidade, rotação, limiares e normalização devem poder entrar por nova versão de política, sem reconstruir endpoints nem frontend.

**Valores numéricos.** Nenhum TTL, tamanho de cache ou limite numérico entra aqui: não há fonte independente. O gate §5 (evidência) descreve um desenho de cache com TTLs distintos para liquidez e relaxações, mas por ser evidência não fixa norma, e a instrução E4, que poderia fixá-la, não foi anexada a esta tarefa. Valores iniciais: `pendente`.

**Proveniência:** v2.0 §41 · v2.0 §42 · v2.0 §43 · gate §5 (evidência) · `pendente` (todos os valores numéricos).

---

## 16. Telemetria

Um único evento `search.executed`, com payload de contexto completo, é suficiente na fase atual. _Delimitação por ADI-01: a lista granular de eventos da v2.0 §44 — início da busca, intenção resolvida, escopo resolvido, raio automático escolhido, raio expandido, raio manual, zero resultados, resultados servidos, clique no resultado, visualização do veículo, lead criado, clique de WhatsApp — entra em fase posterior. Não é conflito: é adiamento._

O payload deve conter, no mínimo, o conteúdo de contexto que a v2.0 §44 lista: consulta, modelo comercial, especificidade, cidade de origem, fonte da localização, modo geográfico, raio solicitado, raio efetivo, contagem de resultados, contagem de vendedores, peso comercial, distância, posição e versão de política.

A esses, este documento acrescenta como observáveis **obrigatórios** o `required_distance_km` e o `effective_radius_km`, que são grandezas distintas (seção 6) e sem as quais a decisão do automático não é auditável.

O gatilho de revisão dos alvos de liquidez depende dessa telemetria (seção 6).

**Proveniência:** ADI-01 · DEC-17 · DEC-20 · v2.0 §44.

---

## 17. Copy territorial e UX de expansão

O texto da página deve refletir a realidade do conjunto exibido. Em `EXACT_CITY`, o texto nomeia apenas a cidade e não deve dizer "e região". Com raio efetivo maior que 0, o texto deve declarar o raio — obrigação de DEC-03 — e, em busca de produto, deve dizer quantos resultados foram encontrados em até quantos quilômetros de qual origem.

O sistema deve explicar o que fez quando expandiu automaticamente, e o controle de raio deve mostrar qual degrau está ativo e que ele veio do automático.

Ao escolher qualquer raio, o usuário passa de `AUTO_RADIUS` para `MANUAL_RADIUS` e o motor deixa de expandir. Deve existir uma ação para reativar o alcance automático. Escolha manual sempre vence o automático.

Quando o raio manual for um valor arbitrário válido, o copy deve refletir esse valor exato, e não o degrau mais próximo (seção 4).

**Proveniência:** DEC-03 · DEC-05 · DEC-19 · v2.0 §49 · v2.0 §50 · v2.0 §52.

---

## 18. SEO e URLs

A rota territorial é `/carros-em/[cidade]`; a superfície transacional é `/comprar`, que recebe consulta, origem e demais parâmetros. Um raio manual aparece como parâmetro na URL, em qualquer das duas superfícies.

Parâmetros transacionais — consulta, raio, ordenação, filtros e escopo — **não** devem criar automaticamente novas landings indexáveis. A política de canonical e noindex existente deve ser preservada e apenas estendida para reconhecer os parâmetros novos.

O parâmetro de raio é transacional nesse sentido e, ao mesmo tempo, tem seu valor honrado exatamente quando válido: `raio=40` não cria landing e também não é arredondado para 50. A faixa de validade é um inteiro entre 0 e 150, inclusive; fora dela o valor não é raio manual válido e não deve ser arredondado para um valor aceito (seção 4).

A rota regional legada não deve ser dependência deste sistema. Ela pode permanecer temporariamente por compatibilidade, não deve ser apagada sem auditoria de referências externas, não deve ser usada como núcleo da nova navegação, e mantém noindex e canonical atuais até estratégia posterior.

A nomenclatura real dos parâmetros deve ser definida contra a política de URL existente; este documento fixa a semântica, não os nomes.

**Proveniência:** DEC-19 · DEC-24 · v2.0 §51 · v2.0 §53 · v2.0 §54.

---

## 19. O que este projeto não altera

Nenhuma decisão deste documento autoriza alterar: a regra de existência territorial; o limiar de indexação SEO sem decisão específica; o canonical territorial; o sitemap; o layout aprovado; o shell de largura aprovado; o comportamento mobile aprovado; o header; o fluxo de pagamento; os módulos legais; e funcionalidades não relacionadas à busca.

Em particular, a regra de existência é reafirmada como invariável: cidade com zero `ACTIVE` próprios responde 404 na rota territorial, e anúncios vizinhos nunca criam nem mantêm uma cidade — por mais que a política de território os inclua no conjunto de resultados.

**Proveniência:** DEC-01 · DEC-02 · v2.0 §62.

---

## 20. Divergências D1–D8 do gate

O gate `978c6715` levantou oito divergências entre o prompt que o originou e o que seu autor propunha fazer. Nunca houve aprovação em bloco dessas oito propostas. DEC-25 as dispôs **uma a uma** — ratificando algumas, substituindo as demais — e, a partir dela, o gate deixou de ser fonte normativa e passou a evidência histórica. Esta seção registra, para cada divergência, o tema, o que o gate propunha e a disposição de DEC-25. Nada aqui é norma por si: a norma é a DEC citada em cada caso.

### D1 — origem na URL sem marcador de procedência

**Tema.** O prompt definia `USER_SELECTED` como a origem acompanhada de um marcador explícito de que o frontend a colocou ali.
**Proposta do gate.** Tratar a origem sozinha como `USER_SELECTED`: o parâmetro só existe porque alguém o escolheu.
**Disposição (DEC-25).** **Não ratificada.** A presença do parâmetro numa URL não prova ação manual, e a precedência `USER_SELECTED` exige marcador de procedência. Pendente, a definir antes da F3 — que é quem gera as URLs.
**Onde entra:** seção 3, como `pendente`.

### D2 — casamento de localização por substring no texto livre

**Tema.** O prompt mandava corrigir o parser compartilhado de busca livre.
**Proposta do gate.** Corrigir dentro do caminho novo, deixando o caminho legado intocado, porque corrigir no parser compartilhado mudaria o comportamento servido com a flag desligada. Os dois defeitos são reais e verificados: uma consulta de produto sem intenção geográfica resolvia para uma cidade cujo nome é substring de outra palavra da frase, e um sinônimo de câmbio de duas letras casava por substring dentro de nomes de cidade e de marca.
**Disposição (DEC-25).** **Ratificado o comportamento**: o casamento locativo ou semântico respeita fronteiras de palavra e não interpreta substrings acidentais. A parte "corrigir no caminho novo e manter o parser legado intacto" é estratégia de compatibilidade (ADI-03), **não** regra da política.
**Onde entra:** seção 3.

### D3 — como o território chega às consultas

**Tema.** Passar o território como conjunto explícito de cidades ou como subconsulta sobre `region_memberships`.
**Proposta do gate.** Manter o conjunto explícito, medindo o custo: 82 cidades para 75 km e 223 para 150 km a partir da origem piloto. O gate registra a alternativa por subconsulta como troca possível.
**Disposição (DEC-25).** **Ratificado o princípio**, por DEC-08: o escopo é único e compartilhado por grid, contagem, facetas e relaxações. A forma SQL é implementação, não norma.
**Onde entra:** seção 11.

### D4 — degrau de preço na relaxação

**Tema.** O prompt dava uma fórmula de degrau fixo e, em outro ponto, um valor que não sai dela.
**Proposta do gate.** Seguir a fórmula `ceil(price_max × 1,15 / 1000) × 1000`.
**Disposição (DEC-25).** **Superada por DEC-21**, que exige a menor concessão útil real, com arredondamento amigável configurável que continue incluindo o candidato que a justificou, e proíbe aplicar percentual ou degrau fixo quando o estoque permite concessão menor.
**Onde entra:** seção 9.

### D5 — quais anéis a interface lista

**Tema.** Quais degraus oferecer ao usuário.
**Proposta do gate.** Listar apenas os anéis menores ou iguais ao teto automático do perfil, porque oferecer um anel que o motor não honra é um clique morto; com `BROWSE_CITY` em 75 e `SEARCH_MODEL` em 150.
**Disposição (DEC-25).** **Superada por DEC-11, DEC-18 e DEC-23**: o 150 km sai da expansão automática, o baseline fica em 0/25/50/75 e o raio efetivo abaixo do alvo não sobe ao teto. A observação de UX — não oferecer um clique que o motor não cumpre — sobrevive apoiada em DEC-11 e DEC-18, não no gate.
**Onde entra:** seções 4, 5 e 6.

### D6 — preço recolhido em "Mais filtros"

**Tema.** Quais facetas abrem por padrão.
**Proposta do gate.** Cumprir a regra de maior poder discriminativo, registrando que, com o estoque medido, preço perde para modelo, marca e ano e fica recolhido. O gate deixa a pergunta aberta: se preço deve abrir sempre, é regra de produto.
**Disposição (DEC-25).** **Superada por DEC-22**, que responde a pergunta aberta: preço é filtro primário permanente e não pode ser rebaixado por entropia. DEC-13 continua valendo para as demais dimensões.
**Onde entra:** seção 13.

### D7 — forma da consulta de liquidez

**Tema.** Contagem de liquidez inline por junção externa ou agregada por cidade.
**Proposta do gate.** Subconsulta agregada por cidade, porque o guard de anúncio inválido depende de um dado que não está disponível na condição da junção externa — o mesmo modo de falha de um defeito anterior conhecido do projeto.
**Disposição (DEC-25).** **Ratificada a semântica**, por DEC-20: a avaliação de liquidez agrupa candidatos por cidade, com o `distance_km` exato de cada uma. A forma SQL não é norma.
**Onde entra:** seção 6.

### D8 — números fixados no teste de relaxação

**Tema.** Os deltas esperados no cenário de aceitação.
**Proposta do gate.** Fixar o teste nos valores medidos no snapshot, incluindo o teto de preço derivado da fórmula do D4.
**Disposição (DEC-25).** **Não normativo; superado por DEC-21.** Os deltas medidos no snapshot são evidência de uma medição pontual, não esperados normativos.
**Onde entra:** seções 9 e 23.

**Proveniência:** ADI-03 · DEC-08 · DEC-11 · DEC-13 · DEC-18 · DEC-20 · DEC-21 · DEC-22 · DEC-23 · DEC-25 · gate D1–D8 (evidência).

---

## 21. Instruções A e E1–E4

Estas instruções pertencem à aprovação do gate da F2 e à mensagem "SQL OK". DEC-25 registra que **não existiu aprovação em bloco** das oito propostas do gate; o texto das instruções A e E1–E4 continua sem fonte independente conhecida. O `pendente` abaixo, portanto, não é a espera de um anexo que exista em algum lugar: é a constatação de que a única fonte conhecida é o relatório da F2, vedado por MET-01.

### Instrução A — cache

Sem fonte independente; a única fonte conhecida é o relatório da F2, que esta tarefa não pode consultar. O gate §5 (evidência) contém um desenho de cache endereçado à instrução A, mas evidência não cria norma e o texto da instrução não está disponível. `pendente`.

### Instrução E1

Sem fonte independente; a única fonte conhecida é o relatório da F2, que esta tarefa não pode consultar. `pendente`.

### Instrução E2

Sem fonte independente; a única fonte conhecida é o relatório da F2, que esta tarefa não pode consultar. `pendente`.

### Instrução E3

Sem fonte independente; a única fonte conhecida é o relatório da F2, que esta tarefa não pode consultar. `pendente`.

### Instrução E4

Sem fonte independente; a única fonte conhecida é o relatório da F2, que esta tarefa não pode consultar. Os valores numéricos de cache que dependeriam dela permanecem `pendente` na seção 15.

**Proveniência:** `pendente` · gate §5 (evidência, apenas para situar a instrução A).

---

## 22. Futuro (não normativo)

Os pontos abaixo estão previstos como evolução. Não são exigidos das próximas fases e não geram invariantes.

**Liquidity Quality Score (v2.0 §21).** Em escala, quantidade sozinha não basta: doze anúncios de uma loja não têm a mesma qualidade que doze de seis vendedores. O avaliador de liquidez pode evoluir para considerar número de vendedores, diversidade de versões e de preço, qualidade e recência, descontando duplicidade e concentração. O contrato deve permitir essa evolução sem reescrita.

**Histerese de liquidez (v2.0 §22).** Margens configuráveis em torno do alvo evitam que oscilações pequenas de estoque façam o raio oscilar entre degraus. Útil sobretudo se o alcance automático for persistido por sessão.

**Taxonomia normalizada de veículo (v2.0 §25).** Migrar da derivação em runtime para uma taxonomia persistida de marca, modelo comercial, versão, código FIPE e ano. É evolução de performance e consistência.

**Normalização avançada de query (v2.0 §27).** Tokens, aliases, sinônimos, dicionário de modelos comerciais e trigram apenas como fallback, para que grafias diferentes do mesmo modelo não produzam comportamentos diferentes.

**Motor adaptativo por dados (v2.0 §45).** Com volume suficiente, o raio automático pode considerar comportamento real por categoria, alterando parâmetros do resolvedor de escopo, não a arquitetura. Não usar aprendizado de máquina antes de volume suficiente.

**Otimização do peso comercial (v2.0 §47).** Denormalizar o peso-base quando os JOINs se mostrarem gargalo, mantendo o campo temporal do Destaque como verdade — sem criar job obrigatório apenas para expirá-lo.

**Read model de busca (v2.0 §48).** Uma projeção própria para busca, atualizada por eventos de publicação, edição, mudança de plano, de destaque e de status, reduz JOINs no caminho crítico sem alterar o Search Policy Engine.

**Score de liquidez v2 (v2.0 §57).** Uma combinação ponderada de contagem, vendedores únicos, diversidade de preço e de versão e recência, descontando concentração de duplicados. Os pesos não devem ser fixados agora; o valor arquitetural é o avaliador substituível e versionado.

**IA auxiliar (v2.0 §46, parte não normativa).** Modelos de linguagem podem auxiliar em linguagem natural e em recomendações futuras — fora do caminho crítico, e sem tocar em elegibilidade, peso, paginação, expiração de Destaque, regras de cidade ou relaxação.

**Origem de busca sem página territorial (DEC-15).** Uma cidade sem página, por não ter `ACTIVE` próprio, pode no futuro ser origem de busca geográfica sem ganhar rota territorial. Está prevista, sem fase definida, e não altera as seções 1 e 19.

**Proveniência:** DEC-15 · v2.0 §21 · v2.0 §22 · v2.0 §25 · v2.0 §27 · v2.0 §45 · v2.0 §46 (parte não normativa) · v2.0 §47 · v2.0 §48 · v2.0 §57.

---

## 23. Cenários, testes e invariantes

### 23.a Cenários e testes da v2.0, revisados

Os cenários funcionais da v2.0 §59 e os testes técnicos da v2.0 §60 permanecem, com as revisões abaixo.

| v2.0                                                        | Situação na v3                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| §59 A — cidade pura mostra só a própria cidade              | _Conflito: §59 A espera a página abrir somente com a cidade; DEC-03 faz a página nascer em `AUTO_RADIUS`. Vale DEC-03._ O cenário passa a esperar o menor território útil, com 0 km apenas quando o estoque próprio já atinge o alvo, e declaração do raio quando maior que 0                                                                                                                                                            |
| §59 B — 25 km manual                                        | Mantido                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| §59 C — 50 km manual inclui cidade de outra UF              | Mantido                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| §59 D — produto sem raio manual usa automático              | Mantido, com o baseline de `/comprar` da seção 8                                                                                                                                                                                                                                                                                                                                                                                         |
| §59 E — produto com "apenas a cidade" explícito não expande | Mantido                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| §59 F — Destaque distante vence Pró local                   | Mantido                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| §59 G — mesmo peso, local primeiro                          | Mantido                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| §59 H — anúncio fora do raio nunca entra                    | Mantido                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| §59 I — poucos resultados até 150 km não vira nacional      | Mantido quanto a não virar nacional; o caminho até 150 km deixa de ser automático e passa por Guided Relaxation (DEC-11)                                                                                                                                                                                                                                                                                                                 |
| §59 J — modelo errado com peso maior não entra              | Mantido                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| §60 — lista de testes técnicos                              | Mantida, com três ajustes: "filtro manual impede AUTO" ganha o caso de raio manual arbitrário (DEC-19); "AUTO usa menor raio útil" ganha a distinção `required_distance_km` × `effective_radius_km` (DEC-20); "AUTO respeita teto" passa a significar teto 75 km com entrega a Guided Relaxation, não expansão até 150 (DEC-11, DEC-18), e o raio efetivo abaixo do alvo é o último anel que acrescentou candidatos, não o teto (DEC-23) |

**Não reproduzido.** A v2.0 §61 (governança de branch antes de implementar) está obsoleta: a governança foi resolvida na F0, em sentido diferente do descrito lá. Não integra esta especificação.

**Checklist da v2.0 §66.** Os itens seguem válidos, com duas correções: o item 5, que autorizava o automático a usar 150 km como expansão especial, é substituído por DEC-11 (150 só por concessão oferecida); e o item 9, que mandava diferenciar 0 km implícito de 0 km explícito, vale apenas na metade explícita — o 0 km explícito continua sendo intenção manual, mas o "0 km implícito" deixa de existir como estado inicial (DEC-03).

**Formulação definitiva.** A síntese da v2.0 §65 permanece a formulação da regra, e é citada literalmente porque a formulação **é** a regra:

> **O Carros na Cidade procura o veículo no menor território capaz de oferecer uma busca útil, sem ultrapassar qualquer limite geográfico explicitamente escolhido pelo usuário.**

### 23.b Invariantes V3

Cada invariante é um requisito atômico, testável por um único caso.

| ID         | Enunciado                                                                                                                                                               | Proveniência               |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| V3-INV-001 | Cidade com 0 `ACTIVE` próprio responde 404 na rota territorial                                                                                                          | DEC-02                     |
| V3-INV-002 | Anúncios de cidades vizinhas nunca criam nem mantêm a existência de uma cidade                                                                                          | DEC-01                     |
| V3-INV-003 | `/carros-em/[cidade]` inicia em perfil `BROWSE_CITY` com modo `AUTO_RADIUS`                                                                                             | DEC-03                     |
| V3-INV-004 | Raio efetivo maior que 0 é declarado no copy da página territorial                                                                                                      | DEC-03                     |
| V3-INV-005 | O automático escolhe o menor anel permitido que atinge o alvo                                                                                                           | DEC-04                     |
| V3-INV-006 | Um raio manual válido de N km permanece exatamente N, sem arredondar para anel                                                                                          | DEC-19 · DEC-24            |
| V3-INV-007 | `required_distance_km` e `effective_radius_km` são grandezas distintas e ambas observáveis                                                                              | DEC-20                     |
| V3-INV-008 | Cidade de outra UF entra se `distance_km <= effective_radius_km`                                                                                                        | DEC-06                     |
| V3-INV-009 | Filtro explícito de produto não provoca expansão territorial silenciosa                                                                                                 | DEC-10                     |
| V3-INV-010 | O anel de 150 km só é alcançado por Guided Relaxation, nunca automaticamente                                                                                            | DEC-11                     |
| V3-INV-011 | Nenhuma concessão de Guided Relaxation é aplicada sem ação explícita do usuário                                                                                         | DEC-21                     |
| V3-INV-012 | Concessão com delta conhecido igual a zero não é apresentada                                                                                                            | DEC-14 · DEC-21            |
| V3-INV-013 | A menor concessão útil precede qualquer percentual ou degrau fixo                                                                                                       | DEC-21                     |
| V3-INV-014 | No máximo três concessões são apresentadas por vez                                                                                                                      | DEC-21                     |
| V3-INV-015 | Modelo alternativo nunca aparece como relaxação; aparece como recomendação separada                                                                                     | DEC-12                     |
| V3-INV-016 | Entrada direta em `/comprar` constrói o território-base antes de aplicar as dimensões de produto                                                                        | DEC-18                     |
| V3-INV-017 | Dentro do território, o peso comercial vence a distância                                                                                                                | DEC-07                     |
| V3-INV-018 | Anúncio fora do território nunca entra, qualquer que seja o seu peso                                                                                                    | DEC-07                     |
| V3-INV-019 | Grid, contagem total e facetas saem do mesmo `CandidateScope`                                                                                                           | DEC-08                     |
| V3-INV-020 | A faceta ativa é calculada removendo apenas a própria restrição                                                                                                         | DEC-13                     |
| V3-INV-021 | Opção de faceta com `count = 0` não é oferecida como nova escolha                                                                                                       | DEC-14                     |
| V3-INV-022 | A opção ativa com `count = 0` permanece visível e removível                                                                                                             | DEC-13 · DEC-14            |
| V3-INV-023 | No caminho novo, a ordenação completa ocorre antes de `LIMIT`/`OFFSET`                                                                                                  | v2.0 §37 · ADI-03          |
| V3-INV-024 | A paginação é estável: a página 2 não repete card da página 1                                                                                                           | v2.0 §38                   |
| V3-INV-025 | Nenhum modelo de linguagem participa de elegibilidade, peso, paginação, expiração de Destaque, regras de cidade ou relaxação                                            | v2.0 §46 · DEC-21          |
| V3-INV-026 | O limiar de indexação SEO é regra separada da existência da cidade e não é alterado por esta política                                                                   | v2.0 §2.2                  |
| V3-INV-027 | Mudar o raio não altera canonical, H1 nem identidade da página territorial                                                                                              | v2.0 §2.3 · DEC-03         |
| V3-INV-028 | Uma fonte de localização de menor precedência não sobrescreve uma de maior                                                                                              | v2.0 §5                    |
| V3-INV-029 | _Retirada por DEC-25 — a proposta do gate D1 não foi ratificada; a precedência de uma origem sem marcador fica pendente até a F3. O identificador não é reaproveitado._ | DEC-25 · `pendente`        |
| V3-INV-030 | O texto livre não move a origem por casamento de substring dentro de outra palavra                                                                                      | DEC-25                     |
| V3-INV-031 | A correção do casamento de texto vive no caminho novo; o legado com a flag desligada fica intocado — compatibilidade, não regra de política                             | ADI-03 · DEC-25            |
| V3-INV-032 | Todo contexto de busca carrega exatamente um dos cinco modos geográficos                                                                                                | v2.0 §6                    |
| V3-INV-033 | `STATE` e `NATIONAL` só são alcançados por ação explícita do usuário                                                                                                    | v2.0 §6 · v2.0 §18         |
| V3-INV-034 | A distância de um anúncio é a distância entre a cidade de origem e a cidade do anúncio                                                                                  | v2.0 §11                   |
| V3-INV-035 | A inclusão territorial é decidida por `distance_km`, nunca por `layer`                                                                                                  | DEC-06 · v2.0 §9           |
| V3-INV-036 | Com 0 km explícito, um filtro de produto não amplia o território                                                                                                        | DEC-05 · v2.0 §13          |
| V3-INV-037 | O usuário pode voltar de `MANUAL_RADIUS` para `AUTO_RADIUS` por ação explícita                                                                                          | DEC-05 · v2.0 §50          |
| V3-INV-038 | Os alvos de liquidez vêm de `platform_settings`, não de constante no código                                                                                             | DEC-17                     |
| V3-INV-039 | Os alvos iniciais são 20/16/16/12/8/4 para os seis perfis nomeados                                                                                                      | DEC-17                     |
| V3-INV-040 | A interface não lista como anel automático um valor acima de 75 km, em nenhum perfil                                                                                    | DEC-11 · DEC-18            |
| V3-INV-041 | `commercial_model` é faceta e filtro por igualdade case-insensitive, com peso A no vetor de busca                                                                       | DEC-09                     |
| V3-INV-042 | A descrição FIPE completa é preservada e não é usada como modelo comercial                                                                                              | v2.0 §23                   |
| V3-INV-043 | A busca textual continua sobre o vetor de busca e não é substituída por `ILIKE`                                                                                         | v2.0 §26                   |
| V3-INV-044 | Um veículo de outro modelo não entra no conjunto principal, mesmo com peso maior                                                                                        | v2.0 §28 · v2.0 §59 J      |
| V3-INV-045 | O peso efetivo é o máximo entre 4 com Destaque ativo e o peso do plano                                                                                                  | v2.0 §29                   |
| V3-INV-046 | Destaque expirado volta ao peso do plano                                                                                                                                | v2.0 §29 · v2.0 §60        |
| V3-INV-047 | Entre anúncios de mesmo peso, a ordem é por distância crescente                                                                                                         | DEC-07 · v2.0 §32          |
| V3-INV-048 | A ordenação distance-first histórica não é reintroduzida                                                                                                                | v2.0 §33                   |
| V3-INV-049 | O ranking termina com um desempate determinístico                                                                                                                       | v2.0 §38                   |
| V3-INV-050 | A chave de cache inclui modo geográfico, origem, raio e versão de política                                                                                              | v2.0 §41                   |
| V3-INV-051 | Toda busca carrega uma `search_policy_version`                                                                                                                          | v2.0 §43                   |
| V3-INV-052 | A telemetria da fase atual é um único evento `search.executed` com payload de contexto                                                                                  | ADI-01                     |
| V3-INV-053 | O payload de `search.executed` inclui `required_distance_km` e `effective_radius_km`                                                                                    | DEC-20 · ADI-01            |
| V3-INV-054 | Em `EXACT_CITY`, o copy nomeia apenas a cidade e não diz "e região"                                                                                                     | v2.0 §52                   |
| V3-INV-055 | Com raio manual arbitrário, o copy declara o valor exato, não o degrau mais próximo                                                                                     | DEC-19 · v2.0 §52          |
| V3-INV-056 | Parâmetros transacionais não criam landing indexável                                                                                                                    | v2.0 §53                   |
| V3-INV-057 | O parâmetro de raio é transacional e tem seu valor honrado exatamente                                                                                                   | DEC-19 · v2.0 §53          |
| V3-INV-058 | Esta política não altera existência territorial, canonical, sitemap, layout, header, pagamento ou módulos legais                                                        | v2.0 §62 · DEC-01 · DEC-02 |
| V3-INV-059 | Uma cidade sem página não ganha rota territorial por ser usada como origem de busca                                                                                     | DEC-15 · DEC-01            |
| V3-INV-060 | Relaxar preço, ano, câmbio, quilometragem ou distância preserva o mesmo produto                                                                                         | DEC-12                     |
| V3-INV-061 | As relaxações não são ordenadas apenas por quantidade acrescentada                                                                                                      | DEC-21                     |
| V3-INV-062 | Custos, arredondamentos e pesos de relaxação são configuração versionada, não lógica no frontend                                                                        | DEC-21                     |
| V3-INV-063 | O arredondamento amigável do teto de preço continua incluindo o candidato que justificou a sugestão                                                                     | DEC-21                     |
| V3-INV-064 | Uma faceta não ativa respeita todas as restrições ativas                                                                                                                | DEC-13 · v2.0 §40          |
| V3-INV-065 | Grid, total e facetas compartilham o mesmo território, não só o mesmo produto                                                                                           | DEC-08                     |
| V3-INV-066 | A relaxação de distância usa o primeiro anel permitido acima do território atual que acrescenta resultados                                                              | DEC-21                     |
| V3-INV-067 | Estado zero vindo de URL antiga, estoque, cache ou concorrência entra em recuperação e Guided Relaxation, não é tratado como impossível                                 | DEC-14                     |
| V3-INV-068 | O território-base de `/comprar` fica limitado aos anéis 0/25/50/75 km                                                                                                   | DEC-18                     |
| V3-INV-069 | A avaliação de liquidez agrupa candidatos por cidade, com o `distance_km` exato de cada uma                                                                             | DEC-20 · DEC-25            |
| V3-INV-070 | Preço permanece no conjunto principal de filtros, qualquer que seja seu poder discriminativo                                                                            | DEC-22                     |
| V3-INV-071 | Sem nenhum anel automático que atinja o alvo, `required_distance_km` é nulo                                                                                             | DEC-23                     |
| V3-INV-072 | O `effective_radius_km` não sobe ao teto de 75 km apenas por esse teto ter sido avaliado                                                                                | DEC-23                     |
| V3-INV-073 | Um anel cuja inclusão não acrescenta candidatos não amplia o território efetivo                                                                                         | DEC-23                     |
| V3-INV-074 | Se nenhum anel externo acrescenta candidatos, `effective_radius_km` é 0                                                                                                 | DEC-23                     |
| V3-INV-075 | Um raio explícito válido é um inteiro entre 0 e 150, inclusive                                                                                                          | DEC-24                     |
| V3-INV-076 | Um raio explícito de 0 produz `EXACT_CITY` explícito, com expansão automática bloqueada                                                                                 | DEC-24                     |
| V3-INV-077 | Raio explícito inválido nunca é silenciosamente arredondado para um valor aceito                                                                                        | DEC-24                     |
| V3-INV-078 | Com raio explícito válido presente, o baseline territorial de `/comprar` não se aplica                                                                                  | DEC-24 · DEC-05            |

**Princípios não testáveis isoladamente.** Três afirmações normativas das seções 1–19 não geram invariante própria, pelo motivo indicado: "o núcleo deve ser barato" (seção 1) é critério de projeto sem limiar definido; "a arquitetura deve permitir evolução sem reescrita" (seções 6 e 15) é propriedade de contrato, verificável por revisão e não por um caso; "a nomenclatura real dos parâmetros deve ser definida contra a política de URL existente" (seção 18) é instrução de processo, não comportamento observável.

**Proveniência:** DEC-01 · DEC-02 · DEC-03 · DEC-04 · DEC-05 · DEC-06 · DEC-07 · DEC-08 · DEC-09 · DEC-10 · DEC-11 · DEC-12 · DEC-13 · DEC-14 · DEC-15 · DEC-17 · DEC-18 · DEC-19 · DEC-20 · DEC-21 · DEC-22 · DEC-23 · DEC-24 · DEC-25 · ADI-01 · ADI-02 · ADI-03 · v2.0 §2.2 · v2.0 §2.3 · v2.0 §5 · v2.0 §6 · v2.0 §9 · v2.0 §11 · v2.0 §13 · v2.0 §18 · v2.0 §23 · v2.0 §26 · v2.0 §28 · v2.0 §29 · v2.0 §32 · v2.0 §33 · v2.0 §37 · v2.0 §38 · v2.0 §40 · v2.0 §41 · v2.0 §43 · v2.0 §46 · v2.0 §50 · v2.0 §52 · v2.0 §53 · v2.0 §59 · v2.0 §60 · v2.0 §61 (não reproduzido) · v2.0 §62 · v2.0 §65 · v2.0 §66.

---

**Fim — Search Policy Engine v3 (Consolidado)**
