import type { Finding, FlowPath, InspectedAction } from './types.ts';

const MAX_PATHS_PER_FINDING = 10;
const WORD_BITS = 32;

/** Inputs that read sensitive data through a variable token, with no action of their own. */
const SENSITIVE_MAGIC_INPUTS = new Set(['clipboard', 'device-details']);

const isSource = (action: InspectedAction): boolean =>
  action.category === 'sensitive-input' ||
  (action.magicInputs ?? []).some(input => SENSITIVE_MAGIC_INPUTS.has(input));

const isSink = (action: InspectedAction): boolean => action.category === 'outbound';

/** Reaching sets per action, as bit sets over the sources, filled in action order. */
class Reach {
  private readonly words: number;
  private readonly bits: Uint32Array;

  constructor(
    actionCount: number,
    private readonly sourceCount: number
  ) {
    this.words = Math.max(1, Math.ceil(sourceCount / WORD_BITS));
    this.bits = new Uint32Array(actionCount * this.words);
  }

  add(action: number, source: number): void {
    const offset = action * this.words + (source >>> 5);
    this.bits[offset] = (this.bits[offset] as number) | (1 << (source & 31));
  }

  merge(into: number, from: number): void {
    for (let word = 0; word < this.words; word++) {
      const target = into * this.words + word;
      this.bits[target] =
        (this.bits[target] as number) | (this.bits[from * this.words + word] as number);
    }
  }

  has(action: number, source: number): boolean {
    return (
      (((this.bits[action * this.words + (source >>> 5)] as number) >>> (source & 31)) & 1) === 1
    );
  }

  sources(action: number): number[] {
    const found: number[] = [];
    for (let source = 0; source < this.sourceCount; source++) {
      if (this.has(action, source)) found.push(source);
    }
    return found;
  }
}

/** Earlier actions whose output may reach this one: stated links, then the inferred one. */
function statedPredecessors(action: InspectedAction): number[] {
  return [...action.dependsOn, ...action.usesVariables];
}

/**
 * For every outbound action, finds the sensitive inputs whose data may reach it through explicit
 * references, variables, and (marked) inferred default inputs, with one example path per source.
 * It reports possibilities from structure only: nothing is evaluated and no value is read.
 */
export function sourceToSinkFindings(actions: InspectedAction[]): Finding[] {
  const sourceIndexes = actions.filter(isSource).map(action => action.index);
  if (!sourceIndexes.length) return [];
  const slotOf = new Map(sourceIndexes.map((index, slot) => [index, slot]));
  const stated = new Reach(actions.length, sourceIndexes.length);
  const any = new Reach(actions.length, sourceIndexes.length);
  actions.forEach((action, position) => {
    const slot = slotOf.get(action.index);
    if (slot !== undefined) {
      stated.add(position, slot);
      any.add(position, slot);
    }
    for (const earlier of statedPredecessors(action)) {
      stated.merge(position, earlier - 1);
      any.merge(position, earlier - 1);
    }
    if (action.inferredInputFrom !== undefined) any.merge(position, action.inferredInputFrom - 1);
  });

  const findings: Finding[] = [];
  for (const sink of actions.filter(isSink)) {
    const position = sink.index - 1;
    const reaching = any.sources(position);
    if (!reaching.length) continue;
    const viaStated = new Set(stated.sources(position));
    const paths = reaching.slice(0, MAX_PATHS_PER_FINDING).map((slot): FlowPath => {
      const strong = viaStated.has(slot);
      return {
        actions: walkBack(actions, strong ? stated : any, strong, position, slot, sourceIndexes),
        inferred: !strong,
      };
    });
    const involved = [
      ...new Set([...reaching.map(slot => sourceIndexes[slot] as number), sink.index]),
    ];
    findings.push({
      code: 'possible-flow',
      ruleId: 'sensitive-to-outbound',
      severity: viaStated.size ? 'warning' : 'review',
      actions: involved.sort((a, b) => a - b),
      message:
        'Data from a sensitive input may reach this outbound action through references or variables. This is inferred from the export structure, not proven; check what is sent.',
      paths,
    });
  }
  return findings;
}

/** One path from `sink` back to the source, always stepping to the closest earlier predecessor. */
function walkBack(
  actions: InspectedAction[],
  reach: Reach,
  statedOnly: boolean,
  sink: number,
  slot: number,
  sourceIndexes: number[]
): number[] {
  const source = (sourceIndexes[slot] as number) - 1;
  const path = [sink];
  let current = sink;
  while (current !== source) {
    const action = actions[current] as InspectedAction;
    const candidates = statedPredecessors(action);
    if (!statedOnly && action.inferredInputFrom !== undefined) {
      candidates.push(action.inferredInputFrom);
    }
    const next = candidates
      .map(index => index - 1)
      .filter(candidate => reach.has(candidate, slot))
      .sort((a, b) => b - a)[0];
    // Every action that has the source in its set got it from a predecessor, so this holds.
    if (next === undefined) break;
    path.push(next);
    current = next;
  }
  return path.reverse().map(index => index + 1);
}
