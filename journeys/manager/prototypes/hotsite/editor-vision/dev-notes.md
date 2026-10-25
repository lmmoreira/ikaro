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
- Os modelos de hotsite são entregues pelo TD56 (catálogo versionado, aplicação segura e este seletor): **Templates** é o primeiro comando do editor visual e a primeira aba do editor em detalhes, e os dois mostram a mesma galeria sobre o mesmo rascunho.

## Templates (TD56 Story 5)

| Arquivo | Vale para |
|---|---|
| `09-inline-realistic-editor.html` (+ `09-inline-interactions.js`) | A hierarquia visual da galeria: seis cards (`beloauto`, `casa47`, `mimo-pet`, `origem`, `clinica-lume`, `lume-studio`) com miniatura, nome, descrição e até quatro chips de capacidades; o selo "Selecionado"; o aviso de depoimentos de exemplo; a confirmação de substituição de imagens; e "Desfazer template". |

- Aplicar e pré-visualizar são a mesma operação: o card aplica o template ao rascunho e a prévia muda na hora. Nada é publicado; a publicação segue o fluxo único do editor.
- O template troca cores, fontes, ordem e variantes das seções, imagens e textos de exemplo. Nome, logo, slogan, serviços, contatos, horários e a configuração de agendamento continuam os do negócio.
- O destaque "Selecionado" vale só na sessão: o manifesto não guarda qual template foi aplicado, então depois de recarregar nenhum card aparece marcado.
- Há uma única confirmação, e só quando a aplicação apagaria imagens que o gerente enviou (hero, sobre, fundos de agendamento e de seção, colagem): "As imagens que você enviou nestas seções serão substituídas e removidas quando você salvar." A galeria, os depoimentos, o formulário de captura e o chatbot do gerente são mantidos, então não entram nessa conta.
- **Desfazer template** volta um passo (o rascunho de antes da última aplicação). Pergunta antes se houve edições depois da aplicação e some ao publicar. Uma nova aplicação substitui o passo guardado.
- Navegação e Bloco de conteúdo aparecem na lista de módulos; a Navegação fica sempre no topo, com cadeado em vez da alça de arrastar.
- A caixa "Protótipo: simular que já enviei imagens minhas" só existe para demonstrar a confirmação; o produto decide sozinho, a partir do rascunho.
