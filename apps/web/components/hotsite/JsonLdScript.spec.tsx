// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { JsonLdScript } from './JsonLdScript';

describe('JsonLdScript', () => {
  it('escapes JSON-LD content before injecting it into the script tag', () => {
    const { container } = render(
      <JsonLdScript data={{ name: 'Foo</script><script>alert(1)</script>' }} />,
    );

    const script = container.querySelector('script');
    expect(script).not.toBeNull();
    expect(script?.innerHTML).toContain('\\u003c');
    expect(script?.innerHTML).not.toContain('</script><script>alert(1)</script>');
  });
});
