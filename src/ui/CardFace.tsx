import { isHeartRankWild, type Card, type GameRank, type Suit } from "../engine/cards";

type CardFaceProps = {
  card: Card;
  gameRank: GameRank;
  compact?: boolean;
};

const SUIT_SYMBOLS: Record<Suit, string> = {
  spades: "♠",
  clubs: "♣",
  hearts: "♥",
  diamonds: "♦",
};

const SUIT_LABELS: Record<Suit, string> = {
  spades: "黑桃",
  clubs: "梅花",
  hearts: "红桃",
  diamonds: "方片",
};

export function CardFace({ card, gameRank, compact = false }: CardFaceProps) {
  if (card.kind === "joker") {
    const jokerName = card.rank === "BJ" ? "大王" : "小王";
    const jokerClass = card.rank === "BJ" ? "big-joker" : "small-joker";

    return (
      <span className={`card-face joker ${jokerClass}${compact ? " compact" : ""}`} aria-label={`${jokerName} ${card.copy}`}>
        <span className="card-rank">{jokerName}</span>
        <span className="card-suit">JOKER</span>
      </span>
    );
  }

  const red = card.suit === "hearts" || card.suit === "diamonds";
  const wild = isHeartRankWild(card, gameRank);
  const classes = ["card-face", red ? "red" : "black", wild ? "wild" : "", compact ? "compact" : ""]
    .filter(Boolean)
    .join(" ");

  return (
    <span className={classes} aria-label={`${SUIT_LABELS[card.suit]}${card.rank} ${card.copy}${wild ? " 逢人配" : ""}`}>
      <span className="card-rank">{card.rank}</span>
      <span className="card-suit">{SUIT_SYMBOLS[card.suit]}</span>
    </span>
  );
}
