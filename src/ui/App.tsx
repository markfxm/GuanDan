import { Bot, CirclePlay, DoorOpen, Hand, StepForward } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Bomb, Eye, EyeOff } from "lucide-react";
import { RANKS, type Card, type GameRank, type Suit } from "../engine/cards";
import type { ScoredPlan } from "../engine/scorer";
import { CardFace } from "./CardFace";
import { groupCardsForHandDisplay } from "./handLayout";
import { createGameRoom, generatePlans, passRoomTurn, playRoomCards, runRoomAiStep, submitOpeningTribute, type PublicRoom, type Seat, type TrickPlay } from "./api";
import { draggedCardIds, ManualGroupTray, setDraggedCardIds } from "./ManualGroupTray";
import {
  addCardToManualGroup,
  classifyManualGroups,
  createManualGroup,
  removeCardFromManualGroups,
  removeMissingCardsFromManualGroups,
  ungroupedCards,
  type ManualCardGroup,
} from "./manualGrouping";
import { PlanView } from "./PlanView";

const DEFAULT_RANK: GameRank = "2";
const AI_PAUSE_MS = 4_000;
const AI_LEAD_PAUSE_MS = 3_000;
const SEAT_NAMES: Record<Seat, string> = { 0: "南", 1: "西", 2: "北", 3: "东" };
const PLAYER_NAMES: Record<Seat, string> = { 0: "南方玩家", 1: "西方玩家", 2: "北方玩家", 3: "东方玩家" };
const OUTCOME_LABELS = {
  "double-down": "双下",
  "single-down": "单下",
  "single-win": "单胜",
} as const;

type ReplayStep =
  | { kind: "plan"; plan: NonNullable<PublicRoom["aiPlans"][Seat]> }
  | { kind: "play"; play: TrickPlay; playIndex: number };

type BombEffectState = {
  seat: Seat;
  eventId: string;
};

