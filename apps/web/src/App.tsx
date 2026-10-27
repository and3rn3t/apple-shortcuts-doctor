import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent, DragEvent } from 'react';
import type { Report } from '@shortcuts-doctor/core';
import { inspectBytes, inspectFile } from './inspect-file.ts';
import type { Outcome } from './inspect-file.ts';
import { SAMPLE_EXPORT } from './sample.ts';

const GETTING_AN_EXPORT_URL =
  'https://github.com/and3rn3t/apple-shortcuts-doctor#getting-an-export';

type State =
  | { status: 'idle' }
  | { status: 'reading' }
  | { status: 'error'; message: string; signed: boolean }
  | { status: 'done'; report: Report };

function toState(outcome: Outcome): State {
  return outcome.kind === 'report'
    ? { status: 'done', report: outcome.report }
    : { status: 'error', message: outcome.message, signed: outcome.signed };
}

function SignedHelp(): React.JSX.Element {
  return (
    <p>
      Exports made with Share → Export File (iPhone, iPad) or File → Export… (Mac) are always
      signed.{' '}
      <a href={GETTING_AN_EXPORT_URL} target="_blank" rel="noopener noreferrer">
        Getting an export
      </a>{' '}
      lists the ways to get a file this tool can read.
    </p>
  );
}

function Result({ state }: { state: State }): React.JSX.Element | null {
  if (state.status === 'reading') return <p>Inspecting…</p>;
  if (state.status === 'error') {
    return (
      <div role="alert" className="error">
        <p>{state.message}</p>
        {state.signed ? <SignedHelp /> : null}
      </div>
    );
  }
  if (state.status === 'done') {
    const { warning, review } = state.report.summary.findingsBySeverity;
    return (
      <p data-testid="summary">
        Inspected {state.report.actionCount} actions: {state.report.findings.length} findings (
        {warning} warning, {review} review).
      </p>
    );
  }
  return null;
}

export function App(): React.JSX.Element {
  const [state, setState] = useState<State>({ status: 'idle' });
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const latest = useRef(0);
  // dragenter/dragleave bubble from the zone's children, so count them: the highlight clears only
  // when the pointer has left the zone and all of its children (relatedTarget is null in Safari).
  const dragDepth = useRef(0);

  // A file dropped outside the drop zone would otherwise navigate the page away to the file.
  useEffect(() => {
    const ignore = (event: Event): void => event.preventDefault();
    window.addEventListener('dragover', ignore);
    window.addEventListener('drop', ignore);
    return () => {
      window.removeEventListener('dragover', ignore);
      window.removeEventListener('drop', ignore);
    };
  }, []);

  async function inspect(file: File): Promise<void> {
    const request = ++latest.current;
    setState({ status: 'reading' });
    const outcome = await inspectFile(file);
    // Ignore a slow earlier file once a newer one has been chosen.
    if (request === latest.current) setState(toState(outcome));
  }

  function onChoose(event: ChangeEvent<HTMLInputElement>): void {
    const file = event.target.files?.[0];
    // Reset so choosing the same file again still fires a change event.
    event.target.value = '';
    if (file) void inspect(file);
  }

  function onDragLeave(): void {
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragging(false);
  }

  function onDrop(event: DragEvent<HTMLDivElement>): void {
    event.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    const file = event.dataTransfer.files[0];
    if (file) void inspect(file);
  }

  function onSample(): void {
    latest.current++;
    setState(toState(inspectBytes(SAMPLE_EXPORT)));
  }

  return (
    <main>
      <h1>Shortcuts Doctor</h1>
      <p>
        Static inspection of Apple Shortcut exports. Everything runs in your browser; nothing is
        uploaded.
      </p>
      <section aria-labelledby="inspect-heading">
        <h2 id="inspect-heading">Inspect an export</h2>
        <div
          className={dragging ? 'dropzone dragging' : 'dropzone'}
          onDragEnter={() => {
            dragDepth.current++;
            setDragging(true);
          }}
          onDragOver={event => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
        >
          <p>Drop an unsigned export here, or</p>
          <div className="actions">
            <button type="button" onClick={() => fileInput.current?.click()}>
              Choose a file
            </button>
            <button type="button" className="secondary" onClick={onSample}>
              Try the built-in sample
            </button>
          </div>
          <input ref={fileInput} type="file" hidden onChange={onChoose} />
        </div>
        <div role="status" aria-live="polite">
          <Result state={state} />
        </div>
      </section>
    </main>
  );
}
