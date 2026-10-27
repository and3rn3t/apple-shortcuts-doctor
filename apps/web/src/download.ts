import { renderMarkdown } from '@shortcuts-doctor/core';
import type { Report } from '@shortcuts-doctor/core';

/** A fixed name: the name of the inspected file is never reused, even locally. */
export const REPORT_FILE_NAME = 'shortcuts-doctor-report.md';
const REVOKE_AFTER_MS = 1000;

/** Saves the report as Markdown through a local blob URL. Nothing is uploaded. */
export function downloadMarkdown(report: Report): void {
  const blob = new Blob([renderMarkdown(report)], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = REPORT_FILE_NAME;
  document.body.append(link);
  link.click();
  link.remove();
  // Give the browser time to start reading the blob before it is released.
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_AFTER_MS);
}
