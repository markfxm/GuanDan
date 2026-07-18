import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { App } from "../../src/ui/App";
import type { Card } from "../../src/engine/cards";
import type { PublicRoom } from "../../src/ui/api";

const cardA: Card = { id: "SA-1", kind: "suited", rank: "A", suit: "spades", copy: 1 };
const cardK: Card = { id: "SK-1", kind: "suited", rank: "K", suit: "spades", copy: 1 };
const cardQ: Card = { id: "SQ-1", kind: "suited", rank: "Q", suit: "spades", copy: 1 };
const card5: Card = { id: "C5-1", kind: "suited", rank: "5", suit: "clubs", copy: 1 };

afterEach(() => {
  delete (globalThis as { __GUANDAN_AI_PAUSE_MS__?: number }).__GUANDAN_AI_PAUSE_MS__;
  delete (globalThis as { __GUANDAN_AI_LEAD_PAUSE_MS__?: number }).__GUANDAN_AI_LEAD_PAUSE_MS__;
  delete (globalThis as { __GUANDAN_BOMB_EFFECT_MS__?: number }).__GUANDAN_BOMB_EFFECT_MS__;
  delete (globalThis as { __GUANDAN_FLAG_LOWER_MS__?: number }).__GUANDAN_FLAG_LOWER_MS__;
  vi.restoreAllMocks();
});

it("defaults new rooms to rank 2 and does not render the game information sidebar", async () => {
  mockFetchQueue([{ room: createRoom({ rank: "2" }) }, { plans: [] }]);

  render(<App />);

  expect(screen.getByLabelText("当前级牌")).toHaveValue("2");
  expect(screen.queryByRole("heading", { name: "牌局信息" })).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: /开房/ }));
  await waitFor(() => {
    const [url, request] = vi.mocked(fetch).mock.calls[0]!;
    const body = JSON.parse(String((request as RequestInit).body));
    expect(url).toBe("/api/rooms");
    expect((request as RequestInit).headers).toEqual(expect.objectContaining({ "Idempotency-Key": expect.any(String) }));
    expect(Object.keys(body).sort()).toEqual(["pendingTributeItems", "rank", "seed"]);
  });
});

it("shows low-card flags only for players holding one through nine cards", async () => {
  const room = createRoom({
    players: [
      { seat: 0, name: "玩家", isAI: false, handCount: 0, team: 0 },
      { seat: 1, name: "AI 1", isAI: true, handCount: 9, team: 1 },
      { seat: 2, name: "AI 2", isAI: true, handCount: 10, team: 0 },
      { seat: 3, name: "AI 3", isAI: true, handCount: 1, team: 1 },
    ],
  });
  mockFetchQueue([{ room }, { plans: [] }]);

  render(<App />);
  fireEvent.click(screen.getAllByRole("button")[0]);

  expect(await screen.findByTestId("low-card-flag-1")).toHaveTextContent("还剩下 9 张了");
  expect(screen.getByTestId("low-card-flag-3")).toHaveTextContent("还剩下 1 张了");
  expect(screen.queryByTestId("low-card-flag-0")).not.toBeInTheDocument();
  expect(screen.queryByTestId("low-card-flag-2")).not.toBeInTheDocument();
});

it("updates a low-card flag after a successful real-time play", async () => {
  const afterPlay = createRoom({
    currentTurn: 1,
    humanHand: [cardK, cardQ],
    players: [
      { seat: 0, name: "玩家", isAI: false, handCount: 2, team: 0 },
      { seat: 1, name: "AI 1", isAI: true, handCount: 27, team: 1 },
      { seat: 2, name: "AI 2", isAI: true, handCount: 27, team: 0 },
      { seat: 3, name: "AI 3", isAI: true, handCount: 27, team: 1 },
    ],
    trick: {
      leadSeat: 0,
      lastPlay: group([cardA]),
      lastPlaySeat: 0,
      passSeats: [],
      plays: [{ seat: 0, action: "play", group: group([cardA]) }],
    },
    playHistory: [{ seat: 0, action: "play", group: group([cardA]) }],
  });
  mockFetchQueue([{ room: createRoom() }, { plans: [] }, { room: afterPlay }]);

  render(<App />);
  fireEvent.click(screen.getAllByRole("button")[0]);
  expect(await screen.findByTestId("low-card-flag-0")).toHaveTextContent("还剩下 3 张了");

  fireEvent.click(screen.getByTestId("hand-card-SA-1"));
  fireEvent.click(screen.getByRole("button", { name: "出牌" }));

  expect(await screen.findByTestId("low-card-flag-0")).toHaveTextContent("还剩下 2 张了");
  expect(screen.queryByTestId("bomb-effect")).not.toBeInTheDocument();
});

