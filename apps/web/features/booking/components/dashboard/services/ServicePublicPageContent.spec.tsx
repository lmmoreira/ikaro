// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { axe } from '@/axe-helper';
import { renderWithIntl } from '@/test-utils';
import { ServicePublicPageContent } from './ServicePublicPageContent';

// Controlled harness: the component is fully controlled by the tab, so a spec needs a state owner.
function Harness({
  initial = {},
  spies = {},
}: {
  initial?: Partial<{ description: string; inclusions: string[]; preparation: string }>;
  spies?: Partial<{
    onDescription: (v: string) => void;
    onInclusions: (v: string[]) => void;
    onPreparation: (v: string) => void;
  }>;
}) {
  const [description, setDescription] = useState(initial.description ?? '');
  const [inclusions, setInclusions] = useState<string[]>(initial.inclusions ?? []);
  const [preparation, setPreparation] = useState(initial.preparation ?? '');
  return (
    <ServicePublicPageContent
      longDescription={description}
      inclusions={inclusions}
      preparationNotes={preparation}
      onLongDescriptionChange={(value) => {
        setDescription(value);
        spies.onDescription?.(value);
      }}
      onInclusionsChange={(items) => {
        setInclusions(items);
        spies.onInclusions?.(items);
      }}
      onPreparationNotesChange={(value) => {
        setPreparation(value);
        spies.onPreparation?.(value);
      }}
    />
  );
}

function descriptionTab(mode: 'write' | 'preview'): HTMLElement {
  const tab = document.querySelector<HTMLElement>(
    `[data-testid="public-page-description-tab"][data-mode="${mode}"]`,
  );
  if (!tab) throw new Error(`No description tab for ${mode}`);
  return tab;
}

describe('ServicePublicPageContent', () => {
  describe('description', () => {
    it('edits the Markdown source and counts characters against the 4000 limit', async () => {
      const user = userEvent.setup();
      const onDescription = vi.fn();
      renderWithIntl(<Harness spies={{ onDescription }} />);

      await user.type(screen.getByTestId('public-page-description'), 'Olá');

      expect(onDescription).toHaveBeenLastCalledWith('Olá');
      expect(screen.getByText('3 / 4000')).toBeVisible();
      expect(screen.getByTestId('public-page-description')).toHaveAttribute('maxlength', '4000');
    });

    it('previews through the restricted renderer: formatting works, script and images do not', async () => {
      const user = userEvent.setup();
      renderWithIntl(
        <Harness
          initial={{
            description:
              '**Forte**\n\n- um\n- dois\n\n<script>alert(1)</script>\n\n![x](https://evil.test/a.png)',
          }}
        />,
      );

      await user.click(descriptionTab('preview'));

      const preview = screen.getByTestId('public-page-description-rendered');
      expect(preview).toBeVisible();
      expect(screen.getByText('Forte')).toBeVisible();
      expect(screen.getAllByRole('listitem')).toHaveLength(2);
      expect(document.querySelector('script')).toBeNull();
      expect(document.querySelector('img')).toBeNull();
    });

    it('says there is nothing to preview for an empty description, and switches back to writing', async () => {
      const user = userEvent.setup();
      renderWithIntl(<Harness />);

      await user.click(descriptionTab('preview'));
      expect(screen.getByText('Nada para pré-visualizar ainda.')).toBeVisible();

      await user.click(descriptionTab('write'));
      expect(screen.getByTestId('public-page-description')).toBeVisible();
    });
  });

  describe('inclusions', () => {
    it('adds a row, edits it and removes it', async () => {
      const user = userEvent.setup();
      const onInclusions = vi.fn();
      renderWithIntl(<Harness spies={{ onInclusions }} />);

      await user.click(screen.getByTestId('public-page-inclusion-add'));
      await user.type(screen.getByTestId('public-page-inclusion'), 'Chá');
      expect(onInclusions).toHaveBeenLastCalledWith(['Chá']);

      await user.click(screen.getByTestId('public-page-inclusion-remove'));
      expect(onInclusions).toHaveBeenLastCalledWith([]);
      expect(screen.queryByTestId('public-page-inclusion')).not.toBeInTheDocument();
    });

    it('removes only the chosen row', async () => {
      const user = userEvent.setup();
      renderWithIntl(<Harness initial={{ inclusions: ['A', 'B', 'C'] }} />);

      await user.click(screen.getAllByTestId('public-page-inclusion-remove')[1]);

      expect(
        screen.getAllByTestId('public-page-inclusion').map((el) => (el as HTMLInputElement).value),
      ).toEqual(['A', 'C']);
    });

    it('shows the count and stops adding at the limit of 12', () => {
      renderWithIntl(
        <Harness initial={{ inclusions: Array.from({ length: 12 }, (_, i) => `item ${i}`) }} />,
      );

      expect(screen.getByTestId('public-page-inclusions-count')).toHaveTextContent('12 de 12');
      expect(screen.getByTestId('public-page-inclusion-add')).toBeDisabled();
    });

    it('limits each item to 120 characters', () => {
      renderWithIntl(<Harness initial={{ inclusions: ['x'] }} />);

      expect(screen.getByTestId('public-page-inclusion')).toHaveAttribute('maxlength', '120');
    });
  });

  it('edits the preparation notes with a 1000-character counter', async () => {
    const user = userEvent.setup();
    const onPreparation = vi.fn();
    renderWithIntl(<Harness spies={{ onPreparation }} />);

    await user.type(screen.getByTestId('public-page-preparation'), 'Cedo');

    expect(onPreparation).toHaveBeenLastCalledWith('Cedo');
    expect(screen.getByText('4 / 1000')).toBeVisible();
    expect(screen.getByTestId('public-page-preparation')).toHaveAttribute('maxlength', '1000');
  });

  it('has no accessibility violations', async () => {
    const { container } = renderWithIntl(
      <Harness initial={{ description: 'Texto', inclusions: ['Chá'], preparation: 'Cedo' }} />,
    );

    expect(await axe(container)).toHaveNoViolations();
  });
});
