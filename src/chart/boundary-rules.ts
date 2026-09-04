/**
 * Published boundary rules and their sources (`CONTEXT.md`, ADR 0015).
 *
 * Emits rule identifiers, descriptions, and citations. User-facing copy
 * is verified against the advice-word blocklist in ui-copy.test.ts.
 */

export interface PublishedSource {
  readonly title: string;
  readonly url: string;
}

export interface BoundaryRule {
  readonly id: string;
  readonly description: string;
  readonly source: PublishedSource;
  readonly provisionalRequirement?: string;
}

const REGULAR_MANUAL_SOURCE: PublishedSource = {
  title: "Marquette regular-cycles user manual",
  url: "https://device.report/m/5d2a8bd09ddf8f66399d538367a5d586e38444ab368d3e85f42fd740a0aeb0ea.pdf",
};

const CASE_REPORTS_SOURCE: PublishedSource = {
  title: "Case Reports of the Marquette Method",
  url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC6081769/",
};

export const BOUNDARY_RULES: Record<string, BoundaryRule> = {
  "REG-START-1": {
    id: "REG-START-1",
    description: "First six cycles begin fertility on Cycle Day 6.",
    source: REGULAR_MANUAL_SOURCE,
  },
  "REG-START-2": {
    id: "REG-START-2",
    description: "Earliest Monitor Peak of the last six cycles minus six.",
    source: REGULAR_MANUAL_SOURCE,
  },
  "REG-START-3": {
    id: "REG-START-3",
    description: "First High reading earlier than calendar start.",
    source: REGULAR_MANUAL_SOURCE,
  },
  "REG-END-1": {
    id: "REG-END-1",
    description: "End is three full days after last Monitor Peak.",
    source: REGULAR_MANUAL_SOURCE,
    provisionalRequirement: "Completing three full days after the last Monitor Peak will make it final.",
  },
  "REG-END-2": {
    id: "REG-END-2",
    description: "Missed-surge fallback uses latest Monitor Peak from last six cycles plus three full days.",
    source: CASE_REPORTS_SOURCE,
    provisionalRequirement: "Passing the historical fallback day or completing three full days after a Monitor Peak will make it final.",
  },
};

export function lookupBoundaryRule(ruleId: string): BoundaryRule | undefined {
  return BOUNDARY_RULES[ruleId];
}
