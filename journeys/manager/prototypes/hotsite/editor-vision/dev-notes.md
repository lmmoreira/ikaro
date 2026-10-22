# Dev Notes — Editor visual do hotsite (entregue, TD55)

## Objetivo

A edição do hotsite é guiada pela prévia: o gerente vê o rascunho enquanto edita, seleciona uma seção diretamente na prévia e vê o efeito de Branding e Compartilhamento no lugar. Manifesto, módulos e regras não mudaram; mudaram a apresentação e a navegação. Entregue pelas Stories 1–4 de `td/TD55-HOTSITE-VISUAL-EDITOR-UX.md`; o comportamento está descrito em `journeys/manager/hotsite.md` § Editor visual.

## Quais arquivos valem

| Arquivo | Vale para |
|---|---|
| `09-inline-realistic-editor.html` (+ `09-inline-interactions.js`, `vision.css`) | Layout geral, prévia persistente, barra de comandos, inspetor e seleção de seções. Não modela Aplicar/Cancelar, descarte, campos condicionais, o seletor de fotos da Galeria nem o construtor de perguntas do Lead Form; os campos reais vêm de `modules/*ConfigPanel.tsx`. |
| `11-sharing-preview.html` | Só a simulação do Google e do cartão do WhatsApp e a atualização ao digitar. |
| `../01-hotsite-editor.html` | Só o editor em abas ("Editar em detalhes") e o "Voltar à edição visual" na barra superior. |
| `01`–`08`, `10-grouped-module-fields.html` | Explorações anteriores ou superadas; não usar como referência (`10` contradiz a decisão final: sem Aplicar/Cancelar, com agrupamento por regex e prévia só do Hero). |

## Premissas de implementação (como foi entregue)

- O rascunho continua sendo `HotsiteAdminContentResponse`; nenhuma propriedade de manifesto foi adicionada.
- A prévia é o `HotsitePreviewCanvas`, o mesmo usado pelo Preview do editor em abas; cada módulo é envolvido por um seletor só do editor, sem alterar o plano de renderização público.
- O Manifesto fica só em "Editar em detalhes".
- Modelos de hotsite continuam fora do escopo.
