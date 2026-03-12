export const GRID_SIZE = 5;
export const HAND_SIZE = 3;
export const TARGET_TOTAL = 21;
export const DECK_PASSES = 3;

export type StandardTileRank =
  | "A"
  | "2"
  | "3"
  | "4"
  | "5"
  | "6"
  | "7"
  | "8"
  | "9"
  | "10"
  | "J"
  | "Q"
  | "K";
export type TileRank = StandardTileRank | "W" | "S";
export type TileKind = "standard" | "wild" | "swap";

export type GameStatus = "idle" | "playing" | "bust" | "cleared";
export type LineStatus = "open" | "locked";
export type GameEvent = "none" | "start" | "place" | "lock" | "bust" | "clear";

export interface StackTile {
  id: string;
  kind: TileKind;
  rank: TileRank;
  value: number;
}

export interface LineSummary {
  cards: StackTile[];
  index: number;
  isSoft: boolean;
  status: LineStatus;
  total: number;
}

export interface PlacementPreview {
  column: LineSummary;
  wouldBust: boolean;
  wouldLockColumns: number[];
  wouldLockRows: number[];
  row: LineSummary;
}

export interface StackemResult {
  bankroll: number;
  bustedColumn?: number;
  bustedRow?: number;
  linesCompleted: number;
  payout: number;
  placedTiles: number;
  reason: "board-sealed" | "bust";
  runId: number;
  score: number;
  turns: number;
}

export interface GameWorld {
  board: Array<Array<StackTile | null>>;
  bankroll: number;
  buyIn: number;
  columnLines: LineSummary[];
  combo: number;
  deck: StackTile[];
  event: GameEvent;
  eventNonce: number;
  lastPlacement: { col: number; row: number } | null;
  lineBurst: {
    columns: number[];
    rows: number[];
  };
  linesCompleted: number;
  message: string;
  moveCost: number;
  payout: number;
  queue: StackTile[];
  result: StackemResult | null;
  rowLines: LineSummary[];
  runId: number;
  score: number;
  status: GameStatus;
  turns: number;
}