it("lowers and removes a low-card flag when the player goes out", async () => {
  (globalThis as { __GUANDAN_FLAG_LOWER_MS__?: number }).__GUANDAN_FLAG_LOWER_MS__ = 40;
  const initialRoom = createRoom({
    humanHand: [cardA],
    players: [
      { seat: 0, name: "玩家", isAI: false, handCount: 1, team: 0 },
      { seat: 1, name: "AI 1", isAI: true, handCount: 27, team: 1 },
      { seat: 2, name: "AI 2", isAI: true, handCount: 27, team: 0 },
      { seat: 3, name: "AI 3", isAI: true, handCount: 27, team: 1 },
    ],
  });
  const afterPlay = createRoom({
    currentTurn: 1,
    humanHand: [],
    finishOrder: [0],
    players: [
      { seat: 0, name: "玩家", isAI: false, handCount: 0, team: 0 },
      { seat: 1, name: "AI 1", isAI: true, handCount: 27, team: 1 },
      { seat: 2, name: "AI 2", isAI: true, handCount: 27, team: 0 },
      { seat: 3, name: "AI 3", isAI: true, handCount: 27, team: 1 },
    ],
    playHistory: [{ seat: 0, action: "play", group: group([cardA]) }],
  });
  mockFetchQueue([{ room: initialRoom }, { plans: [] }, { room: afterPlay }]);

  render(<App />);
  fireEvent.click(screen.getAllByRole("button")[0]);
  await screen.findByTestId("low-card-flag-0");
  fireEvent.click(screen.getByTestId("hand-card-SA-1"));
  fireEvent.click(screen.getByRole("button", { name: "出牌" }));

  await waitFor(() => expect(screen.getByTestId("low-card-flag-0")).toHaveClass("lowering"));
  await waitFor(() => expect(screen.queryByTestId("low-card-flag-0")).not.toBeInTheDocument());
});

it("shows a two-second table effect for a newly played bomb", async () => {
  (globalThis as { __GUANDAN_AI_PAUSE_MS__?: number }).__GUANDAN_AI_PAUSE_MS__ = 100_000;
  (globalThis as { __GUANDAN_BOMB_EFFECT_MS__?: number }).__GUANDAN_BOMB_EFFECT_MS__ = 50;
  const initialRoom = createRoom({ currentTurn: 1 });
  const bomb = group([cardA], "bomb");
  const afterBomb = createRoom({
    currentTurn: 2,
    trick: {
      leadSeat: 1,
      lastPlay: bomb,
      lastPlaySeat: 1,
      passSeats: [],
      plays: [{ seat: 1, action: "play", group: bomb }],
    },
    playHistory: [{ seat: 1, action: "play", group: bomb }],
  });
  mockFetchQueue([{ room: initialRoom }, { room: afterBomb }]);

  render(<App />);
  fireEvent.click(screen.getAllByRole("button")[0]);
  await screen.findByText("Current Trick");
  fireEvent.click(screen.getByRole("button", { name: "下一步" }));

  expect(await screen.findByTestId("bomb-effect")).toHaveClass("bomb-effect-seat-1");
  await waitFor(() => expect(screen.queryByTestId("bomb-effect")).not.toBeInTheDocument());
});

it("does not replay a bomb effect from pre-existing room history", async () => {
  const bomb = group([cardA], "straight-flush");
  const room = createRoom({
    playHistory: [{ seat: 2, action: "play", group: bomb }],
  });
  mockFetchQueue([{ room }, { plans: [] }]);

  render(<App />);
  fireEvent.click(screen.getAllByRole("button")[0]);
  await screen.findByText("Current Trick");

  expect(screen.queryByTestId("bomb-effect")).not.toBeInTheDocument();
});

it("opens a local room and renders AI seats plus the human hand", async () => {
  mockFetchQueue([{ room: createRoom() }, { plans: [] }]);

  render(<App />);
  fireEvent.click(screen.getByRole("button", { name: /开房/ }));

  expect(await screen.findByText("房间已创建，轮到你先出。")).toBeInTheDocument();
  expect(screen.getByText("西 · AI 1")).toBeInTheDocument();
  expect(screen.getByText("北 · AI 2")).toBeInTheDocument();
  expect(screen.getByLabelText("黑桃A 1")).toBeInTheDocument();
});

it("opens a room without crashing when the API omits current trick plays", async () => {
  const legacyRoom = createRoom({
    trick: { leadSeat: 0, passSeats: [] } as unknown as PublicRoom["trick"],
  });
  mockFetchQueue([{ room: legacyRoom }, { plans: [] }]);

  render(<App />);
  fireEvent.click(screen.getAllByRole("button")[0]);

  expect(await screen.findByText("Current Trick")).toBeInTheDocument();
});

