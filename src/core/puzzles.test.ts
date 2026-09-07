import { describe, expect, it } from "vitest";

import { PUZZLES, puzzleById, puzzleState } from "./puzzles";
import { allLegalMoves, applyMove } from "./rules";
import { canForceWin, findForcedWin, isExactMate } from "./solve";
import type { GameState, Move } from "./types";

/** ちょうどその手数で詰ませられる最初の一手をすべて拾う。 */
function winningFirstMoves(state: GameState, plies: number): Move[] {
  const attacker = state.turn;
  const winning: Move[] = [];

  for (const move of allLegalMoves(state)) {
    const applied = applyMove(state, move);
    if ("error" in applied) continue;
    if (canForceWin(applied.state, plies - 1, attacker)) winning.push(move);
  }

  return winning;
}

describe("問題の一覧", () => {
  it("id が重複していない", () => {
    const ids = PUZZLES.map((puzzle) => puzzle.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("id で引ける", () => {
    expect(puzzleById(PUZZLES[0].id)).toBe(PUZZLES[0]);
    expect(puzzleById("ない")).toBeNull();
  });

  it("手数は奇数。攻め方が指して終わるため", () => {
    for (const puzzle of PUZZLES) {
      expect(puzzle.plies % 2, puzzle.id).toBe(1);
    }
  });

  it("持ち駒は 0。打つ手が混ざると読みが重くなる", () => {
    for (const puzzle of PUZZLES) {
      expect(puzzle.hands, puzzle.id).toEqual({ A: 0, B: 0 });
    }
  });
});

/*
 * 問題が問題として成り立っているかを、毎回読み直して確かめる。
 * 手で書き足したものが詰んでいなければ、ここで落ちる。
 */
describe.each(PUZZLES.map((puzzle) => [puzzle.id, puzzle] as const))(
  "%s",
  (_id, puzzle) => {
    const state = puzzleState(puzzle);

    it("まだ決着していない", () => {
      expect(state.outcome).toBeNull();
      expect(allLegalMoves(state).length).toBeGreaterThan(0);
    });

    it("ちょうど書かれた手数で詰む", () => {
      expect(isExactMate(state, puzzle.plies)).toBe(true);
    });

    it("最初の一手は1通りしかない", () => {
      expect(winningFirstMoves(state, puzzle.plies)).toHaveLength(1);
    });

    it("正解の手を指すと、詰みが続いている", () => {
      const found = findForcedWin(state, puzzle.plies)!;
      const { state: next } = (() => {
        const applied = applyMove(state, found.first);
        if ("error" in applied) throw new Error("正解の手が拒否された");
        return applied;
      })();

      if (puzzle.plies === 1) {
        expect(next.outcome).toEqual({
          kind: "win",
          winner: puzzle.turn,
          reason: expect.any(String),
        });
      } else {
        expect(canForceWin(next, puzzle.plies - 1, puzzle.turn)).toBe(true);
      }
    });
  },
);
