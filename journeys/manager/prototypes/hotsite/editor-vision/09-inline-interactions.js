// Interaction layer for the visual-editor journey prototype. It keeps the shipped dashboard
// shell and the initial field definitions, adding draft state, live effects and navigation.
const moduleOrder = Object.keys(modules);
const enabledModules = Object.fromEntries(moduleOrder.map((type) => [type, !['CHATBOT', 'LEAD_FORM'].includes(type)]));
const panelDrafts = new Map();
let shareImageName = '';
let hasUnpublishedChanges = false;
let interactionsInitialized = false;
let selectedTemplate = 'beloauto';

const hotsiteTemplates = [
  { id: 'beloauto', name: 'BeloAuto Premium', category: 'Estética automotiva', description: 'O manifesto BeloAuto como ponto de partida: escuro, preciso e premium.', colors: ['#0a0a0a', '#1a1a1a', '#f5a800'], image: '../hotsite-impl/assets/beloauto-hero.png', heroImage: false, visible: ['HERO', 'SERVICE_LIST', 'BOOKING_CTA', 'TESTIMONIALS', 'ABOUT', 'CONTACT', 'FOOTER'], copy: { brand: 'BELOAUTO', menu: 'Serviços · Resultados · Sobre · Contato', eyebrow: 'ESTÉTICA AUTOMOTIVA PREMIUM · SJC-SP', hero: 'Cuidado completo para o seu carro', subtitle: 'Resultados impecáveis com atenção aos detalhes. Escolha um serviço e agende seu horário.', cta: 'Ver serviços', services: 'Nossos serviços', serviceEyebrow: 'O QUE FAZEMOS', cards: [['Lavagem completa', 'R$ 100'], ['Higienização', 'R$ 180'], ['Polimento técnico', 'R$ 320']], booking: 'Agende seu horário', bookingCopy: 'Reserve em poucos minutos e cuide do seu carro com a gente.', about: 'Cuidado em cada detalhe', aboutCopy: 'Uma equipe especializada para deixar seu carro impecável.', contact: 'Visite a BeloAuto', contactCopy: 'São José dos Campos · WhatsApp · Instagram', footer: 'BELOAUTO · Estética automotiva premium' } },
  { id: 'barbearia', name: 'Barbearia de bairro', category: 'Barbearia', description: 'Contraste clássico e uma chamada rápida para reservar seu horário.', colors: ['#16120f', '#2b211b', '#d9a441'], image: '../hotsite-impl/assets/casa47-hero.png', visible: ['HERO', 'SERVICE_LIST', 'TESTIMONIALS', 'BOOKING_CTA', 'ABOUT', 'CONTACT', 'FOOTER'], copy: { brand: 'CASA 47', menu: 'Cortes · Barba · A casa · Contato', eyebrow: 'BARBEARIA · DESDE 2014', hero: 'Seu estilo, no seu ritmo', subtitle: 'Corte, barba e cuidado de verdade em uma cadeira que já conhece você.', cta: 'Reservar horário', services: 'Serviços da casa', serviceEyebrow: 'ESCOLHA SEU MOMENTO', cards: [['Corte clássico', 'R$ 65'], ['Barba completa', 'R$ 55'], ['Corte + barba', 'R$ 105']], booking: 'Sua cadeira está aqui', bookingCopy: 'Escolha o profissional e o melhor horário para você.', about: 'Uma boa conversa começa no espelho', aboutCopy: 'Técnica, tempo e atenção em cada atendimento.', contact: 'Venha tomar um café', contactCopy: 'Vila Madalena · WhatsApp · Instagram', footer: 'CASA 47 · Barbearia de bairro' } },
  { id: 'pet', name: 'Pet care acolhedor', category: 'Pet shop', description: 'Uma identidade leve que valoriza carinho, recorrência e confiança.', colors: ['#fff8f0', '#fcebd8', '#e97c58'], image: '../hotsite-impl/assets/mimo-pet-hero.png', light: true, visible: ['HERO', 'SERVICE_LIST', 'GALLERY', 'TESTIMONIALS', 'BOOKING_CTA', 'CONTACT', 'FOOTER'], copy: { brand: 'MIMO PET', menu: 'Banho e tosa · Galeria · Dúvidas · Contato', eyebrow: 'CUIDADO QUE ABANA O RABO', hero: 'Todo carinho que seu pet merece', subtitle: 'Banho, tosa e bem-estar com uma equipe que chama cada cliente pelo nome.', cta: 'Agendar banho', services: 'Cuidado para todas as patinhas', serviceEyebrow: 'NOSSOS SERVIÇOS', cards: [['Banho e hidratação', 'A partir de R$ 55'], ['Tosa higiênica', 'A partir de R$ 45'], ['Dia de spa', 'A partir de R$ 120']], booking: 'Vamos cuidar do seu melhor amigo?', bookingCopy: 'Escolha o serviço e encontre um horário confortável para vocês.', about: 'Carinho que se vê', aboutCopy: 'Rotina segura, produtos gentis e muita atenção aos detalhes.', contact: 'Fale com a Mimo', contactCopy: 'Jardins · WhatsApp · Instagram', footer: 'MIMO PET · Cuidado, confiança e carinho' } },
  { id: 'wellness', name: 'Wellness sereno', category: 'Studio de bem-estar', description: 'Muito espaço, tons naturais e uma apresentação mais contemplativa.', colors: ['#18352e', '#295345', '#d9b98d'], image: '../hotsite-impl/assets/origem-hero.png', heroImage: false, visible: ['HERO', 'SERVICE_LIST', 'BOOKING_CTA', 'ABOUT', 'CONTACT', 'FOOTER'], copy: { brand: 'ORIGEM', menu: 'Rituais · Espaço · Sobre · Contato', eyebrow: 'PAUSE. RESPIRE. RECOMECE.', hero: 'Um tempo inteiro para você', subtitle: 'Rituais de bem-estar que respeitam seu corpo, seu ritmo e sua rotina.', cta: 'Conhecer rituais', services: 'Rituais para o seu momento', serviceEyebrow: 'BEM-ESTAR COM INTENÇÃO', cards: [['Massagem relaxante', '90 min'], ['Drenagem manual', '60 min'], ['Ritual Origem', '120 min']], booking: 'Reserve seu momento', bookingCopy: 'Escolha seu ritual e encontre uma pausa na sua semana.', about: 'Bem-estar é presença', aboutCopy: 'Um espaço calmo, técnica cuidadosa e escuta de verdade.', contact: 'Conheça o nosso espaço', contactCopy: 'Pinheiros · WhatsApp · Instagram', footer: 'ORIGEM · Studio de bem-estar' } },
  { id: 'clinic', name: 'Clínica de confiança', category: 'Saúde e estética', description: 'Uma apresentação clara que passa organização e segurança.', colors: ['#eff8ff', '#dceff7', '#147d95'], image: '../hotsite-impl/assets/clinica-lume-hero.png', heroImage: false, light: true, visible: ['HERO', 'SERVICE_LIST', 'TESTIMONIALS', 'BOOKING_CTA', 'ABOUT', 'CONTACT', 'FOOTER'], copy: { brand: 'CLÍNICA LUME', menu: 'Especialidades · Equipe · Convênios · Contato', eyebrow: 'SAÚDE COM ATENÇÃO INDIVIDUAL', hero: 'Cuidado que começa pela escuta', subtitle: 'Atendimento próximo, informação clara e uma jornada tranquila para você.', cta: 'Agendar consulta', services: 'Como podemos ajudar', serviceEyebrow: 'ESPECIALIDADES', cards: [['Consulta inicial', 'Agende online'], ['Acompanhamento', 'Plano personalizado'], ['Avaliação completa', 'Por horário']], booking: 'Seu próximo cuidado começa aqui', bookingCopy: 'Escolha a especialidade e veja os horários disponíveis.', about: 'Ciência e acolhimento', aboutCopy: 'Uma equipe preparada para cuidar de cada etapa.', contact: 'Fale com a Clínica Lume', contactCopy: 'Moema · WhatsApp · Telefone', footer: 'CLÍNICA LUME · Saúde com atenção individual' } },
  { id: 'studio', name: 'Studio criativo', category: 'Fotografia e criação', description: 'Tipografia forte e imagem protagonista para serviços autorais.', colors: ['#171321', '#302747', '#c5ff4a'], image: '../hotsite-impl/assets/lume-studio-hero.png', visible: ['HERO', 'SERVICE_LIST', 'GALLERY', 'TESTIMONIALS', 'LEAD_FORM', 'ABOUT', 'CONTACT', 'FOOTER', 'CHATBOT'], copy: { brand: 'LUME STUDIO', menu: 'Portfólio · Serviços · Processo · Contato', eyebrow: 'FOTOGRAFIA E DIREÇÃO CRIATIVA', hero: 'Imagens que deixam uma marca', subtitle: 'Fotografia, direção e conteúdo para negócios que querem ser lembrados.', cta: 'Ver portfólio', services: 'Projetos que fazemos', serviceEyebrow: 'DO CONCEITO À ENTREGA', cards: [['Ensaio de marca', 'Sob consulta'], ['Campanha completa', 'Projeto autoral'], ['Conteúdo mensal', 'Planos flexíveis']], booking: 'Vamos criar juntos?', bookingCopy: 'Conte um pouco do seu projeto e encontre o melhor caminho.', about: 'Uma ideia bem enquadrada', aboutCopy: 'Estratégia, direção e execução em um mesmo estúdio.', contact: 'Vamos conversar sobre seu projeto', contactCopy: 'Centro · WhatsApp · Instagram', footer: 'LUME STUDIO · Fotografia e direção criativa' } },
];

