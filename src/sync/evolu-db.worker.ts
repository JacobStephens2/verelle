/// <reference lib="webworker" />
declare const self: DedicatedWorkerGlobalScope;

import { installPolyfills } from "@evolu/common/polyfills";
installPolyfills();

import { createRandomBytes } from "@evolu/common";
import { startDbWorker } from "@evolu/common/local-first";
import {
  createRun,
  createWasmSqliteDriver,
  createWorkerDeps,
  createWorkerSelf,
} from "@evolu/web";

const run = createRun({
  ...createWorkerDeps(),
  createSqliteDriver: createWasmSqliteDriver,
  lockManager: globalThis.navigator.locks,
  randomBytes: createRandomBytes(),
});

void run(startDbWorker(createWorkerSelf(self)));
