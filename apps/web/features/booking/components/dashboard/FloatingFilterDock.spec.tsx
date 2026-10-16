// @vitest-environment jsdom
import { useEffect, type PointerEvent } from 'react';
import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FloatingFilterDock } from './FloatingFilterDock';
import {
  useFloatingFilterDock,
  type FloatingFilterDockValue,
} from './floating-filter-dock-context';

const tenant = { tenantId: 't-1' };
vi.mock('@/providers/tenant-provider', () => ({
  useTenant: () => tenant,
}));

let dock: FloatingFilterDockValue;

function captureDock(value: FloatingFilterDockValue): void {
  dock = value;
}

// Stands in for a FloatingFilterMenu: it only reads the dock context, like the real one. The spec
// reads the latest value from `dock`, set from an effect so nothing is assigned during render.
function Probe({ id }: { readonly id: string }): React.JSX.Element {
  const value = useFloatingFilterDock();
  useEffect(() => captureDock(value));
  return <div data-testid={id}>{value.corner}</div>;
}

function pointer(clientX: number, clientY: number): PointerEvent<HTMLElement> {
  return {
    pointerId: 1,
    button: 0,
    clientX,
    clientY,
    currentTarget: {
      setPointerCapture: vi.fn(),
      releasePointerCapture: vi.fn(),
      hasPointerCapture: () => true,
    },
  } as unknown as PointerEvent<HTMLElement>;
}

beforeEach(() => {
  globalThis.window.localStorage.clear();
  tenant.tenantId = 't-1';
  Object.defineProperty(window, 'innerWidth', { value: 1000, configurable: true });
  Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true });
});

describe('FloatingFilterDock', () => {
  it('sits in the bottom-right corner, where the filters are today, until the user moves it', () => {
    render(
      <FloatingFilterDock pageKey="agenda">
        <Probe id="a" />
      </FloatingFilterDock>,
    );

    const element = screen.getByTestId('floating-filter-dock');
    expect(element).toHaveAttribute('data-corner', 'bottom-right');
    expect(element).toHaveClass(
      'fixed',
      'z-30',
      'bottom-24',
      'right-4',
      'lg:bottom-6',
      'lg:right-6',
    );
  });

  it('stacks its filters in the order they are given, along the corner, in every corner', () => {
    render(
      <FloatingFilterDock pageKey="schedule">
        <Probe id="resource" />
        <Probe id="status" />
      </FloatingFilterDock>,
    );
    const element = screen.getByTestId('floating-filter-dock');
    const order = () =>
      Array.from(element.children).map((child) => child.getAttribute('data-testid'));

    for (const [corner, direction] of [
      ['bottom-right', 'flex-col'],
      ['bottom-left', 'flex-col'],
      ['top-right', 'flex-col-reverse'],
      ['top-left', 'flex-col-reverse'],
    ] as const) {
      act(() => dock.setCorner(corner));

      // One column with a gap, never absolutely positioned per menu, so the pills cannot overlap.
      expect(element).toHaveAttribute('data-corner', corner);
      expect(element).toHaveClass('flex', direction, 'gap-2.5');
      expect(order()).toEqual(['resource', 'status']);
    }
  });

  it('moves every filter of the page together by moving the one dock', () => {
    render(
      <FloatingFilterDock pageKey="schedule">
        <Probe id="resource" />
        <Probe id="status" />
      </FloatingFilterDock>,
    );

    act(() => dock.setCorner('top-left'));

    expect(screen.getByTestId('resource')).toHaveTextContent('top-left');
    expect(screen.getByTestId('status')).toHaveTextContent('top-left');
    expect(screen.getAllByTestId('floating-filter-dock')).toHaveLength(1);
  });

  it('follows the pointer while dragging and snaps to the nearest corner on release', () => {
    render(
      <FloatingFilterDock pageKey="agenda">
        <Probe id="a" />
      </FloatingFilterDock>,
    );
    const element = screen.getByTestId('floating-filter-dock');

    act(() => dock.dragHandlers.onPointerDown(pointer(900, 700)));
    act(() => dock.dragHandlers.onPointerMove(pointer(400, 300)));
    expect(dock.isDragging).toBe(true);
    expect(element.style.transform).toBe('translate(-500px, -400px)');

    act(() => dock.dragHandlers.onPointerUp(pointer(80, 60)));

    expect(element).toHaveAttribute('data-corner', 'top-left');
    expect(element.style.transform).toBe('');
    expect(dock.isDragging).toBe(false);
  });

  it('does not move on a plain click', () => {
    render(
      <FloatingFilterDock pageKey="agenda">
        <Probe id="a" />
      </FloatingFilterDock>,
    );

    act(() => dock.dragHandlers.onPointerDown(pointer(900, 700)));
    act(() => dock.dragHandlers.onPointerUp(pointer(900, 700)));

    expect(screen.getByTestId('floating-filter-dock')).toHaveAttribute(
      'data-corner',
      'bottom-right',
    );
  });

  it('remembers the corner per page, and a remount restores it', () => {
    const first = render(
      <FloatingFilterDock pageKey="agenda">
        <Probe id="a" />
      </FloatingFilterDock>,
    );
    act(() => dock.setCorner('top-right'));
    first.unmount();

    render(
      <FloatingFilterDock pageKey="agenda">
        <Probe id="a" />
      </FloatingFilterDock>,
    );
    expect(screen.getByTestId('floating-filter-dock')).toHaveAttribute('data-corner', 'top-right');
  });

  it('starts another page, and another tenant, at the default corner', () => {
    const first = render(
      <FloatingFilterDock pageKey="agenda">
        <Probe id="a" />
      </FloatingFilterDock>,
    );
    act(() => dock.setCorner('top-right'));
    first.unmount();

    const schedule = render(
      <FloatingFilterDock pageKey="schedule">
        <Probe id="a" />
      </FloatingFilterDock>,
    );
    expect(screen.getByTestId('floating-filter-dock')).toHaveAttribute(
      'data-corner',
      'bottom-right',
    );
    schedule.unmount();

    tenant.tenantId = 't-2';
    render(
      <FloatingFilterDock pageKey="agenda">
        <Probe id="a" />
      </FloatingFilterDock>,
    );
    expect(screen.getByTestId('floating-filter-dock')).toHaveAttribute(
      'data-corner',
      'bottom-right',
    );
  });
});
