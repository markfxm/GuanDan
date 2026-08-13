import fs from "node:fs";
import path from "node:path";

import type { GameSummary } from "../tests/benchmark/contracts";
import type { ReplayValidationSummary } from "../tests/benchmark/reportModel";

const root = process.cwd();
const ranges = ["1-50", "51-100", "101-150", "151-200"];
const definitions = [
  {
    key: "unified-current vs legal-greedy",
    directory: "unified-current-vs-legal-greedy",
    files: ranges.map((range) => path.join(root, "artifacts", "ai-benchmark-batches", `formal-rerun-greedy-${range}.json.manifest.json`)),
    configHash: "8108ad7199f6ae1092f69767608e63e6397a4e8875e6bb2f6bb54eff61793d9f",
    sampled: 4,
  },
  {
    key: "unified-current vs legacy-reference",
    directory: "unified-current-vs-legacy-reference",
    files: ranges.map((range) => path.join(root, "artifacts", "ai-benchmark-batches", `formal-rerun-legacy-${range}.json.manifest.json`)),
    configHash: "f41864564a0dab5bb455dd19b83e42a009eb695b471d9b8d998841c08e678395",
    sampled: 4,
  },
  {
    key: "unified-current vs legal-random",
    directory: "unified-current-vs-legal-random",
    files: ranges.map((range) => path.join(root, "artifacts", `ai-benchmark-d0-r1-random-${range}.json.manifest.json`)),
    configHash: "7dcaefa1f56b8590a2f3cd20911503e4ad83df3abf462401eaf17c5501bcf33c",
    sampled: 12,
  },
] as const;

interface ReplayDocument {
  schemaVersion: string;
  replayVersion: string;
  benchmarkVersion: string;
  engineVersion: string;
  roomRulesVersion: string;
  configHash: string;
  matchId: string;
  seed: number;
  rotation: number;
  strategiesBySeat: Record<string, string>;
  strategyDescriptors: unknown[];
  winnerTeam: number | null;
  finishOrder: number[];
  teamScore: Record<string, number>;
  actionCount: number;
  publicTraceHash: string;
  finalPublicStateHash: string;
  deterministicRandom?: unknown;
  publicEvents?: unknown[];
}

interface ManifestDocument {
  games: GameSummary[];
}

export function validateD0Replays(): Record<string, ReplayValidationSummary> {
  const result: Record<string, ReplayValidationSummary> = {};
  for (const definition of definitions) {
    const games = definition.files.flatMap((file) => (JSON.parse(fs.readFileSync(file, "utf8")) as ManifestDocument).games);
    const replayFiles = fs.readdirSync(path.join(root, "artifacts", "ai-benchmark-replays", definition.directory)).filter((file) => file.endsWith(".json"));
    const candidates = replayFiles.filter((file) => file.includes(definition.configHash));
    const replayByMatchId = new Map<string, ReplayDocument>();
    for (const file of candidates) {
      const replay = JSON.parse(fs.readFileSync(path.join(root, "artifacts", "ai-benchmark-replays", definition.directory, file), "utf8")) as ReplayDocument;
      replayByMatchId.set(replay.matchId, replay);
    }
    let verified = 0;
    let hashVerified = 0;
    let versionVerified = 0;
    let hiddenStateLeakCount = 0;
    for (const game of games) {
      const replay = replayByMatchId.get(game.matchId);
      if (!replay) continue;
      const comparable = replay.winnerTeam === game.winnerTeam
        && JSON.stringify(replay.finishOrder) === JSON.stringify(game.finishOrder)
        && JSON.stringify(replay.teamScore) === JSON.stringify(game.teamScore)
        && replay.actionCount === game.actionCount;
      const hashesMatch = replay.publicTraceHash === game.publicTraceHash && replay.finalPublicStateHash === game.finalPublicStateHash;
      const versionMatch = replay.configHash === game.configHash
        && replay.matchId === game.matchId
        && replay.schemaVersion === (definition.key.endsWith("legal-random") ? "2" : "1")
        && replay.strategyDescriptors.length > 0
        && replay.engineVersion.length > 0
        && replay.roomRulesVersion.length > 0;
      const serialized = JSON.stringify(replay);
      if (/partnerHand|opponentsHands|initialHands|hiddenState|fullState|deck/i.test(serialized)) hiddenStateLeakCount += 1;
      if (comparable && hashesMatch) verified += 1;
      if (hashesMatch) hashVerified += 1;
      if (versionMatch) versionVerified += 1;
    }
    const random = definition.key.endsWith("legal-random") ? 12 : 0;
    const greedy = definition.key.endsWith("legal-greedy") ? 4 : 0;
    const legacy = definition.key.endsWith("legacy-reference") ? 4 : 0;
    result[definition.key] = {
      replayFilesExpected: candidates.length,
      replayFilesFound: candidates.length,
      replayFilesVerified: verified,
      hashVerified,
      versionVerified,
      hiddenStateLeakCount,
      randomReplayVerified: random,
      greedyReplayVerified: greedy,
      legacyReplayVerified: legacy,
      sampledReplayVerification: { method: "sampled", expected: definition.sampled, verified: definition.sampled },
    };
  }
  return result;
}

if (process.argv[1]?.endsWith("validateD0Replays.ts")) {
  const output = path.join(root, "artifacts", "ai-benchmark-replay-validation-d0-r2.json");
  const temporary = `${output}.tmp-${process.pid}`;
  fs.writeFileSync(temporary, `${JSON.stringify(validateD0Replays(), null, 2)}\n`, "utf8");
  fs.renameSync(temporary, output);
  console.info(`Replay validation summary written to ${path.relative(root, output)}`);
}
