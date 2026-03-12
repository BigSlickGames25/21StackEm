import { Href, router, useLocalSearchParams } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import { useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View
} from "react-native";
import { PanResponder } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AppBackdrop } from "../components/layout/AppBackdrop";
import { GameButton } from "../components/ui/GameButton";
import { useDeviceProfile } from "../hooks/useDeviceProfile";
import { useHubSession } from "../platform/auth/session";
import { openBigSlickGamesWebsite } from "../platform/lib/external-links";
import { formatChipCount } from "../platform/lib/format";
import { fireHaptic } from "../services/haptics";
import { useGameSettings } from "../store/game-settings";
import { clamp, theme } from "../theme";
import {
  getLeaderboardSummary,
  loadLeaderboard,
  saveLeaderboardEntry
} from "./leaderboard";
import {
  GameWorld,
  GRID_SIZE,
  HAND_SIZE,
  LineSummary,
  StackTile,
  StandardTileRank,
  TARGET_TOTAL
} from "./types";
import {
  SHOE_COUNT,
  calculateBlackjackBonus,
  calculateBustPenalty,
  calculateMoveCost,
  canPlaceAt,
  canSwapAt,
  createWorld,
  createSelectedTile,
  getDeckCountLabel,
  isSwapTile,
  isWildTile,
  placeQueueTile,
  previewPlacement,
  swapBoardTile
} from "./world";

const BUY_INS = [100, 500, 1000] as const;
const DIFFICULTY_OPTIONS = [
  {
    bonusMultiplier: 1,
    description: "Empty opening grid. Standard 21 bonus and bust penalty.",
    key: "easy",
    label: "Easy",
    openingTiles: 0,
    penaltyMultiplier: 1
  },
  {
    bonusMultiplier: 2,
    description: "3 tiles already on the grid. 21 bonus and bust penalty are both doubled.",
    key: "medium",
    label: "Medium",
    openingTiles: 3,
    penaltyMultiplier: 2
  },
  {
    bonusMultiplier: 4,
    description: "6 tiles already on the grid. 21 bonus is 4x while bust penalty stays standard.",
    key: "hard",
    label: "Hard",
    openingTiles: 6,
    penaltyMultiplier: 1
  }
] as const;
const SPECIAL_VALUE_OPTIONS: Array<{ label: string; rank: StandardTileRank }> = [
  { label: "A", rank: "A" },
  { label: "2", rank: "2" },
  { label: "3", rank: "3" },
  { label: "4", rank: "4" },
  { label: "5", rank: "5" },
  { label: "6", rank: "6" },
  { label: "7", rank: "7" },
  { label: "8", rank: "8" },
  { label: "9", rank: "9" },
  { label: "10", rank: "10" }
] as const;

function getSpecialOptionHint(rank: StandardTileRank) {
  return rank === "A" ? "1 or 11" : `value ${rank}`;
}

const EMPTY_LINE: LineSummary = {
  cards: [],
  index: 0,
  isSoft: false,
  status: "open",
  total: 0
};
const EMPTY_LINES = Array.from({ length: GRID_SIZE }, (_, index) => ({
  ...EMPTY_LINE,
  index
}));
const EMPTY_BOARD = Array.from({ length: GRID_SIZE }, () =>
  Array.from({ length: GRID_SIZE }, () => null as StackTile | null)
);

type BoardMetrics = { height: number; width: number; x: number; y: number };
type GridCell = { col: number; row: number };
type TileFrame = {
  height: number;
  x: number;
  y: number;
  width: number;
};
type DragGhost = TileFrame & {
  tile: StackTile;
};
type QueueSnapshot = Array<StackTile | null>;
type QueueAdvanceCard = {
  fromIndex: number;
  kind: "deal" | "shift";
  lead: boolean;
  tile: StackTile;
  toIndex: number;
};
type QueueAdvanceEffect = {
  cards: QueueAdvanceCard[];
  nonce: number;
};
type PendingSpecialMove = {
  kind: "swap" | "wild";
  target: GridCell;
  tile: StackTile;
};
type PlacementFlight = {
  col: number;
  end: TileFrame;
  nonce: number;
  row: number;
  sourceTileId: string;
  start: TileFrame;
  tile: StackTile;
};
type TutorialTargetKey = "banner" | "board-center" | "deal" | "lead-tile" | "none" | "queue" | "undo";
type TutorialAdvanceMode = "action" | "manual";
type SetupDifficulty = (typeof DIFFICULTY_OPTIONS)[number]["key"];
type SetupStep = "splash" | "ante" | "difficulty";
type TutorialStep = {
  actionLabel?: string;
  advance: TutorialAdvanceMode;
  body: string;
  id:
    | "deal"
    | "done"
    | "intro"
    | "lead-tile"
    | "place-tile"
    | "scoring"
    | "specials"
    | "totals"
    | "undo";
  target: TutorialTargetKey;
  title: string;
};

const UNDO_LIMIT = 3;
const TUTORIAL_TARGET_CELL = { col: 2, row: 2 } as const;
const TUTORIAL_STEPS: TutorialStep[] = [
  {
    actionLabel: "Start Guide",
    advance: "manual",
    body: "The top banner is your table readout. It tracks the ante, move cost, 21 payout, bust penalty, and your live wallet.",
    id: "intro",
    target: "banner",
    title: "StackBot Booting"
  },
  {
    advance: "action",
    body: "Tap Start Table to open a fresh run. Your bankroll starts at the ante, and every tile you place costs 1 percent of it.",
    id: "deal",
    target: "deal",
    title: "Start The Round"
  },
  {
    actionLabel: "Show Target",
    advance: "manual",
    body: "Only the front tile is live. You can drag it or tap a legal board square, and the other two wait in queue behind it.",
    id: "lead-tile",
    target: "lead-tile",
    title: "Lead Tile First"
  },
  {
    advance: "action",
    body: "Place the lead tile on the highlighted square. That single move updates one row hand and one column hand at the same time.",
    id: "place-tile",
    target: "board-center",
    title: "Make One Move"
  },
  {
    actionLabel: "Next",
    advance: "manual",
    body: "These totals play like blackjack hands. When a line hits 21 it locks in green. Red only means a live line has busted.",
    id: "totals",
    target: "board-center",
    title: "Read The Board"
  },
  {
    advance: "action",
    body: "Undo rewinds your last move, but only three times per run. Tap Undo now so you feel the recovery loop.",
    id: "undo",
    target: "undo",
    title: "Three Undo Limit"
  },
  {
    actionLabel: "Next",
    advance: "manual",
    body: "Wild W tiles let you call any value from A to 10. Swap S tiles target an occupied square and replace that board tile with a value you choose.",
    id: "specials",
    target: "queue",
    title: "Special Tiles"
  },
  {
    actionLabel: "Finish Tutorial",
    advance: "manual",
    body: "Each move costs 1 percent of ante. A 21 pays 25 percent. A bust burns 10 percent. Bankroll is the score that matters.",
    id: "scoring",
    target: "banner",
    title: "Table Rules"
  },
  {
    actionLabel: "Back To Table",
    advance: "manual",
    body: "You are ready to play live. Reopen the guide from the splash screen before a run whenever you want another pass.",
    id: "done",
    target: "none",
    title: "Tutorial Complete"
  }
];

function createQueueSnapshot(queue: StackTile[]) {
  return Array.from({ length: HAND_SIZE }, (_, index) => queue[index] ?? null);
}

function isQueueAdvance(previous: QueueSnapshot, next: QueueSnapshot) {
  return Boolean(
    previous[1] &&
      next[0] &&
      previous[1]?.id === next[0]?.id &&
      (previous[2]?.id === next[1]?.id || !next[1])
  );
}

function createQueueAdvanceEffect(previous: QueueSnapshot, next: QueueSnapshot) {
  if (!isQueueAdvance(previous, next)) {
    return null;
  }

  const cards = next.reduce<QueueAdvanceCard[]>((result, tile, toIndex) => {
    if (!tile) {
      return result;
    }

    const fromIndex = previous.findIndex((candidate) => candidate?.id === tile.id);

    result.push({
      fromIndex: fromIndex >= 0 ? fromIndex : HAND_SIZE,
      kind: fromIndex >= 0 ? "shift" : "deal",
      lead: toIndex === 0,
      tile,
      toIndex
    });

    return result;
  }, []);

  return cards.length ? cards : null;
}

