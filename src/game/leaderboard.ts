import AsyncStorage from "@react-native-async-storage/async-storage";

export interface LeaderboardEntry {
  buyIn: number;
  createdAt: string;
  id: string;
  linesCompleted: number;
  playerName: string;
  result: "board-sealed" | "bust";
  score: number;
  turns: number;
}

const STORAGE_KEY = "21-stackem/leaderboard";
const MAX_ENTRIES = 24;

export async function loadLeaderboard() {
  let raw: string | null = null;

  try {
    raw = await AsyncStorage.getItem(STORAGE_KEY);
  } catch {
    raw = null;
  }

  if (!raw) {
    return [] as LeaderboardEntry[];
  }

  try {
    const parsed = JSON.parse(raw) as LeaderboardEntry[];
    return sortEntries(parsed);
  } catch {
    return [] as LeaderboardEntry[];
  }
}

export async function saveLeaderboardEntry(
  entry: Omit<LeaderboardEntry, "createdAt" | "id">
) {
  const current = await loadLeaderboard();
  const nextEntry: LeaderboardEntry = {
    ...entry,
    createdAt: new Date().toISOString(),
    id: `${Date.now()}-${Math.round(Math.random() * 100000)}`
  };
  const next = sortEntries([nextEntry, ...current]).slice(0, MAX_ENTRIES);

  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    return next;
  }

  return next;
}

export function sortEntries(entries: LeaderboardEntry[]) {
  return [...entries].sort((left, right) => {
    if (right.score !== left.score) {
      return right.score - left.score;
    }

    if (right.linesCompleted !== left.linesCompleted) {
      return right.linesCompleted - left.linesCompleted;
    }

    return (
      new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
    );
  });
}

export function getLeaderboardSummary(entries: LeaderboardEntry[]) {
  return {
    bestLines: entries.reduce(
      (best, entry) => Math.max(best, entry.linesCompleted),
      0
    ),
    bestScore: entries[0]?.score ?? 0,
    runs: entries.length
  };
}
