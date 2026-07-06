import type { Locator, Page } from '@playwright/test';

export function getMemberRow(page: Page, text: string): Locator {
  return page.locator('.divide-y > div').filter({ hasText: text });
}

// Filtering role-option by visible text is unreliable: the MANAGER option's own description
// ("Tudo da Equipe + ...") contains "Equipe" as a substring, colliding with the STAFF option's
// title. The data-role attribute is unambiguous.
export function getRoleOption(page: Page, role: 'STAFF' | 'MANAGER'): Locator {
  return page.locator(`[data-testid="role-option"][data-role="${role}"]`);
}
