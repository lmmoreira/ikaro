# Dev Notes — Proposta: editor visual do hotsite

## Objetivo

Transformar a experiência atual, orientada por formulários e Preview separado, em uma edição guiada por prévia. Esta proposta preserva o manifesto, os módulos e as regras atuais; ela altera a apresentação e a descoberta das configurações.

## Telas

| Arquivo | Propósito |
|---|---|
| `01-editor-visual.html` | Prévia persistente e seleção direta de seções. |
| `02-branding-impact.html` | Mapa visual de impacto das propriedades globais de Branding. |
| `03-module-context.html` | Opções de módulo organizadas em Conteúdo, Aparência e Avançado. |
| `04-task-validation.html` | Roteiro de validação com tarefas reais de gerente. |

## Premissas de implementação

- O rascunho continua sendo `HotsiteAdminContentResponse`; nenhuma propriedade de manifesto é adicionada.
- `HotsitePreview` passa de destino separado a painel persistente do editor.
- Cada módulo renderizado na prévia precisa expor uma seleção de edição que identifica seu `HotsiteModuleType`.
- Campos globais de Branding devem declarar os elementos/variáveis que afetam para a prévia destacá-los temporariamente.
- O Manifesto continua disponível como modo avançado, fora do caminho principal.

## Critério de validação

Antes de transformar esta proposta em stories, testar as cinco tarefas de `04-task-validation.html` com gerentes ou pessoas sem contexto do schema. O sinal principal é concluir cada tarefa sem pedir explicação sobre o nome técnico de um campo.