it("keeps current trick plays visible and lets next step advance one AI action", async () => {
  const afterHuman = createRoom({
    humanHand: [cardK, cardQ],
    currentTurn: 1,
    trick: {
      leadSeat: 0,
      lastPlay: group([cardA]),
      lastPlaySeat: 0,
      passSeats: [],
      plays: [{ seat: 0, action: "play", group: group([cardA]) }],
    },
  });
  const afterAiStep = createRoom({
    humanHand: [cardK, cardQ],
    currentTurn: 2,
    trick: {
      leadSeat: 0,
      lastPlay: group([cardA]),
      lastPlaySeat: 0,
      passSeats: [1],
      plays: [
        { seat: 0, action: "play", group: group([cardA]) },
        { seat: 1, action: "pass" },
      ],
    },
  });
  mockFetchQueue([{ room: createRoom() }, { plans: [] }, { room: afterHuman }, { room: afterAiStep }]);

  render(<App />);
  fireEvent.click(screen.getByRole("button", { name: /开房/ }));
  await screen.findByLabelText("黑桃A 1");

  fireEvent.click(screen.getByLabelText("黑桃A 1"));
  fireEvent.click(screen.getByRole("button", { name: "出牌" }));

  expect(await screen.findByText("等待西位出牌，可停留观看或点下一步。")).toBeInTheDocument();
  expect(screen.getByText("南本轮出牌")).toBeInTheDocument();
  expect(screen.getByLabelText("黑桃A 1")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "下一步" })).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "下一步" }));

  expect(await screen.findByText("西过牌")).toBeInTheDocument();
});

it("auto-advances after the configured AI pause on AI turns", async () => {
  (globalThis as { __GUANDAN_AI_PAUSE_MS__?: number }).__GUANDAN_AI_PAUSE_MS__ = 1;
  const afterHuman = createRoom({
    humanHand: [cardK, cardQ],
    currentTurn: 1,
    trick: {
      leadSeat: 0,
      lastPlay: group([cardA]),
      lastPlaySeat: 0,
      passSeats: [],
      plays: [{ seat: 0, action: "play", group: group([cardA]) }],
    },
  });
  const afterAiStep = createRoom({
    humanHand: [cardK, cardQ],
    currentTurn: 0,
    trick: { leadSeat: 0, passSeats: [], plays: [] },
  });
  mockFetchQueue([{ room: createRoom() }, { plans: [] }, { room: afterHuman }, { room: afterAiStep }, { plans: [] }]);

  render(<App />);
  fireEvent.click(screen.getByRole("button", { name: /开房/ }));
  await screen.findByLabelText("黑桃A 1");

  fireEvent.click(screen.getByLabelText("黑桃A 1"));
  fireEvent.click(screen.getByRole("button", { name: "出牌" }));
  expect(await screen.findByText("轮到你行动。")).toBeInTheDocument();
});

it("shows a turn countdown while waiting for AI to follow", async () => {
  const aiRoom = createRoom({
    currentTurn: 1,
    trick: {
      leadSeat: 0,
      lastPlay: group([cardA]),
      lastPlaySeat: 0,
      passSeats: [],
      plays: [{ seat: 0, action: "play", group: group([cardA]) }],
    },
  });
  mockFetchQueue([{ room: aiRoom }, { plans: [] }]);

  render(<App />);
  fireEvent.click(screen.getAllByRole("button")[0]);

  expect(await screen.findByText("倒计时 4 秒")).toBeInTheDocument();
});

it("does not request new human plans after passing into an AI turn", async () => {
  const initialRoom = createRoom({
    currentTurn: 0,
    trick: {
      leadSeat: 3,
      lastPlay: group([card5]),
      lastPlaySeat: 3,
      passSeats: [],
      plays: [{ seat: 3, action: "play", group: group([card5]) }],
    },
  });
  const afterPass = createRoom({
    currentTurn: 1,
    trick: {
      leadSeat: 3,
      lastPlay: group([card5]),
      lastPlaySeat: 3,
      passSeats: [0],
      plays: [
        { seat: 3, action: "play", group: group([card5]) },
        { seat: 0, action: "pass" },
      ],
    },
  });
  mockFetchQueue([{ room: initialRoom }, { plans: [] }, { room: afterPass }, { plans: [] }]);

  render(<App />);
  fireEvent.click(screen.getAllByRole("button")[0]);
  await screen.findByLabelText("黑桃A 1");
  expect(planRequestCount()).toBe(1);

  fireEvent.click(screen.getByRole("button", { name: "过牌" }));
  await screen.findByText("等待西位出牌，可停留观看或点下一步。");
  await new Promise((resolve) => window.setTimeout(resolve, 20));

  expect(planRequestCount()).toBe(1);
});

