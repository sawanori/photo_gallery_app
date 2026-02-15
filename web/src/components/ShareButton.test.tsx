import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('../utils/device', () => ({
  isAndroid: vi.fn(() => false),
}));

import ShareButton from './ShareButton';
import { isAndroid } from '../utils/device';
import type { Image } from '@/types';

const mockImage: Image = {
  id: 'test-id',
  url: 'https://example.com/photo.jpg',
  storagePath: '/images/test/photo.jpg',
  title: 'test-photo',
  description: '',
  userId: 'user-1',
  likeCount: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('ShareButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders when navigator.share is available and not Android', () => {
    vi.mocked(isAndroid).mockReturnValue(false);
    Object.defineProperty(navigator, 'share', { value: vi.fn(), writable: true, configurable: true });

    render(<ShareButton image={mockImage} />);
    expect(screen.getByRole('button', { name: '共有' })).toBeInTheDocument();
  });

  it('returns null when navigator.share is not available', () => {
    vi.mocked(isAndroid).mockReturnValue(false);
    Object.defineProperty(navigator, 'share', { value: undefined, writable: true, configurable: true });

    const { container } = render(<ShareButton image={mockImage} />);
    expect(container.firstChild).toBeNull();
  });

  it('returns null on Android even when navigator.share is available', () => {
    vi.mocked(isAndroid).mockReturnValue(true);
    Object.defineProperty(navigator, 'share', { value: vi.fn(), writable: true, configurable: true });

    const { container } = render(<ShareButton image={mockImage} />);
    expect(container.firstChild).toBeNull();
  });
});