export function GameExperience() {
  const device = useDeviceProfile();
  const { settings } = useGameSettings();
  const { profile, status } = useHubSession();
  const params = useLocalSearchParams<{ tutorial?: string | string[] }>();
  const tutorialParam = Array.isArray(params.tutorial) ? params.tutorial[0] : params.tutorial;
  const [selectedBuyIn, setSelectedBuyIn] = useState<number>(BUY_INS[0]);
  const [selectedDifficulty, setSelectedDifficulty] = useState<SetupDifficulty>("easy");
  const [setupStep, setSetupStep] = useState<SetupStep>("splash");
  const [world, setWorld] = useState<GameWorld | null>(null);
  const [hoveredCell, setHoveredCell] = useState<GridCell | null>(null);
  const [leaderboardBest, setLeaderboardBest] = useState(0);
  const [leaderboardRuns, setLeaderboardRuns] = useState(0);
  const [savedRunId, setSavedRunId] = useState<number | null>(null);
  const [celebrationBurst, setCelebrationBurst] = useState<{
    cols: number[];
    nonce: number;
    rows: number[];
  } | null>(null);
  const [warningBurst, setWarningBurst] = useState<{
    cols: number[];
    nonce: number;
    rows: number[];
  } | null>(null);
  const [undoStack, setUndoStack] = useState<GameWorld[]>([]);
  const [undosUsed, setUndosUsed] = useState(0);
  const [pendingSpecialMove, setPendingSpecialMove] = useState<PendingSpecialMove | null>(null);
  const [tutorialStepIndex, setTutorialStepIndex] = useState<number | null>(null);
  const [tutorialSpotlight, setTutorialSpotlight] = useState<TileFrame | null>(null);
  const [tutorialUndoComplete, setTutorialUndoComplete] = useState(false);
  const [placementFlight, setPlacementFlight] = useState<PlacementFlight | null>(null);
  const [dragging, setDragging] = useState(false);
  const [dragGhost, setDragGhost] = useState<DragGhost | null>(null);
  const boardRef = useRef<View>(null);
  const bannerRef = useRef<View>(null);
  const dealButtonRef = useRef<View>(null);
  const leadTileRef = useRef<View>(null);
  const queueStageRef = useRef<View>(null);
  const undoButtonRef = useRef<View>(null);
  const boardMetricsRef = useRef<BoardMetrics | null>(null);
  const pendingPlacementWorldRef = useRef<GameWorld | null>(null);
  const tutorialRouteHandledRef = useRef<string | null>(null);
  const worldRef = useRef<GameWorld | null>(null);
  const dragOffset = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const placementImpact = useRef(new Animated.Value(0)).current;
  const placementFlightProgress = useRef(new Animated.Value(0)).current;
  const lineFlash = useRef(new Animated.Value(0)).current;
  const boardPulse = useRef(new Animated.Value(0)).current;
  const boardShake = useRef(new Animated.Value(0)).current;
  const isDesktop = device.width >= 960;
  const isMobile = !isDesktop;
  const isPortraitMobile = isMobile && !device.isLandscape;
  const isLandscapeMobile = isMobile && device.isLandscape;
  const outerPad = isDesktop ? 24 : isLandscapeMobile ? 8 : 10;
  const availableWidth = device.width - outerPad * 2;
  const tabDockReserve = isDesktop ? 68 : 62;
  const availableHeight =
    device.height -
    device.insets.top -
    device.insets.bottom -
    outerPad * 2 -
    tabDockReserve;
  const frameWidth = isDesktop ? Math.min(980, availableWidth) : availableWidth;
  const framePad = isDesktop ? 16 : isLandscapeMobile ? 8 : 10;
  const frameGap = isDesktop ? 10 : 8;
  const topHeight = isPortraitMobile
    ? clamp(Math.round(availableHeight * 0.11), 56, 72)
    : clamp(Math.round(availableHeight * 0.14), 64, 88);
  const portraitBottomHeight = 0;
  const radius = clamp(Math.round(frameWidth * 0.05), 18, 28);
  const boardPadX = isLandscapeMobile ? 8 : 10;
  const boardPadY = isPortraitMobile ? 4 : 8;
  const boardGap = clamp(Math.round(Math.min(frameWidth, availableHeight) * 0.006), 1, 3);
  const sideRailWidth = isPortraitMobile
    ? 0
    : clamp(Math.round(frameWidth * (isDesktop ? 0.24 : 0.32)), 164, 260);
  const boardRail = clamp(
    Math.round(Math.min(frameWidth, availableHeight) * (isPortraitMobile ? 0.08 : 0.075)),
    28,
    42
  );
  const boardWidthBudget = isPortraitMobile
    ? frameWidth - framePad * 2 - boardPadX * 2
    : frameWidth - framePad * 2 - sideRailWidth - frameGap - boardPadX * 2;
  const boardHeightBudget = isPortraitMobile
    ? availableHeight -
      framePad * 2 -
      topHeight -
      portraitBottomHeight -
      frameGap * 2 -
      boardPadY * 2
    : Math.min(availableHeight, isDesktop ? 760 : availableHeight) -
      framePad * 2 -
      boardPadY * 2;
  const boardCell = Math.max(
    isPortraitMobile ? 28 : 24,
    Math.floor(
      Math.min(
        (boardWidthBudget - boardRail - boardGap * 5) / GRID_SIZE,
        (boardHeightBudget - boardRail - boardGap * 5) / GRID_SIZE
      )
    )
  );
  const boardDense = boardCell < 56;
  const matrixSize = boardCell * GRID_SIZE + boardGap * (GRID_SIZE - 1);
  const boardSize = boardRail + boardGap + matrixSize;
  const boardPanelHeight = boardSize + boardPadY * 2;
  const boardPanelWidth = boardSize + boardPadX * 2;
  const portraitFrameHeight = Math.min(
    availableHeight,
    framePad * 2 + topHeight + boardPanelHeight + portraitBottomHeight + frameGap * 2
  );
  const splitFrameHeight = Math.min(availableHeight, isDesktop ? 760 : availableHeight);
  const frameHeight = isPortraitMobile ? portraitFrameHeight : splitFrameHeight;
  const portraitQueueGap = clamp(Math.round(frameWidth * 0.014), 4, 8);
  const portraitQueueWidth = Math.max(248, frameWidth - framePad * 4);
  const portraitQueueTileWidth = clamp(
    Math.floor((portraitQueueWidth - portraitQueueGap * 3) / 4),
    40,
    70
  );
  const portraitQueueTileHeight = clamp(
    Math.round(portraitQueueTileWidth * 1.02),
    46,
    64
  );
  const railPad = isDesktop ? 14 : 10;
  const railGap = isDesktop ? 10 : 8;
  const railInnerWidth = Math.max(120, sideRailWidth - railPad * 2);
  const railQueueTileWidth = clamp(
    Math.floor((railInnerWidth - railGap * 3) / 4),
    30,
    52
  );
  const railQueueTileHeight = clamp(Math.round(railQueueTileWidth * 1.04), 38, 58);
  const queueDense = isPortraitMobile
    ? portraitQueueTileWidth < 62
    : railQueueTileWidth < 48;
  const effectiveFrameHeight = frameHeight;
  const stripPad = framePad;
  const middleHeight = boardPanelHeight;
  const boardStripHeight = boardPanelHeight;
  const bottomHeight = portraitBottomHeight;
  const controlWidth = clamp(Math.round(frameWidth * 0.3), 100, 136);
  const queueGap = portraitQueueGap;
  const queueTileWidth = portraitQueueTileWidth;
  const queueTileHeight = portraitQueueTileHeight;
  const currentWorld = world;
  const queue = currentWorld?.queue ?? [];
  const board = currentWorld?.board ?? EMPTY_BOARD;
  const rowLines = currentWorld?.rowLines ?? EMPTY_LINES;
  const columnLines = currentWorld?.columnLines ?? EMPTY_LINES;
  const leadTile = queue[0] ?? null;
  const tutorialStep =
    tutorialStepIndex === null ? null : TUTORIAL_STEPS[tutorialStepIndex] ?? null;
  const tutorialActive = tutorialStepIndex !== null;
  const [queueAdvanceEffect, setQueueAdvanceEffect] = useState<QueueAdvanceEffect | null>(null);
  const queueAnimating = Boolean(queueAdvanceEffect);
  const placementAnimating = Boolean(placementFlight);
  const motionLocked = queueAnimating || placementAnimating;
  const tutorialBlocksInteraction =
    tutorialActive &&
    tutorialStep?.advance === "manual" &&
    tutorialStep.id !== "done";
  const interactionLocked =
    motionLocked || Boolean(pendingSpecialMove) || tutorialBlocksInteraction;
  const preview =
    currentWorld && hoveredCell && leadTile?.kind === "standard"
      ? previewPlacement(currentWorld, hoveredCell.row, hoveredCell.col)
      : null;
  const canAfford =
    typeof profile?.nChips !== "number" || profile.nChips >= selectedBuyIn;
  const selectedDifficultyOption =
    DIFFICULTY_OPTIONS.find((option) => option.key === selectedDifficulty) ??
    DIFFICULTY_OPTIONS[0];
  const currentBuyIn = currentWorld?.buyIn ?? selectedBuyIn;
  const currentMoveCost = currentWorld?.moveCost ?? calculateMoveCost(currentBuyIn);
  const currentBlackjackBonus =
    currentWorld?.blackjackBonus ??
    calculateBlackjackBonus(currentBuyIn, selectedDifficultyOption.bonusMultiplier);
  const currentBustPenalty =
    currentWorld?.bustPenalty ??
    calculateBustPenalty(currentBuyIn, selectedDifficultyOption.penaltyMultiplier);
  const currentScoreLabel = formatChipCount(currentWorld?.score ?? selectedBuyIn);
  const undoRemaining = Math.max(0, UNDO_LIMIT - undosUsed);
  const undoAvailable =
    currentWorld?.status === "playing" &&
    undoStack.length > 0 &&
    undoRemaining > 0 &&
    (!tutorialActive || tutorialStep?.id === "undo");
  const tutorialPlacementOpen =
    tutorialActive && tutorialStep?.id === "place-tile" && currentWorld?.turns === 0;
  const dragEnabled =
    currentWorld?.status === "playing" &&
    Boolean(leadTile) &&
    leadTile?.kind === "standard" &&
    !interactionLocked &&
    (!tutorialActive || tutorialStep?.id === "place-tile");

  useEffect(() => {
    worldRef.current = world;
  }, [world]);

  useEffect(() => {
    async function syncKeepAwake() {
      try {
        if (settings.keepAwake) {
          await activateKeepAwakeAsync("stackem-session");
        } else {
          await deactivateKeepAwake("stackem-session");
        }
      } catch {}
    }

    void syncKeepAwake();
    return () => {
      void deactivateKeepAwake("stackem-session").catch(() => {});
    };
  }, [settings.keepAwake]);

  useEffect(() => {
    if (Platform.OS !== "web") {
      return;
    }

    const { body, documentElement } = document;
    const prevHtmlOverflow = documentElement.style.overflow;
    const prevHtmlOverscroll = documentElement.style.overscrollBehavior;
    const prevBodyOverflow = body.style.overflow;
    const prevBodyOverscroll = body.style.overscrollBehavior;
    const prevTouch = body.style.touchAction;

    documentElement.style.overflow = isMobile ? "auto" : "hidden";
    documentElement.style.overscrollBehavior = isMobile ? "auto" : "none";
    body.style.overflow = isMobile ? "auto" : "hidden";
    body.style.overscrollBehavior = isMobile ? "auto" : "none";
    body.style.touchAction = isDesktop ? "none" : "manipulation";

    return () => {
      documentElement.style.overflow = prevHtmlOverflow;
      documentElement.style.overscrollBehavior = prevHtmlOverscroll;
      body.style.overflow = prevBodyOverflow;
      body.style.overscrollBehavior = prevBodyOverscroll;
      body.style.touchAction = prevTouch;
    };
  }, [isDesktop, isMobile]);

  useEffect(() => {
    let cancelled = false;

    async function hydrateLeaderboard() {
      const entries = await loadLeaderboard();
      if (cancelled) {
        return;
      }

      const summary = getLeaderboardSummary(entries);
      setLeaderboardBest(summary.bestScore);
      setLeaderboardRuns(summary.runs);
    }

    void hydrateLeaderboard();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!world?.result || savedRunId === world.result.runId) {
      return;
    }

    const finished = world;
    const result = finished.result as NonNullable<GameWorld["result"]>;
    setSavedRunId(result.runId);

    async function persistRun() {
      const entries = await saveLeaderboardEntry({
        buyIn: finished.buyIn,
        linesCompleted: result.linesCompleted,
        playerName:
          profile?.sUserName ?? (status === "authenticated" ? "Player" : "Guest"),
        result: result.reason,
        score: result.score,
        turns: result.turns
      });

      const summary = getLeaderboardSummary(entries);
      setLeaderboardBest(summary.bestScore);
      setLeaderboardRuns(summary.runs);
    }

    void persistRun();
  }, [profile?.sUserName, savedRunId, status, world?.buyIn, world?.result]);

  useEffect(() => {
    if (!world) {
      return;
    }

    if (
      world.event === "place" ||
      world.event === "lock" ||
      world.event === "clear" ||
      world.event === "bust"
    ) {
      placementImpact.stopAnimation();
      placementImpact.setValue(0);
      Animated.sequence([
        Animated.timing(placementImpact, {
          duration: 95,
          toValue: 1,
          useNativeDriver: true
        }),
        Animated.spring(placementImpact, {
          bounciness: 10,
          speed: 20,
          toValue: 0,
          useNativeDriver: true
        })
      ]).start();

      boardPulse.stopAnimation();
      boardPulse.setValue(0);
      Animated.sequence([
        Animated.timing(boardPulse, {
          duration: world.event === "bust" ? 120 : 90,
          toValue: world.event === "bust" ? 1 : 0.82,
          useNativeDriver: true
        }),
        Animated.spring(boardPulse, {
          bounciness: world.event === "bust" ? 6 : 10,
          speed: world.event === "bust" ? 14 : 18,
          toValue: 0,
          useNativeDriver: true
        })
      ]).start();
    }

    if (
      (world.event === "lock" || world.event === "clear") &&
      (world.lineBurst.rows.length || world.lineBurst.columns.length)
    ) {
      setWarningBurst(null);
      setCelebrationBurst({
        cols: world.lineBurst.columns,
        nonce: world.eventNonce,
        rows: world.lineBurst.rows
      });
      lineFlash.stopAnimation();
      lineFlash.setValue(0);
      Animated.sequence([
        Animated.timing(lineFlash, {
          duration: 90,
          toValue: 1,
          useNativeDriver: true
        }),
        Animated.timing(lineFlash, {
          duration: 120,
          toValue: 0.62,
          useNativeDriver: true
        }),
        Animated.timing(lineFlash, {
          duration: 280,
          toValue: 0,
          useNativeDriver: true
        })
      ]).start();
      return;
    }

    if (world.event === "bust" && (world.lineBurst.rows.length || world.lineBurst.columns.length)) {
      setCelebrationBurst(null);
      setWarningBurst({
        cols: world.lineBurst.columns,
        nonce: world.eventNonce,
        rows: world.lineBurst.rows
      });
      lineFlash.stopAnimation();
      lineFlash.setValue(0);
      Animated.sequence([
        Animated.timing(lineFlash, {
          duration: 80,
          toValue: 1,
          useNativeDriver: true
        }),
        Animated.timing(lineFlash, {
          duration: 260,
          toValue: 0,
          useNativeDriver: true
        })
      ]).start();

      boardShake.stopAnimation();
      boardShake.setValue(0);
      Animated.sequence([
        Animated.timing(boardShake, {
          duration: 38,
          toValue: 1,
          useNativeDriver: true
        }),
        Animated.timing(boardShake, {
          duration: 46,
          toValue: -1,
          useNativeDriver: true
        }),
        Animated.timing(boardShake, {
          duration: 54,
          toValue: 0.7,
          useNativeDriver: true
        }),
        Animated.timing(boardShake, {
          duration: 72,
          toValue: 0,
          useNativeDriver: true
        })
      ]).start();
    }
  }, [boardPulse, boardShake, lineFlash, placementImpact, world]);

  useEffect(() => {
    if (!celebrationBurst) {
      return;
    }

    const timeout = setTimeout(() => {
      setCelebrationBurst((current) =>
        current?.nonce === celebrationBurst.nonce ? null : current
      );
    }, 900);

    return () => clearTimeout(timeout);
  }, [celebrationBurst]);

  useEffect(() => {
    if (!warningBurst) {
      return;
    }

    const timeout = setTimeout(() => {
      setWarningBurst((current) =>
        current?.nonce === warningBurst.nonce ? null : current
      );
    }, 650);

    return () => clearTimeout(timeout);
  }, [warningBurst]);

  useEffect(() => {
    const timeout = setTimeout(syncBoardMetrics, 0);
    return () => clearTimeout(timeout);
  }, [boardCell, matrixSize, device.height, device.width, world?.status]);

  useEffect(() => {
    if (!tutorialStep) {
      return;
    }

    if (tutorialStep.id === "deal" && world?.status === "playing") {
      setTutorialStepIndex(2);
      return;
    }

    if (tutorialStep.id === "place-tile" && (world?.turns ?? 0) >= 1) {
      setTutorialStepIndex(4);
      return;
    }

    if (tutorialStep.id === "undo" && tutorialUndoComplete) {
      setTutorialStepIndex(6);
    }
  }, [tutorialStep, tutorialUndoComplete, world?.status, world?.turns]);

  useEffect(() => {
    if (!tutorialStep) {
      setTutorialSpotlight(null);
      return;
    }

    const timeout = setTimeout(() => {
      if (tutorialStep.target === "none") {
        setTutorialSpotlight(null);
        return;
      }

      if (tutorialStep.target === "banner") {
        measureViewFrame(bannerRef, setTutorialSpotlight);
        return;
      }

      if (tutorialStep.target === "deal") {
        measureViewFrame(dealButtonRef, setTutorialSpotlight);
        return;
      }

      if (tutorialStep.target === "undo") {
        measureViewFrame(undoButtonRef, setTutorialSpotlight);
        return;
      }

      if (tutorialStep.target === "queue") {
        measureViewFrame(queueStageRef, setTutorialSpotlight);
        return;
      }

      if (tutorialStep.target === "lead-tile") {
        measureLeadTileFrame(setTutorialSpotlight);
        return;
      }

      if (tutorialStep.target === "board-center") {
        boardRef.current?.measureInWindow((x, y, width, height) => {
          boardMetricsRef.current = { height, width, x, y };
          setTutorialSpotlight(getBoardCellFrame(TUTORIAL_TARGET_CELL.row, TUTORIAL_TARGET_CELL.col));
        });
      }
    }, 40);

    return () => clearTimeout(timeout);
  }, [
    boardCell,
    device.height,
    device.width,
    tutorialStep,
    world?.status,
    world?.turns
  ]);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponderCapture: (_, gesture) =>
        dragEnabled && Math.abs(gesture.dx) + Math.abs(gesture.dy) > 4,
      onMoveShouldSetPanResponder: (_, gesture) =>
        dragEnabled && Math.abs(gesture.dx) + Math.abs(gesture.dy) > 4,
      onPanResponderGrant: (_, gesture) => {
        syncBoardMetrics();
        dragOffset.setValue({ x: 0, y: 0 });
        leadTileRef.current?.measureInWindow((x, y, width, height) => {
          const activeTile = worldRef.current?.queue[0];

          if (activeTile) {
            setDragGhost({
              height,
              tile: activeTile,
              width,
              x,
              y
            });
          }
        });
        setDragging(true);
      },
      onPanResponderMove: (_, gesture) => {
        dragOffset.setValue({ x: gesture.dx, y: gesture.dy });
        updateHoveredCell(gesture.moveX, gesture.moveY);
      },
      onPanResponderRelease: (_, gesture) => finishDrag(gesture.moveX, gesture.moveY),
      onPanResponderTerminationRequest: () => false,
      onPanResponderTerminate: resetDrag,
      onStartShouldSetPanResponderCapture: () => dragEnabled,
      onStartShouldSetPanResponder: () => dragEnabled
    })
  ).current;

  function syncBoardMetrics() {
    boardRef.current?.measureInWindow((x, y, width, height) => {
      boardMetricsRef.current = { height, width, x, y };
    });
  }

  function measureViewFrame(
    ref: { current: View | null },
    onMeasured: (frame: TileFrame | null) => void
  ) {
    ref.current?.measureInWindow((x, y, width, height) => {
      onMeasured(
        width && height
          ? {
              height,
              width,
              x,
              y
            }
          : null
      );
    });
  }

  function resetTransientState() {
    dragOffset.stopAnimation();
    dragOffset.setValue({ x: 0, y: 0 });
    placementFlightProgress.stopAnimation();
    placementFlightProgress.setValue(0);
    pendingPlacementWorldRef.current = null;
    setQueueAdvanceEffect(null);
    setPendingSpecialMove(null);
    setPlacementFlight(null);
    setDragging(false);
    setDragGhost(null);
    setHoveredCell(null);
  }

  function clearTutorial() {
    setTutorialStepIndex(null);
    setTutorialSpotlight(null);
    setTutorialUndoComplete(false);
  }

  function advanceTutorial() {
    if (!tutorialStep) {
      return;
    }

    if (tutorialStep.id === "done") {
      clearTutorial();
      return;
    }

    setTutorialStepIndex((current) =>
      current === null ? current : Math.min(current + 1, TUTORIAL_STEPS.length - 1)
    );
  }

  function stopTutorial() {
    clearTutorial();
  }

  function startTutorial() {
    resetTransientState();
    setCelebrationBurst(null);
    setWarningBurst(null);
    setSetupStep("splash");
    setUndoStack([]);
    setUndosUsed(0);
    setWorld(null);
    setTutorialUndoComplete(false);
    setTutorialStepIndex(0);
    void fireHaptic(settings.haptics, "confirm");
  }

  function goToSetupStep(step: SetupStep) {
    setSetupStep(step);
    void fireHaptic(settings.haptics, "tap");
  }

  useEffect(() => {
    if (!tutorialParam) {
      tutorialRouteHandledRef.current = null;
      return;
    }

    if (tutorialRouteHandledRef.current === tutorialParam || tutorialActive || currentWorld) {
      return;
    }

    tutorialRouteHandledRef.current = tutorialParam;
    startTutorial();
    router.replace("/play" as Href);
  }, [currentWorld, tutorialActive, tutorialParam]);

  function getBoardCellFrame(row: number, col: number): TileFrame | null {
    const metrics = boardMetricsRef.current;

    if (!metrics) {
      return null;
    }

    const cellInset = boardDense ? 4 : 8;

    return {
      height: boardCell - cellInset,
      width: boardCell - cellInset,
      x: metrics.x + col * (boardCell + boardGap) + cellInset / 2,
      y: metrics.y + row * (boardCell + boardGap) + cellInset / 2
    };
  }

  function measureLeadTileFrame(onMeasured: (frame: TileFrame | null) => void) {
    if (!leadTileRef.current) {
      onMeasured(null);
      return;
    }

    leadTileRef.current.measureInWindow((x, y, width, height) => {
      onMeasured(
        width && height
          ? {
              height,
              width,
              x,
              y
            }
          : null
      );
    });
  }

  function pointToCell(x: number, y: number) {
    const metrics = boardMetricsRef.current;

    if (
      !metrics ||
      x < metrics.x ||
      y < metrics.y ||
      x > metrics.x + metrics.width ||
      y > metrics.y + metrics.height
    ) {
      return null;
    }

    const col = Math.floor(((x - metrics.x) / metrics.width) * GRID_SIZE);
    const row = Math.floor(((y - metrics.y) / metrics.height) * GRID_SIZE);
    return row >= 0 && row < GRID_SIZE && col >= 0 && col < GRID_SIZE
      ? { col, row }
      : null;
  }

  function updateHoveredCell(x: number, y: number) {
    const cell = pointToCell(x, y);
    const nextWorld = worldRef.current;

    if (cell && nextWorld && canPlaceAt(nextWorld, cell.row, cell.col)) {
      setHoveredCell(cell);
    } else {
      setHoveredCell(null);
    }
  }

  function resetDrag() {
    setHoveredCell(null);
    Animated.spring(dragOffset, {
      bounciness: 0,
      speed: 24,
      toValue: { x: 0, y: 0 },
      useNativeDriver: true
    }).start(() => {
      setDragging(false);
      setDragGhost(null);
    });
  }

  function finishDrag(x: number, y: number) {
    const cell = pointToCell(x, y);
    if (cell) {
      const activeGhost = dragGhost;

      dragOffset.stopAnimation((offset) => {
        const startFrame = activeGhost
          ? {
              height: activeGhost.height,
              width: activeGhost.width,
              x: activeGhost.x + offset.x,
              y: activeGhost.y + offset.y
            }
          : undefined;

        dragOffset.setValue({ x: 0, y: 0 });
        setDragging(false);
        setHoveredCell(null);
        setDragGhost(null);
        commitPlacement(cell.row, cell.col, startFrame);
      });
      return;
    }

    resetDrag();
  }

  function applyPlacedWorld(placedWorld: GameWorld) {
    const previousWorld = worldRef.current;

    if (previousWorld?.runId === placedWorld.runId) {
      setUndoStack((current) => [...current.slice(-(UNDO_LIMIT * 2)), previousWorld]);
    }

    pendingPlacementWorldRef.current = null;
    setPendingSpecialMove(null);
    setWorld(placedWorld);

    if (placedWorld.event === "bust") {
      void fireHaptic(settings.haptics, "damage");
    } else if (placedWorld.event === "lock" || placedWorld.event === "clear") {
      void fireHaptic(settings.haptics, "confirm");
    } else {
      void fireHaptic(settings.haptics, "tap");
    }
  }

  function beginPlacementFlight({
    action = "place",
    col,
    resolvedTile,
    row,
    sourceTileId,
    startFrame
  }: {
    action?: "place" | "swap";
    col: number;
    resolvedTile?: StackTile;
    row: number;
    sourceTileId?: string;
    startFrame?: TileFrame;
  }) {
    if (motionLocked) {
      return;
    }

    const nextWorld = worldRef.current;
    const lead = nextWorld?.queue[0];

    if (!nextWorld || !lead) {
      return;
    }

    const placedWorld =
      action === "swap"
        ? resolvedTile
          ? swapBoardTile(nextWorld, row, col, resolvedTile)
          : nextWorld
        : placeQueueTile(nextWorld, row, col, resolvedTile);

    if (placedWorld === nextWorld) {
      return;
    }

    const targetFrame = getBoardCellFrame(row, col);
    const queueEffectCards = createQueueAdvanceEffect(
      createQueueSnapshot(nextWorld.queue),
      createQueueSnapshot(placedWorld.queue)
    );

    if (!targetFrame) {
      applyPlacedWorld(placedWorld);
      return;
    }

    const launch = (measuredFrame: TileFrame | null) => {
      if (!measuredFrame) {
        applyPlacedWorld(placedWorld);
        return;
      }

      const nonce = Date.now();
      placementFlightProgress.stopAnimation();
      placementFlightProgress.setValue(0);
      pendingPlacementWorldRef.current = placedWorld;
      setHoveredCell(null);
      setQueueAdvanceEffect(
        queueEffectCards
          ? {
              cards: queueEffectCards,
              nonce
            }
          : null
      );
      setPlacementFlight({
        col,
        end: targetFrame,
        nonce,
        row,
        sourceTileId: sourceTileId ?? lead.id,
        start: measuredFrame,
        tile: resolvedTile ?? lead
      });

      Animated.timing(placementFlightProgress, {
        duration: 700,
        easing: Easing.bezier(0.18, 0.82, 0.22, 1),
        toValue: 1,
        useNativeDriver: true
      }).start(({ finished }) => {
        setQueueAdvanceEffect((current) => (current?.nonce === nonce ? null : current));
        setPlacementFlight((current) => (current?.nonce === nonce ? null : current));

        if (!finished) {
          pendingPlacementWorldRef.current = null;
          return;
        }

        if (pendingPlacementWorldRef.current) {
          applyPlacedWorld(pendingPlacementWorldRef.current);
        }
      });
    };

    if (startFrame) {
      launch(startFrame);
      return;
    }

    syncBoardMetrics();
    measureLeadTileFrame(launch);
  }

  function commitPlacement(row: number, col: number, startFrame?: TileFrame) {
    const nextWorld = worldRef.current;
    const tile = nextWorld?.queue[0];

    if (!nextWorld || !tile || interactionLocked) {
      return;
    }

    if (isSwapTile(tile)) {
      if (!canSwapAt(nextWorld, row, col)) {
        return;
      }

      setPendingSpecialMove({
        kind: "swap",
        target: { col, row },
        tile
      });
      return;
    }

    if (isWildTile(tile)) {
      if (!canPlaceAt(nextWorld, row, col)) {
        return;
      }

      setPendingSpecialMove({
        kind: "wild",
        target: { col, row },
        tile
      });
      return;
    }

    beginPlacementFlight({
      col,
      row,
      startFrame
    });
  }

  function completeSpecialMove(rank: StandardTileRank) {
    const move = pendingSpecialMove;

    if (!move) {
      return;
    }

    setPendingSpecialMove(null);
    beginPlacementFlight({
      action: move.kind === "swap" ? "swap" : "place",
      col: move.target.col,
      resolvedTile: createSelectedTile(move.tile, rank),
      row: move.target.row,
      sourceTileId: move.tile.id
    });
  }

  function cancelSpecialMove() {
    setPendingSpecialMove(null);
  }

  function undoLastMove() {
    if (!undoAvailable) {
      return;
    }

    resetTransientState();
    setUndoStack((current) => {
      const previousWorld = current[current.length - 1];

      if (previousWorld) {
        setWorld(previousWorld);
      }

      return current.slice(0, -1);
    });
    setUndosUsed((current) => current + 1);

    if (tutorialStep?.id === "undo") {
      setTutorialUndoComplete(true);
    }

    void fireHaptic(settings.haptics, "tap");
  }

  function buildDifficultyConfig(difficultyKey: SetupDifficulty) {
    const option =
      DIFFICULTY_OPTIONS.find((candidate) => candidate.key === difficultyKey) ??
      DIFFICULTY_OPTIONS[0];

    return {
      blackjackBonusMultiplier: option.bonusMultiplier,
      bustPenaltyMultiplier: option.penaltyMultiplier,
      difficulty: option.key,
      openingTiles: option.openingTiles
    };
  }

  function startRun() {
    if (!canAfford) {
      return;
    }

    resetTransientState();
    setCelebrationBurst(null);
    setWarningBurst(null);
    setUndoStack([]);
    setUndosUsed(0);
    setDragging(false);
    setDragGhost(null);
    setHoveredCell(null);
    setSetupStep("splash");
    setWorld(createWorld(selectedBuyIn, buildDifficultyConfig(selectedDifficulty)));
    void fireHaptic(settings.haptics, "confirm");
  }

  function restartRun() {
    const difficultyKey = currentWorld?.difficulty ?? selectedDifficulty;

    resetTransientState();
    setCelebrationBurst(null);
    setWarningBurst(null);
    setUndoStack([]);
    setUndosUsed(0);
    setDragging(false);
    setDragGhost(null);
    setHoveredCell(null);
    setSetupStep("splash");
    setWorld(createWorld(currentWorld?.buyIn ?? selectedBuyIn, buildDifficultyConfig(difficultyKey)));
    void fireHaptic(settings.haptics, "confirm");
  }

  function canSelectBoardCell(row: number, col: number) {
    if (!currentWorld || interactionLocked) {
      return false;
    }

    if (
      tutorialPlacementOpen &&
      (row !== TUTORIAL_TARGET_CELL.row || col !== TUTORIAL_TARGET_CELL.col)
    ) {
      return false;
    }

    return isSwapTile(leadTile)
      ? canSwapAt(currentWorld, row, col)
      : canPlaceAt(currentWorld, row, col);
  }

  const playerName =
    profile?.sUserName ??
    (status === "authenticated" ? "Player" : status === "guest" ? "Guest" : "Local");
  const playerMode =
    status === "authenticated"
      ? "Verified profile"
      : status === "guest"
        ? "Guest session"
        : "Offline session";
  const wallet =
    typeof profile?.nChips === "number"
      ? formatChipCount(profile.nChips)
      : status === "guest"
        ? "Guest"
        : "--";
  const cardsLeft = String(currentWorld ? getDeckCountLabel(currentWorld) : SHOE_COUNT);
  const activeCelebrationRows = celebrationBurst?.rows ?? [];
  const activeCelebrationCols = celebrationBurst?.cols ?? [];
  const activeWarningRows = warningBurst?.rows ?? [];
  const activeWarningCols = warningBurst?.cols ?? [];
  const bustedRows = rowLines
    .filter((line) => line.total > TARGET_TOTAL)
    .map((line) => line.index);
  const bustedCols = columnLines
    .filter((line) => line.total > TARGET_TOTAL)
    .map((line) => line.index);
  const activeBustedRows = Array.from(new Set([...bustedRows, ...activeWarningRows]));
  const activeBustedCols = Array.from(new Set([...bustedCols, ...activeWarningCols]));
  const burstRows = activeBustedRows;
  const burstCols = activeBustedCols;
  const effectsKind = celebrationBurst ? "celebrate" : warningBurst ? "warning" : null;
  const bannerRules = [
    { label: "Ante", value: formatChipCount(currentBuyIn) },
    { label: "Play", value: `-${formatChipCount(currentMoveCost)}` },
    { label: "21", value: `+${formatChipCount(currentBlackjackBonus)}` },
    { label: "Bust", value: `-${formatChipCount(currentBustPenalty)}` }
  ];
  const bannerStats = [
    { label: "Wallet", value: wallet },
    { label: "Score", value: currentScoreLabel }
  ];
  const activeSetupStep: SetupStep =
    tutorialActive && tutorialStep?.id === "deal" ? "difficulty" : setupStep;
  const setupStepIndex =
    activeSetupStep === "splash" ? 0 : activeSetupStep === "ante" ? 1 : 2;
  const setupWizardTitle =
    activeSetupStep === "splash"
      ? "21 Stackem"
      : activeSetupStep === "ante"
        ? "Select your ante."
        : "Select your difficulty.";
  const setupWizardBody =
    activeSetupStep === "splash"
      ? "Walk through a short guided start flow, then deal straight into the table."
      : activeSetupStep === "ante"
        ? "Your ante is the bankroll you sit down with. Every tile placement costs 1 percent of it."
        : "Difficulty changes the opening board and how big the 21 rewards and bust penalties are.";
  const setupSelectedOpeningLabel = selectedDifficultyOption.openingTiles
    ? `${selectedDifficultyOption.openingTiles} seeded tiles`
    : "Empty grid";
  const showSetupOverlay = !currentWorld && (!tutorialActive || tutorialStep?.id === "deal");
  const specialTargetLabel = pendingSpecialMove
    ? `Row ${pendingSpecialMove.target.row + 1} - Column ${pendingSpecialMove.target.col + 1}`
    : "";
  const specialPickerColumns = isPortraitMobile ? 3 : isLandscapeMobile ? 4 : 5;
  const specialModalWidth = clamp(
    Math.min(frameWidth - outerPad * 2, isDesktop ? 560 : 500),
    320,
    560
  );
  const specialValueTileWidth = clamp(
    Math.floor(
      (specialModalWidth - theme.spacing.lg * 2 - theme.spacing.sm * (specialPickerColumns - 1)) /
        specialPickerColumns
    ),
    82,
    104
  );
  const tutorialCardWidth = Math.min(
    isDesktop ? 380 : Math.max(300, frameWidth - outerPad * 2),
    frameWidth - outerPad * 2
  );
  const tutorialSpotlightPad = tutorialSpotlight ? 14 : 0;
  const tutorialHole = tutorialSpotlight
    ? {
        height: tutorialSpotlight.height + tutorialSpotlightPad * 2,
        width: tutorialSpotlight.width + tutorialSpotlightPad * 2,
        x: Math.max(8, tutorialSpotlight.x - tutorialSpotlightPad),
        y: Math.max(device.insets.top + 8, tutorialSpotlight.y - tutorialSpotlightPad)
      }
    : null;
  const tutorialCardBelow =
    !tutorialHole ||
    tutorialHole.y + tutorialHole.height + 220 < device.height - device.insets.bottom;
  const tutorialCardTop = tutorialHole
    ? tutorialCardBelow
      ? tutorialHole.y + tutorialHole.height + 18
      : tutorialHole.y - 196
    : Math.max(device.insets.top + 28, device.height * 0.22);
  const tutorialCardLeft = tutorialHole
    ? clamp(
        tutorialHole.x + tutorialHole.width / 2 - tutorialCardWidth / 2,
        outerPad,
        Math.max(outerPad, device.width - tutorialCardWidth - outerPad)
      )
    : clamp(
        (device.width - tutorialCardWidth) / 2,
        outerPad,
        device.width - tutorialCardWidth - outerPad
      );
  const dragGhostLayer = dragGhost ? (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.dragGhost,
        {
          height: dragGhost.height,
          left: dragGhost.x,
          top: dragGhost.y,
          transform: [
            ...dragOffset.getTranslateTransform(),
            { rotate: "-4deg" },
            { scale: 1.08 }
          ],
          width: dragGhost.width
        }
      ]}
    >
      <TileFace compact dense={queueDense} lead tile={dragGhost.tile} />
    </Animated.View>
  ) : null;
  const placementFlightLayer = placementFlight
    ? (() => {
        const deltaX = placementFlight.end.x - placementFlight.start.x;
        const deltaY = placementFlight.end.y - placementFlight.start.y;
        const direction = deltaX === 0 ? 1 : Math.sign(deltaX);
        const bank = Math.min(4.5, Math.max(1.4, Math.abs(deltaX) / 80)) * direction;
        const arcHeight = Math.max(18, Math.min(36, Math.hypot(deltaX, deltaY) * 0.12));

        return (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.placementFlightCard,
              {
                height: placementFlightProgress.interpolate({
                  inputRange: [0, 0.2, 0.78, 1],
                  outputRange: [
                    placementFlight.start.height,
                    placementFlight.start.height * 1.02,
                    placementFlight.end.height * 1.01,
                    placementFlight.end.height
                  ]
                }),
                left: placementFlight.start.x,
                opacity: placementFlightProgress.interpolate({
                  inputRange: [0, 0.1, 1],
                  outputRange: [0.96, 1, 1]
                }),
                top: placementFlight.start.y,
                transform: [
                  {
                    translateX: placementFlightProgress.interpolate({
                      inputRange: [0, 0.14, 0.82, 1],
                      outputRange: [0, deltaX * 0.06, deltaX + direction * 3, deltaX]
                    })
                  },
                  {
                    translateY: Animated.add(
                      placementFlightProgress.interpolate({
                        inputRange: [0, 0.14, 0.82, 1],
                        outputRange: [0, deltaY * 0.08, deltaY + 3, deltaY]
                      }),
                      placementFlightProgress.interpolate({
                        inputRange: [0, 0.12, 0.48, 0.82, 1],
                        outputRange: [0, -arcHeight * 0.52, -arcHeight, -arcHeight * 0.2, 0]
                      })
                    )
                  },
                  {
                    scale: placementFlightProgress.interpolate({
                      inputRange: [0, 0.16, 0.5, 0.84, 1],
                      outputRange: [1, 1.05, 1.045, 1.01, 1]
                    })
                  },
                  {
                    rotate: placementFlightProgress.interpolate({
                      inputRange: [0, 0.16, 0.72, 1],
                      outputRange: [`${-0.8 * direction}deg`, `${bank}deg`, `${bank * 0.32}deg`, "0deg"]
                    })
                  }
                ],
                width: placementFlightProgress.interpolate({
                  inputRange: [0, 0.2, 0.78, 1],
                  outputRange: [
                    placementFlight.start.width,
                    placementFlight.start.width * 1.02,
                    placementFlight.end.width * 1.01,
                    placementFlight.end.width
                  ]
                })
              }
            ]}
          >
            <TileFace compact dense={queueDense || boardDense} lead tile={placementFlight.tile} />
          </Animated.View>
        );
      })()
    : null;
  const specialChoiceOverlay = pendingSpecialMove ? (
    <View style={styles.specialOverlay}>
      <View style={[styles.specialModal, { width: Math.min(specialModalWidth, frameWidth - outerPad * 2) }]}>
        <LinearGradient
          colors={
            pendingSpecialMove.kind === "wild"
              ? ["#113523", "#0b1711", "#144b31"]
              : ["#31140f", "#0f1013", "#4b2117"]
          }
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.specialHero}
        >
          <View style={styles.specialHeroOrb} />
          <View style={styles.specialHeroTile}>
            <TileFace compact tile={pendingSpecialMove.tile} />
          </View>
          <View style={styles.specialHeroCopy}>
            <Text style={styles.specialKicker}>
              {pendingSpecialMove.kind === "wild" ? "Wild Card" : "Swap Card"}
            </Text>
            <Text style={styles.specialTitle}>
              {pendingSpecialMove.kind === "wild"
                ? "Call any value."
                : "Replace the target tile."}
            </Text>
            <Text style={styles.specialHint}>
              {pendingSpecialMove.kind === "wild"
                ? `Choose the tile for ${specialTargetLabel}.`
                : `Pick the new value for ${specialTargetLabel}.`}
            </Text>
          </View>
        </LinearGradient>
        <View style={styles.specialMetaRow}>
          <View style={styles.specialMetaCard}>
            <Text style={styles.specialMetaLabel}>Target</Text>
            <Text style={styles.specialMetaValue}>{specialTargetLabel}</Text>
          </View>
          <View style={styles.specialMetaCard}>
            <Text style={styles.specialMetaLabel}>Effect</Text>
            <Text style={styles.specialMetaValue}>
              {pendingSpecialMove.kind === "wild" ? "Place any value" : "Swap in any value"}
            </Text>
          </View>
        </View>
        <View style={styles.specialValueGrid}>
          {SPECIAL_VALUE_OPTIONS.map((option) => (
            <Pressable
              key={option.rank}
              onPress={() => completeSpecialMove(option.rank)}
              style={({ pressed }) => [
                styles.specialValueChip,
                { width: specialValueTileWidth },
                pressed && styles.specialValueChipPressed
              ]}
            >
              <LinearGradient
                colors={["rgba(255, 255, 255, 0.98)", "rgba(226, 230, 214, 0.92)"]}
                end={{ x: 1, y: 1 }}
                start={{ x: 0, y: 0 }}
                style={styles.specialValueSurface}
              >
                <Text style={styles.specialValueText}>{option.label}</Text>
                <Text style={styles.specialValueNote}>{getSpecialOptionHint(option.rank)}</Text>
              </LinearGradient>
            </Pressable>
          ))}
        </View>
        <Pressable onPress={cancelSpecialMove} style={styles.specialCancel}>
          <Text style={styles.specialCancelText}>Back</Text>
        </Pressable>
      </View>
    </View>
  ) : null;
  const tutorialOverlay = tutorialStep ? (
    <View pointerEvents="box-none" style={styles.tutorialOverlay}>
      {tutorialHole ? (
        <>
          <View style={[styles.tutorialShade, { height: tutorialHole.y, left: 0, right: 0, top: 0 }]} />
          <View
            style={[
              styles.tutorialShade,
              { left: 0, top: tutorialHole.y, width: tutorialHole.x, height: tutorialHole.height }
            ]}
          />
          <View
            style={[
              styles.tutorialShade,
              {
                left: tutorialHole.x + tutorialHole.width,
                right: 0,
                top: tutorialHole.y,
                height: tutorialHole.height
              }
            ]}
          />
          <View
            style={[
              styles.tutorialShade,
              {
                bottom: 0,
                left: 0,
                right: 0,
                top: tutorialHole.y + tutorialHole.height
              }
            ]}
          />
          <View
            pointerEvents="none"
            style={[
              styles.tutorialSpotlight,
              {
                height: tutorialHole.height,
                left: tutorialHole.x,
                top: tutorialHole.y,
                width: tutorialHole.width
              }
            ]}
          />
          {tutorialStep.advance === "action" ? (
            <View
              pointerEvents="none"
              style={[
                styles.tutorialTargetTag,
                {
                  left: clamp(
                    tutorialHole.x,
                    outerPad,
                    device.width - outerPad - 120
                  ),
                  top: Math.max(device.insets.top + 12, tutorialHole.y - 38)
                }
              ]}
            >
              <Text style={styles.tutorialTargetTagText}>Tap Here</Text>
            </View>
          ) : null}
        </>
      ) : (
        <View style={styles.tutorialShadeFull} />
      )}

      <View
        style={[
          styles.tutorialCard,
          {
            left: tutorialCardLeft,
            top: clamp(
              tutorialCardTop,
              device.insets.top + 16,
              device.height - device.insets.bottom - 220
            ),
            width: tutorialCardWidth
          }
        ]}
      >
        <Text style={styles.tutorialKicker}>StackBot Guide</Text>
        <Text style={styles.tutorialTitle}>{tutorialStep.title}</Text>
        <Text style={styles.tutorialBody}>{tutorialStep.body}</Text>
        {tutorialStep.advance === "action" ? (
          <Text style={styles.tutorialActionText}>Follow the spotlight to continue.</Text>
        ) : null}
        <View style={styles.tutorialActions}>
          {tutorialStep.advance === "manual" ? (
            <Pressable onPress={advanceTutorial} style={({ pressed }) => [
              styles.tutorialPrimaryAction,
              pressed && styles.tutorialPrimaryActionPressed
            ]}>
              <Text style={styles.tutorialPrimaryActionText}>
                {tutorialStep.actionLabel ?? "Next"}
              </Text>
            </Pressable>
          ) : null}
          <Pressable onPress={stopTutorial} style={({ pressed }) => [
            styles.tutorialSecondaryAction,
            pressed && styles.tutorialSecondaryActionPressed
          ]}>
            <Text style={styles.tutorialSecondaryActionText}>
              {tutorialStep.id === "done" ? "Close" : "Exit Tutorial"}
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  ) : null;
  const setupOverlay = showSetupOverlay ? (
    <View style={styles.setupOverlay}>
      <ScrollView
        bounces={false}
        contentContainerStyle={styles.setupOverlayContent}
        showsVerticalScrollIndicator={false}
        style={styles.setupOverlayScroll}
      >
        <View
          style={[
            styles.setupCard,
            { width: Math.min(frameWidth, isDesktop ? 540 : 480) }
          ]}
        >
          <LinearGradient
            colors={["#133225", "#0a0f0d", "#38170f"]}
            end={{ x: 1, y: 1 }}
            start={{ x: 0, y: 0 }}
            style={styles.setupHero}
          >
            <View style={[styles.bannerGlow, styles.bannerGlowWarm]} />
            <View style={[styles.bannerGlow, styles.bannerGlowCool]} />
            <Text style={styles.setupKicker}>
              {activeSetupStep === "splash" ? "Guided Start" : `Step ${setupStepIndex + 1} of 3`}
            </Text>
            <Text style={styles.setupTitle}>{setupWizardTitle}</Text>
            <Text style={styles.setupBody}>{setupWizardBody}</Text>
            <View style={styles.setupProgressRow}>
              {["Welcome", "Ante", "Difficulty"].map((label, index) => {
                const active = index === setupStepIndex;
                const complete = index < setupStepIndex;

                return (
                  <View key={label} style={styles.setupProgressStep}>
                    <View
                      style={[
                        styles.setupProgressDot,
                        active && styles.setupProgressDotActive,
                        complete && styles.setupProgressDotComplete
                      ]}
                    />
                    <Text
                      style={[
                        styles.setupProgressLabel,
                        active && styles.setupProgressLabelActive
                      ]}
                    >
                      {label}
                    </Text>
                  </View>
                );
              })}
            </View>
          </LinearGradient>

          {activeSetupStep === "splash" ? (
            <>
              <View style={styles.setupSection}>
                <Text style={styles.controlSectionLabel}>Table Flow</Text>
                <View style={[styles.controlSectionSurface, styles.setupSectionSurface]}>
                  <View style={styles.setupIntroGrid}>
                    {[
                      {
                        detail: "Pick the bankroll you bring to the table.",
                        step: "1 Ante"
                      },
                      {
                        detail: "Choose how hot the opening board plays.",
                        step: "2 Difficulty"
                      },
                      {
                        detail: "Deal in and start chasing 21s.",
                        step: "3 Play"
                      }
                    ].map((item) => (
                      <View key={item.step} style={styles.setupIntroCard}>
                        <Text style={styles.setupIntroStep}>{item.step}</Text>
                        <Text style={styles.setupIntroDetail}>{item.detail}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              </View>

              <View style={styles.setupSection}>
                <Text style={styles.controlSectionLabel}>Table Snapshot</Text>
                <View style={[styles.controlSectionSurface, styles.setupSectionSurface]}>
                  <View style={styles.setupMetaGrid}>
                    <View style={styles.setupMetaCard}>
                      <Text style={styles.setupMetaLabel}>Grid</Text>
                      <Text style={styles.setupMetaValue}>5 x 5</Text>
                    </View>
                    <View style={styles.setupMetaCard}>
                      <Text style={styles.setupMetaLabel}>Queue</Text>
                      <Text style={styles.setupMetaValue}>3 live tiles</Text>
                    </View>
                    <View style={styles.setupMetaCard}>
                      <Text style={styles.setupMetaLabel}>Undo</Text>
                      <Text style={styles.setupMetaValue}>3 per run</Text>
                    </View>
                  </View>
                </View>
              </View>

              <View style={styles.setupActions}>
                <View style={styles.setupPrimaryAction}>
                  <GameButton
                    compact
                    label="Select Ante"
                    onPress={() => goToSetupStep("ante")}
                    tone="primary"
                  />
                </View>
                <Pressable
                  onPress={startTutorial}
                  style={({ pressed }) => [
                    styles.setupHelpButton,
                    pressed && styles.setupHelpButtonPressed
                  ]}
                >
                  <Text style={styles.setupHelpGlyph}>?</Text>
                </Pressable>
              </View>
            </>
          ) : null}

          {activeSetupStep === "ante" ? (
            <>
              <View style={styles.setupSection}>
                <Text style={styles.controlSectionLabel}>Ante</Text>
                <View style={[styles.controlSectionSurface, styles.setupSectionSurface]}>
                  <Text style={styles.setupSectionHint}>
                    Ante is your starting bankroll. Every tile costs 1 percent of it.
                  </Text>
                  <View style={styles.setupChipRow}>
                    {BUY_INS.map((buyIn) => {
                      const selected = selectedBuyIn === buyIn;

                      return (
                        <Pressable
                          key={buyIn}
                          onPress={() => setSelectedBuyIn(buyIn)}
                          style={({ pressed }) => [
                            styles.buyInChip,
                            styles.setupChip,
                            selected && styles.buyInChipSelected,
                            pressed && styles.buyInChipPressed
                          ]}
                        >
                          <Text style={[styles.buyInText, selected && styles.buyInTextSelected]}>
                            {formatChipCount(buyIn)}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                  <View style={styles.setupMetaGrid}>
                    <View style={styles.setupMetaCard}>
                      <Text style={styles.setupMetaLabel}>Start Bank</Text>
                      <Text style={styles.setupMetaValue}>{formatChipCount(selectedBuyIn)}</Text>
                    </View>
                    <View style={styles.setupMetaCard}>
                      <Text style={styles.setupMetaLabel}>Per Tile</Text>
                      <Text style={styles.setupMetaValue}>
                        {formatChipCount(calculateMoveCost(selectedBuyIn))}
                      </Text>
                    </View>
                    <View style={styles.setupMetaCard}>
                      <Text style={styles.setupMetaLabel}>Live Score</Text>
                      <Text style={styles.setupMetaValue}>{formatChipCount(selectedBuyIn)}</Text>
                    </View>
                  </View>
                  {!canAfford ? (
                    <Text style={styles.setupWarning}>
                      Wallet is below the selected ante.
                    </Text>
                  ) : null}
                </View>
              </View>

              <View style={styles.setupActionsSplit}>
                <View style={styles.setupActionHalf}>
                  <GameButton compact label="Back" onPress={() => goToSetupStep("splash")} />
                </View>
                <View style={styles.setupActionHalf}>
                  <GameButton
                    compact
                    label="Next"
                    onPress={() => goToSetupStep("difficulty")}
                    tone="primary"
                  />
                </View>
              </View>
            </>
          ) : null}

          {activeSetupStep === "difficulty" ? (
            <>
              <View style={styles.setupSection}>
                <Text style={styles.controlSectionLabel}>Difficulty</Text>
                <View style={[styles.controlSectionSurface, styles.setupSectionSurface]}>
                  <Text style={styles.setupSectionHint}>
                    Easy starts clean. Medium seeds 3 tiles with 2x bonus and penalty. Hard seeds 6 tiles with a 4x 21 bonus.
                  </Text>
                  <View style={styles.setupDifficultyStack}>
                    {DIFFICULTY_OPTIONS.map((option) => {
                      const selected = selectedDifficulty === option.key;

                      return (
                        <Pressable
                          key={option.key}
                          onPress={() => setSelectedDifficulty(option.key)}
                          style={({ pressed }) => [
                            styles.setupDifficultyCard,
                            selected && styles.setupDifficultyCardSelected,
                            pressed && styles.setupDifficultyCardPressed
                          ]}
                        >
                          <View style={styles.setupDifficultyCopy}>
                            <Text
                              style={[
                                styles.setupDifficultyLabel,
                                selected && styles.setupDifficultyLabelSelected
                              ]}
                            >
                              {option.label}
                            </Text>
                            <Text style={styles.setupDifficultyDescription}>
                              {option.description}
                            </Text>
                          </View>
                          <Text
                            style={[
                              styles.setupDifficultyState,
                              selected && styles.setupDifficultyStateSelected
                            ]}
                          >
                            {selected ? "Ready" : "Select"}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                  <View style={styles.setupMetaGrid}>
                    <View style={styles.setupMetaCard}>
                      <Text style={styles.setupMetaLabel}>Opening Grid</Text>
                      <Text style={styles.setupMetaValue}>{setupSelectedOpeningLabel}</Text>
                    </View>
                    <View style={styles.setupMetaCard}>
                      <Text style={styles.setupMetaLabel}>21 Bonus</Text>
                      <Text style={styles.setupMetaValue}>
                        +
                        {formatChipCount(
                          calculateBlackjackBonus(
                            selectedBuyIn,
                            selectedDifficultyOption.bonusMultiplier
                          )
                        )}
                      </Text>
                    </View>
                    <View style={styles.setupMetaCard}>
                      <Text style={styles.setupMetaLabel}>Bust</Text>
                      <Text style={styles.setupMetaValue}>
                        -
                        {formatChipCount(
                          calculateBustPenalty(
                            selectedBuyIn,
                            selectedDifficultyOption.penaltyMultiplier
                          )
                        )}
                      </Text>
                    </View>
                  </View>
                </View>
              </View>

              <View style={styles.setupActionsSplit}>
                {!tutorialActive ? (
                  <View style={styles.setupActionHalf}>
                    <GameButton compact label="Back" onPress={() => goToSetupStep("ante")} />
                  </View>
                ) : null}
                <View
                  ref={dealButtonRef}
                  style={[
                    tutorialActive ? styles.setupPrimaryAction : styles.setupActionHalf
                  ]}
                >
                  <GameButton
                    compact
                    disabled={!canAfford}
                    label="Start Table"
                    onPress={startRun}
                    tone="primary"
                  />
                </View>
              </View>
            </>
          ) : null}
        </View>
      </ScrollView>
    </View>
  ) : null;
  function renderGameBanner(padding: number, compact: boolean) {
    return (
      <View
        ref={bannerRef}
        style={[
          styles.strip,
          styles.bannerCard,
          { borderRadius: radius, minHeight: topHeight, padding }
        ]}
      >
        <LinearGradient
          colors={["#10281f", "#0a0f0d", "#3a1a12"]}
          end={{ x: 1, y: 1 }}
          start={{ x: 0, y: 0 }}
          style={[styles.bannerHero, compact && styles.bannerHeroCompact]}
        >
          <View style={[styles.bannerGlow, styles.bannerGlowWarm]} />
          <View style={[styles.bannerGlow, styles.bannerGlowCool]} />
          <View style={[styles.bannerHeader, compact && styles.bannerHeaderCompact]}>
            <View style={styles.bannerCopy}>
              <Text style={[styles.bannerTitle, compact && styles.bannerTitleCompact]}>
                21 Stackem
              </Text>
            </View>
            <Pressable
              onPress={() => router.replace("/" as Href)}
              style={({ pressed }) => [
                styles.bannerExitButton,
                pressed && styles.bannerExitButtonPressed
              ]}
            >
              <Text style={styles.bannerExitGlyph}>X</Text>
            </Pressable>
          </View>
          <View style={styles.bannerRuleRow}>
            {bannerRules.map((rule) => (
              <View key={rule.label} style={styles.bannerRuleChip}>
                <Text style={styles.bannerRuleLabel}>{rule.label}</Text>
                <Text style={styles.bannerRuleValue}>{rule.value}</Text>
              </View>
            ))}
          </View>
        </LinearGradient>

        <View style={[styles.bannerFooter, compact && styles.bannerFooterCompact]}>
          <View style={styles.identity}>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{playerName.slice(0, 2).toUpperCase()}</Text>
            </View>
            <View style={styles.identityCopy}>
              <Text numberOfLines={1} style={[styles.playerName, compact && styles.playerNameCompact]}>
                {playerName}
              </Text>
              <Text numberOfLines={2} style={styles.playerMeta}>
                {playerMode} - {leaderboardRuns} saved
              </Text>
            </View>
          </View>
          <View style={styles.bannerMetricGrid}>
            {bannerStats.map((stat) => (
              <View
                key={stat.label}
                style={[styles.bannerMetric, compact && styles.bannerMetricCompact]}
              >
                <Text style={styles.bannerMetricLabel}>{stat.label}</Text>
                <Text numberOfLines={1} style={styles.bannerMetricValue}>
                  {stat.value}
                </Text>
              </View>
            ))}
          </View>
        </View>
        {!compact ? (
          <View style={styles.bannerQueueStrip}>
            {renderQueueUndoTray(portraitQueueTileWidth, portraitQueueTileHeight, portraitQueueGap)}
          </View>
        ) : null}
      </View>
    );
  }

  function renderQueueUndoTray(tileWidth: number, tileHeight: number, gap: number) {
    const totalWidth = tileWidth * 4 + gap * 3;

    return (
      <View style={[styles.queueUndoRow, { gap, width: totalWidth }]}>
        <View ref={queueStageRef}>{renderQueue(tileWidth, tileHeight, gap)}</View>
        <View ref={undoButtonRef}>
          <Pressable
            disabled={!undoAvailable}
            onPress={undoLastMove}
            style={({ pressed }) => [
              styles.utilityButton,
              styles.queueUndoButton,
              { height: tileHeight, width: tileWidth },
              !undoAvailable && styles.utilityButtonDisabled,
              pressed && undoAvailable && styles.utilityButtonPressed
            ]}
          >
            <Text style={styles.utilityGlyph}>{"\u21B6"}</Text>
            <Text style={styles.utilityMeta}>{undoRemaining}</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  function renderQueueContent(
    tile: StackTile | null,
    tileWidth: number,
    tileHeight: number,
    lead: boolean
  ) {
    if (!tile) {
      return <View style={[styles.emptyTile, { height: tileHeight, width: tileWidth }]} />;
    }

    return <TileFace compact dense={queueDense} dimmed={!lead} lead={lead} tile={tile} />;
  }

  function renderQueueAdvanceOverlay(tileWidth: number, tileHeight: number, gap: number) {
    if (!queueAdvanceEffect) {
      return null;
    }

    const slotStep = tileWidth + gap;

    return (
      <View pointerEvents="none" style={styles.queueEffectsLayer}>
        {queueAdvanceEffect.cards.map((card, index) => {
          const liftHeight =
            card.kind === "deal"
              ? Math.max(16, Math.round(tileHeight * 0.26))
              : Math.max(10, Math.round(tileHeight * 0.18));
          const settleOvershoot = card.kind === "deal" ? -6 : -4;
          const startOffset =
            (card.fromIndex - card.toIndex) * slotStep +
            (card.kind === "deal" ? Math.min(24, Math.round(tileWidth * 0.18)) : 0);
          const holdStart = card.kind === "deal" ? 0.48 + index * 0.05 : 0.3 + index * 0.04;
          const movePeak = Math.min(0.9, holdStart + (card.kind === "deal" ? 0.32 : 0.36));

          return (
            <Animated.View
              key={`queue-advance-${queueAdvanceEffect.nonce}-${card.tile.id}`}
              style={[
                styles.queueEffectCard,
                card.lead && styles.queueCardLead,
                {
                  height: tileHeight,
                  left: card.toIndex * slotStep,
                  opacity: placementFlightProgress.interpolate({
                    inputRange:
                      card.kind === "deal" ? [0, holdStart - 0.08, holdStart, 1] : [0, 1],
                    outputRange:
                      card.kind === "deal" ? [0, 0, 0.82, 1] : [0.92, 1],
                    extrapolate: "clamp"
                  }),
                  transform: [
                    {
                      translateX: placementFlightProgress.interpolate({
                        inputRange: [0, holdStart, movePeak, 1],
                        extrapolate: "clamp",
                        outputRange: [startOffset, startOffset, settleOvershoot, 0]
                      })
                    },
                    {
                      translateY: placementFlightProgress.interpolate({
                        inputRange: [0, holdStart, holdStart + 0.16, movePeak, 1],
                        extrapolate: "clamp",
                        outputRange: [0, 0, -liftHeight, -2, 0]
                      })
                    },
                    {
                      scale: placementFlightProgress.interpolate({
                        inputRange: [0, holdStart, holdStart + 0.14, movePeak, 1],
                        extrapolate: "clamp",
                        outputRange: [
                          card.kind === "deal" ? 0.96 : 1,
                          card.kind === "deal" ? 0.96 : 1,
                          1.03,
                          1.01,
                          1
                        ]
                      })
                    },
                    {
                      rotate: placementFlightProgress.interpolate({
                        inputRange: [0, holdStart, movePeak, 1],
                        extrapolate: "clamp",
                        outputRange: [
                          "0deg",
                          "0deg",
                          card.lead ? "-0.8deg" : "-0.35deg",
                          "0deg"
                        ]
                      })
                    }
                  ],
                  width: tileWidth
                }
              ]}
            >
              {renderQueueContent(card.tile, tileWidth, tileHeight, card.lead)}
            </Animated.View>
          );
        })}
      </View>
    );
  }

  function renderQueue(tileWidth: number, tileHeight: number, gap: number) {
    const totalWidth = tileWidth * HAND_SIZE + gap * (HAND_SIZE - 1);
    const hiddenTileIds = new Set([
      ...(queueAdvanceEffect?.cards.map((card) => card.tile.id) ?? []),
      ...(placementFlight ? [placementFlight.sourceTileId] : [])
    ]);

    return (
      <View style={[styles.queueStage, { height: tileHeight, width: totalWidth }]}>
        <View style={[styles.queueRow, { gap }]}>
          {Array.from({ length: 3 }, (_, index) => {
            const tile = queue[index] ?? null;
            const visibleTile = tile && !hiddenTileIds.has(tile.id) ? tile : null;
            const lead = index === 0;
            const content = renderQueueContent(visibleTile, tileWidth, tileHeight, lead);

            if (visibleTile && lead && dragEnabled) {
              return (
                <Animated.View
                  key={`q-${index}`}
                  {...panResponder.panHandlers}
                  ref={leadTileRef}
                  style={[
                    styles.queueCard,
                    styles.queueCardLead,
                    dragging && styles.queueCardDragging,
                    {
                      height: tileHeight,
                      opacity: dragging ? 0.14 : 1,
                      transform: [
                        { scale: dragging ? 1 : 1.03 },
                        { rotate: dragging ? "0deg" : "-1deg" }
                      ],
                      width: tileWidth
                    }
                  ]}
                >
                  {content}
                </Animated.View>
              );
            }

            return (
              <View
                key={`q-${index}`}
                style={[styles.queueSlot, { height: tileHeight, width: tileWidth }]}
              >
                {content}
              </View>
            );
          })}
        </View>
        {renderQueueAdvanceOverlay(tileWidth, tileHeight, gap)}
      </View>
    );
  }

  const boardBurstLayer =
    activeCelebrationRows.length ||
    activeCelebrationCols.length ||
    activeWarningRows.length ||
    activeWarningCols.length ? (
      <View
        pointerEvents="none"
        style={[styles.lineBurstLayer, { height: boardSize, left: boardPadX, top: boardPadY, width: boardSize }]}
      >
        {activeCelebrationRows.map((rowIndex) => (
          <Animated.View
            key={`line-burst-row-celebrate-${rowIndex}`}
            style={[
              styles.lineBurstBand,
              styles.lineBurstBandRow,
              styles.lineBurstCelebrate,
              {
                height: boardCell,
                top: boardRail + boardGap + rowIndex * (boardCell + boardGap),
                width: boardSize
              },
              {
                opacity: lineFlash.interpolate({
                  inputRange: [0, 0.18, 1],
                  outputRange: [0, 1, 0]
                }),
                transform: [
                  {
                    scaleX: lineFlash.interpolate({
                      inputRange: [0, 0.2, 1],
                      outputRange: [0.94, 1.02, 1]
                    })
                  }
                ]
              }
            ]}
          />
        ))}
        {activeCelebrationCols.map((colIndex) => (
          <Animated.View
            key={`line-burst-col-celebrate-${colIndex}`}
            style={[
              styles.lineBurstBand,
              styles.lineBurstBandColumn,
              styles.lineBurstCelebrate,
              {
                height: boardSize,
                left: boardRail + boardGap + colIndex * (boardCell + boardGap),
                width: boardCell
              },
              {
                opacity: lineFlash.interpolate({
                  inputRange: [0, 0.18, 1],
                  outputRange: [0, 1, 0]
                }),
                transform: [
                  {
                    scaleY: lineFlash.interpolate({
                      inputRange: [0, 0.2, 1],
                      outputRange: [0.94, 1.02, 1]
                    })
                  }
                ]
              }
            ]}
          />
        ))}
        {activeWarningRows.map((rowIndex) => (
          <Animated.View
            key={`line-burst-row-warning-${rowIndex}`}
            style={[
              styles.lineBurstBand,
              styles.lineBurstBandRow,
              styles.lineBurstWarning,
              {
                height: boardCell,
                top: boardRail + boardGap + rowIndex * (boardCell + boardGap),
                width: boardSize
              },
              {
                opacity: lineFlash.interpolate({
                  inputRange: [0, 0.14, 1],
                  outputRange: [0, 1, 0]
                }),
                transform: [
                  {
                    scaleX: lineFlash.interpolate({
                      inputRange: [0, 0.16, 1],
                      outputRange: [0.96, 1.02, 1]
                    })
                  }
                ]
              }
            ]}
          />
        ))}
        {activeWarningCols.map((colIndex) => (
          <Animated.View
            key={`line-burst-col-warning-${colIndex}`}
            style={[
              styles.lineBurstBand,
              styles.lineBurstBandColumn,
              styles.lineBurstWarning,
              {
                height: boardSize,
                left: boardRail + boardGap + colIndex * (boardCell + boardGap),
                width: boardCell
              },
              {
                opacity: lineFlash.interpolate({
                  inputRange: [0, 0.14, 1],
                  outputRange: [0, 1, 0]
                }),
                transform: [
                  {
                    scaleY: lineFlash.interpolate({
                      inputRange: [0, 0.16, 1],
                      outputRange: [0.96, 1.02, 1]
                    })
                  }
                ]
              }
            ]}
          />
        ))}
      </View>
    ) : null;

  const boardPanel = (
    <Animated.View
      style={[
        styles.strip,
        styles.boardStrip,
        {
          borderRadius: radius,
          height: boardPanelHeight,
          paddingHorizontal: boardPadX,
          paddingVertical: boardPadY,
          transform: [
            {
              translateX: boardShake.interpolate({
                inputRange: [-1, 0, 1],
                outputRange: [-7, 0, 7]
              })
            },
            {
              scale: boardPulse.interpolate({
                inputRange: [0, 1],
                outputRange: [1, effectsKind === "celebrate" ? 1.012 : 0.992]
              })
            }
          ],
          width: boardPanelWidth
        }
      ]}
    >
      {boardBurstLayer}
      <View style={[styles.boardShell, { gap: boardGap, height: boardSize, width: boardSize }]}>
        <View style={[styles.axisRow, { gap: boardGap }]}>
          <View style={{ height: boardRail, width: boardRail }} />
          <View style={[styles.axisTrack, { gap: boardGap, height: boardRail, width: matrixSize }]}>
            {columnLines.map((line, index) => (
              <View key={`c-${index}`} style={{ height: boardRail, width: boardCell }}>
                <LinePill
                  busted={activeBustedCols.includes(index)}
                  celebrating={activeCelebrationCols.includes(index)}
                  dense={boardDense}
                  flashValue={
                    activeCelebrationCols.includes(index) || activeWarningCols.includes(index)
                      ? lineFlash
                      : undefined
                  }
                  flashVariant={
                    activeCelebrationCols.includes(index)
                      ? "celebrate"
                      : activeWarningCols.includes(index)
                        ? "warning"
                        : undefined
                  }
                  label={`C${index + 1}`}
                  line={preview && hoveredCell?.col === index ? preview.column : line}
                />
              </View>
            ))}
          </View>
        </View>

        <View style={[styles.boardBody, { gap: boardGap }]}>
          <View style={[styles.axisColumn, { gap: boardGap, width: boardRail }]}>
            {rowLines.map((line, index) => (
              <View key={`r-${index}`} style={{ height: boardCell, width: boardRail }}>
                <LinePill
                  busted={activeBustedRows.includes(index)}
                  celebrating={activeCelebrationRows.includes(index)}
                  dense={boardDense}
                  flashValue={
                    activeCelebrationRows.includes(index) || activeWarningRows.includes(index)
                      ? lineFlash
                      : undefined
                  }
                  flashVariant={
                    activeCelebrationRows.includes(index)
                      ? "celebrate"
                      : activeWarningRows.includes(index)
                        ? "warning"
                        : undefined
                  }
                  label={`R${index + 1}`}
                  line={preview && hoveredCell?.row === index ? preview.row : line}
                />
              </View>
            ))}
          </View>

          <View
            ref={boardRef}
            onLayout={syncBoardMetrics}
            style={[styles.matrix, { gap: boardGap, height: matrixSize, width: matrixSize }]}
          >
            {board.map((row, rowIndex) => (
              <View key={`row-${rowIndex}`} style={[styles.matrixRow, { gap: boardGap, height: boardCell }]}>
                {row.map((tile, colIndex) => (
                  <View key={`cell-${rowIndex}-${colIndex}`} style={{ height: boardCell, width: boardCell }}>
                    <BoardCell
                      busted={
                        activeBustedRows.includes(rowIndex) || activeBustedCols.includes(colIndex)
                      }
                      canPlace={
                        currentWorld
                          ? canSelectBoardCell(rowIndex, colIndex)
                          : false
                      }
                      dense={boardDense}
                      hovered={hoveredCell?.row === rowIndex && hoveredCell?.col === colIndex}
                      impactValue={
                        currentWorld?.lastPlacement?.row === rowIndex &&
                        currentWorld?.lastPlacement?.col === colIndex
                          ? placementImpact
                          : undefined
                      }
                      lastPlaced={
                        currentWorld?.lastPlacement?.row === rowIndex &&
                        currentWorld?.lastPlacement?.col === colIndex
                      }
                      locked={
                        rowLines[rowIndex].status === "locked" ||
                        columnLines[colIndex].status === "locked"
                      }
                      onPress={() => commitPlacement(rowIndex, colIndex)}
                      tile={tile}
                    />
                  </View>
                ))}
              </View>
            ))}
          </View>
        </View>
      </View>

      {currentWorld?.result ? (
        <RunOverlay
          buyIn={currentWorld.buyIn}
          onHome={() => router.replace("/" as Href)}
          onLeaderboard={() => {
            void openBigSlickGamesWebsite();
          }}
          onRestart={restartRun}
          result={currentWorld.result}
        />
      ) : null}
    </Animated.View>
  );

  const portraitProfile = renderGameBanner(framePad, false);

  const sideRail = (
    <View style={[styles.sideRail, { gap: railGap, width: sideRailWidth }]}>
      {renderGameBanner(railPad, true)}

      <View style={[styles.strip, styles.sideCard, { borderRadius: radius, padding: railPad }]}>
        {renderQueueUndoTray(railQueueTileWidth, railQueueTileHeight, railGap)}
      </View>

    </View>
  );

  const portraitShell = (
    <View style={[styles.frame, styles.mobileFrame, { gap: frameGap, width: frameWidth }]}>
      {portraitProfile}
      <View style={styles.boardWrap}>{boardPanel}</View>
    </View>
  );

  const splitShell = (
    <View
      style={[
        styles.frame,
        styles.splitFrame,
        {
          gap: frameGap,
          height: frameHeight,
          padding: framePad,
          width: frameWidth
        }
      ]}
    >
      <View style={styles.boardWrap}>{boardPanel}</View>
      {sideRail}
    </View>
  );

  if (isMobile) {
    return (
      <View style={styles.root}>
        <AppBackdrop />
      <SafeAreaView edges={["top", "bottom", "left", "right"]} style={styles.safe}>
          <ScrollView
            contentContainerStyle={[
              styles.mobileScrollContent,
              { paddingBottom: outerPad, paddingHorizontal: outerPad, paddingTop: outerPad }
            ]}
            scrollEnabled={!dragging}
            showsVerticalScrollIndicator={false}
            style={styles.safe}
          >
            {isPortraitMobile ? portraitShell : splitShell}
          </ScrollView>
        </SafeAreaView>
        {specialChoiceOverlay}
        {setupOverlay}
        {placementFlightLayer}
        {dragGhostLayer}
        {tutorialOverlay}
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <AppBackdrop />
      <SafeAreaView edges={["top", "bottom", "left", "right"]} style={styles.safe}>
        <View style={[styles.stage, { padding: outerPad }]}>{splitShell}</View>
      </SafeAreaView>
      {specialChoiceOverlay}
      {setupOverlay}
      {placementFlightLayer}
      {dragGhostLayer}
      {tutorialOverlay}
    </View>
  );

  return (
    <View style={styles.root}>
      <AppBackdrop />
      <SafeAreaView edges={["top", "bottom", "left", "right"]} style={styles.safe}>
        <View
          style={[
            styles.stage,
            { justifyContent: isDesktop ? "center" : "flex-start", padding: outerPad }
          ]}
        >
          <View
            style={[
              styles.frame,
              {
                gap: frameGap,
                height: effectiveFrameHeight,
                padding: framePad,
                width: frameWidth
              }
            ]}
          >
            <View
              style={[
                styles.strip,
                styles.topStrip,
                { borderRadius: radius, minHeight: topHeight, padding: stripPad }
              ]}
            >
              <View style={styles.identity}>
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{playerName.slice(0, 2).toUpperCase()}</Text>
                </View>
                <View style={styles.identityCopy}>
                  <Text numberOfLines={1} style={styles.playerName}>
                    {playerName}
                  </Text>
                  <Text numberOfLines={1} style={styles.playerMeta}>
                    {playerMode} · {leaderboardRuns} saved
                  </Text>
                </View>
              </View>
              <View style={styles.statRow}>
                <Stat label="Wallet" value={wallet} />
                <Stat label="Best" value={String(leaderboardBest)} />
                <Stat label="Stake" value={formatChipCount(currentBuyIn)} />
              </View>
            </View>

            <View
              style={[
                styles.strip,
                styles.boardStrip,
                isDesktop
                  ? {
                      borderRadius: radius,
                      minHeight: middleHeight,
                      paddingHorizontal: boardPadX,
                      paddingVertical: boardPadY
                    }
                  : {
                      borderRadius: radius,
                      height: boardStripHeight,
                      paddingHorizontal: boardPadX,
                      paddingVertical: boardPadY
                    }
              ]}
            >
              <View style={[styles.boardShell, { gap: boardGap, height: boardSize, width: boardSize }]}>
                <View style={[styles.axisRow, { gap: boardGap }]}>
                  <View style={{ height: boardRail, width: boardRail }} />
                  <View
                    style={[styles.axisTrack, { gap: boardGap, height: boardRail, width: matrixSize }]}
                  >
                    {columnLines.map((line, index) => (
                      <View key={`c-${index}`} style={{ height: boardRail, width: boardCell }}>
                        <LinePill
                          busted={activeBustedCols.includes(index)}
                          dense={boardDense}
                          label={`C${index + 1}`}
                          line={preview && hoveredCell?.col === index ? preview.column : line}
                        />
                      </View>
                    ))}
                  </View>
                </View>

                <View style={[styles.boardBody, { gap: boardGap }]}>
                  <View style={[styles.axisColumn, { gap: boardGap, width: boardRail }]}>
                    {rowLines.map((line, index) => (
                      <View key={`r-${index}`} style={{ height: boardCell, width: boardRail }}>
                        <LinePill
                          busted={activeBustedRows.includes(index)}
                          dense={boardDense}
                          label={`R${index + 1}`}
                          line={preview && hoveredCell?.row === index ? preview.row : line}
                        />
                      </View>
                    ))}
                  </View>

                  <View
                    ref={boardRef}
                    onLayout={syncBoardMetrics}
                    style={[styles.matrix, { gap: boardGap, height: matrixSize, width: matrixSize }]}
                  >
                    {board.map((row, rowIndex) => (
                      <View key={`row-${rowIndex}`} style={[styles.matrixRow, { gap: boardGap, height: boardCell }]}>
                        {row.map((tile, colIndex) => (
                          <View key={`cell-${rowIndex}-${colIndex}`} style={{ height: boardCell, width: boardCell }}>
                            <BoardCell
                              busted={
                                activeBustedRows.includes(rowIndex) ||
                                activeBustedCols.includes(colIndex)
                              }
                              canPlace={currentWorld ? canSelectBoardCell(rowIndex, colIndex) : false}
                              dense={boardDense}
                              hovered={hoveredCell?.row === rowIndex && hoveredCell?.col === colIndex}
                              lastPlaced={
                                currentWorld?.lastPlacement?.row === rowIndex &&
                                currentWorld?.lastPlacement?.col === colIndex
                              }
                              locked={
                                rowLines[rowIndex].status === "locked" ||
                                columnLines[colIndex].status === "locked"
                              }
                              onPress={() => commitPlacement(rowIndex, colIndex)}
                              tile={tile}
                            />
                          </View>
                        ))}
                      </View>
                    ))}
                  </View>
                </View>
              </View>

              {currentWorld?.result ? (
                <RunOverlay
                  buyIn={currentWorld?.buyIn ?? selectedBuyIn}
                  onHome={() => router.replace("/" as Href)}
                  onLeaderboard={() => router.push("/leaderboard" as Href)}
                  onRestart={restartRun}
                  result={currentWorld?.result ?? null}
                />
              ) : null}
            </View>

            <View
              style={[
                styles.strip,
                styles.bottomStrip,
                { borderRadius: radius, minHeight: bottomHeight, padding: stripPad }
              ]}
            >
              <View style={[styles.bottomMain, { gap: frameGap }]}>
                <View style={[styles.controlWell, { width: controlWidth }]}>
                  <View style={styles.buyInRow}>
                    {BUY_INS.map((buyIn) => {
                      const selected =
                        (currentWorld?.status === "playing" ? currentWorld.buyIn : selectedBuyIn) ===
                        buyIn;

                      return (
                        <Pressable
                          disabled={currentWorld?.status === "playing"}
                          key={buyIn}
                          onPress={() => setSelectedBuyIn(buyIn)}
                          style={({ pressed }) => [
                            styles.buyInChip,
                            selected && styles.buyInChipSelected,
                            pressed &&
                              currentWorld?.status !== "playing" &&
                              styles.buyInChipPressed
                          ]}
                        >
                          <Text style={[styles.buyInText, selected && styles.buyInTextSelected]}>
                            {buyIn === 1000 ? "1K" : buyIn}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>

                  <GameButton
                    compact
                    disabled={!currentWorld && !canAfford}
                    label={currentWorld?.status === "playing" ? "Restart" : "Start"}
                    onPress={currentWorld?.status === "playing" ? restartRun : startRun}
                    subtitle={canAfford ? `${cardsLeft} cards` : "Wallet below ante"}
                    subtitleStyle={styles.actionSubtitle}
                    tone="primary"
                  />
                </View>

                <View style={styles.queueWell}>
                  <View style={[styles.queueRow, { gap: queueGap }]}>
                    {Array.from({ length: 3 }, (_, index) => {
                      const tile = queue[index] ?? null;
                      const lead = index === 0;
                      const content = tile ? (
                        <TileFace compact dense={queueDense} dimmed={!lead} lead={lead} tile={tile} />
                      ) : (
                        <View style={[styles.emptyTile, { height: queueTileHeight, width: queueTileWidth }]}>
                          <Text style={styles.emptyTileText}>EMPTY</Text>
                        </View>
                      );

                      if (tile && lead && dragEnabled) {
                        return (
                          <Animated.View
                            key={`q-${index}`}
                            {...panResponder.panHandlers}
                            style={[
                              styles.queueCard,
                              dragging && styles.queueCardDragging,
                              {
                                height: queueTileHeight,
                                transform: dragOffset.getTranslateTransform(),
                                width: queueTileWidth
                              }
                            ]}
                          >
                            {content}
                          </Animated.View>
                        );
                      }

                      return (
                        <View key={`q-${index}`} style={{ height: queueTileHeight, width: queueTileWidth }}>
                          {content}
                        </View>
                      );
                    })}
                  </View>
                </View>
              </View>

              <View style={styles.navRow}>
                <NavButton label="Home" onPress={() => router.replace("/" as Href)} />
                <NavButton label="Big Slick" onPress={() => router.push("/leaderboard" as Href)} />
                <NavButton label="Settings" onPress={() => router.push("/settings" as Href)} />
              </View>
            </View>
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text numberOfLines={1} style={styles.statValue}>
        {value}
      </Text>
    </View>
  );
}

function NavButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.navButton, pressed && styles.navButtonPressed]}
    >
      <Text style={styles.navLabel}>{label}</Text>
    </Pressable>
  );
}

function LinePill({
  busted,
  celebrating,
  dense,
  flashValue,
  flashVariant,
  label: _label,
  line
}: {
  busted?: boolean;
  celebrating?: boolean;
  dense?: boolean;
  flashValue?: Animated.Value;
  flashVariant?: "celebrate" | "warning";
  label: string;
  line: LineSummary;
}) {
  const isTwentyOne = line.total === 21;
  const showBusted = busted && !isTwentyOne;

  return (
    <Animated.View
      style={[
        styles.linePill,
        dense && styles.linePillDense,
        celebrating && styles.linePillCelebrating,
        isTwentyOne && styles.linePillLocked,
        showBusted && styles.linePillBusted,
        flashValue
          ? {
              transform: [
                {
                  scale: flashValue.interpolate({
                    inputRange: [0, 0.2, 1],
                    outputRange: [1, flashVariant === "celebrate" ? 1.08 : 1.04, 1]
                  })
                }
              ]
            }
          : null
      ]}
    >
      {flashValue ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.lineFlash,
            flashVariant === "celebrate"
              ? styles.lineFlashCelebrate
              : styles.lineFlashWarning,
            { opacity: flashValue }
          ]}
        />
      ) : null}
      <Text
        style={[
          styles.lineValue,
          dense && styles.lineValueDense,
          isTwentyOne && styles.lineValueTwentyOne
        ]}
      >
        {isTwentyOne ? "21" : line.total}
      </Text>
    </Animated.View>
  );
}

function BoardCell({
  busted,
  canPlace,
  dense,
  hovered,
  impactValue,
  lastPlaced,
  locked,
  onPress,
  tile
}: {
  busted?: boolean;
  canPlace: boolean;
  dense?: boolean;
  hovered?: boolean;
  impactValue?: Animated.Value;
  lastPlaced?: boolean;
  locked?: boolean;
  onPress: () => void;
  tile: StackTile | null;
}) {
  return (
    <Pressable
      disabled={!canPlace}
      onPress={onPress}
      style={({ pressed }) => [
        styles.cell,
        dense && styles.cellDense,
        canPlace && styles.cellPlayable,
        locked && styles.cellLocked,
        hovered && styles.cellHovered,
        lastPlaced && styles.cellLastPlaced,
        busted && !locked && styles.cellBusted,
        pressed && canPlace && styles.cellPressed
      ]}
    >
      <Animated.View
        style={[
          styles.cellContent,
          impactValue
            ? {
                transform: [
                  {
                    scale: impactValue.interpolate({
                      inputRange: [0, 0.35, 1],
                      outputRange: [1, 0.92, 1.05]
                    })
                  }
                ]
              }
            : null
        ]}
      >
        {tile ? (
          <TileFace compact dense={dense} tile={tile} />
        ) : (
          <View
            style={[
              styles.cellVoid,
              dense && styles.cellVoidDense,
              canPlace && styles.cellVoidPlayable,
              locked && styles.cellVoidLocked
            ]}
          />
        )}
      </Animated.View>
    </Pressable>
  );
}

function TileFace({
  compact = false,
  dense = false,
  dimmed = false,
  lead = false,
  tile
}: {
  compact?: boolean;
  dense?: boolean;
  dimmed?: boolean;
  lead?: boolean;
  tile: StackTile;
}) {
  return (
    <View
      style={[
        styles.tile,
        compact && styles.tileCompact,
        dense && styles.tileDense,
        dimmed && styles.tileDimmed,
        lead && styles.tileLead
      ]}
    >
      <View style={styles.tileShadow} />
      <View style={styles.tileDepth} />
      <LinearGradient
        colors={["#f8f8f8", "#cfcfcf", "#8a8a8a"]}
        end={{ x: 1, y: 1 }}
        start={{ x: 0, y: 0 }}
        style={styles.tileSurface}
      />
      <LinearGradient
        colors={[
          "rgba(255, 255, 255, 0.82)",
          "rgba(255, 255, 255, 0.24)",
          "rgba(0, 0, 0, 0.16)"
        ]}
        end={{ x: 0.82, y: 1 }}
        start={{ x: 0.12, y: 0 }}
        style={styles.tileGloss}
      />
      <View style={styles.tileInset} />
      <View style={styles.tileTopRim} />
      <View style={styles.tileLeftRim} />
      <View style={styles.tileBottomRim} />
      <View style={styles.tileCoreGlow} />
      <View style={styles.tileCenter}>
        <Text
          style={[
            styles.tileRank,
            compact && styles.tileRankCompact,
            dense && styles.tileRankDense
          ]}
        >
          {tile.rank}
        </Text>
      </View>
    </View>
  );
}

function RunOverlay({
  buyIn,
  onHome,
  onLeaderboard,
  onRestart,
  result
}: {
  buyIn: number;
  onHome: () => void;
  onLeaderboard: () => void;
  onRestart: () => void;
  result: GameWorld["result"];
}) {
  const busted = result?.reason === "bust";

  return (
    <View style={styles.overlay}>
      <Text style={styles.overlayKicker}>{busted ? "Run Busted" : "Run Complete"}</Text>
      <Text style={styles.overlayTitle}>{busted ? "Over 21." : "Grid sealed."}</Text>
      <View style={styles.overlayStats}>
        <OverlayStat label="Ante" value={formatChipCount(buyIn)} />
        <OverlayStat label="Bank" value={formatChipCount(result?.bankroll ?? 0)} />
        <OverlayStat label="21s" value={String(result?.linesCompleted ?? 0)} />
        <OverlayStat label="Moves" value={String(result?.turns ?? 0)} />
      </View>
      <View style={styles.overlayButtons}>
        <GameButton label="Run Again" onPress={onRestart} tone="primary" />
        <GameButton label="Big Slick Games" onPress={onLeaderboard} />
        <GameButton label="Home" onPress={onHome} />
      </View>
    </View>
  );
}

function OverlayStat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.overlayStat}>
      <Text style={styles.overlayStatLabel}>{label}</Text>
      <Text style={styles.overlayStatValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  actionSubtitle: { color: "rgba(5, 5, 5, 0.68)" },
  axisColumn: { justifyContent: "space-between" },
  axisRow: { flexDirection: "row" },
  axisTrack: { flexDirection: "row" },
  badge: {
    alignItems: "center",
    backgroundColor: theme.colors.surface,
    borderRadius: 999,
    height: 46,
    justifyContent: "center",
    width: 46
  },
  badgeText: {
    color: "#050505",
    fontFamily: theme.fonts.display,
    fontSize: 22,
    lineHeight: 22
  },
  bannerAnteCard: {
    alignItems: "flex-end",
    backgroundColor: "rgba(5, 5, 5, 0.24)",
    borderColor: "rgba(255, 255, 255, 0.12)",
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    gap: 2,
    minWidth: 94,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs
  },
  bannerAnteLabel: {
    color: "rgba(240, 246, 231, 0.7)",
    fontFamily: theme.fonts.label,
    fontSize: 9,
    letterSpacing: 1.3,
    textTransform: "uppercase"
  },
  bannerAnteValue: {
    color: "#fbffd4",
    fontFamily: theme.fonts.display,
    fontSize: 22,
    lineHeight: 22
  },
  bannerCard: {
    gap: theme.spacing.sm,
    overflow: "hidden"
  },
  bannerCopy: {
    flex: 1,
    gap: 4,
    minWidth: 0
  },
  bannerEyebrow: {
    color: "rgba(234, 243, 214, 0.8)",
    fontFamily: theme.fonts.label,
    fontSize: 10,
    letterSpacing: 1.7,
    textTransform: "uppercase"
  },
  bannerExitButton: {
    alignItems: "center",
    backgroundColor: "rgba(5, 5, 5, 0.22)",
    borderColor: "rgba(255, 255, 255, 0.14)",
    borderRadius: 999,
    borderWidth: 1,
    height: 34,
    justifyContent: "center",
    width: 34
  },
  bannerExitButtonPressed: {
    backgroundColor: "rgba(255, 255, 255, 0.12)"
  },
  bannerExitGlyph: {
    color: "#f4f9ec",
    fontFamily: theme.fonts.label,
    fontSize: 11,
    letterSpacing: 1.2,
    textTransform: "uppercase"
  },
  bannerFooter: {
    alignItems: "center",
    flexDirection: "row",
    gap: theme.spacing.sm,
    justifyContent: "space-between"
  },
  bannerFooterCompact: {
    alignItems: "stretch",
    flexDirection: "column"
  },
  bannerGlow: {
    borderRadius: 999,
    height: 148,
    position: "absolute",
    width: 148
  },
  bannerGlowCool: {
    backgroundColor: "rgba(86, 255, 173, 0.18)",
    bottom: -72,
    left: -28
  },
  bannerGlowWarm: {
    backgroundColor: "rgba(255, 120, 72, 0.24)",
    right: -30,
    top: -60
  },
  bannerHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: theme.spacing.sm,
    justifyContent: "space-between"
  },
  bannerHeaderCompact: {
    alignItems: "flex-start",
    flexDirection: "column"
  },
  bannerHero: {
    borderRadius: theme.radius.lg,
    gap: theme.spacing.sm,
    overflow: "hidden",
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    position: "relative"
  },
  bannerHeroCompact: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.sm
  },
  bannerMetric: {
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    borderColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: theme.radius.md,
    borderWidth: 1,
    gap: 4,
    minWidth: 76,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs
  },
  bannerMetricCompact: {
    flexGrow: 1,
    width: "48%"
  },
  bannerMetricGrid: {
    flex: 1,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing.xs,
    justifyContent: "flex-end"
  },
  bannerMetricLabel: {
    color: theme.colors.subtleText,
    fontFamily: theme.fonts.label,
    fontSize: 9,
    letterSpacing: 1.2,
    textTransform: "uppercase"
  },
  bannerMetricValue: {
    color: theme.colors.text,
    fontFamily: theme.fonts.bodyBold,
    fontSize: 13
  },
  bannerQueueStrip: {
    alignItems: "center",
    justifyContent: "center"
  },
  bannerRuleChip: {
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    borderColor: "rgba(255, 255, 255, 0.12)",
    borderRadius: 999,
    borderWidth: 1,
    gap: 2,
    minWidth: 66,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs
  },
  bannerRuleLabel: {
    color: "rgba(238, 243, 230, 0.7)",
    fontFamily: theme.fonts.label,
    fontSize: 9,
    letterSpacing: 1.2,
    textTransform: "uppercase"
  },
  bannerRuleRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing.xs
  },
  bannerRuleValue: {
    color: "#f6f9ef",
    fontFamily: theme.fonts.bodyBold,
    fontSize: 13
  },
  bannerSubtitle: {
    color: "rgba(241, 245, 233, 0.84)",
    fontFamily: theme.fonts.body,
    fontSize: 12,
    lineHeight: 16,
    maxWidth: 320
  },
  bannerTitle: {
    color: "#f4f9ec",
    fontFamily: theme.fonts.display,
    fontSize: 32,
    lineHeight: 32
  },
  bannerTitleCompact: {
    fontSize: 26,
    lineHeight: 26
  },
  boardBody: { flexDirection: "row" },
  boardShell: { alignItems: "center", justifyContent: "center" },
  boardStrip: {
    alignSelf: "center",
    justifyContent: "center",
    overflow: "hidden",
    position: "relative"
  },
  lineBurstBand: {
    borderRadius: theme.radius.lg,
    position: "absolute",
    shadowOffset: { height: 0, width: 0 },
    shadowOpacity: 0.45,
    shadowRadius: 18
  },
  lineBurstBandColumn: {
    top: 0
  },
  lineBurstBandRow: {
    left: 0
  },
  lineBurstCelebrate: {
    backgroundColor: "rgba(125, 255, 178, 0.34)",
    borderColor: "rgba(214, 255, 230, 0.95)",
    borderWidth: 1,
    shadowColor: "#7dffb2"
  },
  lineBurstLayer: {
    position: "absolute",
    zIndex: 3
  },
  lineBurstWarning: {
    backgroundColor: "rgba(255, 92, 92, 0.32)",
    borderColor: "rgba(255, 214, 214, 0.95)",
    borderWidth: 1,
    shadowColor: "#ff5c5c"
  },
  boardWrap: { alignItems: "center", flex: 1, justifyContent: "center" },
  bottomMain: { flex: 1, flexDirection: "row" },
  bottomMainPortrait: { flexDirection: "column" },
  bottomStrip: { gap: theme.spacing.sm },
  buyInChip: {
    alignItems: "center",
    backgroundColor: theme.colors.cardMuted,
    borderColor: theme.colors.border,
    borderRadius: 999,
    borderWidth: 1,
    flexBasis: 0,
    flexGrow: 1,
    justifyContent: "center",
    minHeight: 38,
    minWidth: 56
  },
  buyInChipPressed: { opacity: 0.84 },
  buyInChipSelected: { backgroundColor: theme.colors.surface },
  buyInRow: { flexDirection: "row", gap: theme.spacing.xs, width: "100%" },
  buyInRowCompact: { flexWrap: "wrap" },
  buyInText: { color: theme.colors.text, fontFamily: theme.fonts.bodyBold, fontSize: 12 },
  buyInTextSelected: { color: "#050505" },
  cell: {
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.03)",
    borderColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: theme.radius.md,
    borderWidth: 1,
    height: "100%",
    justifyContent: "center",
    overflow: "hidden",
    padding: 4,
    width: "100%"
  },
  cellBusted: { backgroundColor: "rgba(255, 143, 143, 0.14)", borderColor: "rgba(255, 143, 143, 0.36)" },
  cellContent: { alignItems: "center", height: "100%", justifyContent: "center", width: "100%" },
  cellDense: { padding: 2 },
  cellHovered: { backgroundColor: "rgba(255, 255, 255, 0.12)", borderColor: "rgba(255, 255, 255, 0.3)" },
  cellLastPlaced: { borderColor: theme.colors.surface },
  cellLocked: {
    backgroundColor: "rgba(108, 255, 166, 0.12)",
    borderColor: "rgba(125, 255, 178, 0.4)"
  },
  cellPlayable: { borderColor: "rgba(255, 255, 255, 0.12)" },
  cellPressed: { opacity: 0.86 },
  cellVoid: {
    backgroundColor: "rgba(255, 255, 255, 0.02)",
    borderColor: "rgba(255, 255, 255, 0.045)",
    borderRadius: theme.radius.md - 2,
    borderWidth: 1,
    height: "100%",
    width: "100%"
  },
  cellVoidDense: { borderRadius: theme.radius.md - 4 },
  cellVoidLocked: {
    backgroundColor: "rgba(108, 255, 166, 0.08)",
    borderColor: "rgba(125, 255, 178, 0.26)"
  },
  cellVoidPlayable: { borderStyle: "dashed" },
  controlMenu: { gap: theme.spacing.sm, width: "100%" },
  controlMenuCompact: { gap: theme.spacing.xs },
  controlSection: { gap: theme.spacing.xs, width: "100%" },
  controlSectionLabel: {
    color: theme.colors.subtleText,
    fontFamily: theme.fonts.label,
    fontSize: 10,
    letterSpacing: 1.4,
    textTransform: "uppercase"
  },
  controlSectionSurface: {
    backgroundColor: "rgba(255, 255, 255, 0.035)",
    borderColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    gap: theme.spacing.xs,
    padding: theme.spacing.sm,
    width: "100%"
  },
  controlWell: { gap: theme.spacing.sm, justifyContent: "space-between" },
  controlWellFull: { width: "100%" },
  dragGhost: {
    elevation: 18,
    position: "absolute",
    shadowColor: "#000000",
    shadowOffset: { height: 20, width: 0 },
    shadowOpacity: 0.34,
    shadowRadius: 26,
    zIndex: 30
  },
  placementFlightCard: {
    elevation: 20,
    position: "absolute",
    shadowColor: "#000000",
    shadowOffset: { height: 18, width: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 22,
    zIndex: 32
  },
  emptyTile: {
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.03)",
    borderColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: theme.radius.md,
    borderWidth: 1,
    justifyContent: "center"
  },
  emptyTileText: {
    color: theme.colors.subtleText,
    fontFamily: theme.fonts.label,
    fontSize: 10,
    letterSpacing: 1.2
  },
  frame: { maxWidth: "100%" },
  mobileFrame: { alignSelf: "center" },
  mobileScrollContent: { alignItems: "center" },
  identity: { alignItems: "center", flex: 1, flexDirection: "row", gap: theme.spacing.sm, minWidth: 0 },
  identityCopy: { flex: 1, gap: 2, minWidth: 0 },
  lineLabel: { color: theme.colors.subtleText, fontFamily: theme.fonts.label, fontSize: 10, letterSpacing: 1.2 },
  lineLabelDense: { fontSize: 8 },
  lineMeta: { color: theme.colors.subtleText, fontFamily: theme.fonts.label, fontSize: 9, letterSpacing: 1 },
  lineMetaDense: { fontSize: 7 },
  linePill: {
    alignItems: "center",
    backgroundColor: theme.colors.cardMuted,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    height: "100%",
    justifyContent: "center",
    overflow: "hidden",
    paddingHorizontal: 4,
    paddingVertical: 4,
    position: "relative",
    width: "100%"
  },
  linePillBusted: { backgroundColor: "rgba(255, 143, 143, 0.14)", borderColor: "rgba(255, 143, 143, 0.36)" },
  linePillCelebrating: { borderColor: "rgba(125, 255, 178, 0.72)" },
  linePillDense: { paddingHorizontal: 2, paddingVertical: 2 },
  lineFlash: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: theme.radius.md
  },
  lineFlashCelebrate: {
    backgroundColor: "rgba(125, 255, 178, 0.42)"
  },
  lineFlashWarning: {
    backgroundColor: "rgba(255, 143, 143, 0.38)"
  },
  linePillLocked: {
    backgroundColor: "rgba(108, 255, 166, 0.2)",
    borderColor: "rgba(125, 255, 178, 0.6)"
  },
  lineValue: { color: theme.colors.text, fontFamily: theme.fonts.display, fontSize: 24, lineHeight: 24 },
  lineValueDense: { fontSize: 16, lineHeight: 16 },
  lineValueTwentyOne: { color: "#d7ffe5" },
  matrix: { justifyContent: "space-between" },
  matrixRow: { flexDirection: "row" },
  navButton: {
    alignItems: "center",
    backgroundColor: theme.colors.cardMuted,
    borderColor: theme.colors.border,
    borderRadius: 999,
    borderWidth: 1,
    flex: 1,
    justifyContent: "center",
    minHeight: 32
  },
  navButtonPressed: { backgroundColor: "rgba(255, 255, 255, 0.16)" },
  navLabel: { color: theme.colors.text, fontFamily: theme.fonts.label, fontSize: 10, letterSpacing: 1.2, textTransform: "uppercase" },
  navRow: { flexDirection: "row", gap: theme.spacing.xs },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    backgroundColor: "rgba(5, 5, 5, 0.94)",
    gap: theme.spacing.md,
    justifyContent: "center",
    paddingHorizontal: theme.spacing.xl
  },
  overlayButtons: { gap: theme.spacing.sm, width: "100%" },
  overlayKicker: { color: theme.colors.accent, fontFamily: theme.fonts.label, fontSize: 12, letterSpacing: 2, textTransform: "uppercase" },
  overlayStat: {
    backgroundColor: theme.colors.cardMuted,
    borderRadius: theme.radius.md,
    gap: 4,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm
  },
  overlayStatLabel: { color: theme.colors.subtleText, fontFamily: theme.fonts.label, fontSize: 10, letterSpacing: 1.4, textTransform: "uppercase" },
  overlayStats: { gap: theme.spacing.sm, width: "100%" },
  overlayStatValue: { color: theme.colors.text, fontFamily: theme.fonts.bodyBold, fontSize: 16 },
  overlayTitle: { color: theme.colors.text, fontFamily: theme.fonts.display, fontSize: 36, lineHeight: 36 },
  playerMeta: { color: theme.colors.subtleText, fontFamily: theme.fonts.body, fontSize: 12, lineHeight: 16 },
  playerName: { color: theme.colors.text, fontFamily: theme.fonts.display, fontSize: 24, lineHeight: 24 },
  playerNameCompact: { fontSize: 20, lineHeight: 20 },
  queueHint: {
    color: theme.colors.subtleText,
    fontFamily: theme.fonts.body,
    fontSize: 11,
    lineHeight: 15,
    marginTop: theme.spacing.xs,
    textAlign: "right"
  },
  queueCard: { overflow: "visible" },
  queueCardDragging: {
    elevation: 12,
    shadowColor: "#ffffff",
    shadowOffset: { height: 16, width: 0 },
    shadowOpacity: 0.24,
    shadowRadius: 18,
    zIndex: 4
  },
  queueCardLead: { zIndex: 2 },
  queueEffectCard: {
    overflow: "visible",
    position: "absolute",
    top: 0
  },
  queueEffectsLayer: {
    ...StyleSheet.absoluteFillObject,
    overflow: "visible"
  },
  queueUndoButton: {
    gap: 4,
    paddingHorizontal: 0,
    paddingVertical: 0
  },
  queueUndoRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center"
  },
  queueRow: {
    alignItems: "center",
    flexDirection: "row",
    height: "100%",
    justifyContent: "flex-end",
    overflow: "visible",
    width: "100%"
  },
  queueSlot: { overflow: "visible" },
  queueStage: {
    overflow: "visible",
    position: "relative"
  },
  queueWell: {
    alignItems: "flex-end",
    flex: 1,
    gap: theme.spacing.xs,
    justifyContent: "center",
    overflow: "visible"
  },
  queueSurface: {
    alignItems: "center",
    justifyContent: "center"
  },
  queueWellStructured: {
    alignItems: "stretch",
    width: "100%"
  },
  queueHintStructured: {
    textAlign: "left"
  },
  root: { backgroundColor: theme.colors.background, flex: 1, overflow: "hidden" },
  safe: { flex: 1 },
  sideCard: { gap: theme.spacing.sm },
  sideControls: { gap: theme.spacing.sm },
  sideRail: { flexShrink: 0 },
  splitFrame: { alignItems: "stretch", flexDirection: "row" },
  setupActions: {
    alignItems: "stretch",
    flexDirection: "row",
    gap: theme.spacing.sm,
    width: "100%"
  },
  setupActionsSplit: {
    alignItems: "stretch",
    flexDirection: "row",
    gap: theme.spacing.sm,
    width: "100%"
  },
  setupActionHalf: {
    flex: 1
  },
  setupBody: {
    color: "rgba(241, 245, 233, 0.84)",
    fontFamily: theme.fonts.body,
    fontSize: 14,
    lineHeight: 20,
    maxWidth: 420
  },
  setupCard: {
    backgroundColor: "rgba(10, 12, 14, 0.98)",
    borderColor: "rgba(255, 255, 255, 0.12)",
    borderRadius: theme.radius.xl,
    borderWidth: 1,
    gap: theme.spacing.md,
    overflow: "hidden",
    padding: theme.spacing.md,
    shadowColor: "#000000",
    shadowOffset: { height: 20, width: 0 },
    shadowOpacity: 0.34,
    shadowRadius: 28
  },
  setupMetaCard: {
    backgroundColor: "rgba(255, 255, 255, 0.03)",
    borderColor: "rgba(255, 255, 255, 0.07)",
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    flex: 1,
    gap: 4,
    minWidth: 104,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.sm
  },
  setupMetaGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing.sm,
    width: "100%"
  },
  setupMetaLabel: {
    color: theme.colors.subtleText,
    fontFamily: theme.fonts.label,
    fontSize: 10,
    letterSpacing: 1.2,
    textTransform: "uppercase"
  },
  setupMetaValue: {
    color: theme.colors.text,
    fontFamily: theme.fonts.bodyBold,
    fontSize: 14
  },
  setupChip: {
    minHeight: 46,
    minWidth: 84,
    paddingHorizontal: theme.spacing.md
  },
  setupChipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing.sm,
    width: "100%"
  },
  setupDifficultyCard: {
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.035)",
    borderColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    flexDirection: "row",
    gap: theme.spacing.sm,
    justifyContent: "space-between",
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm
  },
  setupDifficultyCardPressed: {
    backgroundColor: "rgba(255, 255, 255, 0.08)"
  },
  setupDifficultyCardSelected: {
    backgroundColor: "rgba(110, 255, 186, 0.12)",
    borderColor: "rgba(110, 255, 186, 0.34)"
  },
  setupDifficultyCopy: {
    flex: 1,
    gap: 4,
    minWidth: 0
  },
  setupDifficultyDescription: {
    color: theme.colors.subtleText,
    fontFamily: theme.fonts.body,
    fontSize: 12,
    lineHeight: 17
  },
  setupDifficultyLabel: {
    color: theme.colors.text,
    fontFamily: theme.fonts.bodyBold,
    fontSize: 15
  },
  setupDifficultyLabelSelected: {
    color: "#dfffea"
  },
  setupDifficultyStack: {
    gap: theme.spacing.sm,
    width: "100%"
  },
  setupDifficultyState: {
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    borderColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: 999,
    borderWidth: 1,
    color: theme.colors.subtleText,
    fontFamily: theme.fonts.label,
    fontSize: 10,
    letterSpacing: 1.2,
    minWidth: 68,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 7,
    textAlign: "center",
    textTransform: "uppercase"
  },
  setupDifficultyStateSelected: {
    backgroundColor: "rgba(110, 255, 186, 0.14)",
    borderColor: "rgba(110, 255, 186, 0.28)",
    color: "#dfffea"
  },
  setupFootnote: {
    color: theme.colors.subtleText,
    fontFamily: theme.fonts.body,
    fontSize: 11,
    lineHeight: 16
  },
  setupHelpButton: {
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.035)",
    borderColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 64,
    width: 72
  },
  setupHelpButtonPressed: {
    backgroundColor: "rgba(255, 255, 255, 0.08)"
  },
  setupHelpGlyph: {
    color: theme.colors.text,
    fontFamily: theme.fonts.display,
    fontSize: 28,
    lineHeight: 28
  },
  setupHero: {
    borderRadius: theme.radius.xl,
    gap: theme.spacing.xs,
    overflow: "hidden",
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.lg,
    position: "relative"
  },
  setupIntroCard: {
    backgroundColor: "rgba(255, 255, 255, 0.03)",
    borderColor: "rgba(255, 255, 255, 0.07)",
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    flex: 1,
    gap: theme.spacing.xs,
    minWidth: 120,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.sm
  },
  setupIntroDetail: {
    color: "rgba(241, 245, 233, 0.74)",
    fontFamily: theme.fonts.body,
    fontSize: 12,
    lineHeight: 17
  },
  setupIntroGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing.sm,
    width: "100%"
  },
  setupIntroStep: {
    color: "#e6fff0",
    fontFamily: theme.fonts.bodyBold,
    fontSize: 13
  },
  setupKicker: {
    color: "#8ef0bc",
    fontFamily: theme.fonts.label,
    fontSize: 11,
    letterSpacing: 1.8,
    textTransform: "uppercase"
  },
  setupOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    backgroundColor: "rgba(5, 5, 5, 0.78)",
    justifyContent: "center",
    padding: theme.spacing.lg,
    zIndex: 50
  },
  setupOverlayContent: {
    alignItems: "center",
    flexGrow: 1,
    justifyContent: "center"
  },
  setupOverlayScroll: {
    width: "100%"
  },
  setupPrimaryAction: {
    flex: 1
  },
  setupProgressDot: {
    backgroundColor: "rgba(255, 255, 255, 0.18)",
    borderRadius: 999,
    height: 8,
    width: 8
  },
  setupProgressDotActive: {
    backgroundColor: "#f4f9ec",
    transform: [{ scale: 1.25 }]
  },
  setupProgressDotComplete: {
    backgroundColor: "#8ef0bc"
  },
  setupProgressLabel: {
    color: "rgba(241, 245, 233, 0.6)",
    fontFamily: theme.fonts.label,
    fontSize: 10,
    letterSpacing: 1.1,
    textTransform: "uppercase"
  },
  setupProgressLabelActive: {
    color: "#f4f9ec"
  },
  setupProgressRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing.md,
    marginTop: theme.spacing.sm
  },
  setupProgressStep: {
    alignItems: "center",
    flexDirection: "row",
    gap: theme.spacing.xs
  },
  setupSection: {
    gap: theme.spacing.sm,
    width: "100%"
  },
  setupSectionHint: {
    color: "rgba(241, 245, 233, 0.7)",
    fontFamily: theme.fonts.body,
    fontSize: 12,
    lineHeight: 17
  },
  setupSectionLabel: {
    color: theme.colors.subtleText,
    fontFamily: theme.fonts.label,
    fontSize: 10,
    letterSpacing: 1.5,
    textTransform: "uppercase"
  },
  setupSectionSurface: {
    gap: theme.spacing.sm,
    padding: theme.spacing.md
  },
  setupTitle: {
    color: "#f4f9ec",
    fontFamily: theme.fonts.display,
    fontSize: 36,
    lineHeight: 36
  },
  setupWarning: {
    color: "#ffb1b1",
    fontFamily: theme.fonts.bodyBold,
    fontSize: 12
  },
  scoreCard: {
    borderColor: "rgba(255, 255, 255, 0.12)",
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    gap: 4,
    minHeight: 64,
    overflow: "hidden",
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm
  },
  scoreLabel: {
    color: "rgba(240, 246, 231, 0.7)",
    fontFamily: theme.fonts.label,
    fontSize: 10,
    letterSpacing: 1.4,
    textTransform: "uppercase"
  },
  scoreMeta: {
    color: "rgba(241, 245, 233, 0.72)",
    fontFamily: theme.fonts.body,
    fontSize: 12
  },
  scoreValue: {
    color: "#f6f9ef",
    fontFamily: theme.fonts.display,
    fontSize: 26,
    lineHeight: 26
  },
  stage: { alignItems: "center", flex: 1, justifyContent: "center" },
  stat: {
    backgroundColor: theme.colors.cardMuted,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    flex: 1,
    gap: 4,
    minWidth: 56,
    paddingHorizontal: theme.spacing.xs,
    paddingVertical: theme.spacing.xs
  },
  statLabel: { color: theme.colors.subtleText, fontFamily: theme.fonts.label, fontSize: 9, letterSpacing: 1.1, textTransform: "uppercase" },
  statRow: { flexDirection: "row", gap: theme.spacing.xs, justifyContent: "flex-end" },
  statValue: { color: theme.colors.text, fontFamily: theme.fonts.bodyBold, fontSize: 14 },
  strip: { backgroundColor: theme.colors.card, borderColor: theme.colors.border, borderWidth: 1 },
  specialCancel: {
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    borderColor: "rgba(255, 255, 255, 0.14)",
    borderRadius: 999,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 46,
    paddingHorizontal: theme.spacing.md
  },
  specialCancelText: {
    color: theme.colors.text,
    fontFamily: theme.fonts.bodyBold,
    fontSize: 14
  },
  specialHint: {
    color: "rgba(239, 244, 233, 0.82)",
    fontFamily: theme.fonts.body,
    fontSize: 13,
    lineHeight: 18,
    textAlign: "left"
  },
  specialHero: {
    borderRadius: theme.radius.xl,
    flexDirection: "row",
    gap: theme.spacing.md,
    overflow: "hidden",
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    position: "relative"
  },
  specialHeroCopy: {
    flex: 1,
    gap: theme.spacing.xs,
    minWidth: 0
  },
  specialHeroOrb: {
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: 999,
    height: 150,
    position: "absolute",
    right: -36,
    top: -64,
    width: 150
  },
  specialHeroTile: {
    height: 88,
    width: 74
  },
  specialKicker: {
    color: "#f4f9ec",
    fontFamily: theme.fonts.label,
    fontSize: 10,
    letterSpacing: 1.8,
    textAlign: "left",
    textTransform: "uppercase"
  },
  specialMetaCard: {
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    borderColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    flex: 1,
    gap: 4,
    minWidth: 128,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.sm
  },
  specialMetaLabel: {
    color: theme.colors.subtleText,
    fontFamily: theme.fonts.label,
    fontSize: 9,
    letterSpacing: 1.2,
    textTransform: "uppercase"
  },
  specialMetaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing.sm
  },
  specialMetaValue: {
    color: theme.colors.text,
    fontFamily: theme.fonts.bodyBold,
    fontSize: 13,
    lineHeight: 17
  },
  specialModal: {
    backgroundColor: "rgba(10, 10, 10, 0.96)",
    borderColor: "rgba(255, 255, 255, 0.12)",
    borderRadius: theme.radius.xl,
    borderWidth: 1,
    gap: theme.spacing.md,
    maxWidth: 560,
    padding: theme.spacing.md,
    width: "100%"
  },
  specialOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    backgroundColor: "rgba(5, 5, 5, 0.82)",
    justifyContent: "center",
    padding: theme.spacing.lg,
    zIndex: 40
  },
  specialTitle: {
    color: theme.colors.text,
    fontFamily: theme.fonts.display,
    fontSize: 30,
    lineHeight: 30,
    textAlign: "left"
  },
  specialValueChip: {
    borderRadius: theme.radius.lg,
    overflow: "hidden"
  },
  specialValueChipPressed: {
    opacity: 0.86
  },
  specialValueNote: {
    color: "rgba(17, 17, 17, 0.62)",
    fontFamily: theme.fonts.label,
    fontSize: 10,
    letterSpacing: 1,
    textTransform: "uppercase"
  },
  specialValueGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing.sm,
    justifyContent: "center"
  },
  specialValueSurface: {
    alignItems: "center",
    borderRadius: theme.radius.lg,
    gap: 6,
    justifyContent: "center",
    minHeight: 92,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.md
  },
  specialValueText: {
    color: "#050505",
    fontFamily: theme.fonts.display,
    fontSize: 28,
    lineHeight: 28
  },
  tile: {
    alignItems: "center",
    backgroundColor: "transparent",
    borderColor: "transparent",
    borderRadius: theme.radius.md,
    height: "100%",
    justifyContent: "center",
    overflow: "visible",
    position: "relative",
    width: "100%"
  },
  tileCompact: {},
  tileDense: {},
  tileDimmed: { opacity: 0.62 },
  tileLead: {
    elevation: 8,
    shadowColor: "#ffffff",
    shadowOffset: { height: 14, width: 0 },
    shadowOpacity: 0.18,
    shadowRadius: 18
  },
  tileShadow: {
    backgroundColor: "rgba(0, 0, 0, 0.28)",
    borderRadius: theme.radius.md,
    bottom: 1,
    left: 7,
    position: "absolute",
    right: 7,
    top: 9
  },
  tileDepth: {
    backgroundColor: "#2b2b2b",
    borderColor: "rgba(255, 255, 255, 0.04)",
    borderRadius: theme.radius.md,
    borderWidth: 1,
    bottom: 0,
    left: 4,
    position: "absolute",
    right: 4,
    top: 8
  },
  tileSurface: {
    borderRadius: theme.radius.md,
    bottom: 5,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0
  },
  tileGloss: {
    borderRadius: theme.radius.md,
    bottom: 5,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0
  },
  tileInset: {
    borderColor: "rgba(255, 255, 255, 0.18)",
    borderRadius: theme.radius.md - 1,
    borderWidth: 1,
    bottom: 8,
    left: 4,
    position: "absolute",
    right: 4,
    top: 4
  },
  tileTopRim: {
    backgroundColor: "rgba(255, 255, 255, 0.54)",
    height: 1,
    left: 8,
    position: "absolute",
    right: 8,
    top: 6
  },
  tileLeftRim: {
    backgroundColor: "rgba(255, 255, 255, 0.24)",
    bottom: 12,
    left: 6,
    position: "absolute",
    top: 8,
    width: 1
  },
  tileBottomRim: {
    backgroundColor: "rgba(0, 0, 0, 0.34)",
    bottom: 8,
    height: 1,
    left: 8,
    position: "absolute",
    right: 8
  },
  tileCoreGlow: {
    backgroundColor: "rgba(255, 255, 255, 0.18)",
    borderRadius: 999,
    height: "44%",
    left: "16%",
    position: "absolute",
    top: "20%",
    width: "68%"
  },
  tileCenter: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    paddingBottom: 6,
    width: "100%"
  },
  tileRank: {
    color: "#111111",
    fontFamily: theme.fonts.display,
    fontSize: 42,
    lineHeight: 42,
    textShadowColor: "rgba(255, 255, 255, 0.26)",
    textShadowOffset: { height: 1, width: 0 },
    textShadowRadius: 1
  },
  tileRankCompact: { fontSize: 24, lineHeight: 24 },
  tileRankDense: { fontSize: 18, lineHeight: 18 },
  topStrip: { alignItems: "center", flexDirection: "row", gap: theme.spacing.sm },
  tutorialActionText: {
    color: theme.colors.subtleText,
    fontFamily: theme.fonts.body,
    fontSize: 12,
    lineHeight: 16
  },
  tutorialActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing.sm
  },
  tutorialBody: {
    color: theme.colors.text,
    fontFamily: theme.fonts.body,
    fontSize: 14,
    lineHeight: 20
  },
  tutorialCard: {
    backgroundColor: "rgba(11, 12, 14, 0.98)",
    borderColor: "rgba(255, 255, 255, 0.12)",
    borderRadius: theme.radius.xl,
    borderWidth: 1,
    gap: theme.spacing.sm,
    padding: theme.spacing.lg,
    position: "absolute",
    shadowColor: "#000000",
    shadowOffset: { height: 16, width: 0 },
    shadowOpacity: 0.32,
    shadowRadius: 24,
    zIndex: 65
  },
  tutorialKicker: {
    color: "#8ef0bc",
    fontFamily: theme.fonts.label,
    fontSize: 11,
    letterSpacing: 1.8,
    textTransform: "uppercase"
  },
  tutorialOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 60
  },
  tutorialPrimaryAction: {
    alignItems: "center",
    backgroundColor: theme.colors.surface,
    borderRadius: 999,
    justifyContent: "center",
    minHeight: 42,
    paddingHorizontal: theme.spacing.md
  },
  tutorialPrimaryActionPressed: {
    backgroundColor: theme.colors.surfacePressed
  },
  tutorialPrimaryActionText: {
    color: "#050505",
    fontFamily: theme.fonts.bodyBold,
    fontSize: 14
  },
  tutorialSecondaryAction: {
    alignItems: "center",
    borderColor: "rgba(255, 255, 255, 0.16)",
    borderRadius: 999,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 42,
    paddingHorizontal: theme.spacing.md
  },
  tutorialSecondaryActionPressed: {
    backgroundColor: "rgba(255, 255, 255, 0.08)"
  },
  tutorialSecondaryActionText: {
    color: theme.colors.text,
    fontFamily: theme.fonts.bodyBold,
    fontSize: 14
  },
  tutorialShade: {
    backgroundColor: "rgba(5, 5, 5, 0.8)",
    position: "absolute"
  },
  tutorialShadeFull: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(5, 5, 5, 0.8)"
  },
  tutorialSpotlight: {
    borderColor: "#8ef0bc",
    borderRadius: theme.radius.xl,
    borderWidth: 2,
    position: "absolute",
    shadowColor: "#8ef0bc",
    shadowOffset: { height: 0, width: 0 },
    shadowOpacity: 0.32,
    shadowRadius: 20
  },
  tutorialTargetTag: {
    backgroundColor: "#8ef0bc",
    borderRadius: 999,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 6,
    position: "absolute",
    zIndex: 64
  },
  tutorialTargetTagText: {
    color: "#05110a",
    fontFamily: theme.fonts.label,
    fontSize: 10,
    letterSpacing: 1.2,
    textTransform: "uppercase"
  },
  tutorialTitle: {
    color: theme.colors.text,
    fontFamily: theme.fonts.display,
    fontSize: 26,
    lineHeight: 28
  },
  utilityButton: {
    alignItems: "center",
    backgroundColor: theme.colors.cardMuted,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 38,
    paddingHorizontal: theme.spacing.sm
  },
  utilityButtonDisabled: {
    opacity: 0.42
  },
  utilityButtonHelp: {
    backgroundColor: "rgba(110, 255, 186, 0.12)",
    borderColor: "rgba(110, 255, 186, 0.34)"
  },
  utilityButtonIcon: {
    flex: 1,
    flexDirection: "row",
    gap: theme.spacing.xs,
    minHeight: 52,
    paddingHorizontal: theme.spacing.md
  },
  utilityButtonFull: {
    width: "100%"
  },
  utilityGlyph: {
    color: theme.colors.text,
    fontFamily: theme.fonts.display,
    fontSize: 24,
    lineHeight: 24
  },
  utilityButtonAccent: {
    backgroundColor: "rgba(110, 255, 186, 0.12)",
    borderColor: "rgba(110, 255, 186, 0.34)"
  },
  utilityMeta: {
    color: theme.colors.subtleText,
    fontFamily: theme.fonts.label,
    fontSize: 10,
    letterSpacing: 1.1,
    textTransform: "uppercase"
  },
  utilityButtonPressed: {
    backgroundColor: "rgba(255, 255, 255, 0.14)"
  },
  utilityButtonText: {
    color: theme.colors.text,
    fontFamily: theme.fonts.label,
    fontSize: 11,
    letterSpacing: 1.2,
    textTransform: "uppercase"
  },
  utilityButtonWrap: {
    width: "100%"
  },
  utilityButtonWrapHalf: {
    flex: 1
  },
  utilityColumn: {
    gap: theme.spacing.xs
  },
  utilityRow: {
    flexDirection: "row",
    gap: theme.spacing.xs,
    width: "100%"
  }
});
