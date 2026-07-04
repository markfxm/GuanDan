import type { Card, GameRank, Suit } from "../engine/cards";
import type { CardGroup, GroupPurpose, GroupType } from "../engine/groups";
import type { ScoredPlan } from "../engine/scorer";
import { CardFace } from "./CardFace";

type PlanViewProps = {
  plans: ScoredPlan[];
  selectedPlanId?: string;
  gameRank: GameRank;
  onSelectPlan: (planId: string) => void;
};

const TYPE_LABELS: Record<GroupType, string> = {
  single: "单张",
  pair: "对子",
  triple: "三张",
  "full-house": "夯（三带二）",
  straight: "顺子",
  "consecutive-pairs": "木板",
  plate: "钢板",
  bomb: "炸弹",
  "straight-flush": "同花顺",
  "joker-bomb": "王炸",
};

const PURPOSE_LABELS: Record<GroupPurpose, string> = {
  attack: "进攻",
  engine: "推进",
  recovery: "回手",
  "tail-control": "收尾",
  risk: "风险",
  filler: "整理",
};

const PLAN_LABELS: Record<string, string> = {
  balanced: "均衡推荐",
  fast: "快速跑牌",
  control: "保控防守",
  linked: "连型发动",
  wildcard: "配牌激进",
};

const SUIT_LABELS: Record<Suit, string> = {
  spades: "黑桃",
  clubs: "梅花",
  hearts: "红桃",
  diamonds: "方片",
};

function groupTypeLabel(group: CardGroup): string {
  if (group.type !== "straight-flush") {
    return TYPE_LABELS[group.type];
  }

  const suitedCard = group.cards.find((card): card is Extract<Card, { kind: "suited" }> => card.kind === "suited" && !group.wildcards.includes(card));
  return suitedCard === undefined ? TYPE_LABELS[group.type] : `${SUIT_LABELS[suitedCard.suit]}${TYPE_LABELS[group.type]}`;
}

export function PlanView({ plans, selectedPlanId, gameRank, onSelectPlan }: PlanViewProps) {
  if (plans.length === 0) {
    return <p className="empty-state">开房后这里会展示按赢牌策略拆分的可视化组牌方案。</p>;
  }

  return (
    <div className="plan-stack">
      {plans.map((plan, index) => {
        const selected = plan.id === selectedPlanId;

        return (
          <button
            className={`plan-option${selected ? " selected" : ""}`}
            key={plan.id}
            type="button"
            onClick={() => onSelectPlan(plan.id)}
            aria-pressed={selected}
          >
            <span className="plan-header">
              <span>
                <strong>{PLAN_LABELS[plan.id] ?? plan.name}</strong>
                <span className="plan-meta">方案 {index + 1}</span>
              </span>
              <span className="plan-score">{plan.score}</span>
            </span>

            <span className="group-list">
              {plan.groups.map((group) => (
                <span className="group-row" key={group.id}>
                  <span className="group-copy">
                    <span className={`purpose purpose-${group.purpose}`}>{PURPOSE_LABELS[group.purpose]}</span>
                    <span className="group-type">{groupTypeLabel(group)}</span>
                  </span>
                  <span className="group-cards">
                    {group.cards.map((card) => (
                      <CardFace card={card} compact gameRank={gameRank} key={card.id} />
                    ))}
                  </span>
                </span>
              ))}
            </span>
          </button>
        );
      })}
    </div>
  );
}
