/**
 * 保存した棋譜の置き場。ブラウザに残す。
 *
 * 棋譜は「開始時の設定」と「指した手の並び」だけを持つ。
 * 局面は保存しない。同じ設定の開始局面に同じ順で流し込めば同じ対局になるので、
 * 再生はそれを1手ずつ指し直すだけで済む。
 *
 * 読み出したものは他所（前の版のアプリ、手で書き換えた値）から来ているかもしれないので、
 * 形を確かめてから返す。壊れているものは黙って捨てる。
 */

import { SIDE_NAME } from "../core/notation";
import type { BoardConfig, Move, Outcome } from "../core/types";

const STORAGE_KEY = "hasami:records";
/** これより古いものから捨てる。 */
const LIMIT = 30;

export interface SavedGame {
  readonly id: string;
  /** 保存した時刻。ISO 8601。 */
  readonly savedAt: string;
  readonly config: BoardConfig;
  readonly moves: readonly Move[];
  readonly plies: number;
  /** 決着せずに保存した場合は null。 */
  readonly outcome: Outcome | null;
}

export type NewGame = Omit<SavedGame, "id" | "savedAt">;

function newId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

function isPos(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;
  const pos = value as Record<string, unknown>;
  return typeof pos.x === "number" && typeof pos.y === "number";
}

function isMove(value: unknown): value is Move {
  if (typeof value !== "object" || value === null) return false;
  const move = value as Record<string, unknown>;
  if (!isPos(move.to)) return false;
  if (move.kind === "place") return true;
  return move.kind === "move" && typeof move.pieceId === "number";
}

function isConfig(value: unknown): value is BoardConfig {
  if (typeof value !== "object" || value === null) return false;
  const config = value as Record<string, unknown>;
  return (
    typeof config.cols === "number" &&
    typeof config.rows === "number" &&
    typeof config.moveRange === "number" &&
    typeof config.handSize === "number" &&
    typeof config.connectLimit === "number"
  );
}

function isSavedGame(value: unknown): value is SavedGame {
  if (typeof value !== "object" || value === null) return false;
  const game = value as Record<string, unknown>;
  return (
    typeof game.id === "string" &&
    typeof game.savedAt === "string" &&
    typeof game.plies === "number" &&
    isConfig(game.config) &&
    Array.isArray(game.moves) &&
    game.moves.every(isMove)
  );
}

export class RecordStore {
  /** 新しいものが先頭。 */
  list(): readonly SavedGame[] {
    let raw: string | null;
    try {
      raw = localStorage.getItem(STORAGE_KEY);
    } catch {
      return [];
    }
    if (raw === null) return [];

    try {
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(isSavedGame);
    } catch {
      return [];
    }
  }

  get(id: string): SavedGame | null {
    return this.list().find((game) => game.id === id) ?? null;
  }

  save(game: NewGame): SavedGame | null {
    const saved: SavedGame = { ...game, id: newId(), savedAt: new Date().toISOString() };
    return this.#write([saved, ...this.list()].slice(0, LIMIT)) ? saved : null;
  }

  remove(id: string): void {
    this.#write(this.list().filter((game) => game.id !== id));
  }

  #write(games: readonly SavedGame[]): boolean {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(games));
      return true;
    } catch {
      // 容量切れや保存できない設定。保存できなくても対局は続けられる
      return false;
    }
  }
}

/* ============================================================
 * 一覧に出すための文字列
 * ========================================================== */

/** 保存した時刻。読めなければ空文字。 */
export function formatSavedAt(game: SavedGame): string {
  const date = new Date(game.savedAt);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** 結果の一言。 */
export function outcomeSummary(game: SavedGame): string {
  if (game.outcome === null) return "途中まで";
  if (game.outcome.kind === "draw") return "引き分け";
  return SIDE_NAME[game.outcome.winner] + "の勝ち";
}

/** 盤の大きさなどの一言。 */
export function configSummaryOf(game: SavedGame): string {
  return game.config.cols + "×" + game.config.rows + " · 移動" + game.config.moveRange + " · 持ち駒" + game.config.handSize;
}
