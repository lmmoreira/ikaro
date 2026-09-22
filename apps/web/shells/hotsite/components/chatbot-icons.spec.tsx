// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BotIcon, CloseIcon, SendIcon } from './chatbot-icons';

describe('chatbot-icons', () => {
  it.each([
    ['BotIcon', BotIcon],
    ['CloseIcon', CloseIcon],
    ['SendIcon', SendIcon],
  ])('renders %s as an aria-hidden svg', (_name, icon) => {
    const { container } = render(<>{icon}</>);
    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();
    expect(svg).toHaveAttribute('aria-hidden', 'true');
  });
});
