# Análise técnica do sistema — Carros na Cidade Core

Data: 2026-03-04

## Resumo executivo

Foram identificados pontos de risco em **segurança**, **confiabilidade operacional** e **manutenibilidade**. Os riscos mais críticos são:

1. fallback de autenticação local com credenciais fixas em produção;
2. segredo de sessão com valor padrão inseguro;
3. ausência de suíte de testes no backend;
4. coexistência de implementações legadas e novas para autenticação/rotas;
5. dados de domínio e PII simulada mantidos em memória no frontend.

## Pontos fracos identificados e recomendações

### 1) Segurança de autenticação (criticidade alta)

**Achado**
- Existe fallback de autenticação local com usuários e senhas hardcoded (`123456`) quando backend não responde.

**Risco**
- Aumenta superfície de ataque e pode permitir acessos indevidos em ambientes mal configurados.

**Melhoria sugerida**
- Remover fallback local em produção.
- Proteger por `NODE_ENV !== "production"` e flag explícita (`ALLOW_LOCAL_AUTH=true`) para dev.
- Migrar para credenciais de fixtures apenas em ambiente de testes.

### 2) Gestão de segredo de sessão (criticidade alta)

**Achado**
- O segredo de assinatura da sessão possui valor padrão (`cnc-dev-session-secret`) quando variável de ambiente não existe.

**Risco**
- Tokens podem ser forjados se o segredo padrão for conhecido.

**Melhoria sugerida**
- Tornar `AUTH_SESSION_SECRET` obrigatório em produção (falhar startup sem a variável).
- Adicionar rotação de segredo (chave ativa + chave anterior) para migração sem logout forçado.

### 3) Qualidade e cobertura de testes (criticidade alta)

**Achado**
- Backend não possui testes nem lint efetivo nos scripts principais.

**Risco**
- Regressões passam despercebidas em autenticação, pagamentos e workers.

**Melhoria sugerida**
- Adotar baseline de testes (unit + integração HTTP) para auth, planos, webhook e limites.
- Configurar lint real no backend e CI obrigatório para PR.

### 4) Arquitetura híbrida/legada (criticidade média-alta)

**Achado**
- Convivem módulos novos ESM com controladores antigos CommonJS em árvore ativa.
- Há duplicidade de arquivos de rota com comportamentos diferentes.

**Risco**
- Aumenta custo de manutenção, chance de rota errada em import e inconsistências de schema (ex.: `password` vs `password_hash`).

**Melhoria sugerida**
- Congelar uso de `src/routes/*` legado e consolidar em `src/modules/*`.
- Definir plano de depreciação por domínio e remover duplicatas após validação.

### 5) Dados em memória para regras de negócio (criticidade média)

**Achado**
- Planos, usuários, assinaturas e pagamentos possuem armazenamento em memória no frontend.

**Risco**
- Estado volátil entre deploys/instâncias, inconsistência em escala horizontal e risco de exposição de dados de exemplo.

**Melhoria sugerida**
- Migrar para persistência centralizada (backend + banco).
- Manter seed mock somente em ambiente local e com dados sintéticos não sensíveis.

### 6) Operabilidade e observabilidade (criticidade média)

**Achado**
- Há boa base com logger, request-id e health, porém sem SLO/SLI explícitos e com logs heterogêneos (`console.*` em diversos pontos).

**Risco**
- Dificulta investigação de incidentes e correlação entre serviços/workers.

**Melhoria sugerida**
- Padronizar logs estruturados (`pino`) e remover `console.*` em runtime.
- Definir métricas mínimas: latência p95/p99, taxa de erro, taxa de login falho, fila pendente e retries.

## Roadmap recomendado

### Fase 1 (1–2 semanas)
- Bloquear fallback local em produção.
- Exigir segredo de sessão em produção.
- Configurar lint backend + CI mínimo.

### Fase 2 (2–4 semanas)
- Cobertura de testes para auth, pagamentos e webhooks.
- Consolidar rotas legadas e eliminar duplicidade.

### Fase 3 (4–8 semanas)
- Migrar store em memória para backend persistente.
- Evoluir observabilidade com dashboards e alertas.

## Quick wins (baixo esforço / alto impacto)

1. Guardrail de produção para autenticação local.
2. `AUTH_SESSION_SECRET` obrigatório no deploy.
3. Pipeline com `npm run lint` + testes de fumaça HTTP.
4. Remoção/isolamento de arquivos legados não utilizados.
