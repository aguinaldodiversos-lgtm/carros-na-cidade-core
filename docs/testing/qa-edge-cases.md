# QA — Edge cases e cenários (checklist)

Documento de **garantia de qualidade**: cenários de borda e lacunas de cobertura de testes em relação ao fluxo Carros na Cidade (cadastro → painel → novo anúncio → publicação → isolamento).

**Nota:** este ficheiro não altera UI nem layouts; serve apenas como referência para testes manuais, automatizados e priorização de backlog.

---

## Índice

1. [Autenticação e sessão](#1-autenticação-e-sessão)
2. [Cadastro mínimo](#2-cadastro-mínimo)
3. [Painel e `/me`](#3-painel-e-me)
4. [Novo anúncio e gate de perfil](#4-novo-anúncio-e-gate-de-perfil)
5. [Publicação e API de anúncios](#5-publicação-e-api-de-anúncios)
6. [Isolamento e segurança](#6-isolamento-e-segurança)
7. [PJ / lojista](#7-pj--lojista)
8. [Pagamentos e checkout](#8-pagamentos-e-checkout)
9. [Resiliência e ambiente](#9-resiliência-e-ambiente)
10. [Acessibilidade e dispositivos](#10-acessibilidade-e-dispositivos)
11. [Priorização sugerida](#11-priorização-sugerida)
12. [Tickets numerados (backlog)](#12-tickets-numerados-backlog)

---

## 1. Autenticação e sessão

| ID | Cenário | O que validar |
|----|---------|----------------|
| A1 | Token de acesso expira no meio do wizard | Recuperação via refresh ou mensagem clara; não perder rascunho sem aviso |
| A2 | Refresh token revogado / logout global | Cookie Next invalidado; novo login exigido |
| A3 | Cookie de sessão adulterado (assinatura inválida) | Rejeição sem 500 genérico; redirect para login |
| A4 | Login com e-mail em maiúsculas ou espaços extras | Normalização `trim` + lowercase no backend |
| A5 | Conta com `email_verified === false` | 403 e mensagem explícita (quando o produto exigir verificação) |
| A6 | Rate limit em `/login` | Comportamento após N tentativas (mensagem, tempo de espera) |
| A7 | Parâmetro `next` após login | Apenas paths internos seguros (sem open redirect) |

**Cobertura típica:** parcial nos E2E; falta cenário A1/A2/A3 automatizado.

---

## 2. Cadastro mínimo

| ID | Cenário | O que validar |
|----|---------|----------------|
| R1 | E-mail já cadastrado (segundo POST) | HTTP 400, mensagem em PT, sem vazar existência de conta de forma agressiva |
| R2 | Senha no limite (ex.: 6 caracteres vs 5) | Alinhamento front + back |
| R3 | Senha com caracteres especiais / Unicode | JSON e hash corretos |
| R4 | Backend indisponível no registo | Mensagem de erro no BFF Next, sem crash |
| R5 | Registo imediato + sessão no cookie | Utilizador não fica em estado “meio autenticado” |
| R6 | Tipo de conta `pending` no cookie após registo | Compatível com painel e redirects |

---

## 3. Painel e `/me`

| ID | Cenário | O que validar |
|----|---------|----------------|
| D1 | Resposta parcial do dashboard (campos em falta) | Normalização + fallback; sem exceção em runtime |
| D2 | 502/504 no `GET /api/account/dashboard` | UI de recuperação (`DashboardClientRecovery` ou equivalente) |
| D3 | Utilizador sem documento (`pending`) | Métricas zeradas, copy adequada, sem erro fatal |
| D4 | Refresh F5 no painel autenticado | Sessão mantida com cookie + tokens |

---

## 4. Novo anúncio e gate de perfil

| ID | Cenário | O que validar |
|----|---------|----------------|
| W1 | Primeira visita `pending` → gate → após CPF, segunda visita **sem** gate | Estado `dashboard` e cookie coerentes com `CPF`/`CNPJ` |
| W2 | Abrir `/anunciar/novo` sem estar logado | Redirect ou fluxo definido pelo produto |
| W3 | CPF inválido no gate | Mensagem de erro clara |
| W4 | CNPJ com API Receita indisponível / timeout | Erro tratado; mensagem útil |
| W5 | Mesmo documento noutra conta | HTTP 409 (ou regra de produto documentada) |
| W6 | URL com `step` inválido ou localStorage corrompido | `clampStep` / recuperação sem white screen |
| W7 | Publicar sem fotos no passo exigido | Validação no passo de fotos |
| W8 | Alterar marca/modelo depois de preencher preço | Dados consistentes no POST final |

---

## 5. Publicação e API de anúncios

| ID | Cenário | O que validar |
|----|---------|----------------|
| P1 | `city_id` inconsistente com UF | Rejeição controlada no BFF/backend |
| P2 | PATCH/DELETE de anúncio de outro utilizador | 404; sem fugas de informação |
| P3 | Limites de plano vs anúncios ativos | `resolvePublishEligibility` e mensagens |
| P4 | CNPJ não verificado vs verificado | Limites e mensagens distintas conforme regra de negócio |

---

## 6. Isolamento e segurança

| ID | Cenário | O que validar |
|----|---------|----------------|
| I1 | JWT A a aceder `GET /api/account/ads/:id` do anúncio B | 404 |
| I2 | Listagens privadas sempre filtradas por `req.user.id` | Sem `user_id` confiável vindo só do cliente |
| I3 | Dois utilizadores em E2E com cookies isolados | `user.id` distinto em `/api/dashboard/me` (ver `user-isolation-api.spec.ts`) |
| I4 | Webhooks / pagamentos | Corpo não substitui `user_id` autenticado |

**Nota:** testes unitários em `tests/account/account-owned-ads-isolation.test.js` validam a **forma** do SQL; E2E de ownership (I1) ainda é valioso.

---

## 7. PJ / lojista

| ID | Cenário | O que validar |
|----|---------|----------------|
| L1 | Fluxo completo PJ (login loja, wizard `lojista`, CNPJ) | Substituir placeholder em `critical-pj-flow.spec.ts` quando houver credenciais |
| L2 | Utilizador PF a aceder `/dashboard-loja` | Redirect para `/dashboard` conforme `requireLojistaDashboardSession` |
| L3 | Links no header (painel PF vs loja) | Coerência com tipo de sessão |

---

## 8. Pagamentos e checkout

| ID | Cenário | O que validar |
|----|---------|----------------|
| C1 | Fluxo `20-login-ad-checkout` com MP em sandbox | URLs de sucesso/erro/pendente |
| C2 | Webhook duplicado ou assinatura inválida | Idempotência / rejeição segura |

---

## 9. Resiliência e ambiente

| ID | Cenário | O que validar |
|----|---------|----------------|
| E1 | API FIPE indisponível | Passo 0 do wizard com mensagem recuperável |
| E2 | Autocomplete de cidade sem resultados | Finalização não bloqueada de forma opaca |
| E3 | Duas abas a editar o mesmo anúncio | Comportamento aceitável (última gravação vence ou aviso) |

---

## 10. Acessibilidade e dispositivos

| ID | Cenário | O que validar |
|----|---------|----------------|
| X1 | Navegação por teclado no wizard e no gate de perfil | Foco e submits |
| X2 | Viewport estreito (mobile) no painel | Menu e CTA “Novo anúncio” utilizáveis |
| X3 | Mensagens de erro sem stack trace exposto ao utilizador final | Em produção |

---

## 11. Priorização sugerida

### Alta (risco × esforço)

1. E2E: **segundo anúncio sem gate** (conta já com documento).
2. E2E: **documento duplicado** entre duas contas (409).
3. Teste de contrato: **`GET /api/auth/me`** com conta sem `document_type` → tipo `pending`.
4. Testes de **`next`/redirect** após login (URLs permitidas).

### Média

5. Simular **token expirado** no wizard (TTL curto ou mock).
6. **PJ** ponta a ponta (credenciais `E2E_PJ_*`).
7. Integração: **ownership** em PATCH/DELETE de anúncio.

### Baixa (backlog)

8. Rate limit; cookie adulterado; webhooks.
9. Smoke a11y no painel.

---

## 12. Tickets numerados (backlog)

Use estes IDs em issues (GitHub/Linear/etc.) para rastreio.

| Ticket | Título | Área |
|--------|--------|------|
| **QA-101** | E2E: segundo anúncio sem gate de CPF/CNPJ | Wizard |
| **QA-102** | E2E: `verify-document` retorna 409 para documento já usado noutra conta | Auth |
| **QA-103** | Contrato: teste automatizado `GET /api/auth/me` com `pending` | API |
| **QA-104** | Testes de redirect `next` pós-login (open redirect) | Auth |
| **QA-105** | E2E: expiração de access token durante wizard (refresh) | Sessão |
| **QA-106** | Completar `critical-pj-flow` com credenciais reais | PJ |
| **QA-107** | E2E: utilizador PF bloqueado em `/dashboard-loja` | Rotas |
| **QA-108** | Integração: PATCH/DELETE anúncio alheio → 404 | Ownership |
| **QA-109** | Teste de resiliência: FIPE indisponível (wizard passo 0) | FIPE |
| **QA-110** | Checkout MP sandbox (fluxo completo) | Pagamentos |
| **QA-111** | Checklist manual: rate limit login | Segurança |
| **QA-112** | Smoke a11y: teclado no gate de perfil + wizard | A11y |

---

## Documentação relacionada

- [E2E (Playwright)](./e2e.md)
- [Cobertura e integração](./coverage-and-integration.md)
- [Integração de anúncios](./integration-ads.md)

---

*Última atualização: checklist interno de QA — não substitui critérios de aceitação de produto.*
