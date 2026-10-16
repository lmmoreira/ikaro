// @vitest-environment jsdom
import type { ReactNode } from 'react';
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  FloatingFilterDockContext,
  useFloatingFilterDock,
  type FloatingFilterDockValue,
} from './floating-filter-dock-context';

describe('useFloatingFilterDock', () => {
  it('throws when used outside a dock, so a stray menu cannot float unplaced', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    expect(() => renderHook(() => useFloatingFilterDock())).toThrow(
      'FloatingFilterMenu must be rendered inside a FloatingFilterDock',
    );

    consoleError.mockRestore();
  });

  it('returns the dock value inside a dock', () => {
    const value: FloatingFilterDockValue = {
      corner: 'top-left',
      setCorner: vi.fn(),
      dragHandlers: {
        onPointerDown: vi.fn(),
        onPointerMove: vi.fn(),
        onPointerUp: vi.fn(),
        onPointerCancel: vi.fn(),
        onLostPointerCapture: vi.fn(),
        onClickCapture: vi.fn(),
      },
      isDragging: false,
    };
    function wrapper({ children }: { readonly children: ReactNode }) {
      return (
        <FloatingFilterDockContext.Provider value={value}>
          {children}
        </FloatingFilterDockContext.Provider>
      );
    }

    const { result } = renderHook(() => useFloatingFilterDock(), { wrapper });

    expect(result.current).toBe(value);
  });
});
