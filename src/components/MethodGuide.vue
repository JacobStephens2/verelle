<script setup lang="ts">
import MonitorSetupCoaching from "./MonitorSetupCoaching.vue";

defineEmits<{
  back: [];
}>();
</script>

<template>
  <div class="guide" data-testid="method-guide" aria-label="Marquette Method guide">
    <header class="guide__header">
      <button
        type="button"
        class="guide__back"
        data-testid="guide-back"
        @click="$emit('back')"
      >
        Back to Chart
      </button>
      <h1 class="guide__title">Marquette Method guide</h1>
      <p class="guide__lead">
        The Marquette Model of Natural Family Planning is an evidence-based fertility
        awareness system developed at Marquette University. Verelle computes each
        cycle's fertile window according to the published protocol you select, displaying
        the specific rule and published source behind every boundary.
      </p>
    </header>

    <!-- Monitor setup coaching -->
    <section class="guide__section">
      <h2 class="guide__section-title">Monitor setup coaching</h2>
      <p class="guide__section-desc">
        The Clearblue Fertility Monitor tracks estrogen and LH metabolites. Correct
        setup prevents lost test data or missing an LH surge.
      </p>
      <MonitorSetupCoaching />
    </section>

    <!-- The Three Peaks -->
    <section class="guide__section" data-testid="guide-three-peaks">
      <h2 class="guide__section-title">The three Peaks</h2>
      <p class="guide__section-desc">
        Marquette protocols distinguish three kinds of Peak to maintain traceability:
      </p>

      <div class="guide__grid">
        <article class="guide__card">
          <h3 class="guide__card-title">Monitor Peak</h3>
          <p class="guide__card-body">
            A reading of Peak on the Clearblue monitor, signaling the luteinizing
            hormone (LH) surge that triggers ovulation. The monitor displays Peak for
            two consecutive days. In monitor protocols, the <strong>last</strong> Monitor
            Peak of the cycle anchors the post-Peak infertile count.
          </p>
        </article>

        <article class="guide__card">
          <h3 class="guide__card-title">Mucus Peak</h3>
          <p class="guide__card-body">
            The final day of Peak-category cervical mucus (clear, stretchy, or slippery
            lubricative sensation). Because peak mucus can only be confirmed once a
            subsequent non-Peak day occurs, a Mucus Peak is provisional on the day it
            is recorded and becomes final retrospectively.
          </p>
        </article>

        <article class="guide__card">
          <h3 class="guide__card-title">Peak override</h3>
          <p class="guide__card-body">
            An explicit record entered by the couple naming a date as the Peak when
            the monitor or mucus missed it. Stored as an override so the resulting
            boundary shift is visibly attributable to the couple rather than the device.
          </p>
        </article>
      </div>
    </section>

    <!-- Peak Count -->
    <section class="guide__section" data-testid="guide-peak-count">
      <h2 class="guide__section-title">Peak count</h2>
      <p class="guide__section-desc">
        The post-Peak count tracks the three full days required for ovulation and ovum
        viability following the Peak marker:
      </p>
      <div class="guide__peak-steps">
        <div class="guide__peak-step">
          <span class="guide__peak-badge">P</span>
          <span class="guide__peak-label">Peak anchor</span>
        </div>
        <div class="guide__peak-step">
          <span class="guide__peak-badge">P+1</span>
          <span class="guide__peak-label">Day 1 post-Peak (fertile)</span>
        </div>
        <div class="guide__peak-step">
          <span class="guide__peak-badge">P+2</span>
          <span class="guide__peak-label">Day 2 post-Peak (fertile)</span>
        </div>
        <div class="guide__peak-step">
          <span class="guide__peak-badge">P+3</span>
          <span class="guide__peak-label">Day 3 post-Peak (fertile)</span>
        </div>
      </div>
      <p class="guide__section-note">
        After three full days elapse past the controlling Peak (at the conclusion of P+3),
        the post-Peak infertile time begins on the morning of P+4.
      </p>
    </section>

    <!-- Protocol Families -->
    <section class="guide__section" data-testid="guide-protocol-families">
      <h2 class="guide__section-title">Protocol families</h2>
      <p class="guide__section-desc">
        Verelle supports five Marquette protocol families published in clinical literature:
      </p>

      <div class="guide__families">
        <div class="guide__family-item">
          <h3 class="guide__family-title">Regular monitor</h3>
          <p class="guide__family-body">
            Uses the Clearblue monitor. During the first six cycles, the fertile window
            opens on Cycle Day 6. After six completed cycles, it opens on the earlier of
            the first High reading or the earliest Monitor Peak of the previous six cycles minus six days.
            Fertility closes three full days after the last Monitor Peak, or on the latest
            Monitor Peak plus three days if no Monitor Peak is detected.
          </p>
        </div>

        <div class="guide__family-item">
          <h3 class="guide__family-title">Monitor with mucus</h3>
          <p class="guide__family-body">
            A dual-check sympto-hormonal protocol uniting monitor readings and mucus observations.
            The fertile window opens on whichever comes first: calendar start, monitor High,
            or mucus change from baseline. The window closes three full days after whichever
            Peak (Monitor Peak or Mucus Peak) occurs last.
          </p>
        </div>

        <div class="guide__family-item">
          <h3 class="guide__family-title">Mucus only</h3>
          <p class="guide__family-body">
            The Marquette cervical mucus ovulation protocol. Fertility begins on Cycle Day 6
            (or earliest Mucus Peak minus six days after six cycles), or on the first mucus
            seen or felt. Fertility ends three full days after the confirmed Mucus Peak.
          </p>
        </div>

        <div class="guide__family-item">
          <h3 class="guide__family-title">Postpartum cycle zero</h3>
          <p class="guide__family-body">
            For breastfeeding women prior to the return of menstrual bleeding. Uses 20-day artificial monitor
            cycles. Days without High or Peak readings are infertile; any High or Peak reading
            opens the fertile window through three full days past the last Peak.
          </p>
        </div>

        <div class="guide__family-item">
          <h3 class="guide__family-title">Postpartum return to cycles</h3>
          <p class="guide__family-body">
            Begins when menstrual bleeding returns postpartum. Fertility begins on
            Cycle Day 10 in cycle 1, Day 9 in cycle 2, Day 8 in cycle 3, Day 7 in cycle 4,
            and Day 6 in cycle 5 onward, unless an earlier High reading occurs.
          </p>
        </div>
      </div>
    </section>

    <!-- Published Sources -->
    <section class="guide__section" data-testid="method-sources">
      <h2 class="guide__section-title">Published sources &amp; citations</h2>
      <p class="guide__section-desc">
        Every rule Verelle computes is traceable to published material. You can review
        the primary literature directly:
      </p>

      <ul class="guide__source-list">
        <li class="guide__source-item">
          <a
            href="https://device.report/m/5d2a8bd09ddf8f66399d538367a5d586e38444ab368d3e85f42fd740a0aeb0ea.pdf"
            target="_blank"
            rel="noopener noreferrer"
            class="guide__source-link"
            data-testid="source-link"
          >
            Marquette regular-cycles user manual &rarr;
          </a>
          <span class="guide__source-authors">Fehring, Schneider &amp; Barron (2019 rev. 4)</span>
          <p class="guide__source-desc">
            The official user manual for regular cycles from the Marquette University Institute for Natural Family Planning, detailing the monitor testing protocol, calendar start rules, and post-Peak count.
          </p>
        </li>
        <li class="guide__source-item">
          <a
            href="https://www.clearblue.com/sites/default/files/wysiwyg/fam_booklet_800834-14.pdf"
            target="_blank"
            rel="noopener noreferrer"
            class="guide__source-link"
            data-testid="source-link"
          >
            Clearblue Fertility Monitor booklet &rarr;
          </a>
          <span class="guide__source-authors">SPD Swiss Precision Diagnostics</span>
          <p class="guide__source-desc">
            Manufacturer instructions for the Clearblue Fertility Monitor, covering the m button, daily testing window, first-morning urine, reading interpretations, and testing limits.
          </p>
        </li>
        <li class="guide__source-item">
          <a
            href="https://www.marquette.edu/nursing/institute-natural-family-planning/model.php"
            target="_blank"
            rel="noopener noreferrer"
            class="guide__source-link"
            data-testid="source-link"
          >
            Marquette University Institute for Natural Family Planning &rarr;
          </a>
          <span class="guide__source-authors">Marquette University College of Nursing</span>
          <p class="guide__source-desc">
            Home of the Marquette Model, providing professional teacher education, clinical research, and certified instructor services.
          </p>
        </li>
        <li class="guide__source-item">
          <a
            href="https://www.usccb.org/resources/MM%20History%20and%20effectiveness%20Paper%202018.pdf"
            target="_blank"
            rel="noopener noreferrer"
            class="guide__source-link"
            data-testid="source-link"
          >
            USCCB Marquette Model history/effectiveness paper &rarr;
          </a>
          <span class="guide__source-authors">Fehring (2018)</span>
          <p class="guide__source-desc">
            Evidence-based summary published by the USCCB detailing Marquette protocols, sympto-hormonal dual-check rules, and effectiveness studies across diverse cohorts.
          </p>
        </li>
        <li class="guide__source-item">
          <a
            href="https://pmc.ncbi.nlm.nih.gov/articles/PMC6081769/"
            target="_blank"
            rel="noopener noreferrer"
            class="guide__source-link"
            data-testid="source-link"
          >
            Case Reports of the Marquette Method &rarr;
          </a>
          <span class="guide__source-authors">Fehring, Bouchard &amp; Schneider (2018)</span>
          <p class="guide__source-desc">
            Peer-reviewed clinical case series in The Linacre Quarterly establishing the missed-LH-surge fallback formula after six charted cycles.
          </p>
        </li>
        <li class="guide__source-item">
          <a
            href="https://pmc.ncbi.nlm.nih.gov/articles/PMC8935430/"
            target="_blank"
            rel="noopener noreferrer"
            class="guide__source-link"
            data-testid="source-link"
          >
            Multisite Marquette effectiveness study &rarr;
          </a>
          <span class="guide__source-authors">Mu, Fehring &amp; Bouchard (2022)</span>
          <p class="guide__source-desc">
            Peer-reviewed study in the Journal of the American Board of Family Medicine evaluating regular-cycle effectiveness across multiple clinical centers.
          </p>
        </li>
        <li class="guide__source-item">
          <a
            href="https://epublications.marquette.edu/cgi/viewcontent.cgi?article=1154&context=nursing_fac"
            target="_blank"
            rel="noopener noreferrer"
            class="guide__source-link"
            data-testid="source-link"
          >
            Marquette postpartum transition protocol (2013) &rarr;
          </a>
          <span class="guide__source-authors">Bouchard, Fehring &amp; Schneider (2013)</span>
          <p class="guide__source-desc">
            Peer-reviewed protocol in the Journal of the American Board of Family Medicine describing the stepping start day (Cycle Day 10 to Cycle Day 6) upon return of menstrual bleeding postpartum.
          </p>
        </li>
        <li class="guide__source-item">
          <a
            href="https://epublications.marquette.edu/cgi/viewcontent.cgi?article=1494&context=nursing_fac"
            target="_blank"
            rel="noopener noreferrer"
            class="guide__source-link"
            data-testid="source-link"
          >
            Efficacy of the Marquette Method (2008) &rarr;
          </a>
          <span class="guide__source-authors">Fehring, Schneider &amp; Barron (2008)</span>
          <p class="guide__source-desc">
            Peer-reviewed study in MCN comparing monitor-only, monitor-with-mucus, and mucus-only Marquette protocol variants.
          </p>
        </li>
      </ul>
    </section>
  </div>