it("uses the shorter lead pause after a trick clears for an AI first play", async () => {
  (globalThis as { __GUANDAN_AI_LEAD_PAUSE_MS__?: number }).__GUANDAN_AI_LEAD_PAUSE_MS__ = 50;
  const leadRoom = createRoom({
    currentTurn: 3,
    leaderSeat: 3,
    trick: { leadSeat: 3, passSeats: [], plays: [] },
  });
  const afterAiStep = createRoom({
    currentTurn: 0,
    trick: {
      leadSeat: 3,
      lastPlay: group([cardA]),
      lastPlaySeat: 3,
      passSeats: [],
      plays: [{ seat: 3, action: "play", group: group([cardA]) }],
    },
  });
  mockFetchQueue([{ room: leadRoom }, { room: afterAiStep }, { plans: [] }]);

  render(<App />);
  fireEvent.click(screen.getAllByRole("button")[0]);

  expect(await screen.findByText("等待东方玩家首出牌")).toBeInTheDocument();
  expect(await screen.findByText("轮到你行动。")).toBeInTheDocument();
});

it("renders settlement and starts the next room with the promoted rank", async () => {
  mockFetchQueue([{ room: createRoom({ status: "finished", settlement: settlement() }) }, { room: createRoom({ rank: "K" }) }, { plans: [] }]);

  render(<App />);
  fireEvent.click(screen.getByRole("button", { name: /开房/ }));

  expect(await screen.findByText("双下")).toBeInTheDocument();
  expect(screen.getByText("升级：3，下一局打 K")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "下一局" }));

  expect(await screen.findByText("下一局开始，当前打 K。")).toBeInTheDocument();
});

it("shows finish ranking and next-round tribute in a settlement dialog", async () => {
  const finishedRoom = createRoom({
    status: "finished",
    finishOrder: [0, 3, 1, 2],
    settlement: {
      winningTeam: 0,
      outcome: "single-win",
      levelStep: 1,
      currentRank: "10",
      nextRank: "J",
      tribute: {
        status: "pending",
        items: [{ payer: 2, receiver: 0 }],
      },
    },
  });
  const nextRoom = createRoom({
    rank: "J",
    openingTribute: {
      status: "pending",
      items: [{ payer: 2, receiver: 0 }],
    },
  });
  mockFetchQueue([{ room: finishedRoom }, { room: nextRoom }]);

  render(<App />);
  fireEvent.click(screen.getAllByRole("button")[0]);

  expect(await screen.findByRole("dialog")).toHaveTextContent("恭喜南方玩家获得一游，东方玩家获得二游，西方玩家获得三游，北方玩家获得四游");
  expect(screen.getByRole("dialog")).toHaveTextContent("下局进贡：北方玩家向南方玩家进贡");

  fireEvent.click(screen.getByRole("button", { name: "进行下一局" }));

  expect(await screen.findByText("请北方玩家向南方玩家进贡。")).toBeInTheDocument();
});

it("shows only a summary after opening tribute is completed", async () => {
  const room = createRoom({
    openingTribute: {
      status: "completed",
      items: [{ payer: 2, receiver: 0 }],
      activeCard: card5,
      exchanges: [{ payer: 2, receiver: 0, tributeCard: cardA, returnCard: card5 }],
    },
  });
  mockFetchQueue([{ room }, { plans: [] }]);

  render(<App />);
  fireEvent.click(screen.getAllByRole("button")[0]);

  expect(await screen.findByLabelText("贡还牌摘要")).toHaveTextContent("北方玩家进贡黑桃A，南方玩家还贡梅花5");
  expect(screen.queryByText(/亮牌倒计时/)).not.toBeInTheDocument();
  expect(screen.queryByLabelText("梅花5 1")).not.toBeInTheDocument();
});

it("renders a manual group tray and selects a whole manual group", async () => {
  const twoClubs: Card = { id: "C2-1", kind: "suited", rank: "2", suit: "clubs", copy: 1 };
  const room = createRoom({ humanHand: [cardA, cardK, twoClubs] });
  mockFetchQueue([{ room }, { plans: [] }]);

  render(<App />);
  fireEvent.click(screen.getAllByRole("button")[0]);
  await screen.findByTestId("manual-group-tray");

  fireEvent.drop(screen.getByTestId("manual-group-dropzone"), { dataTransfer: dragData("SA-1") });
  fireEvent.drop(screen.getByTestId("manual-group-manual-1"), { dataTransfer: dragData("SK-1") });

  const manualGroup = await screen.findByTestId("manual-group-manual-1");
  expect(manualGroup).toHaveTextContent("未成型");

  fireEvent.click(manualGroup);

  expect(screen.getByTestId("manual-card-SA-1").closest(".manual-group-card")).toHaveClass("selected");
  expect(screen.getByTestId("manual-card-SK-1").closest(".manual-group-card")).toHaveClass("selected");
});

it("collapses the remaining advice sidebar with its button and Alt+H", async () => {
  mockFetchQueue([{ room: createRoom() }, { plans: [] }]);

  render(<App />);
  fireEvent.click(screen.getAllByRole("button")[0]);
  await screen.findByTestId("manual-group-tray");

  const plansColumn = screen.getByTestId("plans-column");
  expect(plansColumn).not.toHaveClass("collapsed");

  fireEvent.click(within(plansColumn).getByRole("button"));
  expect(plansColumn).toHaveClass("collapsed");

  fireEvent.keyDown(window, { key: "h", altKey: true });
  expect(plansColumn).not.toHaveClass("collapsed");
});

