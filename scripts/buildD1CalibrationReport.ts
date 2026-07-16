import fs from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import path from "node:path";
import {
  buildApprovalTemplate,
  buildCalibrationReviewModel,
  commitAudit,
  D1_EXECUTION_COMMIT,
  finalizeCalibrationReviewModel,
  inventoryDirectory,
  loadPhaseDirectory,
  renderCalibrationReviewMarkdown,
  serializeCalibrationReviewJson,
  type PhaseSummary,
} from "./d1CalibrationReview";
import { canonicalJson } from "../tests/benchmark/contracts";

const SMOKE_DIR = "artifacts/ai-benchmark-d1-smoke-v2";
const CALIBRATION_DIR = "artifacts/ai-benchmark-d1-calibration-v2";
const DEFAULT_APPROVAL = "docs/benchmark-approvals/d1-topk-calibration-approval.json";

export async function buildReviewArtifacts(options: { smokeDir?: string; calibrationDir?: string; outputJson?: string; outputMd?: string; approvalTemplate?: string; validateOnly?: boolean } = {}): Promise<{ reportPath: string; markdownPath: string; approvalPath: string; reportSha256: string; inventorySha256: string }> {
  const smokeDir = options.smokeDir ?? SMOKE_DIR;
  const calibrationDir = options.calibrationDir ?? CALIBRATION_DIR;
  const smoke = await loadPhaseDirectory(smokeDir, "smoke");
  const calibration = await loadPhaseDirectory(calibrationDir, "calibration");
  const smokeSummary = summarizePhase(smoke.manifests, smoke.gamesByMatchup, "smoke");
  const calibrationSummary = summarizePhase(calibration.manifests, calibration.gamesByMatchup, "calibration");
  if (calibrationSummary.rawGames !== 2800 || calibrationSummary.pairedUnits !== 1400) throw new Error("CALIBRATION_COUNTS_INVALID");
  const combinedSha256 = sha256(canonicalJson({ smoke: smoke.inventory, calibration: calibration.inventory }));
  const model = finalizeCalibrationReviewModel({
    ...buildCalibrationReviewModel({ manifests: calibration.manifests, gamesByMatchup: calibration.gamesByMatchup, smoke: smokeSummary, inventories: { smoke: smoke.inventory, calibration: calibration.inventory, combinedSha256 } }),
    commitAudit: commitAudit(process.cwd()),
  });
  const configHash = model.config.calibrationConfigHash;
  const reportPath = options.outputJson ?? `artifacts/ai-benchmark-d1-calibration-v2-${configHash}.json`;
  const markdownPath = options.outputMd ?? `artifacts/ai-benchmark-d1-calibration-v2-${configHash}.md`;
  const approvalPath = options.approvalTemplate ?? DEFAULT_APPROVAL;
  if (options.validateOnly) {
    const existing = JSON.parse(await fs.readFile(reportPath, "utf8"));
    if (existing.reportSha256 !== model.reportSha256) throw new Error("REPORT_SHA256_MISMATCH");
    const approval = JSON.parse(await fs.readFile(approvalPath, "utf8"));
    if (approval.formalExecutionAllowed !== false || approval.calibrationReportSha256 !== model.reportSha256 || (approval.calibrationReportFileSha256 !== undefined && approval.calibrationReportFileSha256 !== sha256(await fs.readFile(reportPath)))) throw new Error("APPROVAL_VALIDATION_FAILED");
    return { reportPath, markdownPath, approvalPath, reportSha256: model.reportSha256!, inventorySha256: combinedSha256 };
  }
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.mkdir(path.dirname(approvalPath), { recursive: true });
  await fs.writeFile(reportPath, serializeCalibrationReviewJson(model), "utf8");
  await fs.writeFile(markdownPath, renderCalibrationReviewMarkdown(model), "utf8");
  const approval = buildApprovalTemplate(model, reportPath);
  approval.calibrationReportFileSha256 = sha256(await fs.readFile(reportPath));
  await fs.writeFile(approvalPath, `${JSON.stringify(approval, null, 2)}\n`, "utf8");
  const afterSmoke = await inventoryDirectory(smokeDir);
  const afterCalibration = await inventoryDirectory(calibrationDir);
  if (canonicalJson(afterSmoke) !== canonicalJson(smoke.inventory) || canonicalJson(afterCalibration) !== canonicalJson(calibration.inventory)) throw new Error("ARTIFACT_INVENTORY_CHANGED");
  return { reportPath, markdownPath, approvalPath, reportSha256: model.reportSha256!, inventorySha256: combinedSha256 };
}

function summarizePhase(manifests: Record<string, any>[], gamesByMatchup: Record<string, any[]>, phase: "smoke" | "calibration"): PhaseSummary {
  const games = Object.values(gamesByMatchup).flat(); const expected = manifests.flatMap((manifest) => manifest.expectedMatchIds ?? []); const completed = manifests.flatMap((manifest) => manifest.completedMatchIds ?? []); const expectedSet = new Set(expected); const completedSet = new Set(completed); const actual = games.map((game) => game.matchId); const actualSet = new Set(actual);
  const safetyOk = manifests.every((manifest) => manifest.safety?.allZero === true); const privacyOk = manifests.every((manifest) => manifest.privacy?.verified === true && manifest.privacy?.hiddenStateLeakCount === 0); const diagnosticsOk = manifests.every((manifest) => manifest.diagnosticsIntegrity?.integrityOk === true && manifest.diagnosticsErrorCount === 0); const hashOk = manifests.every((manifest) => manifest.hash?.verified === true); const versionOk = manifests.every((manifest) => manifest.version?.verified === true);
  return { phase, manifestCount: manifests.length, rawGames: games.length, pairedUnits: manifests.reduce((sum, manifest) => sum + Number(manifest.completedPairedUnits ?? 0), 0), configHashes: [...new Set(manifests.map((manifest) => String(manifest.configHash ?? "")))].sort(), provenanceHashes: [...new Set(manifests.map((manifest) => String(manifest.provenanceHash ?? "")))].sort(), schemaVersions: [...new Set(manifests.map((manifest) => String(manifest.schemaVersion ?? "")))].sort(), expectedMatchIds: expected.length, completedMatchIds: completed.length, duplicate: actual.length - actualSet.size, missing: [...expectedSet].filter((id) => !completedSet.has(id)).length, unknown: [...actualSet].filter((id) => !expectedSet.has(id)).length, safetyOk, privacyOk, diagnosticsOk, hashOk, versionOk };
}

function sha256(value: string | Uint8Array): string { return createHash("sha256").update(value).digest("hex"); }

if (process.argv[1]?.endsWith("buildD1CalibrationReport.ts")) {
  const validateOnly = process.argv.includes("--validate-only");
  buildReviewArtifacts({ validateOnly }).then((result) => console.log(JSON.stringify(result, null, 2))).catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
}

export { D1_EXECUTION_COMMIT };
