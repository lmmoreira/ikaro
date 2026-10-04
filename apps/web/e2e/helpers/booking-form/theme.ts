import type { Page } from '@playwright/test';

// A dark hotsite palette applied to the real booking page: the layout paints the tenant's
// branding as inline `--ba-*` custom properties on one wrapper element, so overriding them there
// re-themes every screen exactly the way a dark tenant would — without touching any tenant's
// stored branding (shared state that parallel specs read).
const DARK_PALETTE: Readonly<Record<string, string>> = {
  '--ba-background': '#0f172a',
  '--ba-text': '#f1f5f9',
  '--ba-secondary': '#475569',
  '--ba-primary': '#93c5fd',
  '--ba-btn-bg': '#93c5fd',
  '--ba-btn-text': '#0f172a',
  '--ba-btn-border': '#93c5fd',
};

export async function applyDarkHotsitePalette(page: Page): Promise<void> {
  await page.evaluate((palette) => {
    const host = document.querySelector<HTMLElement>('[style*="--ba-background"]');
    if (!host) throw new Error('no element carries the hotsite branding variables');
    for (const [name, value] of Object.entries(palette)) host.style.setProperty(name, value);
  }, DARK_PALETTE);
}