// Keep the template picker aligned with the richer, image-led compositions in hotsite-impl.
// These overrides are explicit here so the prototype demonstrates the current engine's real
// module combinations instead of presenting every template through the same preview recipe.
Object.assign(hotsiteTemplates.find(({ id }) => id === 'beloauto'), {
  description: 'Full bleed escuro, galeria featured, superfícies alternadas e CTA cinematográfico.',
  visible: ['HERO', 'SERVICE_LIST', 'GALLERY', 'ABOUT', 'TESTIMONIALS', 'BOOKING_CTA', 'CONTACT', 'FOOTER'],
});
Object.assign(hotsiteTemplates.find(({ id }) => id === 'barbearia'), {
  description: 'Editorial escuro, serviços em lista, fotos do espaço e agendamento imersivo.',
  visible: ['HERO', 'SERVICE_LIST', 'ABOUT', 'GALLERY', 'TESTIMONIALS', 'BOOKING_CTA', 'CONTACT', 'FOOTER'],
});
Object.assign(hotsiteTemplates.find(({ id }) => id === 'pet'), {
  description: 'Hero fotográfico, cards lúdicos, galeria featured e histórias de clientes.',
  image: '../hotsite-impl/assets/mimo-pet-hero-v2.png',
  visible: ['HERO', 'SERVICE_LIST', 'ABOUT', 'GALLERY', 'TESTIMONIALS', 'BOOKING_CTA', 'CONTACT', 'FOOTER'],
});
Object.assign(hotsiteTemplates.find(({ id }) => id === 'wellness'), {
  description: 'Hero sem foto, ritmo contemplativo, galeria natural e CTA imersivo.',
  image: '../hotsite-impl/assets/origem-booking.png',
  visible: ['HERO', 'ABOUT', 'SERVICE_LIST', 'GALLERY', 'TESTIMONIALS', 'BOOKING_CTA', 'CONTACT', 'FOOTER'],
});
Object.assign(hotsiteTemplates.find(({ id }) => id === 'clinic'), {
  description: 'Hero humano, informação estruturada, espaço em destaque e chatbot.',
  image: '../hotsite-impl/assets/clinica-lume-hero-v2.png',
  heroImage: true,
  visible: ['HERO', 'SERVICE_LIST', 'GALLERY', 'TESTIMONIALS', 'ABOUT', 'BOOKING_CTA', 'CONTACT', 'FOOTER', 'CHATBOT'],
});
Object.assign(hotsiteTemplates.find(({ id }) => id === 'studio'), {
  description: 'Portfólio assimétrico, contraste gráfico, lead form e chatbot inline.',
  image: '../hotsite-impl/assets/lume-studio-gallery-1.png',
});

