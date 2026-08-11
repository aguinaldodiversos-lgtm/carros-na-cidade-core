# Fase 1.1 — Notificações Mobile

Data: 2026-08-10
Branch: `codex/opportunities-phase-1-notifications`

Revisão de responsividade do sino de notificações, com prioridade para celular.
Nenhum produto novo implementado; backend intocado.

---

## Estado inicial

| Item                     | Valor                                       |
| ------------------------ | ------------------------------------------- |
| Branch                   | `codex/opportunities-phase-1-notifications` |
| HEAD inicial             | `6e521e03c4a6a1aa3ac3463e964b27813674f3d0`  |
| Sincronia com `origin`   | idêntica (mesmo SHA)                        |
| Working tree             | limpo                                       |
| Posição vs `origin/main` | 5 à frente, **0 atrás**                     |

---

## Problema encontrado

Auditado com 5 lentes independentes em paralelo (shell, duplicação de request,
overflow/z-index, touch/a11y, convenções do repo): 40 achados brutos, 23
verificados adversarialmente, **6 confirmados**. Todos os que mudam a decisão
foram também medidos no navegador antes de qualquer alteração.

### 1. Sino desktop-only — o débito da Fase 1, confirmado

Medido a 360×640: **1 sino no DOM, 0 visíveis.** O componente vivia só na topbar
`hidden ... lg:flex`, e `lg` é 1024px (o `tailwind.config.ts` não customiza
`screens`). Quem usa o portal pelo celular não tinha acesso nenhum.

### 2. Request desperdiçada — o sino já custava sem entregar

As regiões do shell são alternadas por **CSS**, não por render condicional. O
sino ficava montado a 360px e disparava `unread-count` para um badge
`display:none`.

### 3. Duplicação de request — o risco crítico do briefing

Pelo mesmo motivo, um segundo `<AccountNotificationsBell/>` na barra mobile
ficaria **montado junto com o de desktop**: 2 `fetchUnreadCount()` por carga e 2
listeners de `focus`.

### 4. Painel vazaria para fora da tela

`absolute right-0 w-[340px]` funciona no desktop porque o sino fica na borda
direita. No mobile ele fica no **meio** da barra — 340px ancorados ali caem
fora da viewport.

**Não é hipótese.** O `AccountUserMenu`, que já vive nessa barra com o mesmo
padrão (`absolute right-0 w-60`), foi medido a 360px renderizando em
**`left: -43px`** — cortado em silêncio pelo `body { overflow-x: hidden }` do
`globals.css`, sem barra de rolagem para denunciar. **Bug pré-existente, fora
do escopo desta fase** (ver Pendências), mas foi o que confirmou o diagnóstico.

### 5. Orçamento de largura apertado (medido, não estimado)

Barra a 360px: 360 − 32 de padding = 328 úteis, com 283 já ocupados → **45px de
folga**. Um sino de 40px + gap 8 não caberia; 36px + 8 = 44 cabe.

### 6. Dois achados de acessibilidade no código da Fase 1

Levantados pela auditoria, confirmados por leitura do componente:

- **Foco perdido em "Marcar todas como lidas":** o botão desmonta a si mesmo ao
  zerar o contador, enquanto detém o foco. O foco caía no `<body>` e o cursor do
  leitor de tela saía do dropdown.
- **"Não lida" comunicado só por cor:** o ponto azul é `aria-hidden` e o resto
  da diferença é peso/fundo. Item lido e não lido tinham o **mesmo nome
  acessível**.

### 7. Bug de arquitetura encontrado pelo próprio teste novo

Com dois sinos montados, um clique dentro do painel do sino **visível** era
"fora" para o sino **oculto**, que fechava o painel no `pointerdown` — removendo
o botão do DOM antes do `click` disparar. Na prática, "Marcar todas" e cada
notificação ficavam **inclicáveis**. Só apareceu porque o teste monta os dois
sinos como o shell faz.

---

## Solução

| Arquivo                                   | O que muda                                                                                               |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `AccountNotificationsProvider.tsx` (novo) | Estado, busca e ações, montados **uma vez** pelo shell. Também o clique-fora/Escape, com um listener só. |
| `AccountNotificationsBell.tsx`            | Vira casca visual; posicionamento responsivo; correções de a11y.                                         |
| `AccountPanelShell.tsx`                   | Envolve o painel no provider; `relative` na linha da barra; sino na barra mobile.                        |
| `AccountNotificationsBell.test.tsx`       | +14 casos (anti-duplicação, posicionamento, a11y).                                                       |