it("shows finished place badges and hides pending trick placeholders for finished players", async () => {
  const room = createRoom({
    currentTurn: 3,
    finishOrder: [0],
    humanHand: [],
    players: [
      { seat: 0, name: "玩家", isAI: false, handCount: 0, team: 0 },
      { seat: 1, name: "AI 1", isAI: true, handCount: 1, team: 1 },
      { seat: 2, name: "AI 2", isAI: true, handCount: 6, team: 0 },
      { seat: 3, name: "AI 3", isAI: true, handCount: 8, team: 1 },
    ],
    trick: {
      leadSeat: 1,
      lastPlay: group([card5]),
      lastPlaySeat: 1,
      passSeats: [],
      plays: [{ seat: 1, action: "play", group: group([card5]) }],
    },
  });
  mockFetchQueue([{ room }, { plans: [] }]);

  render(<App />);
  fireEvent.click(screen.getAllByRole("button")[0]);

  expect(await screen.findAllByText("一游")).toHaveLength(2);
  expect(screen.queryByText("南本轮待出")).not.toBeInTheDocument();
});

it("opens a finished-round replay with perspective, playback speed, pause and reverse controls", async () => {
  const room = createRoom({
    status: "finished",
    finishOrder: [0, 3, 1, 2],
    playHistory: [
      { seat: 0, action: "play", group: group([cardA]) },
      { seat: 3, action: "pass" },
      { seat: 2, action: "play", group: group([cardK]) },
    ],
    settlement: settlement(),
  });
  mockFetchQueue([{ room }, { plans: [] }]);

  render(<App />);
  fireEvent.click(screen.getAllByRole("button")[0]);

  const replayButton = await screen.findByRole("button", { name: "本局回顾" });
  await waitFor(() => expect(replayButton).toBeEnabled());

  fireEvent.click(replayButton);
  fireEvent.click(screen.getByRole("button", { name: "东方视角" }));

  expect(screen.getByRole("dialog", { name: "本局回顾" })).toBeInTheDocument();
  expect(screen.getByText("以东方玩家视角回顾")).toBeInTheDocument();
  expect(screen.getByText("第 1 / 3 步")).toBeInTheDocument();
  expect(screen.getByText("南方玩家出牌")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "后退" }));
  expect(screen.getByText("第 1 / 3 步")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "前进" }));
  expect(screen.getByText("第 2 / 3 步")).toBeInTheDocument();
  expect(screen.getByText("东方玩家过牌")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "加速 2x" }));
  expect(screen.getByRole("button", { name: "加速 4x" })).toBeInTheDocument();

  expect(screen.getByRole("button", { name: "播放" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "播放" }));
  expect(screen.getByRole("button", { name: "暂停" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "暂停" }));
  expect(screen.getByRole("button", { name: "播放" })).toBeInTheDocument();
});

it("shows AI hand planning as the first replay step", async () => {
  const room = createRoom({
    status: "finished",
    finishOrder: [1, 0, 3, 2],
    replayHands: {
      0: [],
      1: [cardK, cardQ],
      2: [],
      3: [],
    },
    aiPlans: {
      1: {
        seat: 1,
        name: "AI 最少手数组牌",
        score: 88,
        groups: [group([cardK, cardQ])],
      },
    },
    playHistory: [{ seat: 1, action: "play", group: group([cardK]), trickIndex: 0 }],
    settlement: settlement(),
  });
  mockFetchQueue([{ room }, { plans: [] }]);

  render(<App />);
  fireEvent.click(screen.getAllByRole("button")[0]);
  const replayButton = await screen.findByTestId("replay-button");
  await waitFor(() => expect(replayButton).toBeEnabled());

  fireEvent.click(replayButton);
  fireEvent.click(screen.getByTestId("replay-seat-button-1"));

  expect(screen.getByTestId("replay-plan-groups")).toBeInTheDocument();
  expect(screen.getByText(room.aiPlans[1]?.name ?? "")).toBeInTheDocument();
  expect(screen.getByTestId("replay-step-count")).toHaveTextContent("1 / 2");
});

