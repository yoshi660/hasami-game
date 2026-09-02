import { describe, expect, it } from "vitest";

import { pieceById } from "./board";
import {
  capturedPieceIds,
  capturesBy,
  capturesFrom,
  flankAt,
  selfCapture,
} from "./capture";
import { idAt, makeState } from "./testing";
import type { GameState, Piece } from "./types";

/** 図の (x,y) にいる駒を「今この手で動かした駒」として扱う。 */
function mover(state: GameState, x: number, y: number): Piece {
  return pieceById(state, idAt(state, x, y))!;
}

describe("flankAt", () => {
  const state = makeState(`
    A B .
    . . .
    . . .
  `);

  it("自分の駒は挟み手になる", () => {
    expect(flankAt(state, { x: 0, y: 0 }, "A")).toBe("piece");
  });

  it("相手の駒は挟み手にならない", () => {
    expect(flankAt(state, { x: 1, y: 0 }, "A")).toBeNull();
  });

  it("空きマスは挟み手にならない", () => {
    expect(flankAt(state, { x: 2, y: 0 }, "A")).toBeNull();
  });

  it("盤外は壁で、どちらのプレイヤーの挟み手にもなる", () => {
    expect(flankAt(state, { x: -1, y: 0 }, "A")).toBe("wall");
    expect(flankAt(state, { x: -1, y: 0 }, "B")).toBe("wall");
    expect(flankAt(state, { x: 3, y: 0 }, "A")).toBe("wall");
    expect(flankAt(state, { x: 0, y: 3 }, "B")).toBe("wall");
  });
});

describe("通常の挟み", () => {
  it("1枚を自分の駒2つで挟む", () => {
    const state = makeState(`
      . . . . .
      . . . . .
      A B A . .
      . . . . .
      . . . . .
    `);

    const captures = capturesBy(state, mover(state, 2, 2));

    expect(captures).toHaveLength(1);
    expect(captures[0].pieceId).toBe(idAt(state, 1, 2));
    expect(captures[0].owner).toBe("B");
    expect(captures[0].by).toBe(idAt(state, 2, 2));
    expect(captures[0].axis).toBe("horizontal");
    expect(captures[0].flanks).toEqual([
      { x: 2, y: 2 },
      { x: 0, y: 2 },
    ]);
  });

  it("2枚を同時に挟む", () => {
    const state = makeState(`
      . . A . .
      . . B . .
      . . A B A
      . . . . .
      . . . . .
    `);

    expect(capturedPieceIds(state, mover(state, 2, 2))).toEqual([
      idAt(state, 2, 1),
      idAt(state, 3, 2),
    ]);
  });

  it("味方の駒は挟めない", () => {
    const state = makeState("A A A");
    expect(capturesBy(state, mover(state, 2, 0))).toEqual([]);
  });

  it("挟みの距離は1マス固定で、離れた駒には届かない", () => {
    const state = makeState("A . B . A", { config: { moveRange: 3 } });
    expect(capturesBy(state, mover(state, 0, 0))).toEqual([]);
    expect(capturesBy(state, mover(state, 4, 0))).toEqual([]);
  });

  it("1つ先が空きマスなら挟みにならない", () => {
    const state = makeState(`
      . . . . .
      . . . . .
      . A B . .
      . . . . .
      . . . . .
    `);
    expect(capturesBy(state, mover(state, 1, 2))).toEqual([]);
  });
});

describe("盤端に押し付けての捕獲", () => {
  it("左端の壁に押し付ける", () => {
    const state = makeState(`
      . . .
      B A .
      . . .
    `);

    const captures = capturesBy(state, mover(state, 1, 1));

    expect(captures).toHaveLength(1);
    expect(captures[0].pieceId).toBe(idAt(state, 0, 1));
    expect(captures[0].flanks).toEqual([
      { x: 1, y: 1 },
      { x: -1, y: 1 },
    ]);
    expect(captures[0].axis).toBe("horizontal");
  });

  it("上端の壁に押し付ける", () => {
    const state = makeState(`
      . B .
      . A .
      . . .
    `);

    const captures = capturesBy(state, mover(state, 1, 1));

    expect(captures).toHaveLength(1);
    expect(captures[0].pieceId).toBe(idAt(state, 1, 0));
    expect(captures[0].flanks).toEqual([
      { x: 1, y: 1 },
      { x: 1, y: -1 },
    ]);
    expect(captures[0].axis).toBe("vertical");
  });

  it("角の駒は壁2面を背負うので、どちらから来ても捕獲される", () => {
    const fromRight = makeState(`
      B A .
      . . .
      . . .
    `);
    expect(capturedPieceIds(fromRight, mover(fromRight, 1, 0))).toEqual([
      idAt(fromRight, 0, 0),
    ]);

    const fromBelow = makeState(`
      B . .
      A . .
      . . .
    `);
    expect(capturedPieceIds(fromBelow, mover(fromBelow, 0, 1))).toEqual([
      idAt(fromBelow, 0, 0),
    ]);
  });
});