</template>

<style scoped>
.guide {
  width: min(44rem, 100%);
  margin: 0 auto;
  padding: 1rem 1rem calc(2rem + env(safe-area-inset-bottom));
  display: flex;
  flex-direction: column;
  gap: 1.75rem;
}

.guide__header {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.guide__back {
  align-self: flex-start;
  min-height: 2.25rem;
  padding: 0 0.75rem;
  border: 1px solid var(--verelle-rule, #e2e8f0);
  border-radius: 8px;
  background: var(--verelle-surface, #ffffff);
  color: var(--verelle-ink-muted, #475569);
  font: inherit;
  font-size: 0.8125rem;
  cursor: pointer;
}

.guide__title {
  margin: 0;
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--verelle-ink, #0f172a);
  letter-spacing: -0.01em;
}

.guide__lead {
  margin: 0;
  font-size: 0.9375rem;
  line-height: 1.5;
  color: var(--verelle-ink-muted, #475569);
}

.guide__section {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.guide__section-title {
  margin: 0;
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--verelle-ink, #0f172a);
}

.guide__section-desc {
  margin: 0;
  font-size: 0.875rem;
  line-height: 1.45;
  color: var(--verelle-ink-muted, #475569);
}

.guide__section-note {
  margin: 0;
  font-size: 0.8125rem;
  line-height: 1.45;
  color: var(--verelle-ink-muted, #64748b);
  font-style: italic;
}

.guide__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 0.75rem;
}

.guide__card {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  padding: 0.875rem;
  border: 1px solid var(--verelle-rule, #e2e8f0);
  border-radius: 8px;
  background: var(--verelle-surface, #ffffff);
}

.guide__card-title {
  margin: 0;
  font-size: 0.9375rem;
  font-weight: 600;
  color: var(--verelle-ink, #0f172a);
}

.guide__card-body {
  margin: 0;
  font-size: 0.8125rem;
  line-height: 1.45;
  color: var(--verelle-ink-muted, #475569);
}

.guide__peak-steps {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.guide__peak-step {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.375rem 0.625rem;
  border: 1px solid var(--verelle-rule, #e2e8f0);
  border-radius: 6px;
  background: var(--verelle-surface-sunken, #f8fafc);
}

.guide__peak-badge {
  font-family: ui-monospace, monospace;
  font-size: 0.875rem;
  font-weight: 700;
  color: var(--verelle-stamp-peak, #b82b75);
}

.guide__peak-label {
  font-size: 0.75rem;
  color: var(--verelle-ink-muted, #475569);
}

.guide__families {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.guide__family-item {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding: 0.75rem 0.875rem;
  border: 1px solid var(--verelle-rule, #e2e8f0);
  border-radius: 8px;
  background: var(--verelle-surface, #ffffff);
}

.guide__family-title {
  margin: 0;
  font-size: 0.9375rem;
  font-weight: 600;
  color: var(--verelle-ink, #0f172a);
}

.guide__family-body {
  margin: 0;
  font-size: 0.8125rem;
  line-height: 1.45;
  color: var(--verelle-ink-muted, #475569);
}

.guide__source-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.guide__source-item {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding: 0.75rem 0.875rem;
  border: 1px solid var(--verelle-rule, #e2e8f0);
  border-radius: 8px;
  background: var(--verelle-surface, #ffffff);
}

.guide__source-link {
  font-size: 0.9375rem;
  font-weight: 600;
  color: var(--verelle-ink, #0f172a);
  text-decoration: underline;
  text-underline-offset: 2px;
}

.guide__source-link:hover {
  color: var(--verelle-ink-vivid, #0284c7);
}

.guide__source-authors {
  font-size: 0.75rem;
  color: var(--verelle-ink-muted, #64748b);
}

.guide__source-desc {
  margin: 0;
  font-size: 0.8125rem;
  line-height: 1.4;
  color: var(--verelle-ink-muted, #475569);
}
</style>
