import {
  DECK_PASSES,
  GameWorld,
  GRID_SIZE,
  HAND_SIZE,
  LineSummary,
  PlacementPreview,
  StackTile,
  StandardTileRank,
  TARGET_TOTAL,
  TileRank
} from "./types";

const STANDARD_RANKS: StandardTileRank[] = [
  "A",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "J",
  "Q",
  "K"
];
const SPECIAL_TILES_PER_PASS = 2;
const MOVE_COST_RATE = 0.01;
const BLACKJACK_BONUS_RATE = 0.25;
const BUST_PENALTY_RATE = 0.1;

export const SHOE_COUNT = DECK_PASSES * (STANDARD_RANKS.length * 4 + SPECIAL_TILES_PER_PASS);

export function calculateMoveCost(buyIn: number) {
  return Math.max(1, Math.round(buyIn * MOVE_COST_RATE));
}

export function calculateBlackjackBonus(buyIn: number) {
  return Math.max(1, Math.round(buyIn * BLACKJACK_BONUS_RATE));
}

export function calculateBustPenalty(buyIn: number) {
  return Math.max(1, Math.round(buyIn * BUST_PENALTY_RATE));
}

export function createWorld(buyIn: number, runId = Date.now()): GameWorld {
  const deck = buildDeck();
  const board = createEmptyBoard();
  const { deck: nextDeck, drawn } = drawTiles(deck, HAND_SIZE);
  const rowLines = buildRowLines(board);
  const columnLines = buildColumnLines(board);

  return {
    bankroll: buyIn,
    board,
    buyIn,
    columnLines,
    combo: 0,
    deck: nextDeck,
    event: "start",
    eventNonce: 1,
    lastPlacement: null,
    lineBurst: {
      columns: [],
      rows: []
    },
    linesCompleted: 0,
    message: "Place tiles, protect the bankroll, and chase 21 for a 25 percent pop.",
    moveCost: calculateMoveCost(buyIn),
    payout: buyIn,
    queue: stabilizeQueueForBoard(drawn, board),
    result: null,
    rowLines,
    runId,
    score: buyIn,
    status: "playing",
    turns: 0
  };
}

export function isWildTile(tile: StackTile | null | undefined) {
  return tile?.kind === "wild";
}

export function isSwapTile(tile: StackTile | null | undefined) {
  return tile?.kind === "swap";
}

export function canPlaceAt(world: GameWorld, row: number, col: number) {
  const leadTile = world.queue[0];

  return (
    world.status === "playing" &&
    world.bankroll >= world.moveCost &&
    row >= 0 &&
    row < GRID_SIZE &&
    col >= 0 &&
    col < GRID_SIZE &&
    !isCellLocked(world, row, col) &&
    !world.board[row][col] &&
    Boolean(leadTile) &&
    leadTile?.kind !== "swap"
  );
}

export function canSwapAt(world: GameWorld, row: number, col: number) {
  const leadTile = world.queue[0];

  return (
    world.status === "playing" &&
    world.bankroll >= world.moveCost &&
    row >= 0 &&
    row < GRID_SIZE &&
    col >= 0 &&
    col < GRID_SIZE &&
    !isCellLocked(world, row, col) &&
    Boolean(world.board[row][col]) &&
    leadTile?.kind === "swap"
  );
}

export function getPlayableCells(world: GameWorld) {
  const cells: Array<{ col: number; row: number }> = [];

  for (let row = 0; row < GRID_SIZE; row += 1) {
    for (let col = 0; col < GRID_SIZE; col += 1) {
      if (canSwapAt(world, row, col) || canPlaceAt(world, row, col)) {
        cells.push({ col, row });
      }
    }
  }

  return cells;
}

export function previewPlacement(
  world: GameWorld,
  row: number,
  col: number
): PlacementPreview | null {
  const nextTile = world.queue[0];

  if (!nextTile || nextTile.kind !== "standard" || !canPlaceAt(world, row, col)) {
    return null;
  }

  const board = cloneBoard(world.board);
  board[row][col] = nextTile;

  const rowLines = buildRowLines(board);
  const columnLines = buildColumnLines(board);
  const nextRow = rowLines[row];
  const nextColumn = columnLines[col];

  return {
    column: nextColumn,
    row: nextRow,
    wouldBust: nextRow.total > TARGET_TOTAL || nextColumn.total > TARGET_TOTAL,
    wouldLockColumns:
      nextColumn.total === TARGET_TOTAL && world.columnLines[col].total !== TARGET_TOTAL
        ? [col]
        : [],
    wouldLockRows:
      nextRow.total === TARGET_TOTAL && world.rowLines[row].total !== TARGET_TOTAL
        ? [row]
        : []
  };
}

export function createSelectedTile(baseTile: StackTile, rank: StandardTileRank) {
  return {
    id: `${baseTile.id}-${rank}-selected`,
    kind: "standard" as const,
    rank,
    value: getTileValue(rank)
  };
}

