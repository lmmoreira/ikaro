// @vitest-environment jsdom
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { HotsiteModuleResponse, NavigationModuleData } from '@ikaro/types';
import { getPillOption, renderWithIntl } from '@/test-utils';
import { NavigationConfigPanel } from './NavigationConfigPanel';
import { writeModuleData } from './module-config-panel.types';

const NAV: NavigationModuleData = {
  items: [
    { label: 'Serviços', target: 'service-list' },
    { label: 'Fotos', target: 'gallery' },
  ],
};

function layout(...disabled: HotsiteModuleResponse['type'][]): HotsiteModuleResponse[] {
  return (
    ['SERVICE_LIST', 'GALLERY', 'TESTIMONIALS', 'ABOUT', 'CONTACT', 'LEAD_FORM'] as const
  ).map((type) => ({ type, enabled: !disabled.includes(type), data: {} }));
}

function renderPanel(
  data: NavigationModuleData = NAV,
  modules: HotsiteModuleResponse[] | undefined = layout(),
): ReturnType<typeof vi.fn> {
  const onChange = vi.fn();
  renderWithIntl(
    <NavigationConfigPanel data={writeModuleData(data)} onChange={onChange} layout={modules} />,
  );
  return onChange;
}

describe('NavigationConfigPanel', () => {
  it('lists the items with their labels', () => {
    renderPanel();

    expect(screen.getAllByTestId('navigation-item')).toHaveLength(2);
    expect(screen.getByLabelText('Nome do link 1')).toHaveValue('Serviços');
    expect(screen.getByLabelText('Nome do link 2')).toHaveValue('Fotos');
    expect(screen.getByTestId('navigation-item-count')).toHaveTextContent('2 de 6 links');
  });

  it('editing one label changes only that item', async () => {
    const user = userEvent.setup();
    const onChange = renderPanel();

    await user.type(screen.getByLabelText('Nome do link 2'), '!');

    expect(onChange).toHaveBeenLastCalledWith(
      writeModuleData({
        items: [NAV.items[0], { label: 'Fotos!', target: 'gallery' }],
      }),
    );
  });

  it('caps a label at 30 characters', () => {
    renderPanel();

    expect(screen.getByLabelText('Nome do link 1')).toHaveAttribute('maxlength', '30');
  });

  it('removes an item', async () => {
    const user = userEvent.setup();
    const onChange = renderPanel();

    await user.click(screen.getAllByTestId('navigation-item-remove')[0]);

    expect(onChange).toHaveBeenLastCalledWith(writeModuleData({ items: [NAV.items[1]] }));
  });

  describe('adding', () => {
    it('adds an empty item aimed at the first enabled section', async () => {
      const user = userEvent.setup();
      const onChange = renderPanel(NAV, layout('SERVICE_LIST', 'GALLERY'));

      await user.click(screen.getByTestId('navigation-add-item'));

      expect(onChange).toHaveBeenLastCalledWith(
        writeModuleData({ items: [...NAV.items, { label: '', target: 'testimonials' }] }),
      );
    });

    // Negative guarantee: the schema allows at most six items.
    it('disables Add at six items', () => {
      const six = Array.from({ length: 6 }, (_, i) => ({
        label: `L${i}`,
        target: 'gallery' as const,
      }));
      renderPanel({ items: six });

      expect(screen.getByTestId('navigation-add-item')).toBeDisabled();
      expect(screen.getByTestId('navigation-item-count')).toHaveTextContent('6 de 6 links');
    });
  });

  describe('targets', () => {
    it('picks a destination for an item', async () => {
      const user = userEvent.setup();
      const onChange = renderPanel();

      await user.click(getPillOption('navigation-item-target-0', 'contact'));

      expect(onChange).toHaveBeenLastCalledWith(
        writeModuleData({ items: [{ label: 'Serviços', target: 'contact' }, NAV.items[1]] }),
      );
    });

    // Negative guarantee: a disabled section cannot be chosen — the backend would refuse the save.
    it('greys out the sections that are turned off', () => {
      renderPanel(NAV, layout('ABOUT'));

      expect(getPillOption('navigation-item-target-0', 'about')).toBeDisabled();
      expect(getPillOption('navigation-item-target-0', 'contact')).toBeEnabled();
    });

    it('explains an item whose section was turned off after it was chosen', () => {
      renderPanel(NAV, layout('GALLERY'));

      const notes = screen.getAllByTestId('navigation-item-disabled-note');
      expect(notes).toHaveLength(1);
      expect(
        within(screen.getAllByTestId('navigation-item')[1]).getByTestId(
          'navigation-item-disabled-note',
        ),
      ).toBe(notes[0]);
      expect(notes[0]).toHaveTextContent('Galeria');
    });

    it('shows no explanation when every chosen section is on', () => {
      renderPanel();

      expect(screen.queryByTestId('navigation-item-disabled-note')).not.toBeInTheDocument();
    });
  });

  describe('header button', () => {
    it('turning it on seeds a booking button; turning it off removes the key', async () => {
      const user = userEvent.setup();
      const onChange = renderPanel();

      await user.click(screen.getByTestId('navigation-cta-toggle'));
      expect(onChange).toHaveBeenLastCalledWith(
        writeModuleData({ ...NAV, cta: { label: '', target: 'booking-form' } }),
      );
    });

    it('turning it off leaves the items untouched and drops cta', async () => {
      const user = userEvent.setup();
      const onChange = renderPanel({ ...NAV, cta: { label: 'Agendar', target: 'booking-form' } });

      await user.click(screen.getByTestId('navigation-cta-toggle'));

      expect(onChange).toHaveBeenLastCalledWith(writeModuleData(NAV));
    });

    it('edits the label and the target', async () => {
      const user = userEvent.setup();
      const onChange = renderPanel({ ...NAV, cta: { label: 'Agendar', target: 'booking-form' } });

      await user.type(screen.getByLabelText('Texto do botão'), '!');
      expect(onChange).toHaveBeenLastCalledWith(
        writeModuleData({ ...NAV, cta: { label: 'Agendar!', target: 'booking-form' } }),
      );

      await user.click(getPillOption('navigation-cta-target', 'lead-form'));
      expect(onChange).toHaveBeenLastCalledWith(
        writeModuleData({ ...NAV, cta: { label: 'Agendar', target: 'lead-form' } }),
      );
    });

    // Negative guarantee: a button to the contact form needs the lead form turned on.
    it('disables the contact-form target while the lead form is off', () => {
      renderPanel({ ...NAV, cta: { label: 'Falar', target: 'booking-form' } }, layout('LEAD_FORM'));

      expect(getPillOption('navigation-cta-target', 'lead-form')).toBeDisabled();
    });

    it('explains a button that already points at a turned-off lead form', () => {
      renderPanel({ ...NAV, cta: { label: 'Falar', target: 'lead-form' } }, layout('LEAD_FORM'));

      expect(screen.getByText(/formulário de contato está desativado/i)).toBeInTheDocument();
    });
  });

  describe('completeness', () => {
    it('says nothing while every label is filled in', () => {
      renderPanel();

      expect(screen.queryByTestId('navigation-incomplete')).not.toBeInTheDocument();
    });

    it('asks for the missing label', () => {
      renderPanel({ items: [{ label: '', target: 'gallery' }] });

      expect(screen.getByTestId('navigation-incomplete')).toBeInTheDocument();
    });
  });

  it('gives each item a labelled drag handle, so it can be reordered from the keyboard', () => {
    renderPanel();

    expect(
      screen.getAllByTestId('navigation-item-drag').map((el) => el.getAttribute('aria-label')),
    ).toEqual(['Reordenar o link 1', 'Reordenar o link 2']);
  });

  it('treats every section as enabled when it is given no layout', () => {
    renderPanel(NAV, undefined);

    expect(getPillOption('navigation-item-target-0', 'about')).toBeEnabled();
    expect(screen.queryByTestId('navigation-item-disabled-note')).not.toBeInTheDocument();
  });
});
