import { DoorOpen, LogIn } from "lucide-react";
import { RANKS, type GameRank } from "../engine/cards";

type LobbyScreenProps = {
  playerName: string;
  roomId: string;
  gameRank: GameRank;
  loading: boolean;
  onPlayerNameChange: (name: string) => void;
  onRoomIdChange: (roomId: string) => void;
  onGameRankChange: (rank: GameRank) => void;
  onCreateRoom: () => void;
  onJoinRoom: () => void;
};

export function LobbyScreen({
  playerName,
  roomId,
  gameRank,
  loading,
  onPlayerNameChange,
  onRoomIdChange,
  onGameRankChange,
  onCreateRoom,
  onJoinRoom,
}: LobbyScreenProps) {
  return (
    <section className="lobby-screen" aria-labelledby="lobby-title">
      <div className="lobby-intro">
        <p className="eyebrow">Online Room</p>
        <h2 id="lobby-title">房间大厅</h2>
        <p>创建一张牌桌，或输入房间号加入朋友的对局。</p>
      </div>

      <div className="lobby-player-field">
        <label className="field-label" htmlFor="lobby-player-name">
          玩家姓名
        </label>
        <input
          id="lobby-player-name"
          value={playerName}
          onChange={(event) => onPlayerNameChange(event.target.value)}
          placeholder="例如：小王"
          autoComplete="off"
        />
      </div>

      <div className="lobby-grid">
        <form
          className="lobby-form lobby-form-primary"
          onSubmit={(event) => {
            event.preventDefault();
            onCreateRoom();
          }}
        >
          <div>
            <p className="eyebrow">New room</p>
            <h3>创建房间</h3>
          </div>
          <label className="field-label" htmlFor="lobby-rank">
            当前级牌
          </label>
          <select id="lobby-rank" value={gameRank} onChange={(event) => onGameRankChange(event.target.value as GameRank)}>
            {RANKS.map((rank) => (
              <option key={rank} value={rank}>
                {rank}
              </option>
            ))}
          </select>
          <button className="primary-button lobby-submit" type="submit" disabled={loading}>
            <DoorOpen aria-hidden="true" size={18} />
            创建房间
          </button>
        </form>

        <form
          className="lobby-form"
          onSubmit={(event) => {
            event.preventDefault();
            onJoinRoom();
          }}
        >
          <div>
            <p className="eyebrow">Join room</p>
            <h3>加入房间</h3>
          </div>
          <label className="field-label" htmlFor="lobby-room-id">
            房间号
          </label>
          <input
            id="lobby-room-id"
            value={roomId}
            onChange={(event) => onRoomIdChange(event.target.value)}
            placeholder="粘贴房间号"
            autoComplete="off"
          />
          <button className="lobby-submit" type="submit" disabled={loading}>
            <LogIn aria-hidden="true" size={18} />
            加入房间
          </button>
        </form>
      </div>
    </section>
  );
}
