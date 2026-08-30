import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import type { Observation } from "../observations/observation";
import type { CivilDate } from "./civil-date";
import { projectChart } from "./projection";

interface GoldenFixture {
  readonly name: string;
  readonly today: CivilDate;
  readonly observations: readonly Observation[];
  readonly expected: unknown;
}

const FIXTURES_DIRECTORY = path.resolve(import.meta.dirname, "../../fixtures");

describe("projectChart golden fixtures", () => {
  it("discovers every fixture and matches its exact Chart structure", async () => {
    const fixtureFiles = (await readdir(FIXTURES_DIRECTORY))
      .filter((file) => file.endsWith(".json"))
      .sort();

    expect(fixtureFiles.length, "fixtures/ must contain at least one JSON fixture").toBeGreaterThan(
      0,
    );

    for (const fixtureFile of fixtureFiles) {
      const fixture = JSON.parse(
        await readFile(path.join(FIXTURES_DIRECTORY, fixtureFile), "utf8"),
      ) as GoldenFixture;

      expect(projectChart(fixture.observations, fixture.today), fixture.name).toEqual(
        fixture.expected,
      );
    }
  });
});
