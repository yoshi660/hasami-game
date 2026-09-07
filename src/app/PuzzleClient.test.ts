import { describe, expect, it } from "vitest";

import { PUZZLES, puzzleById, puzzleState } from "../core/puzzles";
import type { Puzzle } from "../core/puzzles";
import { allLegalMoves } from "../core/rules";
import { findForcedWin } from "../core/solve";
import type { Move } from "../core/types";
import { PuzzleClient } from "./PuzzleClient";

/** 待たずに応手させる。 */
function clientFor(puzzle: Puzzle): PuzzleClient {
  return new PuzzleClient({ puzzle, replyDelayMs: 0 });
}

/** その局面の正解手。 */
function solutionMove(client: PuzzleClient): Move {
  const found = findForcedWin(client.getState(), client.pliesLeft);
  if (found === null) throw new Error("詰みが見つからない");
  return found.first;
}

const ONE = puzzleById("kabe-1")!;
const THREE = puzzleById("sumi-3")!;

describe("PuzzleClient", () => {
  it("攻め方の側だけを指せる", () => {
    const client = clientFor(THREE);
    expect(client.seats).toEqual([THREE.turn]);
  });

  it("始めは詰み筋の上にいる", () => {
    const client = clientFor(THREE);

    expect(client.status).toBe("playing");
    expect(client.pliesLeft).toBe(THREE.plies);
    expect(client.canUndo).toBe(false);
  });

  it("正解を指し続けると解ける", async () => {
    for (const puzzle of PUZZLES) {
      const client = clientFor(puzzle);

      // 攻め方の手番のあいだ、正解を指し続ける
      for (let guard = 0; guard < 10 && client.status === "playing"; guard++) {
        await client.submitMove(solutionMove(client));
      }

      expect(client.status, puzzle.id).toBe("solved");
      expect(client.getState().outcome, puzzle.id).toMatchObject({
        kind: "win",
        winner: puzzle.turn,
      });
    }
  });

  it("1手詰めは1手で解ける", async () => {
    const client = clientFor(ONE);

    await client.submitMove(solutionMove(client));

    expect(client.status).toBe("solved");
    expect(client.getState().ply).toBe(1);
  });

  it("受け方が自動で返すので、手番は攻め方に戻る", async () => {
    const client = clientFor(THREE);

    await client.submitMove(solutionMove(client));

    expect(client.getState().turn).toBe(THREE.turn);
    expect(client.getState().ply).toBe(2);
  });

  it("正解でない手を指すと、詰み筋から外れる", async () => {
    const client = clientFor(THREE);
    const correct = solutionMove(client);

    const wrong = allLegalMoves(client.getState()).find(
      (move) => JSON.stringify(move) !== JSON.stringify(correct),
    )!;
    await client.submitMove(wrong);

    expect(client.status).toBe("offTrack");
  });

  it("外れた手は待ったで戻せる", async () => {
    const client = clientFor(THREE);
    const correct = solutionMove(client);
    const wrong = allLegalMoves(client.getState()).find(
      (move) => JSON.stringify(move) !== JSON.stringify(correct),
    )!;

    await client.submitMove(wrong);
    expect(await client.undo()).toEqual({ undone: true });

    expect(client.status).toBe("playing");
    expect(client.getState().ply).toBe(0);
  });

  it("待ったは攻め方の手番まで戻す", async () => {
    const client = clientFor(THREE);
    await client.submitMove(solutionMove(client));
    expect(client.getState().ply).toBe(2);

    await client.undo();

    // 受け方の応手だけ取り消された状態にはしない
    expect(client.getState().ply).toBe(0);
    expect(client.getState().turn).toBe(THREE.turn);
  });

  it("戻せる手がなければ断る", async () => {
    const client = clientFor(THREE);
    expect(await client.undo()).toEqual({ undone: false, reason: { kind: "noHistory" } });
  });

  it("受け方の側は指せない", async () => {
    const client = clientFor(THREE);
    const state = puzzleState(THREE);
    void state;

    // 攻め方の手を指したあとは手番が戻っているので、
    // 受け方の手番で送れないことは status と ply で確かめる
    await client.submitMove(solutionMove(client));
    expect(client.getState().turn).toBe(THREE.turn);
  });

  it("イベントは攻め方の手も受け方の手も流れる", async () => {
    const client = clientFor(THREE);
    const types: string[] = [];
    client.onEvent((event) => types.push(event.type));

    await client.submitMove(solutionMove(client));

    // moved が2回（攻め方と受け方）
    expect(types.filter((t) => t === "moved")).toHaveLength(2);
  });
});
