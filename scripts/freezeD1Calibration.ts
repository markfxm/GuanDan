import fs from "node:fs/promises";
import { freezeCalibrationInput, validateCalibrationReport, validateFormalApproval } from "../tests/benchmark/d1Calibration";

export async function validateOnlyCalibration(file: string): Promise<ReturnType<typeof freezeCalibrationInput>> { const report = validateCalibrationReport(JSON.parse(await fs.readFile(file, "utf8"))); return freezeCalibrationInput(report); }
export { validateFormalApproval };
if (process.argv[1]?.endsWith("freezeD1Calibration.ts")) validateOnlyCalibration(process.argv[2] ?? "artifacts/d1-topk/calibration/report.json").then((result) => console.log(JSON.stringify(result, null, 2))).catch((error) => { console.error(error instanceof Error ? error.message : String(error)); });