liveBranding = function applyBrandingPreview() {
  const read = (label) => {
    const fieldLabel = [...document.querySelectorAll('#module-fields .field-label')].find((node) => node.textContent.trim() === label);
    return fieldLabel?.nextElementSibling?.value || '';
  };
  const primary = read('Cor primária') || '#f5a800';
  const secondary = read('Cor secundária') || '#1a1a1a';
  const background = read('Fundo') || '#0a0a0a';
  const foreground = read('Texto') || '#ffffff';
  const buttonBackground = read('Fundo do botão (opcional)') || primary;
  const buttonForeground = read('Texto do botão (opcional)') || '#0a0a0a';
  document.querySelectorAll('.site-button').forEach((button) => {
    button.style.backgroundColor = buttonBackground;
    button.style.color = buttonForeground;
  });
  document.querySelectorAll('.site-eyebrow,.site-card span,.site-testimonial cite').forEach((node) => { node.style.color = primary; });
  document.querySelectorAll('.site-content.alt,.site-card').forEach((node) => { node.style.backgroundColor = secondary; });
  document.querySelectorAll('.site-content:not(.alt),.site-hero').forEach((node) => {
    node.style.backgroundColor = background;
    node.style.color = foreground;
  });
  const brandName = read('Nome da marca');
  const slogan = read('Slogan (opcional)');
  const logo = document.querySelector('.site-brand');
  if (logo) logo.textContent = brandName || 'BELOAUTO';
  const heroEyebrow = document.querySelector('[data-module="HERO"] .site-eyebrow');
  if (heroEyebrow && slogan) heroEyebrow.textContent = slogan;
};

function activePanelKey() {
  return panelMode === 'module' ? `module:${selected}` : panelMode;
}

function markDraftChanged() {
  hasUnpublishedChanges = true;
  const context = panelMode === 'module' ? modules[selected][0] : panelMode === 'sharing' ? 'Compartilhamento' : panelMode === 'branding' ? 'Branding e estilo' : 'Estrutura da página';
  document.getElementById('preview-label').textContent = `Rascunho com alterações — ${context}`;
}

function rememberPanel() {
  const root = document.getElementById('module-fields');
  if (!root || !root.innerHTML) return;
  root.querySelectorAll('input:not([type="file"]), textarea, select').forEach((field) => {
    if (field.tagName === 'TEXTAREA') field.textContent = field.value;
    else if (field.tagName === 'SELECT') {
      [...field.options].forEach((option) => option.toggleAttribute('selected', option.value === field.value));
    } else field.setAttribute('value', field.value);
  });
  panelDrafts.set(activePanelKey(), root.innerHTML);
}

function restorePanel() {
  const saved = panelDrafts.get(activePanelKey());
  if (saved) document.getElementById('module-fields').innerHTML = saved;
}

structure = function renderDraggableStructure() {
  return `<h3>Estrutura da página</h3><p>Arraste os módulos para ordenar. Use o controle para mostrar ou ocultar; “Configurar” abre os campos deste módulo.</p><div class="vision-module-list" id="sortable-modules">${moduleOrder.map((key) => `<div class="vision-module-row" data-module-row="${key}" draggable="true"><span class="vision-drag" aria-label="Arrastar para ordenar">⠿</span><span class="vision-module-name">${modules[key][0]}</span><button class="vision-toggle ${enabledModules[key] ? 'on' : ''}" type="button" data-structure-toggle="${key}" aria-label="Mostrar ou ocultar ${modules[key][0]}"></button><button class="vision-module-configure" type="button" data-configure="${key}">Configurar</button></div>`).join('')}</div>`;
};

