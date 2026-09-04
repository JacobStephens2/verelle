/**
 * Published boundary rules and their sources (`CONTEXT.md`, ADR 0015).
 *
 * Emits only rule identifiers and structured facts; user-facing sentences
 * belong in rendered templates where the copy guard can inspect them.
 */

export interface PublishedSource {
  readonly title: string;
  readonly url: string;
}

export interface BoundaryRule {
  readonly id: string;
  readonly source: PublishedSource;
}

const REGULAR_MANUAL_SOURCE: PublishedSource = {
  title: "Marquette regular-cycles user manual",
  url: "https://device.report/m/5d2a8bd09ddf8f66399d538367a5d586e38444ab368d3e85f42fd740a0aeb0ea.pdf",
};

export const BOUNDARY_RULES: Record<string, BoundaryRule> = {
  "REG-START-1": {
    id: "REG-START-1",
    source: REGULAR_MANUAL_SOURCE,
  },
  "REG-END-1": {
    id: "REG-END-1",
    source: REGULAR_MANUAL_SOURCE,
  },
};

export function lookupBoundaryRule(ruleId: string): BoundaryRule | undefined {
  return BOUNDARY_RULES[ruleId];
}