it("rotates replay table to north perspective and keeps same-trick plays visible until the next trick", async () => {
  const room = createRoom({
    status: "finished",
    finishOrder: [0, 3, 1, 2],
    replayHands: {
      0: [card5],
      1: [cardA],
      2: [cardK, cardQ],
      3: [card5],
    },
    playHistory: [
      { seat: 0, action: "play", group: group([cardA]), trickIndex: 0 },
      { seat: 3, action: "play", group: group([cardK]), trickIndex: 0 },
      { seat: 2, action: "play", group: group([cardQ]), trickIndex: 1 },
    ],
    settlement: settlement(),
  });
  mockFetchQueue([{ room }, { plans: [] }]);

  render(<App />);
  fireEvent.click(screen.getAllByRole("button")[0]);
  const replayButton = await screen.findByRole("button", { name: "本局回顾" });
  await waitFor(() => expect(replayButton).toBeEnabled());

  fireEvent.click(replayButton);
  fireEvent.click(screen.getByRole("button", { name: "北方视角" }));

  const replayTable = screen.getByTestId("replay-table");
  expect(replayTable).toHaveClass("perspective-seat-2");
  expect(screen.getByText("北方玩家本步出牌后手牌")).toBeInTheDocument();
  const replayHand = screen.getByTestId("replay-perspective-hand");
  expect(within(replayHand).getByLabelText("黑桃K 1")).toBeInTheDocument();
  expect(within(replayHand).getByLabelText("黑桃Q 1")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "前进" }));
  expect(within(replayTable).getByLabelText("黑桃A 1")).toBeInTheDocument();
  expect(within(replayTable).getByLabelText("黑桃K 1")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "前进" }));
  expect(within(replayTable).queryByLabelText("黑桃A 1")).not.toBeInTheDocument();
  expect(within(replayTable).queryByLabelText("黑桃K 1")).not.toBeInTheDocument();
  expect(within(replayTable).getByLabelText("黑桃Q 1")).toBeInTheDocument();
});

it("shrinks the replay perspective hand as that player plays cards and supports wheel and keyboard controls", async () => {
  const room = createRoom({
    status: "finished",
    finishOrder: [2, 0, 3, 1],
    replayHands: {
      0: [],
      1: [],
      2: [cardK, cardQ],
      3: [],
    },
    playHistory: [
      { seat: 2, action: "play", group: group([cardK]), trickIndex: 0 },
      { seat: 0, action: "pass", trickIndex: 0 },
      { seat: 2, action: "play", group: group([cardQ]), trickIndex: 1 },
    ],
    settlement: settlement(),
  });
  mockFetchQueue([{ room }, { plans: [] }]);

  render(<App />);
  fireEvent.click(screen.getAllByRole("button")[0]);
  const replayButton = await screen.findByRole("button", { name: "本局回顾" });
  await waitFor(() => expect(replayButton).toBeEnabled());

  fireEvent.click(replayButton);
  fireEvent.click(screen.getByRole("button", { name: "北方视角" }));

  const dialog = screen.getByRole("dialog", { name: "本局回顾" });
  const replayHand = screen.getByTestId("replay-perspective-hand");
  expect(within(replayHand).getByLabelText("黑桃K 1")).toBeInTheDocument();
  expect(within(replayHand).getByLabelText("黑桃Q 1")).toBeInTheDocument();

  fireEvent.wheel(dialog, { deltaY: -100 });
  expect(dialog).toHaveStyle({ "--replay-scale": "1.1" });

  fireEvent.keyDown(window, { key: " " });
  expect(screen.getByRole("button", { name: "播放" })).toBeInTheDocument();
  fireEvent.keyDown(window, { key: "ArrowRight" });
  expect(screen.getByText("第 2 / 3 步")).toBeInTheDocument();
  expect(within(replayHand).queryByLabelText("黑桃K 1")).not.toBeInTheDocument();
  expect(within(replayHand).getByLabelText("黑桃Q 1")).toBeInTheDocument();
  fireEvent.keyDown(window, { key: "ArrowLeft" });
  expect(screen.getByText("第 1 / 3 步")).toBeInTheDocument();
});

it("plays all cards from a selected legal manual pair group", async () => {
  const spade2: Card = { id: "S2-1", kind: "suited", rank: "2", suit: "spades", copy: 1 };
  const club2: Card = { id: "C2-1", kind: "suited", rank: "2", suit: "clubs", copy: 1 };
  const room = createRoom({ humanHand: [spade2, club2, cardA] });
  const afterPlay = createRoom({ humanHand: [cardA], currentTurn: 1 });
  mockFetchQueue([{ room }, { plans: [] }, { room: afterPlay }, { plans: [] }]);

  render(<App />);
  fireEvent.click(screen.getAllByRole("button")[0]);
  await screen.findByTestId("manual-group-tray");

  fireEvent.drop(screen.getByTestId("manual-group-dropzone"), { dataTransfer: dragData("S2-1") });
  fireEvent.drop(screen.getByTestId("manual-group-manual-1"), { dataTransfer: dragData("C2-1") });

  const manualGroup = await screen.findByTestId("manual-group-manual-1");
  expect(manualGroup).toHaveTextContent("对子");
  fireEvent.click(manualGroup);
  fireEvent.click(screen.getByRole("button", { name: "出牌" }));

  await waitFor(() => {
    expect(fetch).toHaveBeenCalledWith(
      "/api/rooms/room-1/play",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ seat: 0, cardIds: ["S2-1", "C2-1"] }),
      }),
    );
  });
});