function setPreviewMode(mode) {
  document.querySelector('.vision-preview-frame .site-frame').style.display = mode === 'sharing' ? 'none' : '';
  document.getElementById('share-preview').style.display = mode === 'sharing' ? '' : 'none';
}

seo = function renderSharingFields() {
  return `<h3>SEO e compartilhamento</h3><p>Esses dados aparecem nos resultados de busca e quando alguém compartilha seu hotsite.</p><div class="form-stack"><label class="field-label">Título para busca (até 60 caracteres)</label><input class="field-input" maxlength="60" value="BeloAuto — Estética automotiva"><label class="field-label">Descrição para busca (até 158 caracteres)</label><textarea class="field-input" rows="3" maxlength="158">Lavagem premium, higienização e polimento técnico. Agende online.</textarea><label class="field-label">Imagem para compartilhamento</label><label class="upload-mock">Escolher imagem para o cartão de compartilhamento<br><span class="field-hint">PNG, JPG ou WebP</span><input type="file" accept="image/png,image/jpeg,image/webp" aria-label="Imagem para compartilhamento"></label></div>`;
};

branding = function renderBrandingFields() {
  const colorField = (label, value) => `<label class="field-label">${label}</label><input class="field-input" type="color" value="${value}" aria-label="${label}">`;
  return `<h3>Branding e estilo</h3><p>As cores e escolhas de estilo atualizam o hotsite à esquerda. Os campos opcionais de botão substituem a cor principal apenas quando preenchidos.</p><div class="form-stack">${colorField('Cor primária','#f5a800')}${colorField('Cor secundária','#1a1a1a')}${colorField('Fundo','#0a0a0a')}${colorField('Texto','#ffffff')}${input('Fundo do botão (opcional)')}${input('Texto do botão (opcional)')}${upload('Logo')}${input('Nome da marca','BeloAuto')}${input('Slogan (opcional)')}${choice('Fonte de títulos',['Inter','Poppins','Roboto','Montserrat'])}${choice('Fonte de texto',['Inter','Roboto','Open Sans'])}${choice('Cantos',['Retos','Arredondados','Bem arredondados'],1)}${choice('Estilo de botão',['Preenchido','Contorno','Discreto'])}${choice('Espaçamento',['Compacto','Confortável','Espaçoso'],1)}${choice('Sombra',['Nenhuma','Sutil','Forte'],1)}${choice('Fundo do Hero',['Cor primária','Cor de fundo'])}${toggle('Alternar fundo das seções')}${choice('Divisor entre seções',['Nenhum','Gradiente','Sólido'])}</div>`;
};

function restoreModuleOrder() {
  const site = document.getElementById('public-site');
  moduleOrder.forEach((type) => {
    const section = site.querySelector(`[data-module="${type}"]`);
    if (section) site.append(section);
  });
  moduleOrder.forEach((type) => {
    const section = site.querySelector(`[data-module="${type}"]`);
    if (section) section.style.display = enabledModules[type] ? '' : 'none';
  });
}

function updatePreviewFromFields() {
  if (panelMode === 'sharing') {
    const title = document.querySelector('#module-fields input:not([type="file"])')?.value || 'Título do hotsite';
    const description = document.querySelector('#module-fields textarea')?.value || 'Descrição do hotsite';
    document.getElementById('google-title').textContent = title;
    document.getElementById('whatsapp-title').textContent = title;
    document.getElementById('google-description').textContent = description;
    document.getElementById('whatsapp-description').textContent = description;
    return;
  }
  if (panelMode === 'branding') {
    liveBranding();
    return;
  }
  if (panelMode !== 'module') return;
  const readField = (name) => {
    const label = [...document.querySelectorAll('#module-fields .field-label')].find((node) => node.textContent.trim() === name);
    const field = label?.nextElementSibling;
    return field && (field.matches('input,textarea,select') ? field.value : '');
  };
  const section = document.querySelector(`[data-module="${selected}"]`);
  if (!section) return;
  const heading = section.querySelector('h1, h2');
  const eyebrow = section.querySelector('.site-eyebrow');
  const body = section.querySelector('p:not(.site-eyebrow)');
  const button = section.querySelector('.site-button');
  const mappings = {
    HERO: { heading: 'Título *', body: 'Subtítulo (opcional)', eyebrow: 'Texto de destaque (opcional)', button: 'Texto do botão *' },
    SERVICE_LIST: { heading: 'Título da seção', eyebrow: 'Texto de destaque' },
    GALLERY: { heading: 'Título da seção', eyebrow: 'Texto de destaque' },
    TESTIMONIALS: { heading: 'Título da seção', eyebrow: 'Texto de destaque' },
    BOOKING_CTA: { heading: 'Título *', body: 'Subtítulo (opcional)', eyebrow: 'Texto de destaque (opcional)', button: 'Texto do botão *' },
    ABOUT: { heading: 'Título *', body: 'Texto *', eyebrow: 'Texto de destaque (opcional)' },
    CONTACT: { heading: 'Título da seção', eyebrow: 'Texto de destaque' },
    LEAD_FORM: { heading: 'Título *', body: 'Subtítulo (opcional)', eyebrow: 'Texto de destaque (opcional)', button: 'Texto do botão *' },
  }[selected];
  if (mappings?.heading && heading) heading.textContent = readField(mappings.heading) || ' ';
  if (mappings?.body && body) body.textContent = readField(mappings.body) || ' ';
  if (mappings?.eyebrow && eyebrow) eyebrow.textContent = readField(mappings.eyebrow) || ' ';
  if (mappings?.button && button) button.textContent = readField(mappings.button) || ' ';
  if (selected === 'TESTIMONIALS') {
    const list = document.querySelector('#module-fields [data-testimonial-list]');
    const entries = list ? [...list.querySelectorAll('.config-subsection')] : [];
    if (entries.length) {
      const preview = section.querySelector('.site-testimonial');
      preview.replaceChildren();
      entries.forEach((entry) => {
        const labels = [...entry.querySelectorAll('.field-label')];
        const value = (label) => labels.find((node) => node.textContent.trim() === label)?.nextElementSibling?.value || '';
        const quote = document.createElement('span'); quote.textContent = `“${value('Depoimento')}”`;
        const author = document.createElement('cite'); author.textContent = `${value('Nome da pessoa')} · ★★★★★`;
        preview.append(quote, author);
      });
    }
  }
  if (selected === 'FOOTER') {
    const spans = section.querySelectorAll('span');
    if (spans[1]) spans[1].textContent = readField('Frase curta (opcional)') || ' ';
    if (spans[2]) spans[2].textContent = readField('Aviso de direitos autorais (opcional)') || ' ';
  }
  if (selected === 'CHATBOT') section.textContent = readField('Nome do assistente') ? `💬 ${readField('Nome do assistente')}` : '💬';
}

