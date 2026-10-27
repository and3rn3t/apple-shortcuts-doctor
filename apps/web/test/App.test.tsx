// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { App } from '../src/App.tsx';

afterEach(cleanup);

it('runs core against the built-in sample and shows its action count', () => {
  render(<App />);
  expect(screen.getByTestId('action-count').textContent).toContain('3 actions');
});

it('never renders the sample parameter values, URLs, or UUIDs anywhere in the DOM', () => {
  render(<App />);
  // innerHTML covers text, attributes, and hidden elements, not just visible text.
  const dom = document.body.innerHTML;
  expect(dom.length).toBeGreaterThan(0);
  for (const value of [
    'example.invalid',
    'sample-uuid-one',
    'sample-uuid-two',
    'WFURL',
    'https://',
  ]) {
    expect(dom).not.toContain(value);
  }
});
