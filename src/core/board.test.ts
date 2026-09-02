import { describe, expect, it } from "vitest";

import {
  AXES,
  DIRECTIONS,
  DOWN,
  LEFT,
  RIGHT,
  UP,
  axisOf,
  boardCells,
  cellsBetween,
  directionTo,
  distance,
  emptyCells,
  fromKey,
  inBounds,
  isEmpty,
  isOrthogonal,
  isOutside,
  neighbors,
  opponent,
  opposite,
  pieceAt,
  pieceById,
  pieceIdAt,
  piecesOf,
  posEquals,
  sealedPiecesOf,
  toKey,
  translate,
} from "./board";
import type { BoardConfig, GameState, Piece, PieceId, Player, PosKey } from "./types";

/* ============================================================
 * テスト用の局面づくり
 *
 *   .  空きマス
 *   A  先手の駒 / a  先手の封じ駒
 *   B  後手の駒 / b  後手の封じ駒
 *
 * 駒 ID は上の行から順に、行内は左から 1, 2, 3... と振る。
 * ========================================================== */

const OWNER: Record<string, Player> = { A: "A", a: "A", B: "B", b: "B" };

function makeState(diagram: string, overrides: Partial<BoardConfig> = {}): GameState {
  const grid = diagram
    .trim()
    .split("\n")
    .map((line) => line.trim().split(/\s+/));

  const rows = grid.length;
  const cols = grid[0].length;
  for (const row of grid) {
    if (row.length !== cols) throw new Error(`行の長さが揃っていない: ${row.join(" ")}`);
  }

  const config: BoardConfig = {
    cols,
    rows,
    moveRange: 1,
    handSize: 8,
    connectLimit: 4,
    ...overrides,
  };

  const board = new Map<PosKey, PieceId>();
  const pieces = new Map<PieceId, Piece>();
  const placed: Record<Player, number> = { A: 0, B: 0 };
  let nextPieceId = 1;

  grid.forEach((row, y) => {
    row.forEach((cell, x) => {
      if (cell === ".") return;
      const owner = OWNER[cell];
      if (owner === undefined) throw new Error(`読めない記号: ${cell}`);
      const id = nextPieceId++;
      board.set(toKey({ x, y }), id);
      pieces.set(id, { id, owner, pos: { x, y }, sealed: cell === cell.toLowerCase() });
      placed[owner]++;
    });
  });

  return {
    config,
    board,
    pieces,
    hands: { A: config.handSize - placed.A, B: config.handSize - placed.B },
    turn: "A",
    nextPieceId,
    ply: 0,
    repetitions: new Map(),
    outcome: null,
  };
}

/** 多くのテストで使う 4x4 の局面。 */
const sample = makeState(`
  . . . .
  . A . B
  . . b .
  a . . .
`);
// id 1 = A(1,1) / id 2 = B(3,1) / id 3 = b(2,2) 封じ / id 4 = a(0,3) 封じ

describe("方向", () => {
  it("4方向は上下左右のみで、斜めを含まない", () => {
    expect(DIRECTIONS).toEqual([UP, RIGHT, DOWN, LEFT]);
    for (const dir of DIRECTIONS) {
      expect(Math.abs(dir.dx) + Math.abs(dir.dy)).toBe(1);
    }
  });

  it("軸は縦横の2本で、それぞれ逆向きの2方向を持つ", () => {
    expect(AXES).toHaveLength(2);
    for (const { dirs } of AXES) {
      expect(opposite(dirs[0])).toEqual(dirs[1]);
    }
  });

  it("opposite は向きを反転する", () => {
    expect(opposite(UP)).toEqual(DOWN);
    expect(opposite(LEFT)).toEqual(RIGHT);
    expect(opposite(opposite(UP))).toEqual(UP);
  });

  it("axisOf は方向の軸を返す", () => {
    expect(axisOf(LEFT)).toBe("horizontal");
    expect(axisOf(RIGHT)).toBe("horizontal");
    expect(axisOf(UP)).toBe("vertical");
    expect(axisOf(DOWN)).toBe("vertical");
  });
});

