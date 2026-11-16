// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithIntl } from '@/test-utils';
import { NavLockMark } from './NavLockMark';

describe('NavLockMark', () => {
  it('draws a padlock whose accessible name says the feature is not included (pt-BR)', () => {
    renderWithIntl(<NavLockMark />);

    expect(screen.getByTestId('nav-lock')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByText('Recurso não contratado')).toHaveClass('sr-only');
  });

  it('says it in English too and keeps a caller class on the icon', () => {
    renderWithIntl(<NavLockMark className="ml-auto" />, { locale: 'en' });

    expect(screen.getByText('Feature not included')).toBeInTheDocument();
    expect(screen.getByTestId('nav-lock')).toHaveClass('ml-auto');
  });
});
