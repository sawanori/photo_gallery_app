import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../utils/device', () => ({
  isAndroid: vi.fn(() => false),
}));

import AndroidSaveGuide from './AndroidSaveGuide';
import { isAndroid } from '../utils/device';

describe('AndroidSaveGuide', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows guide on Android when not dismissed', () => {
    vi.mocked(isAndroid).mockReturnValue(true);
    render(<AndroidSaveGuide />);
    expect(screen.getByText('写真を保存するには')).toBeInTheDocument();
    expect(screen.getByText(/画像が新しいタブで開きます/)).toBeInTheDocument();
  });

  it('does not show guide on non-Android', () => {
    vi.mocked(isAndroid).mockReturnValue(false);
    render(<AndroidSaveGuide />);
    expect(screen.queryByText('写真を保存するには')).not.toBeInTheDocument();
  });

  it('does not show guide when previously dismissed', () => {
    vi.mocked(isAndroid).mockReturnValue(true);
    localStorage.setItem('android_save_guide_dismissed', '1');
    render(<AndroidSaveGuide />);
    expect(screen.queryByText('写真を保存するには')).not.toBeInTheDocument();
  });

  it('dismisses guide and stores in localStorage', async () => {
    vi.mocked(isAndroid).mockReturnValue(true);
    const user = userEvent.setup();
    render(<AndroidSaveGuide />);

    expect(screen.getByText('写真を保存するには')).toBeInTheDocument();

    // Click the dismiss (X) button
    const dismissButton = screen.getByRole('button');
    await user.click(dismissButton);

    expect(screen.queryByText('写真を保存するには')).not.toBeInTheDocument();
    expect(localStorage.getItem('android_save_guide_dismissed')).toBe('1');
  });
});
