// @vitest-environment jsdom
import { DndContext } from '@dnd-kit/core';
import { SortableContext } from '@dnd-kit/sortable';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { getPillOption, renderWithIntl } from '@/test-utils';
import { NavigationItemRow, navigationItemId, navigationItemIndex } from './NavigationItemRow';

const ITEM = { label: 'Fotos', target: 'gallery' } as const;

function renderRow(targetEnabled: (target: string) => boolean = () => true) {
  const onChange = vi.fn();
  const onRemove = vi.fn();
  renderWithIntl(
    <DndContext>
      <SortableContext items={[navigationItemId(0)]}>
        <ul>
          <NavigationItemRow
            index={0}
            item={ITEM}
            targetEnabled={targetEnabled}
            onChange={onChange}
            onRemove={onRemove}
          />
        </ul>
      </SortableContext>
    </DndContext>,
  );
  return { onChange, onRemove };
}

describe('NavigationItemRow', () => {
  it('shows the label bounded to 30 characters and a labelled drag handle', () => {
    renderRow();

    expect(screen.getByLabelText('Nome do link 1')).toHaveValue('Fotos');
    expect(screen.getByLabelText('Nome do link 1')).toHaveAttribute('maxlength', '30');
    expect(screen.getByLabelText('Reordenar o link 1')).toBeInTheDocument();
  });

  it('reports a label edit and a target change', async () => {
    const user = userEvent.setup();
    const { onChange } = renderRow();

    await user.type(screen.getByLabelText('Nome do link 1'), '!');
    expect(onChange).toHaveBeenLastCalledWith({ ...ITEM, label: 'Fotos!' });

    await user.click(getPillOption('navigation-item-target-0', 'about'));
    expect(onChange).toHaveBeenLastCalledWith({ ...ITEM, target: 'about' });
  });

  it('removes the item', async () => {
    const user = userEvent.setup();
    const { onRemove } = renderRow();

    await user.click(screen.getByRole('button', { name: 'Remover o link 1' }));

    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  // Negative guarantee: a section that is off cannot be picked, and an item still pointing at one
  // is explained instead of silently breaking.
  it('greys out disabled sections and explains an item that targets one', () => {
    renderRow((target) => target !== 'gallery');

    expect(getPillOption('navigation-item-target-0', 'gallery')).toBeDisabled();
    expect(getPillOption('navigation-item-target-0', 'about')).toBeEnabled();
    expect(screen.getByTestId('navigation-item-disabled-note')).toHaveTextContent('Galeria');
  });

  it('shows no note while the chosen section is on', () => {
    renderRow();

    expect(screen.queryByTestId('navigation-item-disabled-note')).not.toBeInTheDocument();
  });
});

describe('navigation item ids', () => {
  it('round-trips an index through its sortable id', () => {
    expect(navigationItemIndex(navigationItemId(3))).toBe(3);
    expect(navigationItemIndex('navigation-item-0')).toBe(0);
  });
});