export function App() {
  const [gameRank, setGameRank] = useState<GameRank>(DEFAULT_RANK);
  const [room, setRoom] = useState<PublicRoom>();
  const [selectedCardIds, setSelectedCardIds] = useState<string[]>([]);
  const [plans, setPlans] = useState<ScoredPlan[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState<string>();
  const [status, setStatus] = useState("开房后 AI 会自动补齐空位。");
  const [loading, setLoading] = useState(false);
  const [countdownSeconds, setCountdownSeconds] = useState<number>();
  const [tributeCountdownSeconds, setTributeCountdownSeconds] = useState<number>();
  const [showSettlementDialog, setShowSettlementDialog] = useState(false);
  const [manualGroups, setManualGroups] = useState<ManualCardGroup[]>([]);
  const [plansCollapsed, setPlansCollapsed] = useState(false);
  const [showReplayDialog, setShowReplayDialog] = useState(false);
  const [replaySeat, setReplaySeat] = useState<Seat>();
  const [replayStep, setReplayStep] = useState(0);
  const [replayPlaying, setReplayPlaying] = useState(true);
  const [replaySpeed, setReplaySpeed] = useState(1);
  const [replayScale, setReplayScale] = useState(1);
  const [bombEffect, setBombEffect] = useState<BombEffectState>();
  const bombEffectTimerRef = useRef<number>();

  const visibleHumanHand = useMemo(() => ungroupedCards(room?.humanHand ?? [], manualGroups), [room?.humanHand, manualGroups]);
  const groupedHand = useMemo(() => groupCardsForHandDisplay(visibleHumanHand, gameRank), [visibleHumanHand, gameRank]);
  const groupedManualGroups = useMemo(() => classifyManualGroups(manualGroups, room?.humanHand ?? [], gameRank), [manualGroups, room?.humanHand, gameRank]);
  const selectedPlan = useMemo(() => plans.find((plan) => plan.id === selectedPlanId) ?? plans[0], [plans, selectedPlanId]);
  const humanHandPlanKey = room?.humanHand.map((card) => card.id).sort().join("|") ?? "";
  const tributePending = room?.openingTribute?.status === "pending";
  const tributeRevealBlocking = false;
  const roomReadyForPlay = !tributePending && !tributeRevealBlocking;
  const humanTributeTurn = tributePending && room?.openingTribute?.activeSeat === 0 && !tributeRevealBlocking;
  const humanTurn = room?.currentTurn === 0 && room.status === "playing" && roomReadyForPlay;
  const aiTurn = room !== undefined && room.status === "playing" && roomReadyForPlay && room.currentTurn !== 0 && room.players.find((player) => player.seat === room.currentTurn)?.isAI === true;
  const replayAvailable = room !== undefined && room.status === "finished" && replayStepCount(room) > 0;

  const applyRealtimeRoomUpdate = useCallback((previousRoom: PublicRoom, nextRoom: PublicRoom) => {
    const nextBombEffect = detectNewBombPlay(previousRoom, nextRoom);
    setRoom(nextRoom);
    if (nextBombEffect === undefined) {
      return;
    }

    if (bombEffectTimerRef.current !== undefined) {
      window.clearTimeout(bombEffectTimerRef.current);
    }
    setBombEffect(nextBombEffect);
    bombEffectTimerRef.current = window.setTimeout(() => {
      setBombEffect(undefined);
      bombEffectTimerRef.current = undefined;
    }, bombEffectDurationMs());
  }, []);

  useEffect(() => {
    if (room === undefined) {
      setPlans([]);
      setManualGroups([]);
      return;
    }

    if (!humanTurn) {
      return;
    }

    generatePlans(room.humanHand, room.rank)
      .then((nextPlans) => {
        setPlans(nextPlans);
        setSelectedPlanId(nextPlans[0]?.id);
      })
      .catch(() => setPlans([]));
  }, [humanHandPlanKey, humanTurn, room?.id, room?.rank]);

  useEffect(() => {
    setManualGroups([]);
    setSelectedCardIds([]);
    setShowReplayDialog(false);
    setReplaySeat(undefined);
    setReplayStep(0);
    setReplayPlaying(true);
    setReplaySpeed(1);
    setReplayScale(1);
    setBombEffect(undefined);
    if (bombEffectTimerRef.current !== undefined) {
      window.clearTimeout(bombEffectTimerRef.current);
      bombEffectTimerRef.current = undefined;
    }
  }, [room?.id]);

  useEffect(() => {
    if (room === undefined) {
      setManualGroups([]);
      return;
    }

    setManualGroups((current) => removeMissingCardsFromManualGroups(current, room.humanHand));
  }, [room?.humanHand, room]);

  const handleNextStep = useCallback(async () => {
    if (room === undefined || room.status !== "playing" || room.currentTurn === 0) {
      return;
    }

    await runAction("AI 正在出牌...", async () => {
      const nextRoom = await runRoomAiStep(room.id);
      applyRealtimeRoomUpdate(room, nextRoom);
      setStatus(statusForRoom(nextRoom));
      setShowSettlementDialog(nextRoom.status === "finished");
    });
  }, [applyRealtimeRoomUpdate, room]);

  const handleOpeningTributeStep = useCallback(
    async (cardIds: string[] = []) => {
      if (room === undefined) {
        return;
      }

      await runAction("正在处理贡还牌...", async () => {
        const nextRoom = await submitOpeningTribute(room.id, cardIds.length > 0 ? 0 : undefined, cardIds);
        setRoom(nextRoom);
        setSelectedCardIds([]);
        setStatus(openingTributeText(nextRoom) ?? statusForRoom(nextRoom));
      });
    },
    [room],
  );

  useEffect(() => {
    if (!aiTurn || loading) {
      setCountdownSeconds(undefined);
      return undefined;
    }

    const delayMs = aiDelayMs(room);
    const startedAt = Date.now();
    setCountdownSeconds(Math.ceil(delayMs / 1000));

    const countdown = window.setInterval(() => {
      const remainingMs = Math.max(0, delayMs - (Date.now() - startedAt));
      setCountdownSeconds(Math.ceil(remainingMs / 1000));
    }, 250);

    const timer = window.setTimeout(() => {
      void handleNextStep();
    }, delayMs);

    return () => {
      window.clearInterval(countdown);
      window.clearTimeout(timer);
    };
  }, [aiTurn, handleNextStep, loading, room]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!event.altKey || event.key.toLowerCase() !== "h") {
        return;
      }

      event.preventDefault();
      setPlansCollapsed((collapsed) => !collapsed);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    const tribute = room?.openingTribute;
    if (loading || tribute?.status !== "pending" || tribute.activeSeat === 0) {
      return;
    }

    void handleOpeningTributeStep();
  }, [handleOpeningTributeStep, loading, room?.openingTribute]);

  useEffect(() => {
    if (!showReplayDialog || replaySeat === undefined || !replayPlaying || room === undefined || replayStepCount(room) <= 1) {
      return undefined;
    }

    const timer = window.setInterval(() => {
      setReplayStep((current) => Math.min(current + 1, replayStepCount(room) - 1));
    }, Math.max(450, 1600 / replaySpeed));

    return () => window.clearInterval(timer);
  }, [replayPlaying, replaySeat, replaySpeed, room, showReplayDialog]);

  useEffect(() => {
    if (room !== undefined && replayStep >= replayStepCount(room) - 1) {
      setReplayPlaying(false);
    }
  }, [replayStep, room]);

  useEffect(() => {
    if (!showReplayDialog || room === undefined) {
      return undefined;
    }

    const handleReplayKeyDown = (event: KeyboardEvent) => {
      if (event.key === " ") {
        event.preventDefault();
        setReplayPlaying((playing) => !playing);
        return;
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();
        setReplayPlaying(false);
        setReplayStep((current) => Math.min(replayStepCount(room) - 1, current + 1));
        return;
      }

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        setReplayPlaying(false);
        setReplayStep((current) => Math.max(0, current - 1));
      }
    };

    window.addEventListener("keydown", handleReplayKeyDown);
    return () => window.removeEventListener("keydown", handleReplayKeyDown);
  }, [room, showReplayDialog]);

  async function handleCreateRoom() {
    await runAction("正在创建房间...", async () => {
      const nextRoom = await createGameRoom(gameRank);
      setRoom(nextRoom);
      setGameRank(nextRoom.rank);
      setSelectedCardIds([]);
      setShowSettlementDialog(nextRoom.status === "finished");
      setStatus(openingTributeText(nextRoom) ?? "房间已创建，轮到你先出。");
    });
  }

  async function handleNextRoom() {
    const nextRank = room?.settlement?.nextRank ?? gameRank;
    const pendingTributeItems = room?.settlement?.tribute.status === "pending" ? room.settlement.tribute.items : [];
    setGameRank(nextRank);
    await runAction("正在创建下一局...", async () => {
      const nextRoom = await createGameRoom(nextRank, pendingTributeItems);
      setRoom(nextRoom);
      setSelectedCardIds([]);
      setShowSettlementDialog(false);
      setStatus(openingTributeText(nextRoom) ?? `下一局开始，当前打 ${nextRank}。`);
    });
  }

  async function handlePlay() {
    if (room === undefined || selectedCardIds.length === 0) {
      return;
    }

    await runAction("正在出牌...", async () => {
      const nextRoom = await playRoomCards(room.id, selectedCardIds);
      applyRealtimeRoomUpdate(room, nextRoom);
      setSelectedCardIds([]);
      setStatus(statusForRoom(nextRoom));
      setShowSettlementDialog(nextRoom.status === "finished");
    });
  }

  async function handlePass() {
    if (room === undefined) {
      return;
    }

    await runAction("正在过牌...", async () => {
      const nextRoom = await passRoomTurn(room.id);
      applyRealtimeRoomUpdate(room, nextRoom);
      setSelectedCardIds([]);
      setStatus(statusForRoom(nextRoom));
      setShowSettlementDialog(nextRoom.status === "finished");
    });
  }

  async function runAction(pendingStatus: string, action: () => Promise<void>) {
    setLoading(true);
    setStatus(pendingStatus);

    try {
      await action();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "操作失败。");
    } finally {
      setLoading(false);
    }
  }

  function toggleCard(card: Card) {
    setSelectedCardIds((current) =>
      current.includes(card.id) ? current.filter((id) => id !== card.id) : [...current, card.id],
    );
  }

  function cardsByIds(cardIds: string[]): Card[] {
    const hand = room?.humanHand ?? [];
    return cardIds.map((cardId) => hand.find((card) => card.id === cardId)).filter((card): card is Card => card !== undefined);
  }

  function handleDropToNewGroup(cardIds: string[]) {
    const cards = cardsByIds(cardIds);
    if (cards.length === 0) {
      return;
    }

    setManualGroups((current) => {
      const nextGroupId = `manual-${current.length + 1}`;
      const cleared = cards.reduce((groups, card) => removeCardFromManualGroups(groups, card.id), current);
      return [...cleared, { ...createManualGroup(cards[0], nextGroupId), cardIds: cards.map((card) => card.id) }];
    });
    setSelectedCardIds((current) => current.filter((id) => !cards.some((card) => card.id === id)));
  }

  function handleDropToGroup(groupId: string, cardIds: string[]) {
    const cards = cardsByIds(cardIds);
    if (cards.length === 0) {
      return;
    }

    setManualGroups((current) => cards.reduce((groups, card) => addCardToManualGroup(groups, groupId, card), current));
    setSelectedCardIds((current) => current.filter((id) => !cards.some((card) => card.id === id)));
  }

  function handleManualGroupClick(cardIds: string[]) {
    const allSelected = cardIds.every((cardId) => selectedCardIds.includes(cardId));
    setSelectedCardIds(allSelected ? selectedCardIds.filter((cardId) => !cardIds.includes(cardId)) : cardIds);
  }

  function handleDropBackToHand(cardIds: string[]) {
    setManualGroups((current) => cardIds.reduce((groups, cardId) => removeCardFromManualGroups(groups, cardId), current));
    setSelectedCardIds((current) => current.filter((id) => !cardIds.includes(id)));
  }

  return (
    <main className="app-shell game-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">Local Room Prototype</p>
          <h1>掼蛋牌桌</h1>
        </div>
        <div className="header-status">
          <p className="status-line">{status}</p>
        </div>
      </header>

      <div className={`game-grid${plansCollapsed ? " plans-collapsed" : ""}`}>
        <section className="workspace-column table-column" aria-labelledby="table-title">
          <div className="column-heading">
            <div>
              <p className="eyebrow">Room</p>
              <h2 id="table-title">本机房间</h2>
            </div>
            <div className="toolbar-row compact-toolbar">
              {(countdownSeconds !== undefined || tributeCountdownSeconds !== undefined) && (
                <span className="turn-countdown room-countdown">
                  倒计时 {tributeCountdownSeconds ?? countdownSeconds} 秒
                </span>
              )}
              <select
                aria-label="当前级牌"
                value={gameRank}
                onChange={(event) => setGameRank(event.target.value as GameRank)}
                disabled={room !== undefined && room.status === "playing"}
              >
              {RANKS.map((rank) => (
                  <option key={rank} value={rank}>
                    {rank}
                  </option>
                ))}
              </select>
              <button type="button" onClick={handleCreateRoom} disabled={loading}>
                <DoorOpen aria-hidden="true" size={18} />
                开房
              </button>
              <button
                className={`replay-button${replayAvailable ? " ready" : ""}`}
                data-testid="replay-button"
                type="button"
                onClick={() => {
                  setReplayStep(0);
                  setReplaySeat(undefined);
                  setReplayPlaying(true);
                  setReplayScale(1);
                  setShowReplayDialog(true);
                }}
                disabled={!replayAvailable}
              >
                本局回顾
              </button>
            </div>
          </div>

          {room === undefined ? (
            <div className="empty-state">点击开房后，系统会发牌并用 AI 补齐西、北、东三个座位。</div>
          ) : (
            <div className="table-surface">
              {room.players.map((player) => (
                <div className={`seat-panel seat-${player.seat}${room.currentTurn === player.seat ? " active" : ""}`} key={player.seat}>
                  <span className="seat-name">
                    {SEAT_NAMES[player.seat]} · {player.name}
                  </span>
                  <span className="seat-count">{player.handCount} 张</span>
                  <LowCardFlag count={player.handCount} seat={player.seat} />
                  <FinishBadge finishOrder={room.finishOrder} seat={player.seat} />
                  {player.isAI ? <Bot aria-label="AI" size={16} /> : <Hand aria-label="玩家" size={16} />}
                </div>
              ))}

              {bombEffect !== undefined && <BombEffect effect={bombEffect} />}

              <TrickBoard room={room} />
            </div>
          )}

          {room !== undefined && (
            <>
              <OpeningTributePanel room={room} countdownSeconds={tributeCountdownSeconds} />

              <div className="action-row">
                {humanTributeTurn && (
                  <button className="primary-button" type="button" onClick={() => void handleOpeningTributeStep(selectedCardIds)} disabled={loading || selectedCardIds.length !== 1}>
                    {room.openingTribute?.phase === "return" ? "还贡" : "进贡"}
                  </button>
                )}
                <button className="primary-button" type="button" onClick={handlePlay} disabled={loading || !humanTurn || selectedCardIds.length === 0}>
                  <CirclePlay aria-hidden="true" size={18} />
                  出牌
                </button>
                <button type="button" onClick={handlePass} disabled={loading || !humanTurn || room.trick.lastPlay === undefined}>
                  过牌
                </button>
                <button type="button" onClick={handleNextStep} disabled={loading || !aiTurn}>
                  <StepForward aria-hidden="true" size={18} />
                  下一步
                </button>
              </div>

              <ManualGroupTray
                gameRank={room.rank}
                groups={groupedManualGroups}
                selectedCardIds={selectedCardIds}
                onDropToNewGroup={handleDropToNewGroup}
                onDropToGroup={handleDropToGroup}
                onGroupClick={handleManualGroupClick}
              />

              <div
                className="player-hand hand-board"
                aria-label="玩家手牌"
                data-testid="player-hand"
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  const cardIds = draggedCardIds(event.dataTransfer);
                  if (cardIds.length > 0) {
                    handleDropBackToHand(cardIds);
                  }
                }}
              >
                {groupedHand.map((group) => (
                  <div className="hand-stack" data-testid="hand-stack" key={group.rank}>
                    {group.cards.map((card) => (
                      <button
                        className={`card-button${selectedCardIds.includes(card.id) ? " selected" : ""}`}
                        data-testid={`hand-card-${card.id}`}
                        draggable
                        key={card.id}
                        type="button"
                        onClick={() => toggleCard(card)}
                        onDragStart={(event) => setDraggedCardIds(event.dataTransfer, selectedCardIds.includes(card.id) ? selectedCardIds : [card.id])}
                      >
                        <CardFace card={card} gameRank={room.rank} />
                      </button>
                    ))}
                  </div>
                ))}
              </div>

              <div className="game-meta">
                {room.announcements.map((message) => (
                  <span key={message}>{message}</span>
                ))}
                {room.finishOrder.length > 0 && <span>出完顺序：{room.finishOrder.map((seat) => SEAT_NAMES[seat]).join("、")}</span>}
              </div>

              {room.settlement !== undefined && (
                <div className="settlement-panel">
                  <strong>{OUTCOME_LABELS[room.settlement.outcome]}</strong>
                  <span>胜方：{room.settlement.winningTeam === 0 ? "南北队" : "东西队"}</span>
                  <span>升级：{room.settlement.levelStep}，下一局打 {room.settlement.nextRank}</span>
                  <span>{tributeText(room)}</span>
                  <button type="button" onClick={handleNextRoom} disabled={loading}>
                    下一局
                  </button>
                </div>
              )}
            </>
          )}
        </section>

        <section
          className={`workspace-column plans-column collapsible-column${plansCollapsed ? " collapsed" : ""}`}
          aria-labelledby="plans-title"
          data-testid="plans-column"
        >
          <div className="column-heading">
            <div>
              <p className="eyebrow">AI Advice</p>
              <h2 id="plans-title">组牌建议</h2>
            </div>
            <button
              className="icon-button"
              type="button"
              aria-label={plansCollapsed ? "显示组牌建议" : "隐藏组牌建议"}
              title={plansCollapsed ? "显示组牌建议" : "隐藏组牌建议"}
              onClick={() => setPlansCollapsed((collapsed) => !collapsed)}
            >
              {plansCollapsed ? <Eye aria-hidden="true" size={18} /> : <EyeOff aria-hidden="true" size={18} />}
            </button>
          </div>
          {!plansCollapsed && <PlanView plans={plans} selectedPlanId={selectedPlan?.id} gameRank={gameRank} onSelectPlan={setSelectedPlanId} />}
        </section>

      </div>
      {room?.settlement !== undefined && showSettlementDialog && (
        <div className="modal-backdrop">
          <section className="settlement-dialog" role="dialog" aria-modal="true" aria-label="本局结算">
            <h2>本局结算</h2>
            <p>{finishRankingText(room)}</p>
            <p>{nextRoundTributeText(room)}</p>
            <div className="dialog-actions">
              <button className="primary-button" type="button" onClick={handleNextRoom} disabled={loading}>
                进行下一局
              </button>
              <button type="button" onClick={() => setShowSettlementDialog(false)} disabled={loading}>
                稍后再说
              </button>
            </div>
          </section>
        </div>
      )}
      {room !== undefined && showReplayDialog && (
        <ReplayDialog
          room={room}
          perspectiveSeat={replaySeat}
          stepIndex={replayStep}
          playing={replayPlaying}
          speed={replaySpeed}
          scale={replayScale}
          onSelectSeat={(seat) => {
            setReplaySeat(seat);
            setReplayStep(0);
            setReplayPlaying(true);
          }}
          onClose={() => setShowReplayDialog(false)}
          onTogglePlay={() => setReplayPlaying((playing) => !playing)}
          onPrevious={() => {
            setReplayPlaying(false);
            setReplayStep((current) => Math.max(0, current - 1));
          }}
          onNext={() => {
            setReplayPlaying(false);
            setReplayStep((current) => Math.min(replayStepCount(room) - 1, current + 1));
          }}
          onSpeedChange={() => setReplaySpeed((current) => (current >= 4 ? 1 : current * 2))}
          onScaleChange={(nextScale) => setReplayScale(nextScale)}
        />
      )}
    </main>
  );
}