**Estado compartilhado, não instância condicional.** Nada de
`matchMedia`/render condicional: traria mismatch de hidratação e flash do sino
na primeira pintura. **CSS decide o que aparece; React decide o que busca.**

**Posicionamento por CSS puro, sem número mágico e sem `position: fixed`.** No
mobile o wrapper é `static`, então o painel se ancora na **linha** da barra (que
o shell marca `relative`) via `inset-x-4`. Em `lg` o wrapper volta a `relative`
e o desktop fica byte a byte como era.

Três faixas de largura, cada uma por um motivo medido:

- `< sm` → `inset-x-4` (largura útil da barra; 340px fixos não caberiam a 360)
- `sm–lg` → largura contida à direita (sem isso, **721px** de dropdown num
  tablet de 768 — não vaza, mas é absurdo para duas linhas de texto)
- `lg+` → `w-[340px]`, exatamente a Fase 1

Altura: `max-h-[55vh]`, com `max-lg:landscape:max-h-[40vh]` — o painel começa
~133px abaixo do topo, então 55vh de 360 ainda passava da dobra em landscape.

Botão 36px no mobile (mesma altura do avatar vizinho) e 40px no desktop.
`pointerdown` no lugar de `mousedown`: é o evento que o dedo produz.

---

## Viewports testados

Todos no navegador real, PF e CNPJ, com 120 notificações semeadas por fixture no
banco de **teste**.

| Viewport            | Região  | Botão | Painel          | Vaza? | Scroll-X | Resultado |
| ------------------- | ------- | ----- | --------------- | ----- | -------- | --------- |
| 360×640             | mobile  | 36×36 | 328px (16→344)  | não   | não      | **OK**    |
| 390×844             | mobile  | 36×36 | 358px (16→374)  | não   | não      | **OK**    |
| 412×915             | mobile  | 36×36 | 380px (16→396)  | não   | não      | **OK**    |
| 768×1024            | mobile  | 36×36 | 360px (377→737) | não   | não      | **OK**    |
| 1024×768            | desktop | 40×40 | 340px           | não   | não      | **OK**    |
| 1440×900            | desktop | 40×40 | 340px           | não   | não      | **OK**    |
| 640×360 (landscape) | mobile  | 36×36 | base 338 < 360  | não   | não      | **OK**    |

**PF:** badge `99+` sem quebrar layout; abrir → 10 itens com scroll interno;
clicar um → 120→119 persistido (API confirma); "marcar todas" → badge some, API
confirma 0; toque fora fecha; Escape fecha.

**CNPJ:** `notifications-bell-lojista`, badge 5 → clique → 4 persistido; vê
apenas as 5 próprias, **nenhuma** das 120 do PF.

Textos: título no limite de 120 caracteres e corpo longo truncam com
`line-clamp-2` + `break-words`, sem estourar a largura.

---

## Network

Medido no **build de produção** (`.next/standalone`), não em dev — em dev o
`reactStrictMode: true` duplica os efeitos e daria falso positivo de duplicação.
Essa distinção foi feita depois de observar 2 chamadas em dev com um único sino
montado.

| Cenário                               | Chamadas               |
| ------------------------------------- | ---------------------- |
| Carga do dashboard (2 sinos montados) | **1** × `unread-count` |
| Abrir o painel                        | +1 × `?limit=10`       |
| 12 s parado, sem interação            | **0** novas            |

**Duplicação mobile/desktop: NÃO.** **Polling adicionado: NÃO.**

---

## Acessibilidade

| Item                              | Estado                                                                 |
| --------------------------------- | ---------------------------------------------------------------------- |
| `aria-label` do sino              | preservado, com singular/plural correto ("1 não lida" / "3 não lidas") |
| `aria-haspopup` / `aria-expanded` | preservados                                                            |
| `role="dialog"` no painel         | preservado                                                             |
| Foco após "Marcar todas"          | **corrigido** — volta ao painel (`tabIndex={-1}`)                      |
| "Não lida" para leitor de tela    | **corrigido** — texto `sr-only`, não só cor                            |
| Área de toque do sino             | 36×36 mobile / 40×40 desktop                                           |
| Área de toque de "Marcar todas"   | 156×34 (era ~20px de altura; padding acrescentado)                     |
| Cada notificação                  | linha inteira clicável, ~72px de altura                                |
| Fechar por toque fora             | `pointerdown` (cobre dedo, mouse e caneta)                             |
| Fechar por Escape                 | preservado                                                             |

---