function bindPrototypeControls() {
  const root = document.getElementById('module-fields');
  if (!root.dataset.prototypeBound) {
    root.dataset.prototypeBound = 'true';
    root.addEventListener('input', (event) => {
      markDraftChanged();
      rememberPanel();
      updatePreviewFromFields();
    });
    root.addEventListener('change', (event) => {
      if (event.target.matches('input[type="file"]') && event.target.files?.[0]) {
        shareImageName = event.target.files[0].name;
        const uploadName = event.target.closest('.upload-mock')?.textContent?.toLowerCase() || '';
        if (panelMode === 'sharing') {
          document.getElementById('og-preview-image').textContent = shareImageName;
          document.getElementById('og-preview-image').style.backgroundImage = `linear-gradient(120deg,#11182733,#11182733),url("${URL.createObjectURL(event.target.files[0])}")`;
          document.getElementById('og-preview-image').style.backgroundSize = 'cover';
          document.getElementById('og-preview-image').style.backgroundPosition = 'center';
        } else {
          const section = document.querySelector(`[data-module="${selected}"]`);
          if (section && /fundo/.test(uploadName)) section.style.backgroundImage = 'linear-gradient(120deg,#111827cc,#11182755),linear-gradient(120deg,#f5a800,#1e293b)';
          else if (section && /galeria|imagens/.test(uploadName)) {
            const tile = document.createElement('div'); tile.className = 'site-card'; tile.textContent = shareImageName; section.querySelector('.site-cards')?.append(tile);
          } else if (section) section.querySelector('.site-testimonial cite')?.insertAdjacentText('beforebegin', ` (${shareImageName})`);
        }
      }
      if (event.target.matches('input,textarea,select')) markDraftChanged();
      rememberPanel();
      updatePreviewFromFields();
    });
    root.addEventListener('click', (event) => {
      const choiceButton = event.target.closest('.choice');
      if (choiceButton) {
        choiceButton.parentElement.querySelectorAll('.choice').forEach((button) => button.classList.remove('active'));
        choiceButton.classList.add('active');
        applyChoiceEffect(choiceButton);
        markDraftChanged();
        rememberPanel();
      }
      const toggleButton = event.target.closest('.vision-toggle');
      if (toggleButton) {
        toggleButton.classList.toggle('on');
        const row = toggleButton.closest('[data-structure-toggle]');
        if (row) {
          const type = row.dataset.structureToggle;
          enabledModules[type] = toggleButton.classList.contains('on');
          const section = document.querySelector(`[data-module="${type}"]`);
          if (section) section.style.display = enabledModules[type] ? '' : 'none';
        } else if (panelMode === 'module' && selected === 'SERVICE_LIST' && toggleButton.closest('.vision-module-row')?.textContent.includes('Mostrar preços')) {
          document.querySelectorAll('[data-module="SERVICE_LIST"] .site-card span').forEach((price) => {
            price.style.display = toggleButton.classList.contains('on') ? '' : 'none';
          });
        } else if (panelMode === 'branding' && toggleButton.closest('.vision-module-row')?.textContent.includes('Alternar fundo')) {
          document.querySelectorAll('.site-content').forEach((section, index) => section.classList.toggle('alt', toggleButton.classList.contains('on') && index % 2 === 1));
        }
        markDraftChanged();
        rememberPanel();
      }
      const configure = event.target.closest('[data-configure]');
      if (configure) selectModule(configure.dataset.configure);
      const template = event.target.closest('[data-template]');
      if (template) applyTemplate(template.dataset.template);
      if (event.target.closest('#back-to-module-list')) showStructure();
      if (event.target.closest('#add-testimonial')) {
        const list = root.querySelector('[data-testimonial-list]');
        const item = list.querySelector('.config-subsection').cloneNode(true);
        item.querySelector('h4').textContent = `Depoimento ${list.children.length + 1}`;
        item.querySelectorAll('input, textarea').forEach((field) => { field.value = ''; field.removeAttribute('value'); field.textContent = ''; });
        item.querySelectorAll('input[type="file"]').forEach((field) => { field.value = ''; });
        list.append(item);
        markDraftChanged();
        rememberPanel();
      }
      if (event.target.closest('#add-lead-question')) {
        const list = root.querySelector('[data-question-list]');
        const item = document.createElement('div'); item.className = 'mini-item';
        item.innerHTML = '<label class="field-label">Pergunta</label><input class="field-input" value=""><button type="button" class="vision-module-configure" data-remove-item>Remover</button>';
        list.append(item);
        markDraftChanged();
        rememberPanel();
      }
      if (event.target.closest('[data-remove-item]')) { event.target.closest('.mini-item').remove(); markDraftChanged(); rememberPanel(); }
    });
    root.addEventListener('dragstart', (event) => {
      const row = event.target.closest('[data-module-row]');
      if (row) { event.dataTransfer.setData('text/plain', row.dataset.moduleRow); row.classList.add('opacity-50'); }
    });
    root.addEventListener('dragend', (event) => event.target.closest('[data-module-row]')?.classList.remove('opacity-50'));
    root.addEventListener('dragover', (event) => { if (event.target.closest('[data-module-row]')) event.preventDefault(); });
    root.addEventListener('drop', (event) => {
      const target = event.target.closest('[data-module-row]');
      if (!target) return;
      event.preventDefault();
      const draggedType = event.dataTransfer.getData('text/plain');
      const from = moduleOrder.indexOf(draggedType), to = moduleOrder.indexOf(target.dataset.moduleRow);
      if (from < 0 || to < 0 || from === to) return;
      moduleOrder.splice(to, 0, moduleOrder.splice(from, 1)[0]);
      markDraftChanged();
      restoreModuleOrder();
      showStructure();
    });
  }
}