it("removes grouped cards from the original hand and keeps remaining hand sorted", async () => {
  const spade2: Card = { id: "S2-1", kind: "suited", rank: "2", suit: "spades", copy: 1 };
  const club2: Card = { id: "C2-1", kind: "suited", rank: "2", suit: "clubs", copy: 1 };
  const room = createRoom({ humanHand: [spade2, cardA, club2, cardK] });
  mockFetchQueue([{ room }, { plans: [] }]);

  render(<App />);
  fireEvent.click(screen.getAllByRole("button")[0]);
  await screen.findByTestId("manual-group-tray");

  fireEvent.drop(screen.getByTestId("manual-group-dropzone"), { dataTransfer: dragData("S2-1") });

  expect(screen.getByTestId("manual-group-manual-1")).toHaveTextContent("2");
  expect(screen.queryByTestId("hand-card-S2-1")).not.toBeInTheDocument();
  expect(screen.getAllByTestId("hand-stack").map((stack) => stack.textContent)).toEqual(["A♠", "K♠", "2♣"]);
});

it("clears manual groups when a new room starts", async () => {
  const spade2: Card = { id: "S2-1", kind: "suited", rank: "2", suit: "spades", copy: 1 };
  const firstRoom = createRoom({ humanHand: [spade2, cardA] });
  const nextRoom = createRoom({ id: "room-2", humanHand: [cardK, cardQ] });
  mockFetchQueue([{ room: firstRoom }, { plans: [] }, { room: nextRoom }, { plans: [] }]);

  render(<App />);
  fireEvent.click(screen.getAllByRole("button")[0]);
  await screen.findByTestId("manual-group-tray");
  fireEvent.drop(screen.getByTestId("manual-group-dropzone"), { dataTransfer: dragData("S2-1") });
  expect(screen.getByTestId("manual-group-manual-1")).toBeInTheDocument();

  fireEvent.click(screen.getAllByRole("button")[0]);

  expect(await screen.findByText("把牌拖到这里开始组牌")).toBeInTheDocument();
  expect(screen.queryByTestId("manual-group-manual-1")).not.toBeInTheDocument();
});

it("lets a card drag back from a manual group into the original hand", async () => {
  const spade2: Card = { id: "S2-1", kind: "suited", rank: "2", suit: "spades", copy: 1 };
  const room = createRoom({ humanHand: [spade2, cardA] });
  mockFetchQueue([{ room }, { plans: [] }]);

  render(<App />);
  fireEvent.click(screen.getAllByRole("button")[0]);
  await screen.findByTestId("manual-group-tray");

  fireEvent.drop(screen.getByTestId("manual-group-dropzone"), { dataTransfer: dragData("S2-1") });
  expect(screen.queryByTestId("hand-card-S2-1")).not.toBeInTheDocument();

  fireEvent.drop(screen.getByTestId("player-hand"), { dataTransfer: dragData("S2-1") });

  expect(screen.queryByTestId("manual-group-manual-1")).not.toBeInTheDocument();
  expect(screen.getByTestId("hand-card-S2-1")).toBeInTheDocument();
});

it("decomposes a whole manual full-house group when dragged back into the original hand", async () => {
  const cards: Card[] = [
    { id: "SK-1", kind: "suited", rank: "K", suit: "spades", copy: 1 },
    { id: "CK-1", kind: "suited", rank: "K", suit: "clubs", copy: 1 },
    { id: "HK-1", kind: "suited", rank: "K", suit: "hearts", copy: 1 },
    { id: "SQ-1", kind: "suited", rank: "Q", suit: "spades", copy: 1 },
    { id: "CQ-1", kind: "suited", rank: "Q", suit: "clubs", copy: 1 },
    cardA,
  ];
  const room = createRoom({ humanHand: cards });
  mockFetchQueue([{ room }, { plans: [] }]);

  render(<App />);
  fireEvent.click(screen.getAllByRole("button")[0]);
  await screen.findByTestId("manual-group-tray");

  fireEvent.drop(screen.getByTestId("manual-group-dropzone"), { dataTransfer: dragData("SK-1") });
  for (const cardId of ["CK-1", "HK-1", "SQ-1", "CQ-1"]) {
    fireEvent.drop(screen.getByTestId("manual-group-manual-1"), { dataTransfer: dragData(cardId) });
  }

  const manualGroup = await screen.findByTestId("manual-group-manual-1");
  expect(screen.getAllByTestId(/^manual-card-/)).toHaveLength(5);
  for (const cardId of ["SK-1", "CK-1", "HK-1", "SQ-1", "CQ-1"]) {
    expect(screen.queryByTestId(`hand-card-${cardId}`)).not.toBeInTheDocument();
  }

  const transfer = dragData();
  fireEvent.dragStart(manualGroup, { dataTransfer: transfer });
  fireEvent.drop(screen.getByTestId("player-hand"), { dataTransfer: transfer });

  expect(screen.queryByTestId("manual-group-manual-1")).not.toBeInTheDocument();
  for (const cardId of ["SK-1", "CK-1", "HK-1", "SQ-1", "CQ-1"]) {
    expect(screen.getByTestId(`hand-card-${cardId}`)).toBeInTheDocument();
  }
});

