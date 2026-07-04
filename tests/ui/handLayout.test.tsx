import { render, screen, within } from "@testing-library/react";
import type { Card } from "../../src/engine/cards";
import type { CardGroup } from "../../src/engine/groups";
import type { ScoredPlan } from "../../src/engine/scorer";
import { CardFace } from "../../src/ui/CardFace";
import { groupCardsForHandDisplay } from "../../src/ui/handLayout";
import { PlanView } from "../../src/ui/PlanView";

const cards: Card[] = [
  { id: "D2-1", kind: "suited", rank: "2", suit: "diamonds", copy: 1 },
  { id: "H10-2", kind: "suited", rank: "10", suit: "hearts", copy: 2 },
  { id: "S10-2", kind: "suited", rank: "10", suit: "spades", copy: 2 },
  { id: "Joker-SJ-1", kind: "joker", rank: "SJ", copy: 1 },
  { id: "C10-1", kind: "suited", rank: "10", suit: "clubs", copy: 1 },
  { id: "Joker-BJ-1", kind: "joker", rank: "BJ", copy: 1 },
  { id: "D10-1", kind: "suited", rank: "10", suit: "diamonds", copy: 1 },
  { id: "S10-1", kind: "suited", rank: "10", suit: "spades", copy: 1 },
  { id: "HA-1", kind: "suited", rank: "A", suit: "hearts", copy: 1 },
];

it("groups original hand by 打 10 rank order and stacks same-rank cards by suit order", () => {
  const groups = groupCardsForHandDisplay(cards, "10");

  expect(groups.map((group) => group.rank)).toEqual(["BJ", "SJ", "10", "A", "2"]);
  expect(groups.find((group) => group.rank === "10")?.cards.map((card) => card.id)).toEqual([
    "S10-1",
    "S10-2",
    "C10-1",
    "H10-2",
    "D10-1",
  ]);
});

it("renders Guandan group names including 夯, 顺子, 钢板 and 木板", () => {
  render(<PlanView plans={[createPlan()]} selectedPlanId="balanced" gameRank="10" onSelectPlan={() => undefined} />);

  const plan = screen.getByRole("button", { name: /均衡推荐/ });
  expect(within(plan).getByText("夯（三带二）")).toBeInTheDocument();
  expect(within(plan).getByText("顺子")).toBeInTheDocument();
  expect(within(plan).getByText("钢板")).toBeInTheDocument();
  expect(within(plan).getByText("木板")).toBeInTheDocument();
  expect(within(plan).getByText("黑桃同花顺")).toBeInTheDocument();
});

it("renders big joker with a distinct color class from small joker", () => {
  const { rerender } = render(<CardFace card={{ id: "Joker-BJ-1", kind: "joker", rank: "BJ", copy: 1 }} gameRank="10" />);
  expect(screen.getByLabelText("大王 1")).toHaveClass("big-joker");

  rerender(<CardFace card={{ id: "Joker-SJ-1", kind: "joker", rank: "SJ", copy: 1 }} gameRank="10" />);
  expect(screen.getByLabelText("小王 1")).toHaveClass("small-joker");
});

function createPlan(): ScoredPlan {
  const baseCards = cards.slice(0, 5);
  const groupTypes: CardGroup["type"][] = ["full-house", "straight", "plate", "consecutive-pairs", "straight-flush"];

  return {
    id: "balanced",
    name: "balanced",
    score: 88,
    groups: groupTypes.map((type, index) => ({
      id: `${type}-${index}`,
      type,
      label: type,
      purpose: "engine",
      cards: type === "straight-flush" ? spadeStraightFlushCards() : baseCards,
      wildcards: [],
      strength: 40,
    })),
    scoreBreakdown: {
      turnCount: 80,
      controlRetained: 70,
      wildcardValue: 60,
      linkedTempo: 90,
      singleRisk: 75,
      tailControl: 65,
    },
    explanations: [],
    risks: [],
  };
}

function spadeStraightFlushCards(): Card[] {
  return ["6", "5", "4", "3", "2"].map((rank) => ({
    id: `S${rank}-1`,
    kind: "suited",
    rank: rank as Card["rank"],
    suit: "spades",
    copy: 1,
  })) as Card[];
}