function applyChoiceEffect(button) {
  const label = button.parentElement.previousElementSibling?.textContent?.toLowerCase() || '';
  const section = document.querySelector(`[data-module="${selected}"]`);
  if (!section) return;
  if (label.includes('layout') && selected === 'HERO') section.style.textAlign = button.textContent.includes('esquerda') ? 'left' : 'center';
  if (label.includes('formato') && selected === 'SERVICE_LIST') {
    const cards = section.querySelector('.site-cards');
    if (cards) cards.style.gridTemplateColumns = button.textContent === 'Lista' ? '1fr' : '';
  }
  if (label.includes('fundo da seção') && ['BOOKING_CTA', 'LEAD_FORM'].includes(selected)) section.style.background = button.textContent.includes('fundo') ? '#0a0a0a' : '#f5a800';
  if (label.includes('posição horizontal') && selected === 'HERO') section.style.textAlign = button.textContent.toLowerCase();
  if (label.includes('posição vertical') && ['HERO', 'BOOKING_CTA'].includes(selected)) section.style.paddingTop = button.textContent === 'Topo' ? '1.5rem' : button.textContent === 'Base' ? '5rem' : '';
  if (label.includes('posição da foto') && selected === 'GALLERY') section.querySelector('.site-cards')?.style.setProperty('direction', button.textContent === 'Direita' ? 'rtl' : 'ltr');
  if (panelMode === 'branding') {
    if (label.includes('fonte de títulos')) document.querySelectorAll('.site-frame h1,.site-frame h2').forEach((node) => { node.style.fontFamily = button.textContent; });
    if (label.includes('fonte de texto')) document.querySelectorAll('.site-frame').forEach((node) => { node.style.fontFamily = button.textContent; });
    if (label === 'cantos') document.querySelectorAll('.site-card,.site-testimonial,.site-button').forEach((node) => { node.style.borderRadius = button.textContent === 'Retos' ? '0' : button.textContent === 'Bem arredondados' ? '1.25rem' : '.5rem'; });
    if (label === 'espaçamento') document.querySelectorAll('.site-section').forEach((node) => { node.style.paddingBlock = button.textContent === 'Compacto' ? '1.5rem' : button.textContent === 'Espaçoso' ? '5rem' : ''; });
    if (label === 'sombra') document.querySelectorAll('.site-card,.site-testimonial').forEach((node) => { node.style.boxShadow = button.textContent === 'Nenhuma' ? 'none' : button.textContent === 'Forte' ? '0 12px 30px #0005' : '0 2px 8px #0002'; });
    if (label.includes('fundo do hero')) {
      const hero = document.querySelector('[data-module="HERO"]');
      const primaryLabel = [...document.querySelectorAll('#module-fields .field-label')].find((node) => node.textContent.trim() === 'Cor primária');
      hero.style.backgroundColor = button.textContent.includes('primária') ? primaryLabel?.nextElementSibling?.value : '#0a0a0a';
    }
  }
}

