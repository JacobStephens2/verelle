<script setup lang="ts">
import { computed } from "vue";

import type { Confidence, DayStatus, FertileWindow } from "../chart/projection";
import type { ProtocolFamily, ProtocolVersion } from "../observations/cycle-overlay";
import {
  defaultProtocolVersion,
  PROTOCOL_VERSION_LABELS,
} from "../observations/cycle-overlay";
import type { BoundaryRule } from "../chart/boundary-rules";
import { lookupBoundaryRule } from "../chart/boundary-rules";

const props = defineProps<{
  cycleDay: number;
  dayStatus: DayStatus | null;
  fertileWindow: FertileWindow | null;
  protocolVersion: ProtocolVersion | null;
  protocolFamily?: ProtocolFamily | null;
}>();

const effectiveProtocolVersion = computed<ProtocolVersion | null>(() => {
  if (props.protocolVersion !== null) return props.protocolVersion;
  if (props.protocolFamily) return defaultProtocolVersion(props.protocolFamily);
  return null;
});

const protocolVersionDisplay = computed<string>(() => {
  if (effectiveProtocolVersion.value === null) return "None selected";
  return PROTOCOL_VERSION_LABELS[effectiveProtocolVersion.value] ?? effectiveProtocolVersion.value;
});

const isPreWindowInfertile = computed<boolean>(() => {
  if (props.dayStatus !== "infertile" || !props.fertileWindow) return false;
  return props.cycleDay < props.fertileWindow.start.cycleDay;
});

const isPostWindowInfertile = computed<boolean>(() => {
  if (props.dayStatus !== "infertile" || !props.fertileWindow?.end) return false;
  return props.cycleDay > props.fertileWindow.end.cycleDay;
});

const isFertileStart = computed<boolean>(() => {
  if (props.dayStatus !== "fertile" || !props.fertileWindow) return false;
  return props.cycleDay === props.fertileWindow.start.cycleDay;
});

const isFertileDay = computed<boolean>(() => {
  return props.dayStatus === "fertile";
});

const boundaryRules = computed<readonly BoundaryRule[]>(() => {
  if (!props.fertileWindow) return [];
  if (isPreWindowInfertile.value || isFertileStart.value) {
    const startRule = lookupBoundaryRule(props.fertileWindow.start.ruleId);
    return startRule ? [startRule] : [];
  }
  if (isPostWindowInfertile.value && props.fertileWindow.end) {
    const endRule = lookupBoundaryRule(props.fertileWindow.end.ruleId);
    return endRule ? [endRule] : [];
  }
  // For in-window fertile day:
  const rules: BoundaryRule[] = [];
  const startRule = lookupBoundaryRule(props.fertileWindow.start.ruleId);
  if (startRule) rules.push(startRule);
  if (props.fertileWindow.end) {
    const endRule = lookupBoundaryRule(props.fertileWindow.end.ruleId);
    if (endRule && endRule.id !== startRule?.id) rules.push(endRule);
  }
  return rules;
});

const relevantConfidence = computed<Confidence>(() => {
  if (!props.fertileWindow) return "final";
  if (isPreWindowInfertile.value || isFertileStart.value) {
    return props.fertileWindow.start.confidence;
  }
  if (isPostWindowInfertile.value && props.fertileWindow.end) {
    return props.fertileWindow.end.confidence;
  }
  // For in-window fertile day:
  if (props.fertileWindow.end === null) return "provisional";
  return props.fertileWindow.end.confidence;
});

const isProvisional = computed<boolean>(() => {
  return relevantConfidence.value === "provisional";
});

const confidenceDisplay = computed<string>(() => {
  return isProvisional.value ? "Provisional" : "Final";
});

const provisionalExplanation = computed<string | null>(() => {
  if (!isProvisional.value) return null;
  if (props.fertileWindow?.end === null) {
    if (props.protocolFamily === "mucus_only") {
      return "This boundary is provisional. Observing a non-Peak mucus day after a Mucus Peak and completing three full days will make it final.";
    }
    if (props.protocolFamily === "regular_monitor_plus_mucus") {
      return "This boundary is provisional. Completing three full days after a Monitor Peak or a Mucus Peak will make it final.";
    }
    return "This boundary is provisional. Recording a Monitor Peak and completing three full days after the last Monitor Peak will make it final.";
  }
  if (props.fertileWindow?.end?.confidence === "provisional") {
    const endRule = lookupBoundaryRule(props.fertileWindow.end.ruleId);
    return endRule?.provisionalRequirement
      ? `This boundary is provisional. ${endRule.provisionalRequirement}`
      : "This boundary is provisional.";
  }
  if (props.fertileWindow?.start?.confidence === "provisional") {
    const startRule = lookupBoundaryRule(props.fertileWindow.start.ruleId);
    return startRule?.provisionalRequirement
      ? `This boundary is provisional. ${startRule.provisionalRequirement}`
      : "This boundary is provisional.";
  }
  return "This boundary is provisional.";
});
</script>

