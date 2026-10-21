(() => {
  const page = document.body;
  const content = document.getElementById('proposal-content');
  if (!content) return;

  const title = page.dataset.pageTitle ?? 'Hotsite';
  const backHref = page.dataset.backHref;
  const backLabel = page.dataset.backLabel ?? 'Hotsite';
  const topbarStart = backHref
    ? `<a href="${backHref}" class="vision-shell-back">← ${backLabel}</a>`
    : '<div class="topbar-brand"><div class="topbar-logo-mark">B</div><span class="topbar-tenant-name">BeloAuto Demo</span></div>';

  const shell = document.createElement('div');
  shell.className = 'vision-dashboard-shell';
  shell.innerHTML = `
    <div class="dashboard-topbar">
      ${topbarStart}
      <h1 class="topbar-page-title">${title}</h1>
      <div style="margin-left:auto;display:flex;align-items:center;gap:.75rem"><span class="topbar-avatar">AP</span><span class="topbar-date">Hoje, 16 de junho de 2026</span></div>
    </div>
    <div class="dashboard-layout">
      <aside class="sidebar">
        <div class="sidebar-header"><div class="sidebar-logo">B</div><div><p class="sidebar-tenant-name">BeloAuto Demo</p><p class="sidebar-tenant-slug">@beloauto</p></div></div>
        <nav class="sidebar-nav" style="margin-top:.5rem"><a class="sidebar-nav-item" href="#">▣ Agenda</a><a class="sidebar-nav-item" href="#">◷ Horários</a><a class="sidebar-nav-item" href="#">⌁ Serviços</a><a class="sidebar-nav-item" href="#">☆ Fidelidade</a></nav>
        <p class="sidebar-section-label">Somente Gerente</p>
        <nav class="sidebar-nav"><a class="sidebar-nav-item" href="#">♙ Equipe</a><a class="sidebar-nav-item" href="#">⚙ Configurações</a><a class="sidebar-nav-item active" href="../01-hotsite-editor.html">◎ Hotsite</a></nav>
        <div class="sidebar-footer"><div class="list-avatar" style="flex-shrink:0;width:2rem;height:2rem;font-size:.8125rem">AP</div><div><p class="sidebar-user-name">Ana Pereira</p><span class="role-badge role-badge-manager">Gerente</span></div></div>
      </aside>
      <main class="main-content"><div class="dashboard-body"></div></main>
    </div>
    <nav class="bottom-nav"><a class="bottom-nav-item" href="#">Agenda</a><a class="bottom-nav-item" href="#">Horários</a><a class="bottom-nav-item" href="#">Serviços</a><a class="bottom-nav-item" href="#">Fidelidade</a><a class="bottom-nav-item active" href="../01-hotsite-editor.html">Mais</a></nav>`;
  shell.querySelector('.dashboard-body').append(content);
  page.append(shell);
})();
