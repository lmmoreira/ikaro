// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { TestimonialsModuleData } from '@ikaro/types';
import { renderWithIntl } from '@/test-utils';
import { TestimonialsConfigPanel } from './TestimonialsConfigPanel';
import { writeModuleData } from './module-config-panel.types';

vi.mock('@/features/platform/tenant-settings', () => ({
  generateHotsiteImageSignedUrl: vi.fn(),
  deleteHotsiteImage: vi.fn(),
}));

const EMPTY: TestimonialsModuleData = { items: [], layout: 'grid' };

const WITH_ITEM: TestimonialsModuleData = {
  items: [{ authorName: 'Maria', text: 'Ótimo serviço' }],
  layout: 'grid',
};

describe('TestimonialsConfigPanel', () => {
  it('shows an empty message when there are no items', () => {
    renderWithIntl(<TestimonialsConfigPanel data={writeModuleData(EMPTY)} onChange={vi.fn()} />);

    expect(screen.getByTestId('testimonials-empty')).toBeInTheDocument();
  });

  it('clicking "add" appends a blank testimonial', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    renderWithIntl(<TestimonialsConfigPanel data={writeModuleData(EMPTY)} onChange={onChange} />);

    await user.click(screen.getByTestId('testimonials-add'));

    expect(onChange).toHaveBeenCalledWith(
      writeModuleData({ ...EMPTY, items: [{ authorName: '', text: '' }] }),
    );
  });

  it("editing an item's authorName updates only that item", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    renderWithIntl(
      <TestimonialsConfigPanel data={writeModuleData(WITH_ITEM)} onChange={onChange} />,
    );

    await user.type(screen.getByLabelText('Nome do autor *'), 'X');

    expect(onChange).toHaveBeenLastCalledWith(
      writeModuleData({
        ...WITH_ITEM,
        items: [{ ...WITH_ITEM.items[0], authorName: 'MariaX' }],
      }),
    );
  });

  it('removing an item drops it from the list', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    renderWithIntl(
      <TestimonialsConfigPanel data={writeModuleData(WITH_ITEM)} onChange={onChange} />,
    );

    await user.click(
      screen.getAllByTestId('testimonial-remove').find((el) => el.dataset.index === '0')!,
    );

    expect(onChange).toHaveBeenCalledWith(writeModuleData({ ...WITH_ITEM, items: [] }));
  });

  it("setting a rating updates only that item's rating", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    renderWithIntl(
      <TestimonialsConfigPanel data={writeModuleData(WITH_ITEM)} onChange={onChange} />,
    );

    await user.click(screen.getByTestId('testimonial-rating-0-5'));

    expect(onChange).toHaveBeenCalledWith(
      writeModuleData({ ...WITH_ITEM, items: [{ ...WITH_ITEM.items[0], rating: 5 }] }),
    );
  });

  it("editing title, eyebrow, and an item's text each update only their own field", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    renderWithIntl(
      <TestimonialsConfigPanel data={writeModuleData(WITH_ITEM)} onChange={onChange} />,
    );

    await user.type(screen.getByLabelText('Título (opcional)'), 'T');
    expect(onChange).toHaveBeenLastCalledWith(writeModuleData({ ...WITH_ITEM, title: 'T' }));

    await user.type(screen.getByLabelText('Texto de destaque (opcional)'), 'E');
    expect(onChange).toHaveBeenLastCalledWith(writeModuleData({ ...WITH_ITEM, eyebrow: 'E' }));

    await user.type(screen.getByLabelText('Texto *'), 'X');
    expect(onChange).toHaveBeenLastCalledWith(
      writeModuleData({
        ...WITH_ITEM,
        items: [{ ...WITH_ITEM.items[0], text: 'Ótimo serviçoX' }],
      }),
    );
  });

  it('changing the layout pill calls onChange with the new layout', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    renderWithIntl(
      <TestimonialsConfigPanel data={writeModuleData(WITH_ITEM)} onChange={onChange} />,
    );

    await user.click(screen.getByTestId('testimonials-layout-carousel'));

    expect(onChange).toHaveBeenCalledWith(writeModuleData({ ...WITH_ITEM, layout: 'carousel' }));
  });
});
