// @vitest-environment jsdom
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { HotsiteNavigationItem } from '@ikaro/types';
import { axe } from '@/axe-helper';
import { renderWithIntl } from '@/test-utils';
import { HotsiteNavigation } from './HotsiteNavigation';

const ITEMS: HotsiteNavigationItem[] = [
  { label: 'O ritual', target: 'testimonials' },
  { label: 'Serviços', target: 'service-list' },
  { label: 'Contato', target: 'contact' },
];

function menu(): HTMLDetailsElement {
  return screen.getByTestId('hotsite-navigation-menu') as HTMLDetailsElement;
}

describe('HotsiteNavigation', () => {
  it('renders a booking CTA in desktop and mobile navigation', () => {
    renderWithIntl(
      <HotsiteNavigation
        items={ITEMS}
        slug="casa47"
        cta={{ label: 'AGENDAR', target: 'booking-form' }}
      />,
    );
    expect(screen.getByTestId('hotsite-navigation-cta')).toHaveAttribute('href', '/casa47/booking');
    expect(screen.getByTestId('hotsite-navigation-mobile-cta')).toHaveAttribute(
      'href',
      '/casa47/booking',
    );
  });

  it('renders a lead CTA even when there are no section links', () => {
    renderWithIntl(
      <HotsiteNavigation
        items={[]}
        slug="studio"
        cta={{ label: 'COMEÇAR', target: 'lead-form' }}
      />,
    );
    expect(screen.getByTestId('hotsite-navigation-cta')).toHaveAttribute(
      'href',
      '/studio/lead-form',
    );
  });
  it('renders nothing without items', () => {
    const { container } = renderWithIntl(<HotsiteNavigation items={[]} slug="casa47" />);

    expect(container).toBeEmptyDOMElement();
  });

  it('links every item to its section anchor on the home page, absolute to the slug', () => {
    renderWithIntl(<HotsiteNavigation items={ITEMS} slug="casa47" />);

    const desktop = screen.getByTestId('hotsite-navigation');
    expect(desktop.querySelectorAll('a')).toHaveLength(3);
    expect(screen.getAllByRole('link', { name: 'Serviços', hidden: true })[0]).toHaveAttribute(
      'href',
      '/casa47#service-list',
    );
    expect(screen.getAllByRole('link', { name: 'O ritual', hidden: true })[0]).toHaveAttribute(
      'href',
      '/casa47#testimonials',
    );
    expect(screen.getAllByRole('link', { name: 'Contato', hidden: true })[0]).toHaveAttribute(
      'href',
      '/casa47#contact',
    );
  });

  it('shows the inline links from md up and the collapsed menu below it', () => {
    renderWithIntl(<HotsiteNavigation items={ITEMS} slug="casa47" />);

    expect(screen.getByTestId('hotsite-navigation')).toHaveClass('hidden', 'md:flex');
    expect(menu()).toHaveClass('md:hidden');
  });

  describe('mobile menu', () => {
    it('starts closed and announces how to open it', () => {
      renderWithIntl(<HotsiteNavigation items={ITEMS} slug="casa47" />);

      expect(menu().open).toBe(false);
      expect(screen.getByText('Abrir menu')).toBeInTheDocument();
    });

    it('opens from the keyboard-operable summary and announces how to close it', () => {
      renderWithIntl(<HotsiteNavigation items={ITEMS} slug="casa47" />);

      menu().open = true;
      fireEvent(menu(), new Event('toggle'));

      expect(screen.getByText('Fechar menu')).toBeInTheDocument();
    });

    it('closes on Escape', () => {
      renderWithIntl(<HotsiteNavigation items={ITEMS} slug="casa47" />);
      menu().open = true;
      fireEvent(menu(), new Event('toggle'));

      fireEvent.keyDown(document, { key: 'Escape' });

      expect(menu().open).toBe(false);
    });

    it('closes on a click outside the menu but not inside it', () => {
      renderWithIntl(<HotsiteNavigation items={ITEMS} slug="casa47" />);
      menu().open = true;
      fireEvent(menu(), new Event('toggle'));

      fireEvent.pointerDown(menu().querySelector('nav') as HTMLElement);
      expect(menu().open).toBe(true);

      fireEvent.pointerDown(document.body);
      expect(menu().open).toBe(false);
    });

    it('closes when a link is tapped', () => {
      renderWithIntl(<HotsiteNavigation items={ITEMS} slug="casa47" />);
      menu().open = true;
      fireEvent(menu(), new Event('toggle'));

      fireEvent.click(menu().querySelector('a') as HTMLElement);

      expect(menu().open).toBe(false);
    });

    // A visitor can open the native <details> before the component has hydrated, so React never saw
    // a toggle event; Escape and an outside click must still close it.
    it('closes on Escape and on an outside click even when no toggle event reached React', () => {
      renderWithIntl(<HotsiteNavigation items={ITEMS} slug="casa47" />);

      menu().open = true;
      fireEvent.keyDown(document, { key: 'Escape' });
      expect(menu().open).toBe(false);

      menu().open = true;
      fireEvent.pointerDown(document.body);
      expect(menu().open).toBe(false);
    });

    it('ignores Escape while closed', () => {
      renderWithIntl(<HotsiteNavigation items={ITEMS} slug="casa47" />);

      fireEvent.keyDown(document, { key: 'Escape' });

      expect(menu().open).toBe(false);
    });
  });

  it('has no accessibility violations', async () => {
    const { container } = renderWithIntl(<HotsiteNavigation items={ITEMS} slug="casa47" />);

    expect(await axe(container)).toHaveNoViolations();
  });
});
