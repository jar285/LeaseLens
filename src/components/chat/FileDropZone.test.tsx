import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FileDropZone } from './FileDropZone';

function makeFile(name: string, contents = 'x', type = 'text/markdown'): File {
  return new File([contents], name, { type });
}

function dropEvent(files: File[]) {
  return {
    preventDefault: vi.fn(),
    dataTransfer: { files },
  };
}

describe('FileDropZone', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders children', () => {
    render(
      <FileDropZone onFiles={() => {}}>
        <p>hello</p>
      </FileDropZone>,
    );
    expect(screen.getByText('hello')).toBeInTheDocument();
  });

  it('calls onFiles with .md drops', () => {
    const onFiles = vi.fn();
    render(
      <FileDropZone onFiles={onFiles}>
        <p>hello</p>
      </FileDropZone>,
    );
    const zone = screen.getByTestId('file-drop-zone');
    const file = makeFile('brand.md');
    fireEvent.drop(zone, dropEvent([file]));
    expect(onFiles).toHaveBeenCalledTimes(1);
    expect(onFiles.mock.calls[0][0]).toHaveLength(1);
    expect(onFiles.mock.calls[0][0][0].name).toBe('brand.md');
  });

  it('silently ignores non-markdown drops', () => {
    const onFiles = vi.fn();
    render(
      <FileDropZone onFiles={onFiles}>
        <p>hello</p>
      </FileDropZone>,
    );
    const zone = screen.getByTestId('file-drop-zone');
    const png = makeFile('logo.png', 'binary', 'image/png');
    fireEvent.drop(zone, dropEvent([png]));
    expect(onFiles).not.toHaveBeenCalled();
  });

  it('caps at 5 files when more are dropped', () => {
    const onFiles = vi.fn();
    render(
      <FileDropZone onFiles={onFiles}>
        <p>hello</p>
      </FileDropZone>,
    );
    const zone = screen.getByTestId('file-drop-zone');
    const files = Array.from({ length: 7 }, (_, i) => makeFile(`f${i}.md`));
    fireEvent.drop(zone, dropEvent(files));
    expect(onFiles).toHaveBeenCalledTimes(1);
    expect(onFiles.mock.calls[0][0]).toHaveLength(5);
  });

  it('rejects oversized files', () => {
    const onFiles = vi.fn();
    render(
      <FileDropZone onFiles={onFiles}>
        <p>hello</p>
      </FileDropZone>,
    );
    const zone = screen.getByTestId('file-drop-zone');
    const big = new File(['x'.repeat(100_001)], 'big.md', {
      type: 'text/markdown',
    });
    fireEvent.drop(zone, dropEvent([big]));
    expect(onFiles).not.toHaveBeenCalled();
  });
});
