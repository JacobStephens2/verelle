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

const USCCB_SOURCE: PublishedSource = {
  title: "USCCB Marquette Model history/effectiveness paper",
  url: "https://www.usccb.org/resources/MM%20History%20and%20effectiveness%20Paper%202018.pdf",
};

const POSTPARTUM_2005_SOURCE: PublishedSource = {
  title: "Marquette breastfeeding protocol while not in cycles (2005)",
  url: "https://doi.org/10.1016/j.fertnstert.2005.03.042",
};

const POSTPARTUM_2013_SOURCE: PublishedSource = {
  title: "Marquette postpartum transition protocol (2013)",
  url: "https://doi.org/10.3122/jabfm.2013.01.120126",
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
  "MUCUS-START": {
    id: "MUCUS-START",
    description: "Mucus change from baseline earlier than calendar start or monitor High.",
    source: USCCB_SOURCE,
  },
  "MUCUS-END": {
    id: "MUCUS-END",
    description: "End is three full days after last Mucus Peak.",
    source: USCCB_SOURCE,
    provisionalRequirement: "Recording a non-Peak mucus observation and completing three full days after the Mucus Peak will make it final.",
  },
  "MUCUS-ONLY-START-1": {
    id: "MUCUS-ONLY-START-1",
    description: "First six cycles begin fertility on Cycle Day 6.",
    source: REGULAR_MANUAL_SOURCE,
  },
  "MUCUS-ONLY-START-2": {
    id: "MUCUS-ONLY-START-2",
    description: "Earliest Mucus Peak of the last six cycles minus six.",
    source: REGULAR_MANUAL_SOURCE,
  },
  "MUCUS-ONLY-START-3": {
    id: "MUCUS-ONLY-START-3",
    description: "First mucus observation earlier than calendar start.",
    source: REGULAR_MANUAL_SOURCE,
  },
  "MUCUS-ONLY-END-1": {
    id: "MUCUS-ONLY-END-1",
    description: "End is three full days after the Mucus Peak.",
    source: REGULAR_MANUAL_SOURCE,
    provisionalRequirement: "Recording a non-Peak mucus observation and completing three full days after the Mucus Peak will make it final.",
  },
  "MUCUS-ONLY-END-2": {
    id: "MUCUS-ONLY-END-2",
    description: "Missed-peak fallback uses latest Mucus Peak from last six cycles plus three full days.",
    source: CASE_REPORTS_SOURCE,
    provisionalRequirement: "Passing the historical fallback day or completing three full days after a confirmed Mucus Peak will make it final.",
  },
  "PP0-START": {
    id: "PP0-START",
    description: "Postpartum cycle zero begins fertility on the first High or Peak reading.",
    source: POSTPARTUM_2005_SOURCE,
  },
  "PP0-END": {
    id: "PP0-END",
    description: "End is three full days after the last Peak.",
    source: POSTPARTUM_2005_SOURCE,
    provisionalRequirement: "Completing three full days after the last Peak will make it final.",
  },
  "PP-RETURN-START-1": {
    id: "PP-RETURN-START-1",
    description: "Postpartum return-to-cycles begins fertility on Cycle Day 10 in cycle 1, shifting one day earlier each cycle to Cycle Day 6 from cycle 5 onward.",
    source: POSTPARTUM_2013_SOURCE,
  },
  "PP-RETURN-START-HIGH": {
    id: "PP-RETURN-START-HIGH",
    description: "First High reading earlier than calendar start.",
    source: POSTPARTUM_2013_SOURCE,
  },
  "PP-RETURN-END-1": {
    id: "PP-RETURN-END-1",
    description: "End is three full days after the last Peak.",
    source: POSTPARTUM_2013_SOURCE,
    provisionalRequirement: "Completing three full days after the last Peak will make it final.",
  },
};

export type BoundaryRuleId = keyof typeof BOUNDARY_RULES;

export function lookupBoundaryRule(ruleId: string): BoundaryRule | undefined {
  return BOUNDARY_RULES[ruleId];
}
