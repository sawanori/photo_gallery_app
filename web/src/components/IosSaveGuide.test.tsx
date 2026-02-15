import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../utils/device', () => ({
  isIos: vi.fn(() => false),
}));

import IosSaveGuide from './IosSaveGuide';
import { isIos } from '../utils/device';

describe('IosSaveGuide', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows guide on iOS when not dismissed', () => {
    vi.mocked(isIos).mockReturnValue(true);
    render(<IosSaveGuide />);
    expect(screen.getByText('写真を保存するには')).toBeInTheDocument();
    expect(screen.getByText(/写真"に追加/)).toBeInTheDocument();
  });

  it('does not show guide on non-iOS', () => {
    vi.mocked(isIos).mockReturnValue(false);
    render(<IosSaveGuide />);
    expect(screen.queryByText('写真を保存するには')).not.toBeInTheDocument();
  });

  it('does not show guide when previously dismissed', () => {
    vi.mocked(isIos).mockReturnValue(true);
    localStorage.setItem('ios_save_guide_dismissed', '1');
    render(<IosSaveGuide />);
    expect(screen.queryByText('写真を保存するには')).not.toBeInTheDocument();
  });

  it('dismisses guide and stores in localStorage', async () => {
    vi.mocked(isIos).mockReturnValue(true);
    const user = userEvent.setup();
    render(<IosSaveGuide />);

    expect(screen.getByText('写真を保存するには')).toBeInTheDocument();

    const dismissButton = screen.getByRole('button');
    await user.click(dismissButton);

    expect(screen.queryByText('写真を保存するには')).not.toBeInTheDocument();
    expect(localStorage.getItem('ios_save_guide_dismissed')).toBe('1');
  });
});