function OpeningTributePanel({ room, countdownSeconds }: { room: PublicRoom; countdownSeconds?: number }) {
  const tribute = room.openingTribute;
  if (tribute === undefined || tribute.status === "none" || tribute.status === "anti-tribute") {
    return null;
  }

  if (tribute.status === "completed") {
    return (
      <section className="opening-tribute-summary" aria-label="贡还牌摘要">
        <strong>贡还完成</strong>
        <span>{openingTributeSummary(tribute.exchanges ?? [])}</span>
      </section>
    );
  }

  const item = tribute.items[tribute.activeItemIndex ?? 0] ?? tribute.items[0];
  if (item === undefined && tribute.activeCard === undefined) {
    return null;
  }

  const phaseText = tribute.phase === "return" ? "等待还贡" : "等待进贡";
  const actor = tribute.activeSeat !== undefined ? PLAYER_NAMES[tribute.activeSeat] : undefined;

  return (
    <section className="opening-tribute-panel" aria-label="贡还牌">
      <div>
        <p className="eyebrow">Opening Tribute</p>
        <strong>{phaseText}</strong>
        {item !== undefined && <span>{`${PLAYER_NAMES[item.payer]}向${PLAYER_NAMES[item.receiver]}进贡`}</span>}
        {actor !== undefined && tribute.status === "pending" && <span>当前操作：{actor}</span>}
        {countdownSeconds !== undefined && <span>亮牌倒计时：{countdownSeconds} 秒</span>}
      </div>
      {tribute.activeCard !== undefined && (
        <div className="tribute-card-show">
          <CardFace card={tribute.activeCard} gameRank={room.rank} />
          <span>{cardText(tribute.activeCard)}</span>
        </div>
      )}
    </section>
  );
}