describe("自分から挟まれに行く形", () => {
  it("敵駒2つの間に入ると自分が封じられる", () => {
    const state = makeState(`
      . . . . .
      . . . . .
      . B A B .
      . . . . .
      . . . . .
    `);

    const piece = mover(state, 2, 2);
    const self = selfCapture(state, piece);

    expect(self).not.toBeNull();
    expect(self!.pieceId).toBe(piece.id);
    expect(self!.by).toBe(piece.id);
    expect(self!.owner).toBe("A");
    expect(self!.axis).toBe("horizontal");
    expect(self!.flanks).toEqual([
      { x: 1, y: 2 },
      { x: 3, y: 2 },
    ]);

    // 相手を挟んではいない
    expect(capturesBy(state, piece)).toEqual([]);
  });

  it("壁と敵駒に挟まれても封じられる", () => {
    const state = makeState(`
      . . . . .
      . . . . .
      A B . . .
      . . . . .
      . . . . .
    `);

    const self = selfCapture(state, mover(state, 0, 2));

    expect(self).not.toBeNull();
    expect(self!.flanks).toEqual([
      { x: -1, y: 2 },
      { x: 1, y: 2 },
    ]);
  });

  it("縦に挟まれた場合は axis が vertical", () => {
    const state = makeState(`
      . B .
      . A .
      . B .
    `);

    expect(selfCapture(state, mover(state, 1, 1))?.axis).toBe("vertical");
  });

  it("片側だけでは封じられない", () => {
    const state = makeState(`
      . . . . .
      . . . . .
      . B A . .
      . . . . .
      . . . . .
    `);

    expect(selfCapture(state, mover(state, 2, 2))).toBeNull();
  });

  it("両側とも壁の場合は挟みとみなさない", () => {
    const oneWide = makeState(`
      A
      .
      .
    `);
    expect(selfCapture(oneWide, mover(oneWide, 0, 0))).toBeNull();

    const oneCell = makeState("A");
    expect(selfCapture(oneCell, mover(oneCell, 0, 0))).toBeNull();
  });
});

describe("複数方向での同時捕獲", () => {
  const state = makeState(`
    . . A . .
    . . B . .
    A B A B A
    . . B . .
    . . A . .
  `);
  const center = mover(state, 2, 2);

  it("4方向すべてで同時に捕獲する", () => {
    const captures = capturesBy(state, center);

    expect(captures).toHaveLength(4);
    expect(captures.map((c) => c.pieceId)).toEqual([
      idAt(state, 2, 1),
      idAt(state, 3, 2),
      idAt(state, 2, 3),
      idAt(state, 1, 2),
    ]);
    expect(captures.every((c) => c.by === center.id)).toBe(true);
    expect(captures.map((c) => c.axis)).toEqual([
      "vertical",
      "horizontal",
      "vertical",
      "horizontal",
    ]);
  });

  it("方向ごとに独立して判定し、打ち消し合わない", () => {
    // 中央の駒自身も左右の敵駒に挟まれているが、4枚の捕獲は取り消されない
    expect(selfCapture(state, center)).not.toBeNull();
    expect(capturesBy(state, center)).toHaveLength(4);
  });

  it("capturesFrom は相手の分が先、自分が挟まれた分が最後", () => {
    const all = capturesFrom(state, center);

    expect(all).toHaveLength(5);
    expect(all.slice(0, 4).every((c) => c.owner === "B")).toBe(true);
    expect(all[4].pieceId).toBe(center.id);
    expect(all[4].owner).toBe("A");
  });

  it("捕獲が1件もなければ capturesFrom は空", () => {
    const quiet = makeState(`
      A . .
      . . .
      . . B
    `);
    expect(capturesFrom(quiet, mover(quiet, 0, 0))).toEqual([]);
  });
});

describe("参照透過", () => {
  it("判定しても局面は変わらない", () => {
    const state = makeState(`
      . . . . .
      . . . . .
      A B A B A
      . . . . .
      . . . . .
    `);
    const before = JSON.stringify([...state.pieces]);

    capturesFrom(state, mover(state, 2, 2));
    capturedPieceIds(state, mover(state, 2, 2));

    expect(JSON.stringify([...state.pieces])).toBe(before);
  });
});
