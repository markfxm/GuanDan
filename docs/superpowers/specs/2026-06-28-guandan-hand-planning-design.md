# Guandan Hand Planning Research Tool Design

Date: 2026-06-28

## Goal

Build the first version of a Guandan research and training tool focused on hand planning. The user can generate or enter a 27-card hand, choose the current rank, and ask the system to produce multiple visual hand-grouping plans with scores and strategy explanations.

This is the first step toward a later four-player networked Guandan game. The first version should make the grouping engine, rule model, and strategy explanations reusable for future AI play, but it will not implement full multiplayer gameplay yet.

## Scope

### In Scope

- Local browser application with a Node service.
- Jiangsu-style mainstream Guandan card model:
  - Two standard decks, 108 cards.
  - Four players, 27 cards each.
  - Current rank is higher than A.
  - Heart rank cards are wild cards and can represent any non-joker card.
  - Example order for rank 10: big joker, small joker, 10, A, K, Q, J, 9, 8, 7, 6, 5, 4, 3, 2.
- Random 27-card hand generation.
- Manual hand entry and hand editing.
- Visual display of the original 27-card hand.
- Generation of 3-5 grouping plans.
- Visual display of each grouping plan as grouped card sets.
- Strategy scoring and explanation derived from the uploaded PDF:
  - Minimize turns without destroying control.
  - Preserve recovery/control cards.
  - Use wild cards for gap filling or control upgrades before low-value bomb stacking.
  - Prefer linked structures such as consecutive pairs, plates, straights, and full houses when they improve tempo.
  - Reduce low-value loose singles while preserving high-value locks.
  - Highlight risky singleton or missing ranks.

### Out of Scope For Version 1

- True four-player network rooms.
- Full trick-by-trick gameplay.
- AI bidding, tribute, return tribute, anti-tribute, reporting, and finishing-order settlement.
- Full hidden-information opponent modeling.
- Account system, persistence, ranking, or matchmaking.
- Claiming superhuman play strength. The strategy engine is a rules-and-heuristics research assistant, not a trained reinforcement-learning agent.

## Product Flow

1. User opens the browser app.
2. User chooses the current rank, defaulting to 10.
3. User either clicks random deal or manually enters/edits 27 cards.
4. The app validates the hand against two-deck card counts and wild-card rules.
5. User clicks generate plans.
6. The service returns multiple plans with grouped cards, scores, and explanations.
7. User compares visual plans and can select one as the preferred grouping.
8. User can regenerate, adjust rank, edit cards, or inspect scoring details.

## Interface Design

The main screen is a three-column research table.

### Left Column: Original Hand

- Shows the 27-card hand as card faces, not plain text.
- Cards show rank and suit.
- Jokers use a distinct dark style.
- Heart rank wild cards use a distinct highlighted style.
- Supports sorting modes:
  - Original deal order.
  - By Guandan rank strength.
  - By suit.
  - By detected risk.
- Includes controls for:
  - Random deal.
  - Manual input.
  - Rank selector.
  - Validation status.

### Center Column: Visual Plans

- Shows 3-5 candidate grouping plans.
- Each plan has a label, score, and visual grouped rows.
- Each grouped row represents one playable hand or strategic unit.
- Rows include:
  - Type label: bomb, straight flush, consecutive pairs, plate, straight, full house, pair, single, lock, reserve.
  - Card faces in that group.
  - Purpose label: attack, engine, recovery, tail control, risk, filler.
- Plans should be easy to scan without reading long explanations.

Initial plan archetypes:

- Balanced recommendation.
- Fast shedding.
- Control-preserving.
- Linked-shape engine.
- Wild-card aggressive.

### Right Column: Explanation And Risk

- Shows score breakdown:
  - Turn count.
  - Control retained.
  - Wild-card value.
  - Linked-shape tempo.
  - Loose single risk.
  - Tail control.
- Explains why the recommended plan wins.
- Lists trade-offs for non-recommended plans.
- Highlights:
  - How each wild card was used.
  - Which bombs or jokers remain as recovery.
  - Which singles are low-risk fillers versus high-value locks.
  - Which missing or singleton ranks suggest potential opponent bomb risk.

## Architecture

Use a frontend plus local Node service.

### Frontend

Recommended stack:

- Vite.
- React.
- TypeScript.
- CSS modules or scoped CSS.

Frontend responsibilities:

- Render card faces and grouped plan rows.
- Manage hand editing state.
- Call service APIs for random deal, validation, and plan generation.
- Let the user compare and select plans.
- Show explanations and score breakdowns.

### Node Service

Recommended stack:

- Node.
- TypeScript.
- Fastify or Express.

Service responsibilities:

- Card and rule model.
- Two-deck validation.
- Random deal generation.
- Legal group detection.
- Wild-card substitution search.
- Plan generation.
- Plan scoring.
- Explanation generation.

Keep the rule and strategy engine independent from HTTP so it can later be reused by multiplayer AI players.

## Core Modules

### Card Model

Represents:

- Rank.
- Suit.
- Deck copy id.
- Joker type.
- Whether the card is the current rank.
- Whether the card is a heart-rank wild card.