function selectModule(type) {
  rememberPanel();
  panelMode = 'module'; selected = type; setGlobalActive('structure'); setPreviewMode('site');
  document.querySelectorAll('[data-module]').forEach((node) => node.classList.toggle('is-selected', node.dataset.module === type));
  const [name] = modules[type];
  document.getElementById('preview-label').textContent = `Rascunho — configurando: ${name}`;
  document.getElementById('module-fields').innerHTML = `<button class="vision-impact-link" type="button" id="back-to-module-list">← Voltar para organizar módulos</button>${moduleForm(type)}`;
  restorePanel(); document.getElementById('module-fields').scrollTop = 0; bindPrototypeControls(); updatePreviewFromFields();
}

function showBranding() {
  if (interactionsInitialized) rememberPanel();
  panelMode = 'branding'; setGlobalActive('branding'); setPreviewMode('site');
  document.querySelectorAll('[data-module]').forEach((node) => node.classList.remove('is-selected'));
  document.getElementById('preview-label').textContent = 'Rascunho — configurando Branding e estilo';
  document.getElementById('module-fields').innerHTML = branding(); restorePanel(); document.getElementById('module-fields').scrollTop = 0; bindPrototypeControls(); updatePreviewFromFields();
  interactionsInitialized = true;
}

function showSharing() {
  rememberPanel(); panelMode = 'sharing'; setGlobalActive('sharing'); setPreviewMode('sharing');
  document.querySelectorAll('[data-module]').forEach((node) => node.classList.remove('is-selected'));
  document.getElementById('preview-label').textContent = 'Prévia de compartilhamento';
  document.getElementById('module-fields').innerHTML = seo(); restorePanel(); document.getElementById('module-fields').scrollTop = 0; bindPrototypeControls(); updatePreviewFromFields();
}

function showStructure() {
  rememberPanel(); panelMode = 'structure'; setGlobalActive('structure'); setPreviewMode('site');
  document.getElementById('preview-label').textContent = 'Rascunho — organize e configure os módulos';
  document.getElementById('module-fields').innerHTML = structure(); document.getElementById('module-fields').scrollTop = 0; bindPrototypeControls();
}

function templateGallery() {
  return `<h3>Comece com um template</h3><p>Escolha uma base que combine com o seu negócio. Você pode personalizar cores, textos, fotos e módulos depois.</p><div class="template-grid">${hotsiteTemplates.map((template) => `<button class="template-card ${selectedTemplate === template.id ? 'active' : ''}" type="button" data-template="${template.id}" aria-pressed="${selectedTemplate === template.id}"><span class="template-thumbnail" style="--template-bg:${template.colors[0]};--template-surface:${template.colors[1]};--template-accent:${template.colors[2]};--template-image:url('${template.image}')"><span class="template-thumbnail-brand">${template.copy.brand}</span><span class="template-thumbnail-copy"></span><span class="template-thumbnail-action"></span></span><span class="template-card-copy"><strong>${template.name}</strong><span>${template.category}</span><small>${template.description}</small></span>${selectedTemplate === template.id ? '<span class="template-selected">Selecionado</span>' : ''}</button>`).join('')}</div><p class="template-note">O template preenche uma base de conteúdo demonstrativa. Revise os textos, imagens, serviços e dados de contato antes de publicar.</p>`;
}

function setText(selector, value) {
  const element = document.querySelector(selector);
  if (element) element.textContent = value;
}

function setCards(moduleType, cards) {
  const target = document.querySelector(`[data-module="${moduleType}"] .site-cards`);
  if (!target) return;
  target.replaceChildren(...cards.map(([title, detail]) => {
    const card = document.createElement('div');
    card.className = 'site-card';
    const heading = document.createElement('strong'); heading.textContent = title;
    const caption = document.createElement('span'); caption.textContent = detail;
    card.append(heading, caption);
    return card;
  }));
}

