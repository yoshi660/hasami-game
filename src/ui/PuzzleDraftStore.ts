/**
 * 作問した問題の下書き。ブラウザに残す。
 *
 * 作問の画面から足すと、その場で一覧に並んで遊べる。ソースを触らなくてよい。
 * ただし残るのはその端末だけなので、みんなに配るには
 * 「書き出す」で core/puzzles.ts に貼って push する（README 参照）。
 *
 * 読み出したものは手で書き換えられているかもしれないので、形を確かめてから返す。
 */

import type { Puzzle } from "../core/puzzles";

const STORAGE_KEY = "hasami:drafts";
const LIMIT = 50;

/** 下書きの id はこの印で始まる。組み込みの問題と混ざらないように。 */
export const DRAFT_PREFIX = "draft-";

export function isDraftId(id: string): boolean {
  return id.startsWith(DRAFT_PREFIX);
}

function isPuzzle(value: unknown): value is Puzzle {
  if (typeof value !== "object" || value === null) return false;
  const puzzle = value as Record<string, unknown>;
  const hands = puzzle.hands as Record<string, unknown> | undefined;

  return (
    typeof puzzle.id === "string" &&
    typeof puzzle.plies === "number" &&
    typeof puzzle.moveRange === "number" &&
    (puzzle.turn === "A" || puzzle.turn === "B") &&
    Array.isArray(puzzle.rows) &&
    puzzle.rows.length > 0 &&
    puzzle.rows.every((row) => typeof row === "string") &&
    typeof hands === "object" &&
    hands !== null &&
    typeof hands.A === "number" &&
    typeof hands.B === "number"
  );
}

export class PuzzleDraftStore {
  /** 新しいものが後ろ。一覧では組み込みの問題の後に並ぶ。 */
  list(): readonly Puzzle[] {
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
      return parsed.filter(isPuzzle);
    } catch {
      return [];
    }
  }

  /** 足す。id は自動で振る。 */
  add(puzzle: Omit<Puzzle, "id">): Puzzle | null {
    const saved: Puzzle = { ...puzzle, id: `${DRAFT_PREFIX}${Date.now().toString(36)}` };
    return this.#write([...this.list(), saved].slice(-LIMIT)) ? saved : null;
  }

  remove(id: string): void {
    this.#write(this.list().filter((puzzle) => puzzle.id !== id));
  }

  #write(puzzles: readonly Puzzle[]): boolean {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(puzzles));
      return true;
    } catch {
      // 保存できなくても、書き出して貼る道は残っている
      return false;
    }
  }
}