export function placeQueueTile(
  world: GameWorld,
  row: number,
  col: number,
  resolvedTile?: StackTile
): GameWorld {
  if (!canPlaceAt(world, row, col)) {
    return world;
  }

  const leadTile = world.queue[0];
  const nextTile =
    resolvedTile?.kind === "standard"
      ? resolvedTile
      : leadTile?.kind === "standard"
        ? leadTile
        : null;

  if (!nextTile) {
    return world;
  }

  const board = cloneBoard(world.board);
  board[row][col] = nextTile;
  return resolveTurn(world, board, row, col, nextTile, "place");
}

export function swapBoardTile(
  world: GameWorld,
  row: number,
  col: number,
  resolvedTile: StackTile
): GameWorld {
  if (!canSwapAt(world, row, col) || resolvedTile.kind !== "standard") {
    return world;
  }

  const board = cloneBoard(world.board);
  board[row][col] = resolvedTile;
  return resolveTurn(world, board, row, col, resolvedTile, "swap");
}

export function formatLineValue(line: LineSummary) {
  if (line.total === TARGET_TOTAL) {
    return "21";
  }

  return String(line.total);
}

export function getDeckCountLabel(world: GameWorld) {
  return world.deck.length + world.queue.length;
}

export function rankLabel(rank: TileRank) {
  return rank;
}

function resolveTurn(
  world: GameWorld,
  board: GameWorld["board"],
  row: number,
  col: number,
  tile: StackTile,
  action: "place" | "swap"
): GameWorld {
  const rowLines = buildRowLines(board, world.rowLines);
  const columnLines = buildColumnLines(board, world.columnLines);
  const hitRows = rowLines
    .filter((line) => line.total === TARGET_TOTAL && world.rowLines[line.index].total !== TARGET_TOTAL)
    .map((line) => line.index);
  const hitColumns = columnLines
    .filter(
      (line) =>
        line.total === TARGET_TOTAL && world.columnLines[line.index].total !== TARGET_TOTAL
    )
    .map((line) => line.index);
  const bustRows = rowLines
    .filter((line) => line.total > TARGET_TOTAL && world.rowLines[line.index].total <= TARGET_TOTAL)
    .map((line) => line.index);
  const bustColumns = columnLines
    .filter(
      (line) =>
        line.total > TARGET_TOTAL && world.columnLines[line.index].total <= TARGET_TOTAL
    )
    .map((line) => line.index);
  const blackjackCount = hitRows.length + hitColumns.length;
  const bustCount = bustRows.length + bustColumns.length;
  const blackjackBonus = calculateBlackjackBonus(world.buyIn);
  const bustPenalty = calculateBustPenalty(world.buyIn);
  const reward = blackjackCount * blackjackBonus;
  const penalty = bustCount * bustPenalty;
  const bankroll = Math.max(0, world.bankroll - world.moveCost + reward - penalty);
  const nextCombo = blackjackCount ? world.combo + 1 : 0;
  const { deck, queue } = advanceQueue(world, board);
  const event = bustCount ? "bust" : blackjackCount ? "lock" : "place";
  const lineBurst = bustCount
    ? {
        columns: bustColumns,
        rows: bustRows
      }
    : {
        columns: hitColumns,
        rows: hitRows
      };
  const nextWorldBase: GameWorld = {
    ...world,
    bankroll,
    board,
    columnLines,
    combo: nextCombo,
    deck,
    event,
    eventNonce: world.eventNonce + 1,
    lastPlacement: { col, row },
    lineBurst,
    linesCompleted: world.linesCompleted + blackjackCount,
    message: formatTurnMessage(
      tile,
      action,
      row,
      col,
      bankroll,
      blackjackCount,
      bustCount,
      blackjackBonus,
      bustPenalty
    ),
    payout: bankroll,
    queue,
    result: null,
    rowLines,
    score: bankroll,
    turns: world.turns + 1
  };

  if (bankroll < nextWorldBase.moveCost) {
    return finishWorld(nextWorldBase, "bust", bustRows[0], bustColumns[0]);
  }

  if (!nextWorldBase.queue.length) {
    return finishWorld(nextWorldBase, "board-sealed", bustRows[0], bustColumns[0]);
  }

  const playableCells = getPlayableCells(nextWorldBase);

  if (!playableCells.length) {
    return finishWorld(nextWorldBase, "board-sealed", bustRows[0], bustColumns[0]);
  }

  return nextWorldBase;
}

function finishWorld(
  world: GameWorld,
  reason: "board-sealed" | "bust",
  bustedRow?: number,
  bustedColumn?: number
): GameWorld {
  return {
    ...world,
    event: reason === "bust" ? "bust" : world.event === "place" ? "clear" : world.event,
    message:
      reason === "bust"
        ? "Bankroll exhausted. The run is over."
        : "Grid sealed. Bank the remaining bankroll.",
    payout: world.bankroll,
    result: {
      bankroll: world.bankroll,
      bustedColumn,
      bustedRow,
      linesCompleted: world.linesCompleted,
      payout: world.bankroll,
      placedTiles: world.turns,
      reason,
      runId: world.runId,
      score: world.bankroll,
      turns: world.turns
    },
    status: reason === "bust" ? "bust" : "cleared"
  };
}