## Resiliência

Backend **inteiro derrubado**, a 360×640:

- shell renderiza; menu mobile e CTA presentes;
- sino presente, sem badge (degrada em silêncio);
- painel abre com "Não foi possível carregar as notificações.";
- painel dentro da viewport; zero scroll horizontal.

O painel nunca deixa de renderizar por causa do sino.

---

## Testes

| Comando                          | Resultado                                                                             |
| -------------------------------- | ------------------------------------------------------------------------------------- |
| `npm test --prefix frontend`     | **as mesmas 5 falhas do baseline**, 2799 passando (era 2785)                          |
| `npx tsc --noEmit`               | VERDE                                                                                 |
| `npx next lint --max-warnings 0` | VERDE                                                                                 |
| `npm run build`                  | VERDE + standalone                                                                    |
| Backend                          | **não executado — nenhum arquivo backend alterado** (`git status` sobre `src/` vazio) |

Falhas de baseline (idênticas às da Fase 1, sem relação com notificações):
`app/seguranca/page.copy.test.ts` (2) e
`app/carros-usados/regiao/[slug]/page.config.test.ts` (3, flaky por vazamento de
`process.env` entre workers).

**Falhas novas: nenhuma.**

### Testes acrescentados (14)

Anti-duplicação (o requisito crítico): dois sinos montados → 1 `fetchUnreadCount`,
1 listener de `focus`, 1 busca de lista, contador idêntico nos dois, "marcar
todas" por um zera o outro. Posicionamento: wrapper `static`/`lg:relative`,
`inset-x-4` + `lg:w-[340px]`, `max-h` responsiva, botão 36/40.
Acessibilidade: foco preservado, texto `sr-only`, `tabIndex={-1}`.

---

## Build

`npm run build` verde, com a rota e o componente no bundle. Toda a verificação
de rede e de `Cache-Control` foi feita contra esse build, não contra o dev
server.

---

## Arquivos alterados

- `frontend/components/account/AccountNotificationsProvider.tsx` (novo)
- `frontend/components/account/AccountNotificationsBell.tsx`
- `frontend/components/account/AccountNotificationsBell.test.tsx`
- `frontend/components/account/AccountPanelShell.tsx`

## Arquivos NÃO alterados

- todo o backend (`src/**`), incluindo `src/modules/notifications/**` e a
  migration `049`
- auth, JWT, sessão, cookies
- `ads`, SEO, sitemaps, `frontend/middleware.ts`
- payments, planos, Mercado Pago
- workers

---

## Pendências

1. **`AccountUserMenu` vaza para fora da tela no mobile** (`left: -43px` a
   360px). Pré-existente, mesmo padrão que corrigimos no sino. Fora do escopo
   desta fase; correção é análoga (uma linha de classe).
2. **`AccountPlanCard` busca `/api/dashboard/me` estando `display:none` no
   mobile** — desperdício pré-existente de 1 request por carga em celular.
3. **O sino não está na barra mobile em telas `lg`+ nem no menu sanfona** — por
   desenho: cada breakpoint tem exatamente uma instância visível.

---

## Veredito

# GO

| Critério                                        | Status                                 |
| ----------------------------------------------- | -------------------------------------- |
| PF acessa notificações no mobile                | ✅                                     |
| CNPJ acessa notificações no mobile              | ✅                                     |
| Desktop continua funcionando                    | ✅ (1024 e 1440 idênticos à Fase 1)    |
| Sino visível em 360/390/412px                   | ✅                                     |
| Painel não extrapola viewport                   | ✅ (7 viewports medidos)               |
| Sem scroll horizontal                           | ✅                                     |
| Lista com scroll vertical adequado              | ✅                                     |
| Badge `99+` não quebra layout                   | ✅                                     |
| Empty / error / loading                         | ✅                                     |
| Marcar uma / marcar todas                       | ✅ (persistência confirmada pela API)  |
| `action_path` continua funcionando              | ✅                                     |
| Sem dois sinos fazendo requests duplicados      | ✅ (1 chamada, medido em produção)     |
| Sem polling novo                                | ✅ (0 chamadas em 12 s)                |
| PF/PJ com lógica compartilhada                  | ✅ (mesmo componente + mesmo provider) |
| Zero regressão desktop                          | ✅                                     |
| Zero falha nova de frontend                     | ✅                                     |
| Typecheck / lint / build                        | ✅                                     |
| Backend / auth / ads / SEO / payments intocados | ✅                                     |
| Produtos A e B não implementados                | ✅                                     |
