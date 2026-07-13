import type { PublicRoom, Seat } from "./api";

const SEAT_LABELS: Record<Seat, string> = { 0: "南", 1: "西", 2: "北", 3: "东" };

type WaitingRoomProps = {
  room: PublicRoom;
  copyInviteLabel: string;
  onCopyInviteLink: () => void;
};

export function WaitingRoom({ room, copyInviteLabel, onCopyInviteLink }: WaitingRoomProps) {
  return (
    <section className="waiting-room" aria-labelledby="waiting-room-title">
      <div className="waiting-room-heading">
        <div>
          <p className="eyebrow">Room lobby</p>
          <h2 id="waiting-room-title">房间等待区</h2>
        </div>
        <div className="waiting-room-id">
          <span>房间 ID</span>
          <code>{room.id}</code>
          <button type="button" onClick={onCopyInviteLink} aria-label={copyInviteLabel}>
            {copyInviteLabel}
          </button>
        </div>
      </div>

      <div className="waiting-seats" role="list" aria-label="房间座位">
        {([0, 1, 2, 3] as Seat[]).map((seat) => {
          const player = room.players.find((candidate) => candidate.seat === seat);
          const isCurrentPlayer = seat === room.humanSeat;
          const state = player === undefined ? "空位" : player.isAI ? "AI" : player.name;

          return (
            <div className={`waiting-seat${isCurrentPlayer ? " current" : ""}`} key={seat} role="listitem">
              <span className="waiting-seat-number">座位 {seat}</span>
              <strong>{SEAT_LABELS[seat]} · {state}</strong>
              <span>{isCurrentPlayer ? "你的座位" : player?.isAI ? "等待真人加入" : player === undefined ? "可加入" : "已加入"}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
