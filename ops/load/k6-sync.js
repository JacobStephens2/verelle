import http from "k6/http";
import { check, fail } from "k6";

export const options = {
  scenarios: {
    authenticated_sync_pull: {
      executor: "constant-vus",
      vus: 100,
      duration: "2m",
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.01"],
    "http_req_duration{endpoint:sync_pull}": ["p(95)<300"],
  },
};

const base = __ENV.VERELLE_ORIGIN || "https://verelle.app";
const datasetId = __ENV.VERELLE_TEST_DATASET_ID;
const bearerToken = __ENV.VERELLE_TEST_BEARER_TOKEN;

export function setup() {
  if (!datasetId || !bearerToken) {
    fail(
      "Set VERELLE_TEST_DATASET_ID and VERELLE_TEST_BEARER_TOKEN for an isolated load-test account",
    );
  }
  const ready = http.get(`${base}/readyz`, { timeout: "5s" });
  if (ready.status !== 200) {
    fail(`Verelle is not ready (HTTP ${ready.status})`);
  }
}

export default function () {
  const response = http.get(
    `${base}/api/v1/datasets/${datasetId}/operations?after=0&limit=1`,
    {
      headers: { Authorization: `Bearer ${bearerToken}` },
      tags: { endpoint: "sync_pull" },
      timeout: "5s",
    },
  );
  check(response, {
    "authenticated sync pull succeeds": (value) => value.status === 200,
    "sync response is bounded": (value) => value.body.length <= 1024 * 1024,
  });
  if (response.status === 401 || response.status === 403) {
    fail("The isolated load-test enrollment is no longer authorized");
  }
}
