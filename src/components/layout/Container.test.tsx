import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Container } from './Container';

describe('Container', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders children inside a div by default', () => {
    render(
      <Container testId="c">
        <span data-testid="content">Hello</span>
      </Container>,
    );
    const c = screen.getByTestId('c');
    expect(c.tagName).toBe('DIV');
    expect(screen.getByTestId('content')).toBeInTheDocument();
  });

  it('applies the default xl size (max-w-6xl)', () => {
    render(<Container testId="c">x</Container>);
    const c = screen.getByTestId('c');
    expect(c.dataset.size).toBe('xl');
    expect(c.className).toContain('max-w-6xl');
    expect(c.className).toContain('mx-auto');
    expect(c.className).toContain('px-6');
  });

  it('applies the requested size', () => {
    const sizes = [
      ['sm', 'max-w-3xl'],
      ['md', 'max-w-4xl'],
      ['lg', 'max-w-5xl'],
      ['xl', 'max-w-6xl'],
      ['2xl', 'max-w-7xl'],
    ] as const;
    for (const [size, cls] of sizes) {
      const { container, unmount } = render(
        <Container size={size}>x</Container>,
      );
      const node = container.firstChild as HTMLElement;
      expect(node.className).toContain(cls);
      unmount();
    }
  });

  it('renders as a different element when `as` is provided', () => {
    render(
      <Container as="section" testId="c">
        x
      </Container>,
    );
    expect(screen.getByTestId('c').tagName).toBe('SECTION');
  });

  it('appends custom className', () => {
    render(
      <Container testId="c" className="extra">
        x
      </Container>,
    );
    expect(screen.getByTestId('c').className).toContain('extra');
  });
});
