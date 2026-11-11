import type React from 'react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import type { Testimonial } from '@ikaro/types';
import { brandedSurfaceStyle } from '@/shared/components/hotsite/branded-surface-style';

interface TestimonialCardProps {
  readonly testimonial: Testimonial;
  readonly cardBg?: string;
  /** Text colour readable on `cardBg`; defaults to the one readable on the secondary colour. */
  readonly cardText?: string;
}

interface StarRatingProps {
  readonly rating: 1 | 2 | 3 | 4 | 5;
}

function StarRating({ rating }: StarRatingProps): React.JSX.Element {
  const t = useTranslations('hotsite');
  return (
    <div
      role="img"
      aria-label={t('testimonials.ratingAriaLabel', { rating })}
      className="flex gap-1 text-lg"
      style={{ color: 'var(--ba-primary)' }}
    >
      {Array.from({ length: 5 }, (_, index) => (
        <span
          key={index}
          data-testid={index < rating ? 'star-filled' : 'star-empty'}
          aria-hidden="true"
        >
          {index < rating ? '★' : '☆'}
        </span>
      ))}
    </div>
  );
}

export function TestimonialCard({
  testimonial,
  cardBg,
  cardText,
}: TestimonialCardProps): React.JSX.Element {
  const cardStyle: React.CSSProperties = {
    ...brandedSurfaceStyle,
    ...(cardBg === undefined ? {} : { backgroundColor: cardBg }),
    ...(cardText === undefined ? {} : { color: cardText }),
    boxShadow: 'var(--ba-shadow)',
  };
  return (
    <div className="flex h-full flex-col gap-3 p-6" style={cardStyle}>
      {testimonial.avatarUrl && (
        <Image
          src={testimonial.avatarUrl}
          alt={testimonial.authorName}
          width={48}
          height={48}
          className="rounded-full object-cover"
        />
      )}
      {testimonial.rating && <StarRating rating={testimonial.rating} />}
      <p className="text-sm italic opacity-90">&ldquo;{testimonial.text}&rdquo;</p>
      <span className="text-sm font-semibold">{testimonial.authorName}</span>
    </div>
  );
}