The card model must preserve physical cards. Two identical rank/suit cards from two decks are distinct cards.

### Rule Model

Represents:

- Current rank.
- Rank ordering.
- Wild-card substitution constraints.
- Recognized group types.
- Group comparison metadata for later reuse.

Version 1 needs enough comparison logic to evaluate grouping quality, not full trick-play legality for every situation.

### Group Detector

Finds candidate groups from a hand:

- Singles.
- Pairs.
- Triples.
- Full houses.
- Straights.
- Consecutive pairs.
- Plates.
- Same-rank bombs.
- Straight flushes.
- Joker bombs when present.
- Wild-card-assisted variants where legal.

The detector should return candidate groups with the physical cards consumed and any wild-card role assignments.

### Plan Generator

Builds multiple complete partitions of the 27-card hand.

Approach:

- Generate high-value candidates first: bombs, straight flushes, linked shapes, full houses.
- Explore alternative wild-card assignments.
- Use bounded search or beam search to avoid combinatorial explosion.
- Produce distinct plan archetypes by changing scoring weights.
- Always ensure every physical card appears exactly once in a plan.

### Scorer

Each plan gets a total score and component scores.

Suggested components:

- Fewer turns is better.
- Linked shapes that shed many cards are better when protected by recovery cards.
- Control retained is valuable.
- Wild-card use is valuable when it reduces turns, upgrades tail control, or creates a key structure.
- Low-value singles are penalized.
- High-value singles or jokers retained as locks are rewarded.
- Overusing all control to make the fewest turns is penalized.
- Bomb stacking with low marginal value is penalized.

The scorer should output explanations tied to the components, not just numbers.

## Strategy Logic From PDF

Version 1 encodes the PDF strategy as transparent heuristics:

- A pretty grouping is not enough; a good grouping keeps future flexibility.
- Wild cards are scarce and should usually fill gaps or upgrade control.
- Linked structures are tempo engines.
- Bombs and jokers are recovery, braking, and steering resources.
- Loose low singles are structural risk.
- Do not remove all control just to reduce one turn.
- Tail control matters because later gameplay will involve finishing order and wind passing.
- Singleton and missing ranks should be flagged as potential bomb-risk signals, using the PDF probability logic as warnings rather than absolute predictions.

## API Sketch

### `POST /api/deal`

Input:

```json
{
  "rank": "10"
}
```

Output:

```json
{
  "hand": ["...27 physical card ids..."]
}
```

### `POST /api/validate-hand`

Input:

```json
{
  "rank": "10",
  "cards": ["..."]
}
```

Output:

```json
{
  "valid": true,
  "errors": [],
  "warnings": []
}
```

### `POST /api/plans`

Input:

```json
{
  "rank": "10",
  "cards": ["..."],
  "count": 5
}
```

Output:

```json
{
  "plans": [
    {
      "id": "balanced",
      "name": "Balanced recommendation",
      "score": 86,
      "scoreBreakdown": {
        "turnCount": 84,
        "controlRetained": 78,
        "wildcardValue": 88,
        "linkedTempo": 80,
        "singleRisk": 32,
        "tailControl": 76
      },
      "groups": [
        {
          "type": "bomb",
          "purpose": "recovery",
          "cards": ["..."],
          "wildcards": []
        }
      ],
      "explanations": [
        "This plan keeps one recovery bomb while using the wild card to build a tempo shape."
      ],
      "risks": [
        "One low singleton remains and should be watched in later play."
      ]
    }
  ]
}
```

## Testing Strategy

Use test-driven development for implementation.

Core tests:

- Deck has 108 physical cards.
- Random deal produces 27 unique physical cards.
- Validation rejects more copies of a physical card class than two decks allow.
- Rank ordering places the current rank above A.
- Heart rank cards are detected as wild cards.
- Candidate detection finds core hand types.
- Wild-card substitution does not allow replacing jokers.
- Generated plans consume each input card exactly once.
- Scorer prefers a plan that preserves control over a same-turn-count plan that spends all control.
- Scorer rewards wild-card use that reduces turn count or upgrades control.
- Scorer penalizes unnecessary low-value bomb stacking.

UI tests:

- Original hand renders 27 card faces.
- Wild cards and jokers have distinct visual styles.
- Plan rows show type, purpose, and card faces.
- Selecting a plan updates explanation detail.

## Future Extensions

- Add trick-play legality and comparison for full gameplay.
- Add AI action selection for play, pass, bomb, and team yielding.
- Add four-player local simulation.
- Add network rooms with human players and AI-filled seats.
- Add tribute, return tribute, anti-tribute, reporting, wind passing, and scoring.
- Add opponent hand inference and probability updates during play.
- Add saved hand studies and batch Monte Carlo analysis.

## Open Decisions For Implementation Planning

- Exact frontend framework can be Vite React unless the user prefers another stack.
- Exact server framework can be Fastify or Express; Fastify is preferred for typed schemas.
- Beam-search width and scoring weights should start conservative and be adjusted after seeing generated plans.
- Manual entry format should support both visual picker and compact text input, but the implementation plan can decide which arrives first.
