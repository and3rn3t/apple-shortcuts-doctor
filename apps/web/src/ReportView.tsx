import { displayIdentifier } from '@shortcuts-doctor/core';
import type { Finding, InspectedAction, Report } from '@shortcuts-doctor/core';
import type { RefObject } from 'react';
import { downloadMarkdown } from './download.ts';
import { FINDING_LABEL, FINDING_ORDER, SEVERITIES, SEVERITY_LABEL } from './labels.ts';

function ActionLinks({ indexes }: { indexes: readonly number[] }): React.JSX.Element {
  return (
    <>
      {indexes.map((index, position) => (
        <span key={index}>
          {position ? ', ' : ''}
          <a href={`#action-${index}`}>#{index}</a>
        </span>
      ))}
    </>
  );
}

function Summary({ report }: { report: Report }): React.JSX.Element {
  const { warning, review } = report.summary.findingsBySeverity;
  const categories = Object.entries(report.summary.actionsByCategory).filter(
    ([, count]) => count > 0
  );
  return (
    <>
      <dl className="summary">
        <div>
          <dt>Actions</dt>
          <dd>{report.actionCount}</dd>
        </div>
        <div>
          <dt>Warning findings</dt>
          <dd>{warning}</dd>
        </div>
        <div>
          <dt>Review findings</dt>
          <dd>{review}</dd>
        </div>
      </dl>
      <p>
        Findings are grouped by rule, so one finding can cover several actions. Actions by category:
      </p>
      <ul className="inline">
        {categories.map(([category, count]) => (
          <li key={category}>
            {category}: {count}
          </li>
        ))}
      </ul>
    </>
  );
}

function FindingItem({ finding }: { finding: Finding }): React.JSX.Element {
  return (
    <li>
      {finding.message}{' '}
      <span className="where">
        {finding.actions.length === 1 ? 'Action ' : 'Actions '}
        <ActionLinks indexes={finding.actions} />
      </span>
    </li>
  );
}

function Findings({ findings }: { findings: readonly Finding[] }): React.JSX.Element {
  if (!findings.length) return <p>No findings. That does not mean this Shortcut is safe.</p>;
  return (
    <>
      {SEVERITIES.map(severity => {
        const ofSeverity = findings.filter(finding => finding.severity === severity);
        if (!ofSeverity.length) return null;
        return (
          <div key={severity}>
            <h4>
              {SEVERITY_LABEL[severity]} ({ofSeverity.length})
            </h4>
            {FINDING_ORDER.map(code => {
              const group = ofSeverity.filter(finding => finding.code === code);
              if (!group.length) return null;
              return (
                <div key={code}>
                  <h5>{FINDING_LABEL[code]}</h5>
                  <ul>
                    {group.map((finding, position) => (
                      <FindingItem key={position} finding={finding} />
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        );
      })}
    </>
  );
}

const ROLE_TEXT = { start: 'starts', middle: 'continues', end: 'ends' } as const;
/** Nesting deeper than this stops indenting, so a phone-width screen never overflows. */
const MAX_INDENT_DEPTH = 8;

function ActionItem({ action }: { action: InspectedAction }): React.JSX.Element {
  const depth = Math.min(action.depth, MAX_INDENT_DEPTH);
  return (
    <li id={`action-${action.index}`} tabIndex={-1} className={`depth-${depth}`}>
      {/* Identifiers come from the export and are untrusted: shown as text only, never as HTML. */}
      <code>{displayIdentifier(action.identifier)}</code>{' '}
      <span className="category">{action.category}</span>
      {action.flow ? (
        <span className="where">
          {' '}
          {ROLE_TEXT[action.flow.role]} block {action.flow.block}
        </span>
      ) : null}
      {action.dependsOn.length ? (
        <span className="where">
          {' '}
          uses the output of <ActionLinks indexes={action.dependsOn} />
        </span>
      ) : null}
      {action.usesVariables.length ? (
        <span className="where">
          {' '}
          uses variables set by <ActionLinks indexes={action.usesVariables} />
        </span>
      ) : null}
      {action.inferredInputFrom ? (
        <span className="where">
          {' '}
          probably takes the output of <ActionLinks indexes={[action.inferredInputFrom]} />{' '}
          (inferred)
        </span>
      ) : null}
      {action.magicInputs?.length ? (
        <span className="where"> reads {action.magicInputs.join(', ')}</span>
      ) : null}
      {action.unresolvedVariableCount ? (
        <span className="where">
          {' '}
          {action.unresolvedVariableCount} unset variable
          {action.unresolvedVariableCount === 1 ? '' : 's'}
        </span>
      ) : null}
      {action.unresolvedReferenceCount ? (
        <span className="where">
          {' '}
          {action.unresolvedReferenceCount} unresolved reference
          {action.unresolvedReferenceCount === 1 ? '' : 's'}
        </span>
      ) : null}
    </li>
  );
}

export function ReportView({
  report,
  headingRef,
}: {
  report: Report;
  headingRef: RefObject<HTMLHeadingElement | null>;
}): React.JSX.Element {
  return (
    <section aria-labelledby="report-heading" className="report">
      <h2 id="report-heading" ref={headingRef} tabIndex={-1}>
        Report
      </h2>
      <p role="note" className="note">
        Not a safety verdict. Severity only orders your manual review, and an empty list of findings
        does not mean a Shortcut is safe. Nothing in the export was run.
      </p>
      <p>
        <button type="button" className="secondary" onClick={() => downloadMarkdown(report)}>
          Download Markdown report
        </button>
      </p>
      <h3>Summary</h3>
      <Summary report={report} />
      <h3>Findings</h3>
      <Findings findings={report.findings} />
      <h3>Actions</h3>
      <ol className="action-list">
        {report.actions.map(action => (
          <ActionItem key={action.index} action={action} />
        ))}
      </ol>
      <h3>What this can’t tell you</h3>
      <ul>
        {report.limitations.map(limitation => (
          <li key={limitation}>{limitation}</li>
        ))}
      </ul>
    </section>
  );
}
