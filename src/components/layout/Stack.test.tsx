import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Stack } from './Stack';

describe('Stack', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders children inside a flex-col div by default', () => {
    render(
      <Stack testId="s">
        <span data-testid="a" />
        <span data-testid="b" />
      </Stack>,
    );
    const s = screen.getByTestId('s');
    expect(s.tagName).toBe('DIV');
    expect(s.className).toContain('flex');
    expect(s.className).toContain('flex-col');
    expect(screen.getByTestId('a')).toBeInTheDocument();
    expect(screen.getByTestId('b')).toBeInTheDocument();
  });

  it('applies the default gap (4)', () => {
    render(
      <Stack testId="s">
        <span />
      </Stack>,
    );
    const s = screen.getByTestId('s');
    expect(s.dataset.gap).toBe('4');
    expect(s.className).toContain('gap-4');
  });

  it('applies the requested gap value', () => {
    const gaps: Array<
      ['0' | '1' | '1.5' | '2' | '2.5' | '3' | '4' | '6' | '8', string]
    > = [
      ['0', 'gap-0'],
      ['1', 'gap-1'],
      ['1.5', 'gap-1.5'],
      ['2', 'gap-2'],
      ['2.5', 'gap-2.5'],
      ['3', 'gap-3'],
      ['4', 'gap-4'],
      ['6', 'gap-6'],
      ['8', 'gap-8'],
    ];
    for (const [gap, cls] of gaps) {
      const { container, unmount } = render(
        <Stack gap={gap}>
          <span />
        </Stack>,
      );
      const node = container.firstChild as HTMLElement;
      expect(node.className).toContain(cls);
      unmount();
    }
  });

  it('renders as the requested element', () => {
    render(
      <Stack as="ul" testId="s">
        <li />
      </Stack>,
    );
    expect(screen.getByTestId('s').tagName).toBe('UL');
  });

  it('appends custom className', () => {
    render(
      <Stack testId="s" className="extra">
        <span />
      </Stack>,
    );
    expect(screen.getByTestId('s').className).toContain('extra');
  });
});
