export type D0KeepCurrentCase = {
  caseId: string;
  observation: Record<string, unknown>;
  runtimeInput: Record<string, unknown>;
  config: Record<string, unknown>;
  inputSha256: string;
  expected: {
    actionStableKey: string;
    action: Record<string, unknown>;
    runtime: Record<string, unknown>;
    runtimeCanonicalJson: string;
    publicTraceHash: string;
    schemaVersion: string;
    engineVersion: string;
  };
};

export type D0KeepCurrentFixture = {
  schemaVersion: string;
  sourceCommit: string;
  sourceTag: string;
  generatorCommit: string;
  generatorVersion: string;
  inputSha256: string;
  outputSha256: string;
  cases: D0KeepCurrentCase[];
};
