import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Logger } from '@shared/utils/logger';
import { ErrorBoundary } from './ErrorBoundary';

const ThrowError = ({ message = 'Boom' }: { message?: string }) => {
  throw new Error(message);
};

describe('ErrorBoundary', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('renders children when no descendant throws', () => {
    render(
      <ErrorBoundary>
        <div>Healthy child</div>
      </ErrorBoundary>
    );

    expect(screen.getByText('Healthy child')).toBeInTheDocument();
  });

  it('renders a custom fallback and logs the captured error', () => {
    const loggerErrorSpy = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    render(
      <ErrorBoundary fallback={<div>Custom fallback</div>}>
        <ThrowError message="Fallback failure" />
      </ErrorBoundary>
    );

    expect(screen.getByText('Custom fallback')).toBeInTheDocument();
    expect(loggerErrorSpy).toHaveBeenCalledWith(
      'Caught an error:',
      expect.objectContaining({
        error: expect.objectContaining({ message: 'Fallback failure' }),
        errorInfo: expect.objectContaining({ componentStack: expect.any(String) }),
      })
    );
  });

  it('renders the default recovery UI, shows DEV details, and reloads on reset', () => {
    vi.stubEnv('DEV', true);
    const reloadSpy = vi.spyOn(window.location, 'reload').mockImplementation(() => undefined);

    render(
      <ErrorBoundary>
        <ThrowError message="Render exploded" />
      </ErrorBoundary>
    );

    expect(screen.getByRole('heading', { name: 'Something went wrong' })).toBeInTheDocument();
    expect(screen.getByText(/could not continue/i)).toBeInTheDocument();
    expect(screen.getByText('Error Details')).toBeInTheDocument();
    expect(screen.getByText('Error: Render exploded')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Try Again' }));

    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });
});
