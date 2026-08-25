/// PROTOTYPE. Throwaway — debug channel only.
// Compiled in only when VITE_PROBE_REPORT is set, so a device build never
// phones home and criterion 4 stays honest.
const URL_ = import.meta.env.VITE_PROBE_REPORT as string | undefined;

export const reportingEnabled = Boolean(URL_);

export const report = (stage: string, payload: unknown): void => {
  if (!URL_) return;
  const body = JSON.stringify({ ...(payload as object), stage });
  // Android serves from https://localhost, so a cleartext POST is blocked as
  // mixed content. Capacitor mirrors console to logcat, which needs no network
  // at all — and works with the network off, which matters for criterion 4.
  console.log(`PROBE_REPORT ${body}`);
  void fetch(URL_, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  }).catch(() => {
    /* the probe must never fail because the debug channel is down */
  });
};
