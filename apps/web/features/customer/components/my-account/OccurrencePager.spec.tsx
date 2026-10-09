// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { OccurrencePager } from './OccurrencePager';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) =>
    params ? `${key}:${JSON.stringify(params)}` : key,
}));

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    ...rest
  }: React.PropsWithChildren<{ href: string } & Record<string, unknown>>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const hrefForPage = (page: number): string => `/s/detail?page=${page}`;

describe('OccurrencePager', () => {
  it('renders nothing for a single page', () => {
    const { container } = render(
      <OccurrencePager page={1} totalPages={1} hrefForPage={hrefForPage} />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('on the first page has no "previous" link and links "next" to page 2', () => {
    render(<OccurrencePager page={1} totalPages={3} hrefForPage={hrefForPage} />);

    expect(screen.getByTestId('pager-previous').tagName).toBe('SPAN');
    expect(screen.getByTestId('pager-next')).toHaveAttribute('href', '/s/detail?page=2');
    expect(screen.getByText('pagerPosition:{"page":1,"pages":3}')).toBeInTheDocument();
  });

  it('on a middle page links both directions', () => {
    render(<OccurrencePager page={2} totalPages={3} hrefForPage={hrefForPage} />);

    expect(screen.getByTestId('pager-previous')).toHaveAttribute('href', '/s/detail?page=1');
    expect(screen.getByTestId('pager-next')).toHaveAttribute('href', '/s/detail?page=3');
  });

  it('on the last page has no "next" link', () => {
    render(<OccurrencePager page={3} totalPages={3} hrefForPage={hrefForPage} />);

    expect(screen.getByTestId('pager-next').tagName).toBe('SPAN');
    expect(screen.getByTestId('pager-previous')).toHaveAttribute('href', '/s/detail?page=2');
  });
});
