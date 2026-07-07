'use client';

import { useTranslations } from 'next-intl';
import type { Testimonial, TestimonialsModuleData } from '@ikaro/types';
import { PillSelect } from '@/shared/components/ui/pill-select';
import { Button } from '@/shared/components/ui/button';
import { SingleImageUploadField } from '../SingleImageUploadField';
import {
  readModuleData,
  writeModuleData,
  type ModuleConfigPanelProps,
} from './module-config-panel.types';

const EMPTY_TESTIMONIAL: Testimonial = { authorName: '', text: '' };

const RATING_VALUES: readonly Testimonial['rating'][] = [1, 2, 3, 4, 5];

export function TestimonialsConfigPanel({
  data,
  onChange,
}: ModuleConfigPanelProps): React.JSX.Element {
  const t = useTranslations('dashboard.hotsitePage.layout.panels.testimonials');
  const testimonials = readModuleData<TestimonialsModuleData>(data);

  function update(patch: Partial<TestimonialsModuleData>): void {
    onChange(writeModuleData({ ...testimonials, ...patch }));
  }

  function updateItem(index: number, patch: Partial<Testimonial>): void {
    update({
      items: testimonials.items.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    });
  }

  function addItem(): void {
    update({ items: [...testimonials.items, { ...EMPTY_TESTIMONIAL }] });
  }

  function removeItem(index: number): void {
    update({ items: testimonials.items.filter((_, i) => i !== index) });
  }

  return (
    <div className="space-y-5">
      <div>
        <label
          htmlFor="testimonials-title"
          className="mb-1.5 block text-sm font-semibold text-gray-900"
        >
          {t('titleLabel')}
        </label>
        <input
          id="testimonials-title"
          type="text"
          value={testimonials.title ?? ''}
          placeholder={t('titlePlaceholder')}
          onChange={(event) => update({ title: event.target.value })}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label
          htmlFor="testimonials-eyebrow"
          className="mb-1.5 block text-sm font-semibold text-gray-900"
        >
          {t('eyebrowLabel')}
        </label>
        <input
          id="testimonials-eyebrow"
          type="text"
          value={testimonials.eyebrow ?? ''}
          placeholder={t('eyebrowPlaceholder')}
          onChange={(event) => update({ eyebrow: event.target.value })}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
        />
      </div>

      <PillSelect
        label={t('layoutLabel')}
        value={testimonials.layout}
        onChange={(layout) => update({ layout })}
        testId="testimonials-layout"
        options={[
          { value: 'grid', label: t('layoutGrid') },
          { value: 'carousel', label: t('layoutCarousel') },
        ]}
      />

      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-semibold text-gray-900">{t('itemsLabel')}</span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addItem}
            data-testid="testimonials-add"
          >
            {t('addItemLabel')}
          </Button>
        </div>

        {testimonials.items.length === 0 && (
          <p data-testid="testimonials-empty" className="text-sm text-gray-500">
            {t('emptyItemsLabel')}
          </p>
        )}

        <div className="space-y-4">
          {testimonials.items.map((item, index) => (
            <div
              key={index}
              data-testid={`testimonial-item-${index}`}
              className="rounded-md border border-gray-200 p-3"
            >
              <div className="mb-3">
                <label
                  htmlFor={`testimonial-author-${index}`}
                  className="mb-1.5 block text-sm font-semibold text-gray-900"
                >
                  {t('authorNameLabel')}
                </label>
                <input
                  id={`testimonial-author-${index}`}
                  type="text"
                  value={item.authorName}
                  placeholder={t('authorNamePlaceholder')}
                  onChange={(event) => updateItem(index, { authorName: event.target.value })}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                />
              </div>

              <div className="mb-3">
                <label
                  htmlFor={`testimonial-text-${index}`}
                  className="mb-1.5 block text-sm font-semibold text-gray-900"
                >
                  {t('textLabel')}
                </label>
                <textarea
                  id={`testimonial-text-${index}`}
                  value={item.text}
                  placeholder={t('textPlaceholder')}
                  onChange={(event) => updateItem(index, { text: event.target.value })}
                  rows={3}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                />
              </div>

              <div className="mb-3">
                <PillSelect
                  label={t('ratingLabel')}
                  value={item.rating ? String(item.rating) : ''}
                  onChange={(value) =>
                    updateItem(index, {
                      rating: value === '' ? undefined : (Number(value) as Testimonial['rating']),
                    })
                  }
                  testId={`testimonial-rating-${index}`}
                  options={[
                    { value: '', label: t('ratingNone') },
                    ...RATING_VALUES.map((r) => ({ value: String(r), label: String(r) })),
                  ]}
                />
              </div>

              <div className="mb-3">
                <SingleImageUploadField
                  id={`testimonial-avatar-${index}`}
                  value={item.avatarUrl ?? ''}
                  onChange={(avatarUrl) => updateItem(index, { avatarUrl })}
                  purpose="testimonials"
                  previewSize="small"
                  label={t('avatarLabel')}
                  clickToAddLabel={t('avatarClickToAdd')}
                  formatHintLabel={t('avatarFormatHint')}
                  uploadingLabel={t('avatarUploading')}
                  uploadErrorLabel={t('avatarUploadError')}
                  removeLabel={t('avatarRemove')}
                />
              </div>

              <button
                type="button"
                data-testid={`testimonial-remove-${index}`}
                onClick={() => removeItem(index)}
                className="text-sm font-semibold text-red-600 underline"
              >
                {t('removeItemLabel')}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