describe("座標", () => {
  it("toKey と fromKey は往復する", () => {
    expect(toKey({ x: 3, y: 5 })).toBe("3,5");
    expect(fromKey("3,5")).toEqual({ x: 3, y: 5 });
  });

  it("盤外の負の座標も往復する（壁の位置を表すのに使う）", () => {
    expect(toKey({ x: -1, y: 0 })).toBe("-1,0");
    expect(fromKey("-1,0")).toEqual({ x: -1, y: 0 });
    expect(fromKey(toKey({ x: -2, y: -3 }))).toEqual({ x: -2, y: -3 });
  });

  it("x と y を取り違えたキーは別物になる", () => {
    expect(toKey({ x: 1, y: 2 })).not.toBe(toKey({ x: 2, y: 1 }));
  });

  it("posEquals は値で比べる", () => {
    expect(posEquals({ x: 1, y: 2 }, { x: 1, y: 2 })).toBe(true);
    expect(posEquals({ x: 1, y: 2 }, { x: 2, y: 1 })).toBe(false);
  });

  it("translate は指定方向に進む", () => {
    expect(translate({ x: 2, y: 2 }, UP)).toEqual({ x: 2, y: 1 });
    expect(translate({ x: 2, y: 2 }, RIGHT, 3)).toEqual({ x: 5, y: 2 });
    expect(translate({ x: 2, y: 2 }, DOWN, 0)).toEqual({ x: 2, y: 2 });
  });

  it("translate は盤外にも出られる（壁の判定に必要）", () => {
    expect(translate({ x: 0, y: 0 }, LEFT)).toEqual({ x: -1, y: 0 });
  });

  it("inBounds は四隅を含み、その外を弾く", () => {
    const config = sample.config; // 4x4
    expect(inBounds(config, { x: 0, y: 0 })).toBe(true);
    expect(inBounds(config, { x: 3, y: 3 })).toBe(true);
    expect(inBounds(config, { x: -1, y: 0 })).toBe(false);
    expect(inBounds(config, { x: 0, y: -1 })).toBe(false);
    expect(inBounds(config, { x: 4, y: 0 })).toBe(false);
    expect(inBounds(config, { x: 0, y: 4 })).toBe(false);
  });

  it("isOutside は inBounds の逆", () => {
    expect(isOutside(sample.config, { x: 0, y: 0 })).toBe(false);
    expect(isOutside(sample.config, { x: -1, y: 0 })).toBe(true);
  });

  it("boardCells は全マスを上の行から左詰めで返す", () => {
    const cells = boardCells({ ...sample.config, cols: 3, rows: 2 });
    expect(cells).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 0, y: 1 },
      { x: 1, y: 1 },
      { x: 2, y: 1 },
    ]);
  });

  it("neighbors は盤内の隣接マスだけを返す", () => {
    const config = sample.config; // 4x4
    expect(neighbors(config, { x: 1, y: 1 })).toHaveLength(4);
    expect(neighbors(config, { x: 0, y: 1 })).toHaveLength(3);
    expect(neighbors(config, { x: 0, y: 0 })).toEqual([
      { x: 1, y: 0 },
      { x: 0, y: 1 },
    ]);
    expect(neighbors(config, { x: 3, y: 3 })).toHaveLength(2);
  });
});

describe("直線", () => {
  it("同じ行か同じ列なら直線", () => {
    expect(isOrthogonal({ x: 0, y: 0 }, { x: 3, y: 0 })).toBe(true);
    expect(isOrthogonal({ x: 0, y: 0 }, { x: 0, y: 3 })).toBe(true);
  });

  it("斜めは直線ではない", () => {
    expect(isOrthogonal({ x: 0, y: 0 }, { x: 1, y: 1 })).toBe(false);
    expect(isOrthogonal({ x: 0, y: 0 }, { x: 2, y: 3 })).toBe(false);
  });

  it("同じマスは直線ではない", () => {
    expect(isOrthogonal({ x: 2, y: 2 }, { x: 2, y: 2 })).toBe(false);
  });

  it("directionTo は単位方向を返す", () => {
    expect(directionTo({ x: 2, y: 2 }, { x: 2, y: 0 })).toEqual(UP);
    expect(directionTo({ x: 2, y: 2 }, { x: 5, y: 2 })).toEqual(RIGHT);
    expect(directionTo({ x: 2, y: 2 }, { x: 2, y: 9 })).toEqual(DOWN);
    expect(directionTo({ x: 2, y: 2 }, { x: 0, y: 2 })).toEqual(LEFT);
  });

  it("directionTo は斜めと同じマスで null", () => {
    expect(directionTo({ x: 0, y: 0 }, { x: 1, y: 1 })).toBeNull();
    expect(directionTo({ x: 1, y: 1 }, { x: 1, y: 1 })).toBeNull();
  });

  it("distance は直線上のマス数", () => {
    expect(distance({ x: 0, y: 0 }, { x: 3, y: 0 })).toBe(3);
    expect(distance({ x: 3, y: 0 }, { x: 0, y: 0 })).toBe(3);
    expect(distance({ x: 2, y: 2 }, { x: 2, y: 2 })).toBe(0);
    expect(distance({ x: 0, y: 0 }, { x: 1, y: 1 })).toBeNull();
  });

  it("cellsBetween は両端を含まない", () => {
    expect(cellsBetween({ x: 0, y: 0 }, { x: 3, y: 0 })).toEqual([
      { x: 1, y: 0 },
      { x: 2, y: 0 },
    ]);
  });

  it("cellsBetween は隣接なら空", () => {
    expect(cellsBetween({ x: 0, y: 0 }, { x: 1, y: 0 })).toEqual([]);
  });

  it("cellsBetween は向きを変えても同じマス集合を返す", () => {
    const forward = cellsBetween({ x: 0, y: 0 }, { x: 0, y: 3 });
    const backward = cellsBetween({ x: 0, y: 3 }, { x: 0, y: 0 });
    expect(forward).toEqual([...backward!].reverse());
  });

  it("cellsBetween は斜めと同じマスで null", () => {
    expect(cellsBetween({ x: 0, y: 0 }, { x: 2, y: 2 })).toBeNull();
    expect(cellsBetween({ x: 1, y: 1 }, { x: 1, y: 1 })).toBeNull();
  });
});

