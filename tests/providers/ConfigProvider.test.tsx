import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Logger } from '@shared/utils/logger';
import { createMockSettings } from '@test/settingsMocks';
import { ConfigProvider } from '@/providers/ConfigProvider';

afterEach(() => {
  Logger.globalDebugMode = false;
});

describe('ConfigProvider', () => {
  it('renders children and syncs logger debug mode when settings change', () => {
    const { rerender } = render(
      <ConfigProvider settings={createMockSettings({ debugMode: true })}>
        <div>Provider child</div>
      </ConfigProvider>
    );

    expect(screen.getByText('Provider child')).toBeInTheDocument();
    expect(Logger.globalDebugMode).toBe(true);

    rerender(
      <ConfigProvider settings={createMockSettings({ debugMode: false })}>
        <div>Provider child</div>
      </ConfigProvider>
    );

    expect(Logger.globalDebugMode).toBe(false);
  });

  it('resets logger debug mode on unmount', () => {
    const { unmount } = render(
      <ConfigProvider settings={createMockSettings({ debugMode: true })}>
        <div>Provider child</div>
      </ConfigProvider>
    );

    expect(Logger.globalDebugMode).toBe(true);

    unmount();

    expect(Logger.globalDebugMode).toBe(false);
  });
});
