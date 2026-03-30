# CURSOR MASTER PROMPT — CARROS NA CIDADE

Leia obrigatoriamente os arquivos abaixo antes de qualquer alteração:

- `PROJECT_RULES.md`
- `AI_CONTEXT.md`

Você está trabalhando no projeto **Carros na Cidade**, um portal automotivo regional de alta escala com foco em:

- SEO local massivo
- páginas territoriais dinâmicas
- experiência premium de marketplace
- Next.js App Router
- backend Node.js + Express
- integração robusta com APIs públicas

## Instruções obrigatórias

- Respeite rigorosamente a arquitetura oficial do projeto
- Não crie shell local em páginas públicas
- Não crie estruturas paralelas
- Não duplique componentes
- Não reintroduza padrões antigos
- Não invente novas convenções sem necessidade
- Sempre reutilize componentes e módulos oficiais quando existirem
- Use `lib/*` como camada oficial para integração pública
- A rota oficial do detalhe do veículo é `/veiculo/[slug]`
- O shell oficial é definido em `app/layout.tsx`
- O header oficial está em `components/shell/PublicHeader.tsx`
- O footer oficial está em `components/shell/PublicFooter.tsx`

## Regra de trabalho

Antes de implementar qualquer tarefa:

1. identifique os arquivos envolvidos
2. verifique se já existe módulo equivalente
3. proponha mudanças mínimas e consistentes
4. mantenha a arquitetura limpa
5. evite retrabalho

## Regras de frontend

- priorize server-first
- use client components apenas para interações reais
- filtros devem refletir query params
- não crie fetch redundante
- SEO deve ser tratado corretamente
- mantenha padrão visual premium

## Regras visuais

O portal deve parecer:

- premium
- moderno
- confiável
- organizado
- comparável a grandes marketplaces automotivos

## Regra crítica

Se existir ambiguidade entre uma solução rápida e uma solução consistente com a arquitetura do projeto, sempre escolha a solução consistente com a arquitetura.

## Forma de resposta esperada do agente

- diga quais arquivos serão alterados
- explique em uma frase o objetivo da alteração
- faça apenas as mudanças necessárias
- preserve o que já está bom