function ReplayDialog({
  room,
  perspectiveSeat,
  stepIndex,
  playing,
  speed,
  scale,
  onSelectSeat,
  onClose,
  onTogglePlay,
  onPrevious,
  onNext,
  onSpeedChange,
  onScaleChange,
}: {
  room: PublicRoom;
  perspectiveSeat?: Seat;
  stepIndex: number;
  playing: boolean;
  speed: number;
  scale: number;
  onSelectSeat: (seat: Seat) => void;
  onClose: () => void;
  onTogglePlay: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onSpeedChange: () => void;
  onScaleChange: (scale: number) => void;
}) {
  const steps = replaySteps(room);
  const stepCount = steps.length;
  const currentStep = steps[stepIndex];
  const currentPlan = currentStep?.kind === "plan" ? currentStep.plan : undefined;
  const currentPlay = currentStep?.kind === "play" ? currentStep.play : undefined;
  const currentPlayIndex = currentStep?.kind === "play" ? currentStep.playIndex : 0;
  const visibleRoundPlays = currentStep?.kind === "play" ? replayRoundPlays(room.playHistory, currentPlayIndex) : [];
  const playBySeat = new Map<Seat, TrickPlay>();
  for (const play of visibleRoundPlays) {
    playBySeat.set(play.seat, play);
  }
  const perspectiveHand = perspectiveSeat === undefined || currentPlan !== undefined ? [] : groupCardsForHandDisplay(replayRemainingHand(room, perspectiveSeat, currentPlayIndex), room.rank);
  const perspectiveHandLabel =
    currentPlan !== undefined
      ? `${PLAYER_NAMES[currentPlan.seat]}本局组牌`
      : perspectiveSeat === undefined
      ? ""
      : `${PLAYER_NAMES[perspectiveSeat]}${currentPlay?.seat === perspectiveSeat && currentPlay.action === "play" ? "本步出牌前手牌" : "本步出牌后手牌"}`;

  return (
    <div className="modal-backdrop">
      <section
        className="replay-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="本局回顾"
        style={{ "--replay-scale": String(scale) } as CSSProperties}
        onWheel={(event) => {
          if (event.deltaY === 0) {
            return;
          }

          event.preventDefault();
          const delta = event.deltaY < 0 ? 0.1 : -0.1;
          onScaleChange(Math.min(1.4, Math.max(0.7, Math.round((scale + delta) * 10) / 10)));
        }}
      >
        <div className="replay-heading">
          <div>
            <p className="eyebrow">Round Replay</p>
            <h2>本局回顾</h2>
          </div>
          <button type="button" onClick={onClose}>
            关闭
          </button>
        </div>

        {perspectiveSeat === undefined ? (
          <div className="replay-perspective-picker">
            <strong>选择回顾视角</strong>
            <div className="replay-seat-buttons">
              {([0, 1, 2, 3] as Seat[]).map((seat) => (
                <button type="button" data-testid={`replay-seat-button-${seat}`} key={seat} onClick={() => onSelectSeat(seat)}>
                  {PLAYER_NAMES[seat].replace("玩家", "视角")}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            <div className="replay-meta">
              <strong>以{PLAYER_NAMES[perspectiveSeat]}视角回顾</strong>
              <span data-testid="replay-step-count">
                第 {Math.min(stepIndex + 1, stepCount)} / {stepCount} 步
              </span>
              {currentStep !== undefined && <span>{replayStepText(currentStep)}</span>}
            </div>

            <div className={`replay-table perspective-seat-${perspectiveSeat}`} data-testid="replay-table">
              {([0, 1, 2, 3] as Seat[]).map((seat) => (
                <div
                  className={`replay-seat replay-seat-${seat}${seat === perspectiveSeat ? " perspective" : ""}${currentStepSeat(currentStep) === seat ? " current" : ""}`}
                  data-testid={`replay-seat-${seat}`}
                  key={seat}
                >
                  <strong>{SEAT_NAMES[seat]}</strong>
                  {currentPlan?.seat === seat ? (
                    <span>组牌</span>
                  ) : playBySeat.get(seat) !== undefined ? (
                    playBySeat.get(seat)?.action === "pass" ? (
                      <span>过牌</span>
                    ) : (
                      <div className="group-cards replay-cards">
                        {playBySeat.get(seat)?.group?.cards.map((card) => (
                          <CardFace card={card} compact gameRank={room.rank} key={card.id} />
                        ))}
                      </div>
                    )
                  ) : (
                    <span>等待</span>
                  )}
                </div>
              ))}
            </div>

            <section className="replay-hand-panel" aria-label={perspectiveHandLabel}>
              <strong>{perspectiveHandLabel}</strong>
              {currentPlan !== undefined ? (
                <div className="replay-plan">
                  <div className="replay-plan-summary">
                    <strong>{currentPlan.name}</strong>
                    <span>得分 {currentPlan.score}</span>
                  </div>
                  <div className="replay-hand replay-plan-groups" data-testid="replay-plan-groups">
                    {currentPlan.groups.map((group) => (
                      <div className="group-cards replay-cards replay-plan-group" key={group.id}>
                        {group.cards.map((card) => (
                          <CardFace card={card} gameRank={room.rank} key={card.id} />
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="replay-hand" data-testid="replay-perspective-hand">
                  {perspectiveHand.map((group) => (
                    <div className="hand-stack" key={group.rank}>
                      {group.cards.map((card) => (
                        <CardFace card={card} gameRank={room.rank} key={card.id} />
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </section>

            <div className="replay-controls">
              <button type="button" onClick={onPrevious} disabled={stepIndex === 0}>
                后退
              </button>
              <button type="button" onClick={onTogglePlay}>
                {playing ? "暂停" : "播放"}
              </button>
              <button type="button" onClick={onNext} disabled={stepIndex >= stepCount - 1}>
                前进
              </button>
              <button type="button" onClick={onSpeedChange}>
                加速 {speed >= 4 ? 1 : speed * 2}x
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function openingTributeSummary(exchanges: NonNullable<PublicRoom["openingTribute"]>["exchanges"]): string {
  if (exchanges === undefined || exchanges.length === 0) {
    return "本局无贡还牌。";
  }

  return exchanges
    .map((exchange) => {
      const returnText = exchange.returnCard === undefined ? "尚未还贡" : `还贡${cardText(exchange.returnCard)}`;
      return `${PLAYER_NAMES[exchange.payer]}进贡${cardText(exchange.tributeCard)}，${PLAYER_NAMES[exchange.receiver]}${returnText}`;
    })
    .join("；");
}

function TrickBoard({ room }: { room: PublicRoom }) {
  const playBySeat = new Map<Seat, TrickPlay>();
  for (const play of room.trick.plays) {
    playBySeat.set(play.seat, play);
  }

  return (
    <div className="trick-panel trick-round">
      <p className="eyebrow">Current Trick</p>
      {room.trick.plays.length === 0 ? (
        <strong>等待{PLAYER_NAMES[room.currentTurn]}首出牌</strong>
      ) : (
        <div className="round-play-grid">
          {([0, 1, 2, 3] as Seat[]).map((seat) => (
            <RoundPlay key={seat} play={playBySeat.get(seat)} room={room} seat={seat} />
          ))}
        </div>
      )}
    </div>
  );
}

function RoundPlay({ play, room, seat }: { play?: TrickPlay; room: PublicRoom; seat: Seat }) {
  if (play === undefined) {
    if (room.finishOrder.includes(seat)) {
      return (
        <div className={`round-play round-seat-${seat} finished-placeholder`}>
          <FinishBadge finishOrder={room.finishOrder} seat={seat} />
        </div>
      );
    }

    return (
      <div className={`round-play round-seat-${seat}`}>
        <strong>{SEAT_NAMES[seat]}本轮待出</strong>
      </div>
    );
  }

  if (play.action === "pass") {
    return (
      <div className={`round-play round-seat-${seat} passed`}>
        <strong>{SEAT_NAMES[seat]}过牌</strong>
      </div>
    );
  }

  return (
    <div className={`round-play round-seat-${seat}`}>
      <strong>{SEAT_NAMES[seat]}本轮出牌</strong>
      <div className="group-cards trick-cards">
        {play.group?.cards.map((card) => (
          <CardFace card={card} compact gameRank={room.rank} key={card.id} />
        ))}
      </div>
    </div>
  );
}

function FinishBadge({ finishOrder, seat }: { finishOrder: Seat[]; seat: Seat }) {
  const placeIndex = finishOrder.indexOf(seat);
  if (placeIndex === -1) {
    return null;
  }

  const labels = ["一游", "二游", "三游", "四游"];
  return <span className="finish-badge">{labels[placeIndex] ?? `${placeIndex + 1}游`}</span>;
}

function LowCardFlag({ count, seat }: { count: number; seat: Seat }) {
  const [displayCount, setDisplayCount] = useState<number | undefined>(count >= 1 && count <= 9 ? count : undefined);
  const [lowering, setLowering] = useState(false);

  useEffect(() => {
    if (count >= 1 && count <= 9) {
      setDisplayCount(count);
      setLowering(false);
      return undefined;
    }

    if (count === 0 && displayCount !== undefined) {
      setLowering(true);
      const timer = window.setTimeout(() => {
        setDisplayCount(undefined);
        setLowering(false);
      }, flagLowerDurationMs());
      return () => window.clearTimeout(timer);
    }

    setDisplayCount(undefined);
    setLowering(false);
    return undefined;
  }, [count]);

  if (displayCount === undefined) {
    return null;
  }

  return (
    <div className={`low-card-flag low-card-flag-${seat}${lowering ? " lowering" : ""}`} data-testid={`low-card-flag-${seat}`} role="status">
      <span className="low-card-flag-pole" aria-hidden="true" />
      <span className="low-card-flag-cloth">还剩下 {displayCount} 张了</span>
    </div>
  );
}

function BombEffect({ effect }: { effect: BombEffectState }) {
  return (
    <div
      aria-label={`${PLAYER_NAMES[effect.seat]}炸弹动画`}
      className={`bomb-effect bomb-effect-seat-${effect.seat}`}
      data-testid="bomb-effect"
      key={effect.eventId}
    >
      <span className="bomb-effect-flash" aria-hidden="true" />
      <span className="bomb-effect-core" aria-hidden="true"><Bomb size={34} strokeWidth={2.5} /></span>
      <strong>轰！</strong>
      <span className="bomb-effect-smoke smoke-one" aria-hidden="true" />
      <span className="bomb-effect-smoke smoke-two" aria-hidden="true" />
      <span className="bomb-effect-smoke smoke-three" aria-hidden="true" />
    </div>
  );
}

function detectNewBombPlay(previousRoom: PublicRoom, nextRoom: PublicRoom): BombEffectState | undefined {
  if (previousRoom.id !== nextRoom.id || nextRoom.playHistory.length <= previousRoom.playHistory.length) {
    return undefined;
  }

  const newPlays = nextRoom.playHistory.slice(previousRoom.playHistory.length);
  for (let index = newPlays.length - 1; index >= 0; index -= 1) {
    const play = newPlays[index];
    const type = play?.group?.type;
    if (play?.action !== "play" || (type !== "bomb" && type !== "joker-bomb" && type !== "straight-flush")) {
      continue;
    }

    return {
      seat: play.seat,
      eventId: `${nextRoom.id}:${previousRoom.playHistory.length + index}:${play.group?.id ?? type}`,
    };
  }

  return undefined;
}

function bombEffectDurationMs(): number {
  const configured = (globalThis as { __GUANDAN_BOMB_EFFECT_MS__?: number }).__GUANDAN_BOMB_EFFECT_MS__;
  return typeof configured === "number" && Number.isFinite(configured) ? configured : 2_000;
}

function flagLowerDurationMs(): number {
  const configured = (globalThis as { __GUANDAN_FLAG_LOWER_MS__?: number }).__GUANDAN_FLAG_LOWER_MS__;
  return typeof configured === "number" && Number.isFinite(configured) ? configured : 260;
}

function statusForRoom(room: PublicRoom): string {
  if (room.status === "finished") {
    return "本局结束。";
  }

  if (room.currentTurn === 0) {
    return "轮到你行动。";
  }

  if (isLeadTurn(room)) {
    return `等待${PLAYER_NAMES[room.currentTurn]}首出牌`;
  }

  return `等待${SEAT_NAMES[room.currentTurn]}位出牌，可停留观看或点下一步。`;
}

function aiPauseMs(): number {
  const configured = (globalThis as { __GUANDAN_AI_PAUSE_MS__?: number }).__GUANDAN_AI_PAUSE_MS__;
  return typeof configured === "number" && Number.isFinite(configured) ? configured : AI_PAUSE_MS;
}

function aiLeadPauseMs(): number {
  const configured = (globalThis as { __GUANDAN_AI_LEAD_PAUSE_MS__?: number }).__GUANDAN_AI_LEAD_PAUSE_MS__;
  return typeof configured === "number" && Number.isFinite(configured) ? configured : AI_LEAD_PAUSE_MS;
}

function aiDelayMs(room: PublicRoom | undefined): number {
  return room !== undefined && isLeadTurn(room) ? aiLeadPauseMs() : aiPauseMs();
}

function isLeadTurn(room: PublicRoom): boolean {
  return room.trick.plays.length === 0 && room.trick.lastPlay === undefined;
}

function finishRankingText(room: PublicRoom): string {
  const placeNames = ["一游", "二游", "三游", "四游"];
  return `恭喜${room.finishOrder.map((seat, index) => `${PLAYER_NAMES[seat]}获得${placeNames[index]}`).join("，")}。`;
}

function nextRoundTributeText(room: PublicRoom): string {
  const tribute = room.settlement?.tribute;
  if (tribute === undefined || tribute.status === "none" || tribute.items.length === 0) {
    return "下局无需进贡。";
  }

  return `下局进贡：${tribute.items.map((item) => `${PLAYER_NAMES[item.payer]}向${PLAYER_NAMES[item.receiver]}进贡`).join("；")}。`;
}

function openingTributeText(room: PublicRoom): string | undefined {
  const tribute = room.openingTribute;
  if (tribute === undefined || tribute.status === "none") {
    return undefined;
  }

  if (tribute.status === "anti-tribute") {
    return tribute.reason ?? "抗贡成立。";
  }

  if (tribute.status === "completed" && tribute.exchanges !== undefined) {
    return `贡还完成：${tribute.exchanges
      .map(
        (exchange) =>
          `${PLAYER_NAMES[exchange.payer]}进贡${cardText(exchange.tributeCard)}，${PLAYER_NAMES[exchange.receiver]}还贡${cardText(exchange.returnCard)}`,
      )
      .join("；")}。`;
  }

  return `请${tribute.items.map((item) => `${PLAYER_NAMES[item.payer]}向${PLAYER_NAMES[item.receiver]}进贡`).join("，")}。`;
}

function cardText(card: Card): string {
  if (card.kind === "joker") {
    return card.rank === "BJ" ? "大王" : "小王";
  }

  const suitNames: Record<Suit, string> = {
    spades: "黑桃",
    clubs: "梅花",
    hearts: "红桃",
    diamonds: "方片",
  };

  return `${suitNames[card.suit]}${card.rank}`;
}

function replayPlans(room: PublicRoom): NonNullable<PublicRoom["aiPlans"][Seat]>[] {
  const aiPlans = room.aiPlans ?? {};
  return ([0, 1, 2, 3] as Seat[])
    .map((seat) => aiPlans[seat])
    .filter((plan): plan is NonNullable<PublicRoom["aiPlans"][Seat]> => plan !== undefined);
}

function replaySteps(room: PublicRoom): ReplayStep[] {
  return [
    ...replayPlans(room).map((plan) => ({ kind: "plan" as const, plan })),
    ...room.playHistory.map((play, playIndex) => ({ kind: "play" as const, play, playIndex })),
  ];
}

function replayStepCount(room: PublicRoom): number {
  return replaySteps(room).length;
}

function replayStepText(step: ReplayStep): string {
  if (step.kind === "plan") {
    return `${PLAYER_NAMES[step.plan.seat]}组牌`;
  }

  return replayActionText(step.play);
}

function currentStepSeat(step: ReplayStep | undefined): Seat | undefined {
  if (step === undefined) {
    return undefined;
  }

  return step.kind === "plan" ? step.plan.seat : step.play.seat;
}

function replayActionText(play: TrickPlay): string {
  return `${PLAYER_NAMES[play.seat]}${play.action === "pass" ? "过牌" : "出牌"}`;
}

function replayRoundPlays(playHistory: TrickPlay[], stepIndex: number): TrickPlay[] {
  const currentPlay = playHistory[stepIndex];
  if (currentPlay === undefined) {
    return [];
  }

  const currentTrickIndex = currentPlay.trickIndex ?? 0;
  return playHistory.slice(0, stepIndex + 1).filter((play) => (play.trickIndex ?? 0) === currentTrickIndex);
}

function replayRemainingHand(room: PublicRoom, seat: Seat, stepIndex: number): Card[] {
  const playedIds = new Set<string>();
  for (const play of room.playHistory.slice(0, stepIndex)) {
    if (play.seat !== seat || play.action !== "play") {
      continue;
    }

    for (const card of play.group?.cards ?? []) {
      playedIds.add(card.id);
    }
  }

  return (room.replayHands[seat] ?? []).filter((card) => !playedIds.has(card.id));
}

function tributeText(room: PublicRoom): string {
  if (room.settlement === undefined) {
    return "";
  }

  const { tribute } = room.settlement;
  if (tribute.status === "anti-tribute") {
    return tribute.reason ?? "抗贡成立。";
  }

  if (tribute.status === "none" || tribute.items.length === 0) {
    return "无需进贡。";
  }

  return `进贡：${tribute.items.map((item) => `${SEAT_NAMES[item.payer]}贡给${SEAT_NAMES[item.receiver]}`).join("；")}`;
}