function applyTemplate(templateId) {
  const template = hotsiteTemplates.find((entry) => entry.id === templateId);
  if (!template) return;
  selectedTemplate = templateId;
  panelDrafts.clear();
  const { colors, copy, image, visible, light } = template;
  const [background, surface, accent] = colors;
  const text = light ? '#172033' : '#ffffff';
  const muted = light ? '#42526a' : 'rgba(255,255,255,.76)';
  const site = document.getElementById('public-site');
  site.dataset.template = templateId;
  site.style.backgroundColor = background;
  site.style.color = text;
  document.querySelectorAll('.site-section, .site-bar, .site-card, .site-button, .site-frame h1, .site-frame h2, .site-frame p, .site-frame span, .site-testimonial').forEach((node) => node.removeAttribute('style'));
  document.querySelector('.site-bar').style.backgroundColor = background;
  document.querySelector('.site-bar').style.color = text;
  const hero = document.querySelector('[data-module="HERO"]');
  hero.style.backgroundColor = background;
  hero.style.color = text;
  hero.style.backgroundImage = template.heroImage === false ? 'none' : `linear-gradient(90deg,${background}f2 0%,${background}d9 47%,${background}4d 100%),url("${image}")`;
  hero.style.backgroundSize = 'cover';
  hero.style.backgroundPosition = 'center';
  hero.querySelector('p:not(.site-eyebrow)').style.color = muted;
  document.querySelectorAll('.site-content:not(.alt)').forEach((section) => { section.style.backgroundColor = background; section.style.color = text; });
  document.querySelectorAll('.site-content.alt').forEach((section) => { section.style.backgroundColor = surface; section.style.color = text; });
  document.querySelectorAll('.site-content > p').forEach((paragraph) => { paragraph.style.color = muted; });
  document.querySelectorAll('.site-eyebrow, .site-card span, .site-testimonial cite').forEach((node) => { node.style.color = accent; });
  document.querySelectorAll('.site-card').forEach((card) => { card.style.backgroundColor = surface; card.style.color = text; card.style.border = `1px solid ${accent}33`; });
  document.querySelectorAll('.site-testimonial').forEach((card) => { card.style.borderLeftColor = accent; card.style.color = text; });
  const booking = document.querySelector('[data-module="BOOKING_CTA"]');
  booking.style.backgroundColor = accent;
  booking.style.color = light ? '#172033' : background;
  document.querySelectorAll('.site-button').forEach((button) => { button.style.backgroundColor = accent; button.style.color = light ? '#172033' : background; });
  booking.querySelector('.site-button').style.backgroundColor = background;
  booking.querySelector('.site-button').style.color = text;
  setText('.site-brand', copy.brand);
  setText('.site-menu', copy.menu);
  setText('[data-module="HERO"] .site-eyebrow', copy.eyebrow);
  setText('[data-module="HERO"] h1', copy.hero);
  setText('[data-module="HERO"] p:not(.site-eyebrow)', copy.subtitle);
  setText('[data-module="HERO"] .site-button', copy.cta);
  setText('[data-module="SERVICE_LIST"] .site-eyebrow', copy.serviceEyebrow);
  setText('[data-module="SERVICE_LIST"] h2', copy.services);
  setCards('SERVICE_LIST', copy.cards);
  setText('[data-module="GALLERY"] .site-eyebrow', 'POR TRÁS DE CADA DETALHE');
  setText('[data-module="GALLERY"] h2', template.id === 'studio' ? 'Trabalhos recentes' : 'Momentos que a gente cuida');
  setCards('GALLERY', [['Ambiente', 'Conheça o espaço'], ['Detalhes', 'Feito com cuidado'], ['Resultados', 'Clientes felizes']]);
  setText('[data-module="TESTIMONIALS"] h2', 'Histórias de quem escolheu a gente');
  setText('[data-module="TESTIMONIALS"] .site-testimonial', '“Atendimento atencioso, resultado impecável e uma experiência que dá vontade de repetir.”');
  const testimonial = document.querySelector('[data-module="TESTIMONIALS"] .site-testimonial');
  const cite = document.createElement('cite'); cite.textContent = 'Cliente Ikaro · ★★★★★'; testimonial.append(cite);
  setText('[data-module="BOOKING_CTA"] h2', copy.booking);
  setText('[data-module="BOOKING_CTA"] p', copy.bookingCopy);
  setText('[data-module="ABOUT"] h2', copy.about);
  setText('[data-module="ABOUT"] p:not(.site-eyebrow)', copy.aboutCopy);
  setText('[data-module="CONTACT"] h2', copy.contact);
  setText('[data-module="CONTACT"] p:not(.site-eyebrow)', copy.contactCopy);
  setText('[data-module="LEAD_FORM"] h2', 'Vamos tirar sua ideia do papel');
  setText('[data-module="LEAD_FORM"] p:not(.site-eyebrow)', 'Conte um pouco do que você precisa. A gente responde em breve.');
  setText('[data-module="LEAD_FORM"] .site-button', 'Quero conversar');
  setText('[data-module="FOOTER"] span:nth-of-type(2)', copy.footer);
  setText('[data-module="FOOTER"] span:nth-of-type(3)', '© 2026. Todos os direitos reservados.');
  moduleOrder.forEach((type) => {
    enabledModules[type] = visible.includes(type);
    const section = document.querySelector(`[data-module="${type}"]`);
    if (section) section.style.display = enabledModules[type] ? '' : 'none';
  });
  document.querySelectorAll('[data-module]').forEach((node) => node.classList.remove('is-selected'));
  hasUnpublishedChanges = true;
  document.getElementById('preview-label').textContent = `Rascunho com alterações — template ${template.name}`;
  document.getElementById('module-fields').innerHTML = templateGallery();
  document.getElementById('module-fields').scrollTop = 0;
  bindPrototypeControls();
  showFeedback(`Template “${template.name}” aplicado à prévia.`);
}

function showTemplates() {
  rememberPanel(); panelMode = 'templates'; setGlobalActive('templates'); setPreviewMode('site');
  document.querySelectorAll('[data-module]').forEach((node) => node.classList.remove('is-selected'));
  document.getElementById('preview-label').textContent = 'Rascunho — escolha uma base para o seu hotsite';
  document.getElementById('module-fields').innerHTML = templateGallery();
  document.getElementById('module-fields').scrollTop = 0;
  bindPrototypeControls();
}

function showFeedback(message) {
  const output = document.getElementById('editor-feedback');
  output.textContent = message; output.style.display = 'block';
  window.setTimeout(() => { output.style.display = 'none'; }, 2800);
}

document.getElementById('publish-action').addEventListener('click', () => showFeedback('Protótipo: alterações publicadas.'));
document.getElementById('publish-mobile').addEventListener('click', () => showFeedback('Protótipo: alterações publicadas.'));
document.getElementById('view-live-action').addEventListener('click', () => showFeedback('Prévia do site publicado (demonstração).'));
document.getElementById('view-live-mobile').addEventListener('click', () => showFeedback('Prévia do site publicado (demonstração).'));

restoreModuleOrder();
showBranding();
