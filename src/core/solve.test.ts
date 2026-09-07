import { describe, expect, it } from "vitest";

import { bestDefence, findForcedWin, isExactMate } from "./solve";
import { applyMove } from "./rules";
import { idAt, makeState, unwrap } from "./testing";

/** 詰めはさみの問題は持ち駒なしで作る。打ちが混ざると読む手が一気に増えるため。 */
const NO_HANDS = { hands: { A: 0, B: 0 } } as const;

describe("findForcedWin", () => {
  it("1手で詰む局面を見つける", () => {
    const state = makeState(
      `
      B . A
      A . .
      . . .
    `,
      NO_HANDS,
    );

    const found = findForcedWin(state, 5);

    expect(found).not.toBeNull();
    expect(found!.plies).toBe(1);
    expect(found!.first).toEqual({
      kind: "move",
      pieceId: idAt(state, 2, 0),
      to: { x: 1, y: 0 },
    });
  });

  it("見つけた手を指すと本当に決着する", () => {
    const state = makeState(
      `
      B . A
      A . .
      . . .
    `,
      NO_HANDS,
    );

    const found = findForcedWin(state, 5)!;
    const { state: next } = unwrap(applyMove(state, found.first));

    expect(next.outcome).toEqual({
      kind: "win",
      winner: "A",
      reason: "sealedPieceStuck",
    });
  });

  it("詰まない局面では null", () => {
    const state = makeState(
      `
      A . . . .
      . . . . .
      . . . . .
      . . . . .
      . . . . B
    `,
      NO_HANDS,
    );

    expect(findForcedWin(state, 3)).toBeNull();
  });

  it("決着済みの局面では null", () => {
    const state = makeState(
      `
      B . A
      A . .
      . . .
    `,
      NO_HANDS,
    );
    const { state: over } = unwrap(
      applyMove(state, { kind: "move", pieceId: idAt(state, 2, 0), to: { x: 1, y: 0 } }),
    );

    expect(over.outcome).not.toBeNull();
    expect(findForcedWin(over, 5)).toBeNull();
  });

  it("1手で終わる手は、読みの上限に関わらず見つかる", () => {
    const state = makeState(
      `
      B . A
      A . .
      . . .
    `,
      NO_HANDS,
    );

    // 指した先が決着していれば、その先を読む必要がない
    expect(findForcedWin(state, 5, { nodeLimit: 0 })).not.toBeNull();
  });
});

describe("isExactMate", () => {
  const state = makeState(
    `
      B . A
      A . .
      . . .
    `,
    NO_HANDS,
  );

  it("ちょうどその手数なら true", () => {
    expect(isExactMate(state, 1)).toBe(true);
  });

  it("もっと短く詰むなら、長い手数では false", () => {
    expect(isExactMate(state, 3)).toBe(false);
    expect(isExactMate(state, 5)).toBe(false);
  });
});

describe("bestDefence", () => {
  it("逃れる手があればそれを選ぶ", () => {
    // 受け方の白は動けば助かる。詰まされる手を選ばない
    const state = makeState(
      `
      . . . . .
      . . . . .
      . . B . .
      . . . . .
      . . . . A
    `,
      { ...NO_HANDS, turn: "B" },
    );

    const move = bestDefence(state, "A", 3);

    expect(move).not.toBeNull();
    const { state: next } = unwrap(applyMove(state, move!));
    expect(findForcedWin(next, 3)).toBeNull();
  });

  it("指せる手がなければ null", () => {
    // 決着済みの局面
    const start = makeState(
      `
      B . A
      A . .
      . . .
    `,
      NO_HANDS,
    );
    const { state: over } = unwrap(
      applyMove(start, { kind: "move", pieceId: idAt(start, 2, 0), to: { x: 1, y: 0 } }),
    );

    expect(bestDefence(over, "A", 3)).toBeNull();
  });
});
