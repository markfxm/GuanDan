import type { GameRank } from "../engine/cards";
import { CardFace } from "./CardFace";
import type { ClassifiedManualGroup } from "./manualGrouping";

type ManualGroupTrayProps = {
  groups: ClassifiedManualGroup[];
  gameRank: GameRank;
  selectedCardIds: string[];
  onDropToNewGroup: (cardIds: string[]) => void;
  onDropToGroup: (groupId: string, cardIds: string[]) => void;
  onGroupClick: (cardIds: string[]) => void;
};

export function ManualGroupTray({
  groups,
  gameRank,
  selectedCardIds,
  onDropToNewGroup,
  onDropToGroup,
  onGroupClick,
}: ManualGroupTrayProps) {
  return (
    <section className="manual-group-tray" aria-label="我的组牌" data-testid="manual-group-tray">
      <div className="manual-group-heading">
        <strong>我的组牌</strong>
        <span>拖牌形成竖排牌型，点击整组选中</span>
      </div>
      <div
        className="manual-group-dropzone"
        data-testid="manual-group-dropzone"
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          const cardIds = draggedCardIds(event.dataTransfer);
          if (cardIds.length > 0) {
            onDropToNewGroup(cardIds);
          }
        }}
      >
        {groups.length === 0 && <span className="manual-group-empty">把牌拖到这里开始组牌</span>}
        {groups.map((group) => {
          const selected = group.cardIds.length > 0 && group.cardIds.every((cardId) => selectedCardIds.includes(cardId));

          return (
            <button
              className={`manual-group-card${group.legalGroup === undefined ? " invalid" : " valid"}${selected ? " selected" : ""}`}
              data-testid={`manual-group-${group.id}`}
              draggable
              key={group.id}
              type="button"
              onClick={() => onGroupClick(group.cardIds)}
              onDragStart={(event) => setDraggedCardIds(event.dataTransfer, group.cardIds)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                event.stopPropagation();
                const cardIds = draggedCardIds(event.dataTransfer);
                if (cardIds.length > 0) {
                  onDropToGroup(group.id, cardIds);
                }
              }}
            >
              <span className="manual-group-label">{group.label}</span>
              <span className="manual-group-cards">
                {group.cards.map((card) => (
                  <span
                    className="manual-group-card-face"
                    data-testid={`manual-card-${card.id}`}
                    draggable
                    key={card.id}
                    onDragStart={(event) => setDraggedCardIds(event.dataTransfer, [card.id])}
                  >
                    <CardFace card={card} gameRank={gameRank} />
                  </span>
                ))}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

export function setDraggedCardIds(dataTransfer: DataTransfer, cardIds: string[]) {
  dataTransfer.setData("application/json", JSON.stringify({ cardIds }));
  dataTransfer.setData("text/plain", cardIds[0] ?? "");
}

export function draggedCardIds(dataTransfer: DataTransfer): string[] {
  const json = dataTransfer.getData("application/json");
  if (json !== "") {
    try {
      const parsed = JSON.parse(json) as { cardIds?: unknown };
      if (Array.isArray(parsed.cardIds) && parsed.cardIds.every((cardId) => typeof cardId === "string")) {
        return parsed.cardIds;
      }
    } catch {
      return [];
    }
  }

  const singleCardId = dataTransfer.getData("text/plain");
  return singleCardId === "" ? [] : [singleCardId];
}
