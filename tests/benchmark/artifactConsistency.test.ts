import fs from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "../..");
const jsonPath = path.join(root, "artifacts", "ai-benchmark-baseline.json");
const markdownPath = path.join(root, "artifacts", "ai-benchmark-baseline.md");
const manifestPath = path.join(root, "artifacts", "ai-benchmark-manifest.json");

describe("D0 report artifacts", () => {
  const report = JSON.parse(fs.readFileSync(jsonPath, "utf8")) as any;
  const markdown = fs.readFileSync(markdownPath, "utf8");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as any;

  it("keeps JSON, Markdown, and manifest aggregates aligned", () => {
    expect(report.matchups).toHaveLength(3);
    expect((markdown.match(/^### /gm) ?? []).length).toBe(3);
    expect(report.matchups.map((matchup: any) => `${matchup.strategyA} vs ${matchup.strategyB}`)).toEqual([
      "unified-current vs legal-greedy",
      "unified-current vs legacy-reference",
      "unified-current vs legal-random",
    ]);
    expect(manifest.matchups.map((matchup: any) => `${matchup.strategyA} vs ${matchup.strategyB}`)).toEqual(report.matchups.map((matchup: any) => `${matchup.strategyA} vs ${matchup.strategyB}`));
    for (const matchup of report.matchups) {
      expect(matchup.paired.winRateA).toEqual(expect.any(Number));
      expect(matchup.paired.scoreDifferenceCI).toHaveLength(2);
      expect(matchup.paired.winRateCI).toHaveLength(2);
      expect(markdown).toContain(`Paired win-rate 95% CI: [${matchup.paired.winRateCI[0].toFixed(3)}, ${matchup.paired.winRateCI[1].toFixed(3)}]`);
      expect(markdown).toContain(`95% CI: [${matchup.paired.scoreDifferenceCI[0].toFixed(3)}, ${matchup.paired.scoreDifferenceCI[1].toFixed(3)}]`);
    }
  });

  it("records complete global counts and validation metadata", () => {
    expect(report.config.seeds).toEqual(Array.from({ length: 200 }, (_, index) => index + 1));
    expect(report.config).toMatchObject({ seedCount: 200, rawGames: 4800, pairedUnits: 2400, baseSeeds: 600, rotationsPerSeed: 4, placementsPerRotation: 2, gamesPerSeedPerMatchup: 8, matchupCount: 3 });
    expect(manifest.validation).toMatchObject({ expectedMatchIds: 4800, completedMatchIds: 4800, duplicate: 0, missing: 0, unknown: 0, provenanceMissing: 0, nonPositiveDuration: 0 });
    expect(report.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(report.matchups.every((matchup: any) => matchup.bootstrap.blockUnit === "base-seed" && matchup.bootstrap.iterations > 0 && Number.isInteger(matchup.bootstrap.seed))).toBe(true);
    expect(report.replayValidation).toBeDefined();
  });

  it("contains no unresolved placeholders", () => {
    expect(markdown).not.toMatch(/\{\{[^}]+\}\}|<[^>]+>|TODO|undefined|NaN/);
  });
});
