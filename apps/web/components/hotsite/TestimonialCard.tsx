import type React from 'react';
import Image from 'next/image';
import type { Testimonial } from '@ikaro/types';

interface TestimonialCardProps {
  readonly testimonial: Testimonial;
  readonly cardBg?: string;
}

interface StarRatingProps {
  readonly rating: 1 | 2 | 3 | 4 | 5;
}

function StarRating({ rating }: StarRatingProps) {
  return (
    <div
      aria-label={`${rating} de 5 estrelas`}
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

export function TestimonialCard({ testimonial, cardBg }: TestimonialCardProps) {
  const cardStyle: React.CSSProperties = {
    backgroundColor: cardBg ?? 'var(--ba-secondary)',
    borderRadius: 'var(--ba-radius)',
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
      <span className="text-sm font-semibold" style={{ color: 'var(--ba-text)' }}>
        {testimonial.authorName}
      </span>
    </div>
  );
}
