// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { App } from '../src/App.tsx';

afterEach(cleanup);

it('runs core against the built-in sample and shows its action count', () => {
  render(<App />);
  expect(screen.getByTestId('action-count').textContent).toContain('3 actions');
});