function advanceQueue(world: GameWorld, board: GameWorld["board"]) {
  const remainingQueue = world.queue.slice(1);
  const { deck, drawn } = drawTiles(world.deck, HAND_SIZE - remainingQueue.length);
  const queue = stabilizeQueueForBoard([...remainingQueue, ...drawn], board);

  return {
    deck,
    queue
  };
}

function stabilizeQueueForBoard(queue: StackTile[], board: GameWorld["board"]) {
  if (hasPlacedTiles(board) || queue.length < 2 || queue[0]?.kind !== "swap") {
    return queue;
  }

  const nextLeadIndex = queue.findIndex((tile) => tile.kind !== "swap");

  if (nextLeadIndex <= 0) {
    return queue;
  }

  return [...queue.slice(nextLeadIndex), ...queue.slice(0, nextLeadIndex)];
}

function hasPlacedTiles(board: GameWorld["board"]) {
  return board.some((row) => row.some(Boolean));
}

function isCellLocked(world: GameWorld, row: number, col: number) {
  return world.rowLines[row]?.status === "locked" || world.columnLines[col]?.status === "locked";
}

function buildDeck() {
  const deck: StackTile[] = [];

  for (let pass = 0; pass < DECK_PASSES; pass += 1) {
    for (let suitCopy = 0; suitCopy < 4; suitCopy += 1) {
      for (const rank of STANDARD_RANKS) {
        deck.push({
          id: `${pass}-${suitCopy}-${rank}-${deck.length}`,
          kind: "standard",
          rank,
          value: getTileValue(rank)
        });
      }
    }

    deck.push({
      id: `wild-${pass}-${deck.length}`,
      kind: "wild",
      rank: "W",
      value: 0
    });
    deck.push({
      id: `swap-${pass}-${deck.length}`,
      kind: "swap",
      rank: "S",
      value: 0
    });
  }

  for (let index = deck.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    const current = deck[index];

    deck[index] = deck[swapIndex];
    deck[swapIndex] = current;
  }

  return deck;
}

function getTileValue(rank: StandardTileRank) {
  if (rank === "A") {
    return 1;
  }

  if (rank === "10" || rank === "J" || rank === "Q" || rank === "K") {
    return 10;
  }

  return Number(rank);
}

function createEmptyBoard() {
  return Array.from({ length: GRID_SIZE }, () =>
    Array.from({ length: GRID_SIZE }, () => null as StackTile | null)
  );
}

function cloneBoard(board: GameWorld["board"]) {
  return board.map((row) => [...row]);
}

function drawTiles(deck: StackTile[], count: number) {
  if (!count) {
    return {
      deck,
      drawn: [] as StackTile[]
    };
  }

  return {
    deck: deck.slice(count),
    drawn: deck.slice(0, count)
  };
}

function buildRowLines(board: GameWorld["board"], previousLines?: LineSummary[]) {
  return board.map((cards, index) => createLineSummary(cards, index, previousLines?.[index]));
}

function buildColumnLines(board: GameWorld["board"], previousLines?: LineSummary[]) {
  return Array.from({ length: GRID_SIZE }, (_, index) =>
    createLineSummary(
      board.map((row) => row[index]),
      index,
      previousLines?.[index]
    )
  );
}

function createLineSummary(
  cards: Array<StackTile | null>,
  index: number,
  previousLine?: LineSummary
): LineSummary {
  const placedCards = cards.filter(Boolean) as StackTile[];
  const total = evaluateHand(placedCards);
  const locked = previousLine?.status === "locked" || total === TARGET_TOTAL;

  return {
    cards: placedCards,
    index,
    isSoft: hasSoftAce(placedCards),
    status: locked ? "locked" : "open",
    total
  };
}

function evaluateHand(cards: StackTile[]) {
  let total = cards.reduce((sum, tile) => sum + tile.value, 0);
  let aceCount = cards.filter((tile) => tile.rank === "A").length;

  while (aceCount > 0 && total + 10 <= TARGET_TOTAL) {
    total += 10;
    aceCount -= 1;
  }

  return total;
}

function hasSoftAce(cards: StackTile[]) {
  let total = cards.reduce((sum, tile) => sum + tile.value, 0);
  let aceCount = cards.filter((tile) => tile.rank === "A").length;

  while (aceCount > 0) {
    if (total + 10 <= TARGET_TOTAL) {
      return true;
    }

    aceCount -= 1;
  }

  return false;
}

function formatTurnMessage(
  tile: StackTile,
  action: "place" | "swap",
  row: number,
  col: number,
  bankroll: number,
  blackjackCount: number,
  bustCount: number,
  blackjackBonus: number,
  bustPenalty: number
) {
  const moveLabel = action === "swap" ? `Swap set to ${tile.rank}` : `${tile.rank} placed`;
  const resultParts = [`${moveLabel} at row ${row + 1}, column ${col + 1}.`, `Bank ${bankroll}.`];

  if (blackjackCount) {
    resultParts.unshift(`${blackjackCount} x 21 pays ${blackjackBonus} chips.`);
  }

  if (bustCount) {
    resultParts.unshift(`${bustCount} bust penalty ${bustPenalty} chips.`);
  }

  return resultParts.join(" ");
}
