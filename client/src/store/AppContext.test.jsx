import React, { useEffect } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { AppProvider, useAppDispatch, useAppState } from './AppContext.jsx';

function ViewHarness({ view }) {
  const state = useAppState();
  const dispatch = useAppDispatch();

  useEffect(() => {
    dispatch({ type: 'SET_VIEW', payload: view });
  }, [dispatch, view]);

  return <div data-testid="current-view">{state.view}</div>;
}

describe('AppContext pack navigation views', () => {
  it('accepts pack library and builder views while rejecting unknown persisted routes', async () => {
    const { rerender } = render(
      <AppProvider>
        <ViewHarness view="packs" />
      </AppProvider>
    );

    await waitFor(() => expect(screen.getByTestId('current-view').textContent).toBe('packs'));

    rerender(
      <AppProvider>
        <ViewHarness view="pack-builder" />
      </AppProvider>
    );
    await waitFor(() => expect(screen.getByTestId('current-view').textContent).toBe('pack-builder'));

    rerender(
      <AppProvider>
        <ViewHarness view="not-a-real-view" />
      </AppProvider>
    );
    await waitFor(() => expect(screen.getByTestId('current-view').textContent).toBe('projects'));
  });
});
