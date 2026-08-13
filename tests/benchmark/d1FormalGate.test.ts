import { describe, expect, it } from "vitest";
import { validateFormalApproval, computeApprovedCodeTreeHash } from "./d1Calibration";

describe("D1 formal gate", () => {
  it("rejects missing or non-approved calibration approval", () => {
    expect(() => validateFormalApproval(undefined, { expectedConfigHash: "cfg", currentCommit: "abc", currentTreeHash: "tree" })).toThrow(/APPROVAL/);
    expect(() => validateFormalApproval({ formalExecutionAllowed: false }, { expectedConfigHash: "cfg", currentCommit: "abc", currentTreeHash: "tree" })).toThrow(/FORMAL_EXECUTION_NOT_ALLOWED/);
  });

  it("requires approved code commit/tree and config to match", () => {
    const approval = { formalExecutionAllowed: true, approvedCodeCommit: "abc", approvedCodeTreeHash: "tree", configHash: "cfg", calibrationReportSha256: "report", approvalFilePath: "docs/benchmark-approvals/d1-topk-calibration-approval.json", reviewer: "reviewer", approvedAt: "2026-07-14T00:00:00.000Z", frozenConstants: {}, approvedBehaviorCaps: {}, improvementMargins: {}, bootstrapIterations: 10000, bootstrapSeed: 20260714 };
    expect(validateFormalApproval(approval, { expectedConfigHash: "cfg", currentCommit: "abc", currentTreeHash: "tree" }).formalExecutionAllowed).toBe(true);
    expect(() => validateFormalApproval({ ...approval, approvedCodeTreeHash: "other" }, { expectedConfigHash: "cfg", currentCommit: "abc", currentTreeHash: "tree" })).toThrow(/TREE_HASH/);
    expect(computeApprovedCodeTreeHash).toBeTypeOf("function");
  });
});
