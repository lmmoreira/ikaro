// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { PublicEnvScript } from './PublicEnvScript';

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe('PublicEnvScript', () => {
  it('injects the real per-environment values as window.__PUBLIC_ENV__', () => {
    process.env.NEXT_PUBLIC_BFF_URL = 'https://bff.example.com/v1';
    process.env.NEXT_PUBLIC_SITE_URL = 'https://example.com';
    process.env.NEXT_PUBLIC_HOTSITE_IMAGE_BASE_URL = 'https://storage.example.com/bucket';

    const { container } = render(<PublicEnvScript />);
    const script = container.querySelector('script');

    expect(script).not.toBeNull();
    expect(script?.innerHTML).toContain('window.__PUBLIC_ENV__=');
    expect(script?.innerHTML).toContain('https://bff.example.com/v1');
    expect(script?.innerHTML).toContain('https://example.com');
    expect(script?.innerHTML).toContain('https://storage.example.com/bucket');
  });

  it('escapes "<" so an env value can never prematurely close the script tag', () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://example.com</script><script>alert(1)</script>';

    const { container } = render(<PublicEnvScript />);
    const script = container.querySelector('script');

    expect(script?.innerHTML).toContain('\\u003c');
    expect(script?.innerHTML).not.toContain('</script><script>alert(1)</script>');
  });
});