describe("盤面アクセス", () => {
  it("pieceIdAt は駒の ID を返し、空きマスでは undefined", () => {
    expect(pieceIdAt(sample, { x: 1, y: 1 })).toBe(1);
    expect(pieceIdAt(sample, { x: 3, y: 1 })).toBe(2);
    expect(pieceIdAt(sample, { x: 0, y: 0 })).toBeUndefined();
  });

  it("pieceIdAt は盤外で undefined", () => {
    expect(pieceIdAt(sample, { x: -1, y: 1 })).toBeUndefined();
  });

  it("pieceAt は駒の実体を返す", () => {
    expect(pieceAt(sample, { x: 1, y: 1 })).toEqual({
      id: 1,
      owner: "A",
      pos: { x: 1, y: 1 },
      sealed: false,
    });
    expect(pieceAt(sample, { x: 2, y: 2 })?.sealed).toBe(true);
    expect(pieceAt(sample, { x: 0, y: 0 })).toBeUndefined();
  });

  it("pieceById は ID で引ける", () => {
    expect(pieceById(sample, 2)?.owner).toBe("B");
    expect(pieceById(sample, 999)).toBeUndefined();
  });

  it("盤上の駒の位置は board と pieces で一致する", () => {
    for (const [key, id] of sample.board) {
      expect(toKey(pieceById(sample, id)!.pos)).toBe(key);
    }
    expect(sample.board.size).toBe(sample.pieces.size);
  });

  it("isEmpty は空きマスだけ true", () => {
    expect(isEmpty(sample, { x: 0, y: 0 })).toBe(true);
    expect(isEmpty(sample, { x: 1, y: 1 })).toBe(false);
  });

  it("isEmpty は盤外を空きマスとみなさない", () => {
    expect(isEmpty(sample, { x: -1, y: 0 })).toBe(false);
    expect(isEmpty(sample, { x: 4, y: 4 })).toBe(false);
  });

  it("opponent は手番を入れ替える", () => {
    expect(opponent("A")).toBe("B");
    expect(opponent("B")).toBe("A");
    expect(opponent(opponent("A"))).toBe("A");
  });

  it("piecesOf は指定した側の駒だけを読み順で返す", () => {
    expect(piecesOf(sample, "A").map((p) => p.id)).toEqual([1, 4]);
    expect(piecesOf(sample, "B").map((p) => p.id)).toEqual([2, 3]);
  });

  it("piecesOf は封じ駒も含む", () => {
    expect(piecesOf(sample, "A").some((p) => p.sealed)).toBe(true);
  });

  it("sealedPiecesOf は封じ駒だけを返す", () => {
    expect(sealedPiecesOf(sample, "A")).toEqual([4]);
    expect(sealedPiecesOf(sample, "B")).toEqual([3]);
  });

  it("sealedPiecesOf は封じ駒がなければ空", () => {
    const clean = makeState(`
      A .
      . B
    `);
    expect(sealedPiecesOf(clean, "A")).toEqual([]);
    expect(sealedPiecesOf(clean, "B")).toEqual([]);
  });

  it("emptyCells は駒のないマスを全部返す", () => {
    const cells = emptyCells(sample);
    expect(cells).toHaveLength(4 * 4 - 4);
    expect(cells).toContainEqual({ x: 0, y: 0 });
    expect(cells).not.toContainEqual({ x: 1, y: 1 });
  });

  it("emptyCells は盤が埋まっていれば空", () => {
    expect(emptyCells(makeState("A B"))).toEqual([]);
  });
});

describe("参照透過", () => {
  it("読み出しても局面は変わらない", () => {
    const snapshot = () =>
      JSON.stringify({
        board: [...sample.board],
        pieces: [...sample.pieces],
        hands: sample.hands,
        turn: sample.turn,
      });
    const before = snapshot();

    piecesOf(sample, "A");
    sealedPiecesOf(sample, "B");
    emptyCells(sample);
    pieceAt(sample, { x: 1, y: 1 });
    neighbors(sample.config, { x: 0, y: 0 });

    expect(snapshot()).toBe(before);
  });

  it("返された配列を書き換えても局面に影響しない", () => {
    const pieces = piecesOf(sample, "A") as Piece[];
    pieces.pop();
    expect(piecesOf(sample, "A")).toHaveLength(2);
  });

  it("translate は引数の座標を書き換えない", () => {
    const from = { x: 1, y: 1 };
    translate(from, UP, 5);
    expect(from).toEqual({ x: 1, y: 1 });
  });
});