<template>
  <aside
    v-if="dayStatus !== null && fertileWindow !== null"
    class="day-explanation"
    data-testid="day-explanation"
    aria-label="Why this day"
  >
    <div class="day-explanation__header">
      <span class="day-explanation__status" :data-day-status="dayStatus">
        Cycle Day {{ cycleDay }} &middot; {{ dayStatus === "fertile" ? "Fertile" : "Infertile" }}
      </span>
      <span class="day-explanation__confidence" data-testid="boundary-confidence">
        {{ confidenceDisplay }}
      </span>
    </div>

    <p v-if="isPreWindowInfertile" class="day-explanation__summary" data-testid="day-explanation-summary">
      Cycle Day {{ cycleDay }} is infertile because it is before the fertile window opens on Cycle Day {{ fertileWindow.start.cycleDay }}.
    </p>
    <p v-else-if="isFertileStart" class="day-explanation__summary" data-testid="day-explanation-summary">
      Cycle Day {{ cycleDay }} is fertile because the fertile window opens on Cycle Day {{ fertileWindow.start.cycleDay }}.
    </p>
    <p v-else-if="isFertileDay" class="day-explanation__summary" data-testid="day-explanation-summary">
      <span v-if="fertileWindow.end">
        Cycle Day {{ cycleDay }} is fertile within the fertile window that opened on Cycle Day {{ fertileWindow.start.cycleDay }} and closes on Cycle Day {{ fertileWindow.end.cycleDay }}.
      </span>
      <span v-else>
        Cycle Day {{ cycleDay }} is fertile within the fertile window that opened on Cycle Day {{ fertileWindow.start.cycleDay }}.
      </span>
    </p>
    <p v-else-if="isPostWindowInfertile && fertileWindow.end" class="day-explanation__summary" data-testid="day-explanation-summary">
      Cycle Day {{ cycleDay }} is infertile because the fertile window closed on Cycle Day {{ fertileWindow.end.cycleDay }}.
    </p>

    <div class="day-explanation__protocol" data-testid="protocol-version">
      <span class="day-explanation__label">Protocol version:</span>
      <span>{{ protocolVersionDisplay }}</span>
    </div>

    <div
      v-for="rule in boundaryRules"
      :key="rule.id"
      class="day-explanation__rule-section"
      data-testid="boundary-rule-section"
    >
      <div class="day-explanation__rule" data-testid="boundary-rule">
        <span class="day-explanation__label">Boundary rule:</span>
        <span class="day-explanation__rule-id">{{ rule.id }}</span>
        <span v-if="rule.description" class="day-explanation__rule-desc">
          &mdash; {{ rule.description }}
        </span>
      </div>

      <div class="day-explanation__source">
        <span class="day-explanation__label">Published source:</span>
        <a
          :href="rule.source.url"
          target="_blank"
          rel="noopener noreferrer"
          class="day-explanation__source-link"
          data-testid="rule-source-link"
        >
          {{ rule.source.title }}
        </a>
      </div>
    </div>

    <div v-if="provisionalExplanation" class="day-explanation__provisional-note" data-testid="provisional-explanation">
      {{ provisionalExplanation }}
    </div>
  </aside>
</template>

<style scoped>
.day-explanation {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  padding: 0.75rem;
  border: 1px solid var(--verelle-rule);
  border-radius: 8px;
  background: var(--verelle-surface-sunken);
  font-size: 0.8125rem;
  line-height: 1.4;
}

.day-explanation__header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.5rem;
}

.day-explanation__status {
  font-weight: 600;
  color: var(--verelle-ink);
}

.day-explanation__confidence {
  font-size: 0.75rem;
  color: var(--verelle-ink-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  font-weight: 600;
}

.day-explanation__summary {
  margin: 0;
  color: var(--verelle-ink);
}

.day-explanation__rule-section {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding: 0.25rem 0;
}

.day-explanation__rule,
.day-explanation__protocol,
.day-explanation__source {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.25rem;
}

.day-explanation__label {
  color: var(--verelle-ink-muted);
  font-weight: 500;
}

.day-explanation__rule-id {
  font-family: monospace;
  font-weight: 600;
}

.day-explanation__rule-desc {
  color: var(--verelle-ink-muted);
}

.day-explanation__source-link {
  color: var(--verelle-ink);
  text-decoration: underline;
}

.day-explanation__provisional-note {
  margin-top: 0.25rem;
  padding-top: 0.25rem;
  border-top: 1px dashed var(--verelle-rule);
  color: var(--verelle-ink-muted);
  font-style: italic;
}
</style>
