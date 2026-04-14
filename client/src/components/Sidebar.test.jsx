import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

import Sidebar from './Sidebar.jsx';
import { AppProvider } from '../store/AppContext.jsx';

describe('Sidebar update notice', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('surfaces an update banner when the backend reports a newer main commit', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input) => {
      const url = String(input);
      if (url.endsWith('/api/v1/projects')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ projects: [] }),
        };
      }
      if (url.endsWith('/api/v1/version')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ appVersion: '9.0.0' }),
        };
      }
      if (url.endsWith('/api/v1/update-status')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            mode: 'git-remote',
            updateAvailable: true,
            branch: 'main',
            behindBy: 2,
            actionUrl: 'https://github.com/ArmandoBattaglino/Harness-Maker/commits/main',
            actionLabel: 'Open updates',
          }),
        };
      }
      throw new Error(`Unexpected fetch: ${url}`);
    }));

    render(
      <AppProvider>
        <Sidebar />
      </AppProvider>
    );

    await waitFor(() => expect(screen.getAllByText('Update available')).toHaveLength(2));
    expect(screen.getByText('main is ahead by 2 commits.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Open updates' })).toHaveAttribute(
      'href',
      'https://github.com/ArmandoBattaglino/Harness-Maker/commits/main'
    );
    expect(screen.getByText('v9.0.0')).toBeTruthy();
  });
});
