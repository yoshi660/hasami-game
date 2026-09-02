import { describe, expect, it } from "vitest";

import {
  REPETITION_LIMIT,
  connectedGroupOf,
  overConnectedOutcome,
  repetitionKey,
  repetitionOutcome,
  turnStartOutcome,
} from "./result";
import { idAt, makeState } from "./testing";
import type { GameState, Piece, PieceId, PosKey } from "./types";

describe("connectedGroupOf", () => {
  it("1つだけなら自分自身", () => {
    const state = makeState(`
      A . .
      . . .
      . . B
    `);
    expect(connectedGroupOf(state, idAt(state, 0, 0))).toEqual([idAt(state, 0, 0)]);
  });

  it("上下左右につながった駒をまとめる", () => {
    const state = makeState(`
      A A .
      . A .
      . . .
    `);
    expect(connectedGroupOf(state, idAt(state, 0, 0))).toHaveLength(3);
  });

  it("斜めはつながっていない", () => {
    const state = makeState(`
      A . .
      . A .
      . . A
    `);
    expect(connectedGroupOf(state, idAt(state, 0, 0))).toEqual([idAt(state, 0, 0)]);
  });

  it("相手の駒は塊に含めない", () => {
    const state = makeState(`
      A B A
      . . .
      . . .
    `);
    expect(connectedGroupOf(state, idAt(state, 0, 0))).toEqual([idAt(state, 0, 0)]);
  });

  it("L字も1つの塊", () => {
    const state = makeState(`
      A . .
      A . .
      A A .
    `);
    expect(connectedGroupOf(state, idAt(state, 1, 2))).toHaveLength(4);
  });

  it("封じ駒も塊として数える", () => {
    const state = makeState(`
      A a .
      . . .
      . . .
    `);
    expect(connectedGroupOf(state, idAt(state, 0, 0))).toHaveLength(2);
  });

  it("存在しない駒なら空", () => {
    const state = makeState("A .");
    expect(connectedGroupOf(state, 999)).toEqual([]);
  });
});

describe("overConnectedOutcome", () => {
  it("3つまでは負けにならない", () => {
    const state = makeState(`
      A A .
      . A .
      . . .
    `);
    expect(overConnectedOutcome(state, "A")).toBeNull();
  });

  it("4つつながると負け", () => {
    const state = makeState(`
      A A .
      . A .
      . A .
    `);
    const over = overConnectedOutcome(state, "A");

    expect(over).not.toBeNull();
    expect(over!.outcome).toEqual({ kind: "win", winner: "B", reason: "overConnected" });
    expect(over!.group).toHaveLength(4);
  });

  it("塊が離れていれば合計が4以上でも負けにならない", () => {
    const state = makeState(`
      A A . A
      . . . A
      . . . .
      . . . .
    `);
    expect(overConnectedOutcome(state, "A")).toBeNull();
  });

  it("指定した側だけを判定する", () => {
    const state = makeState(`
      B B .
      . B .
      . B .
    `);
    expect(overConnectedOutcome(state, "A")).toBeNull();
    expect(overConnectedOutcome(state, "B")).not.toBeNull();
  });

  it("connectLimit は設定から読む", () => {
    const state = makeState(
      `
      A A .
      . . .
      . . .
    `,
      { config: { connectLimit: 2 } },
    );
    expect(overConnectedOutcome(state, "A")).not.toBeNull();
  });
});

describe("turnStartOutcome", () => {
  it("封じ駒があって動かせるなら続く", () => {
    expect(turnStartOutcome("B", { sealed: [1], canMove: true, canPlace: false })).toBeNull();
  });

  it("封じ駒が動かせないと負け", () => {
    expect(turnStartOutcome("B", { sealed: [1], canMove: false, canPlace: true })).toEqual({
      kind: "win",
      winner: "A",
      reason: "sealedPieceStuck",
    });
  });

  it("封じ駒があるときは打てても関係ない", () => {
    expect(turnStartOutcome("A", { sealed: [1, 2], canMove: false, canPlace: true })).toEqual({
      kind: "win",
      winner: "B",
      reason: "sealedPieceStuck",
    });
  });

  it("打つことも動かすこともできないと負け", () => {
    expect(turnStartOutcome("A", { sealed: [], canMove: false, canPlace: false })).toEqual({
      kind: "win",
      winner: "B",
      reason: "noLegalMove",
    });
  });

  it("打てるだけでも続く", () => {
    expect(turnStartOutcome("A", { sealed: [], canMove: false, canPlace: true })).toBeNull();
  });

  it("動かせるだけでも続く", () => {
    expect(turnStartOutcome("A", { sealed: [], canMove: true, canPlace: false })).toBeNull();
  });
});

describe("repetitionKey", () => {
  const base = makeState(`
    A . B
    . . .
    . . .
  `);

  it("同じ形なら同じキー", () => {
    const same = makeState(`
      A . B
      . . .
      . . .
    `);
    expect(repetitionKey(same)).toBe(repetitionKey(base));
  });

  it("駒の配置が違えば別のキー", () => {
    const moved = makeState(`
      . A B
      . . .
      . . .
    `);
    expect(repetitionKey(moved)).not.toBe(repetitionKey(base));
  });

  it("手番が違えば別のキー", () => {
    const other = makeState(
      `
      A . B
      . . .
      . . .
    `,
      { turn: "B" },
    );
    expect(repetitionKey(other)).not.toBe(repetitionKey(base));
  });

  it("封じ状態が違えば別のキー", () => {
    const sealed = makeState(`
      a . B
      . . .
      . . .
    `);
    expect(repetitionKey(sealed)).not.toBe(repetitionKey(base));
  });

  it("駒 ID には依存しない", () => {
    // 同じ形のまま ID だけ振り直した局面
    const renumbered: GameState = {
      ...base,
      board: new Map<PosKey, PieceId>([
        ["0,0", 71],
        ["2,0", 42],
      ]),
      pieces: new Map<PieceId, Piece>([
        [71, { id: 71, owner: "A", pos: { x: 0, y: 0 }, sealed: false }],
        [42, { id: 42, owner: "B", pos: { x: 2, y: 0 }, sealed: false }],
      ]),
    };
    expect(repetitionKey(renumbered)).toBe(repetitionKey(base));
  });
});

describe("repetitionOutcome", () => {
  it("上限に達するまでは続く", () => {
    expect(repetitionOutcome(1)).toBeNull();
    expect(repetitionOutcome(REPETITION_LIMIT - 1)).toBeNull();
  });

  it("上限に達したら引き分け", () => {
    expect(repetitionOutcome(REPETITION_LIMIT)).toEqual({ kind: "draw", reason: "repetition" });
    expect(repetitionOutcome(REPETITION_LIMIT + 1)).toEqual({ kind: "draw", reason: "repetition" });
  });
});