it("drags all selected cards into one manual straight group", async () => {
  const spade2: Card = { id: "S2-1", kind: "suited", rank: "2", suit: "spades", copy: 1 };
  const club3: Card = { id: "C3-1", kind: "suited", rank: "3", suit: "clubs", copy: 1 };
  const spade4: Card = { id: "S4-1", kind: "suited", rank: "4", suit: "spades", copy: 1 };
  const diamond5: Card = { id: "D5-1", kind: "suited", rank: "5", suit: "diamonds", copy: 1 };
  const room = createRoom({ humanHand: [cardA, spade2, club3, spade4, diamond5, cardK] });
  mockFetchQueue([{ room }, { plans: [] }]);

  render(<App />);
  fireEvent.click(screen.getAllByRole("button")[0]);
  await screen.findByTestId("manual-group-tray");

  for (const cardId of ["SA-1", "S2-1", "C3-1", "S4-1", "D5-1"]) {
    fireEvent.click(screen.getByTestId(`hand-card-${cardId}`));
  }

  const transfer = dragData();
  fireEvent.dragStart(screen.getByTestId("hand-card-D5-1"), { dataTransfer: transfer });
  fireEvent.drop(screen.getByTestId("manual-group-dropzone"), { dataTransfer: transfer });

  const manualGroup = await screen.findByTestId("manual-group-manual-1");
  expect(manualGroup).toHaveTextContent("顺子");
  expect(screen.getAllByTestId(/^manual-card-/)).toHaveLength(5);
  expect(screen.queryByTestId("hand-card-SA-1")).not.toBeInTheDocument();
  expect(screen.queryByTestId("hand-card-D5-1")).not.toBeInTheDocument();
});

function createRoom(overrides: Partial<PublicRoom> = {}): PublicRoom {
  return {
    id: "room-1",
    rank: "10",
    players: [
      { seat: 0, name: "玩家", isAI: false, handCount: 3, team: 0 },
      { seat: 1, name: "AI 1", isAI: true, handCount: 27, team: 1 },
      { seat: 2, name: "AI 2", isAI: true, handCount: 27, team: 0 },
      { seat: 3, name: "AI 3", isAI: true, handCount: 27, team: 1 },
    ],
    currentTurn: 0,
    leaderSeat: 0,
    currentTrickIndex: 0,
    trick: { leadSeat: 0, passSeats: [], plays: [] },
    finishOrder: [],
    aiPlans: {},
    playHistory: [],
    replayHands: {
      0: [cardA, cardK, cardQ],
      1: [],
      2: [],
      3: [],
    },
    status: "playing",
    actionLog: ["房间已创建，AI 已补齐空位。"],
    humanSeat: 0,
    humanHand: [cardA, cardK, cardQ],
    announcements: [],
    ...overrides,
  };
}

function group(
  cards: Card[],
  type: NonNullable<PublicRoom["trick"]["lastPlay"]>["type"] = "single",
): NonNullable<PublicRoom["trick"]["lastPlay"]> {
  return {
    id: `${type}:${cards.map((card) => card.id).join(",")}`,
    type,
    label: "单张",
    purpose: "risk",
    cards,
    wildcards: [],
    strength: 1,
  };
}

function settlement(): PublicRoom["settlement"] {
  return {
    winningTeam: 0,
    outcome: "double-down",
    levelStep: 3,
    currentRank: "10",
    nextRank: "K",
    tribute: {
      status: "pending",
      items: [
        { payer: 1, receiver: 0 },
        { payer: 3, receiver: 2 },
      ],
    },
  };
}

function mockFetchQueue(bodies: unknown[]) {
  const queue = [...bodies];
  vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
    const body = queue.shift();
    if (body === undefined) {
      throw new Error("Unexpected fetch call");
    }

    return {
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => body,
    } as Response;
  });
}

function planRequestCount(): number {
  return vi.mocked(fetch).mock.calls.filter(([url]) => url === "/api/plans").length;
}

function dragData(cardId = ""): DataTransfer {
  const data = new Map<string, string>();
  return {
    setData: (type: string, value: string) => data.set(type, value),
    getData: (type: string) => (type === "text/plain" && cardId !== "" ? cardId : data.get(type) ?? ""),
    clearData: () => data.clear(),
    dropEffect: "move",
    effectAllowed: "all",
    files: [] as unknown as FileList,
    items: [] as unknown as DataTransferItemList,
    types: ["text/plain"],
    setDragImage: () => undefined,
  };
}
