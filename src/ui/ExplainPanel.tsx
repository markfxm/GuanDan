import type { ScoredPlan } from "../engine/scorer";

type ExplainPanelProps = {
  plan?: ScoredPlan;
};

const SCORE_LABELS: Array<[keyof ScoredPlan["scoreBreakdown"], string]> = [
  ["turnCount", "出完效率"],
  ["controlRetained", "回手控制"],
  ["wildcardValue", "配牌价值"],
  ["linkedTempo", "连型节奏"],
  ["singleRisk", "散张压力"],
  ["tailControl", "尾手控制"],
];

export function ExplainPanel({ plan }: ExplainPanelProps) {
  if (plan === undefined) {
    return <p className="empty-state">选择一个方案后，这里会显示评分结构、解释和风险提示。</p>;
  }

  return (
    <div className="explain-panel">
      <div className="score-hero">
        <span>综合评分</span>
        <strong>{plan.score}</strong>
      </div>

      <div className="score-bars">
        {SCORE_LABELS.map(([key, label]) => (
          <div className="score-line" key={key}>
            <span>{label}</span>
            <div
              className="score-track"
              role="meter"
              aria-label={label}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={plan.scoreBreakdown[key]}
            >
              <span style={{ width: `${plan.scoreBreakdown[key]}%` }} />
            </div>
            <strong>{plan.scoreBreakdown[key]}</strong>
          </div>
        ))}
      </div>

      <section className="explain-section">
        <h3>方案说明</h3>
        <ul>
          {plan.explanations.map((explanation) => (
            <li key={explanation}>{explanation}</li>
          ))}
        </ul>
      </section>

      <section className="explain-section">
        <h3>风险提示</h3>
        {plan.risks.length > 0 ? (
          <ul>
            {plan.risks.map((risk) => (
              <li key={risk}>{risk}</li>
            ))}
          </ul>
        ) : (
          <p>当前方案没有明显散张或手数风险。</p>
        )}
      </section>
    </div>
  );
}
