import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { simulateUnifiedRooms } from "./unifiedAiSimulation";

const seeds = (process.argv[2] ?? Array.from({ length: 100 }, (_, index) => index + 1).join(",")).split(",").map(Number);
const outputPath = resolve(process.argv[3] ?? "artifacts/ai-simulation-report-100.json");
const summary = simulateUnifiedRooms(seeds, 1000, { diagnostics: true });
mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
console.info(`Unified AI simulation: ${summary.completed}/${seeds.length} completed; report: ${outputPath}`);
console.info(JSON.stringify(summary.statistics, null, 2));
for (const result of summary.results) {
  console.info(`seed ${result.seed}: ${result.durationMs.toFixed(1)}ms, decisions=${result.diagnostics?.decisionCount ?? 0}, plays=${result.diagnostics?.playCount ?? 0}, passes=${result.diagnostics?.passCount ?? 0}`);
  for (const hotspot of result.topHotspots ?? []) console.info(`  ${hotspot.stage}: ${hotspot.totalMs.toFixed(1)}ms (${hotspot.percentageOfTotalDecisionTime.toFixed(1)}%)`);
}
if (summary.completed !== seeds.length || summary.exceededActionLimit !== 0 || summary.engineErrors !== 0) process.exitCode = 1;
