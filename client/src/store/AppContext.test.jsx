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

function NavigationIntentHarness() {
  const state = useAppState();
  const dispatch = useAppDispatch();

  useEffect(() => {
    dispatch({
      type: 'SET_NAVIGATION_INTENT',
      payload: { source: 'pack-library', focus: 'builder', packId: 'pack-1', workflowId: 'wf-1' },
    });
  }, [dispatch]);

  return (
    <>
      <div data-testid="nav-pack">{state.navigationIntent?.packId ?? 'none'}</div>
      <button type="button" onClick={() => dispatch({ type: 'CLEAR_NAVIGATION_INTENT' })}>
        Clear intent
      </button>
    </>
  );
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

  it('stores and clears explicit pack/workflow navigation intent', async () => {
    render(
      <AppProvider>
        <NavigationIntentHarness />
      </AppProvider>
    );

    await waitFor(() => expect(screen.getByTestId('nav-pack').textContent).toBe('pack-1'));
    screen.getByRole('button', { name: 'Clear intent' }).click();
    await waitFor(() => expect(screen.getByTestId('nav-pack').textContent).toBe('none'));
  });
});
