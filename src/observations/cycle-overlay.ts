/**
 * The **Cycle overlay**: protocol family, protocol version, intention and
 * postpartum cycle number chosen for a Cycle (`CONTEXT.md`, issue #32).
 *
 * These are choices made by the couple, not derivations from Observations.
 * Keyed by the Cycle Day 1 Civil date.
 */
import type { CivilDate } from "../chart/civil-date";

/**
 * Which set of published Marquette rules a cycle is charted under (`CONTEXT.md`).
 */
export const PROTOCOL_FAMILIES = [
  "regular_monitor",
  "regular_monitor_plus_mucus",
  "mucus_only",
  "postpartum_cycle_zero_original",
  "postpartum_return_to_cycles",
] as const;
export type ProtocolFamily = (typeof PROTOCOL_FAMILIES)[number];

/** Human-readable names for protocol families. */
export const PROTOCOL_FAMILY_LABELS: Record<ProtocolFamily, string> = {
  regular_monitor: "Regular monitor",
  regular_monitor_plus_mucus: "Monitor with mucus",
  mucus_only: "Mucus only",
  postpartum_cycle_zero_original: "Postpartum cycle zero",
  postpartum_return_to_cycles: "Postpartum return to cycles",
};

/**
 * Which published source a family's rules were taken from (`CONTEXT.md`, ADR 0015).
 */
export const PROTOCOL_VERSIONS = [
  "marquette_regular_manual_public",
  "marquette_regular_plus_mucus_manual",
  "marquette_mucus_only_manual",
  "marquette_postpartum_cycle_zero_2005",
  "marquette_postpartum_return_to_cycles_2013",
] as const;
export type ProtocolVersion = (typeof PROTOCOL_VERSIONS)[number];

export const PROTOCOL_VERSION_LABELS: Record<ProtocolVersion, string> = {
  marquette_regular_manual_public: "Marquette Regular Manual (Public)",
  marquette_regular_plus_mucus_manual: "Marquette Regular + Mucus Manual",
  marquette_mucus_only_manual: "Marquette Mucus-Only Manual",
  marquette_postpartum_cycle_zero_2005: "Marquette Postpartum Cycle 0 (2005)",
  marquette_postpartum_return_to_cycles_2013: "Marquette Postpartum Return to Cycles (2013)",
};

export function defaultProtocolVersion(family: ProtocolFamily): ProtocolVersion {
  switch (family) {
    case "regular_monitor":
      return "marquette_regular_manual_public";
    case "regular_monitor_plus_mucus":
      return "marquette_regular_plus_mucus_manual";
    case "mucus_only":
      return "marquette_mucus_only_manual";
    case "postpartum_cycle_zero_original":
      return "marquette_postpartum_cycle_zero_2005";
    case "postpartum_return_to_cycles":
      return "marquette_postpartum_return_to_cycles_2013";
  }
}

/**
 * Whether a cycle is charted to avoid or achieve pregnancy (`CONTEXT.md`).
 */
export const INTENTIONS = ["avoid", "achieve"] as const;
export type Intention = (typeof INTENTIONS)[number];

/** Human-readable names for intentions. */
export const INTENTION_LABELS: Record<Intention, string> = {
  avoid: "Avoid pregnancy",
  achieve: "Achieve pregnancy",
};

/**
 * Default intention for a cycle when none is chosen (`CONTEXT.md`, Issue #41).
 */
export const DEFAULT_INTENTION: Intention = "avoid";

/**
 * Resolve the effective intention of a cycle overlay, defaulting to avoiding.
 */
export function resolvedCycleIntention(
  overlay: CycleOverlay | null | undefined,
): Intention {
  return overlay?.intention ?? DEFAULT_INTENTION;
}

/**
 * Stored choices for one Cycle, keyed by its Cycle Day 1 Civil date.
 */
export interface CycleOverlay {
  readonly startDate: CivilDate;
  readonly protocolFamily: ProtocolFamily | null;
  readonly protocolVersion: ProtocolVersion | null;
  readonly intention: Intention | null;
  readonly postpartumCycleNumber: number | null;
}

export type CycleOverlayFields = Omit<CycleOverlay, "startDate">;

export type CycleOverlayUpdate = {
  -readonly [Field in keyof CycleOverlayFields]?: CycleOverlayFields[Field];
};

/** An unchosen Cycle overlay keyed by the Cycle Day 1 Civil date. */
export function defaultCycleOverlay(startDate: CivilDate): CycleOverlay {
  return {
    startDate,
    protocolFamily: null,
    protocolVersion: null,
    intention: "avoid",
    postpartumCycleNumber: null,
  };
}

/**
 * The CycleOverlay resulting from merging `update` onto `overlay`.
 * Merged per-column so two partners editing different choices both win.
 */
export function applyCycleOverlayUpdate(
  overlay: CycleOverlay,
  update: CycleOverlayUpdate,
): CycleOverlay {
  const merged = { ...overlay };
  for (const key of Object.keys(update) as Array<keyof CycleOverlayFields>) {
    if (!(key in update)) continue;
    (merged as Record<string, unknown>)[key] = update[key] ?? null;
  }
  return merged;
}

/**
 * The update that writes just `fields` of `values`.
 */
export function cycleOverlayUpdateOf(
  values: CycleOverlayFields,
  fields: ReadonlySet<keyof CycleOverlayFields>,
): CycleOverlayUpdate {
  const update: CycleOverlayUpdate = {};
  for (const field of fields) {
    (update as Record<string, unknown>)[field] = values[field];
  }
  return update;
}
