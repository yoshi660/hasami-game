/**
 * 座標と盤面アクセスの純粋関数。
 *
 * ここに入れてよいのは「盤の形と、そこに何が置かれているか」を扱うものだけ。
 * 挟みの判定・合法手の生成・勝敗の判定はルール層の仕事なので置かない。
 *
 * すべて参照透過。引数を書き換えない（設計ルール4）。
 */

import type {
  Axis,
  BoardConfig,
  GameState,
  Piece,
  PieceId,
  Player,
  Pos,
  PosKey,
} from "./types";

/* ============================================================
 * 方向
 * ========================================================== */

/**
 * 方向ベクトル。座標ではなく差分を表す。
 * Pos と別のフィールド名にして、取り違えを型で弾く。
 */
export interface Vec {
  readonly dx: number;
  readonly dy: number;
}

export const UP: Vec = { dx: 0, dy: -1 };
export const RIGHT: Vec = { dx: 1, dy: 0 };
export const DOWN: Vec = { dx: 0, dy: 1 };
export const LEFT: Vec = { dx: -1, dy: 0 };

/** 上下左右の4方向。斜めは含まない。 */
export const DIRECTIONS: readonly Vec[] = [UP, RIGHT, DOWN, LEFT];

/** 1つの軸と、その両側を向く2方向。挟みは軸ごとに判定する。 */
export interface AxisPair {
  readonly axis: Axis;
  readonly dirs: readonly [Vec, Vec];
}

export const AXES: readonly AxisPair[] = [
  { axis: "horizontal", dirs: [LEFT, RIGHT] },
  { axis: "vertical", dirs: [UP, DOWN] },
];

/**
 * 方向ベクトルを作る。
 * -0 は === では 0 と等しいのに深い比較では別物になるため、ここで正規化する。
 */
function vec(dx: number, dy: number): Vec {
  return { dx: dx === 0 ? 0 : dx, dy: dy === 0 ? 0 : dy };
}

export function opposite(dir: Vec): Vec {
  return vec(-dir.dx, -dir.dy);
}

/** 方向が属する軸。斜めやゼロベクトルは受け付けない想定。 */
export function axisOf(dir: Vec): Axis {
  return dir.dy === 0 ? "horizontal" : "vertical";
}

/* ============================================================
 * 座標
 * ========================================================== */

/** 盤面 Map のキーを作る。Pos は参照比較になるため必ずこれを通す。 */
export function toKey(pos: Pos): PosKey {
  return `${pos.x},${pos.y}`;
}

/** toKey の逆。 */
export function fromKey(key: PosKey): Pos {
  const comma = key.indexOf(",");
  return {
    x: Number(key.slice(0, comma)),
    y: Number(key.slice(comma + 1)),
  };
}

export function posEquals(a: Pos, b: Pos): boolean {
  return a.x === b.x && a.y === b.y;
}

/** pos から dir 方向へ steps マス進んだ座標。盤外になりうる。 */
export function translate(pos: Pos, dir: Vec, steps = 1): Pos {
  return { x: pos.x + dir.dx * steps, y: pos.y + dir.dy * steps };
}

export function inBounds(config: BoardConfig, pos: Pos): boolean {
  return pos.x >= 0 && pos.x < config.cols && pos.y >= 0 && pos.y < config.rows;
}

/** 盤の全マスを、上の行から順に、行内は左から右に並べて返す。 */
export function boardCells(config: BoardConfig): readonly Pos[] {
  const cells: Pos[] = [];
  for (let y = 0; y < config.rows; y++) {
    for (let x = 0; x < config.cols; x++) cells.push({ x, y });
  }
  return cells;
}

/** 盤内にある上下左右の隣接マス。盤端では3マスや2マスになる。 */
export function neighbors(config: BoardConfig, pos: Pos): readonly Pos[] {
  return DIRECTIONS.map((dir) => translate(pos, dir)).filter((p) =>
    inBounds(config, p),
  );
}

/* ============================================================
 * 直線
 * ========================================================== */

/** 同じ行か同じ列にあり、かつ同じマスではない。 */
export function isOrthogonal(from: Pos, to: Pos): boolean {
  if (posEquals(from, to)) return false;
  return from.x === to.x || from.y === to.y;
}

/** from から to への単位方向。直線上にない、または同じマスなら null。 */
export function directionTo(from: Pos, to: Pos): Vec | null {
  if (!isOrthogonal(from, to)) return null;
  return vec(Math.sign(to.x - from.x), Math.sign(to.y - from.y));
}

/** 直線上の距離（マス数）。直線上にない場合は null。 */
export function distance(from: Pos, to: Pos): number | null {
  if (posEquals(from, to)) return 0;
  if (!isOrthogonal(from, to)) return null;
  return Math.abs(to.x - from.x) + Math.abs(to.y - from.y);
}

/**
 * from と to の間のマス。両端は含まない。
 * 経路が塞がっていないかの判定に使う（to 自体の空き判定は別に行う）。
 * 直線上にない場合は null。
 */
export function cellsBetween(from: Pos, to: Pos): readonly Pos[] | null {
  const dir = directionTo(from, to);
  if (dir === null) return null;
  const steps = distance(from, to);
  if (steps === null) return null;
  const cells: Pos[] = [];
  for (let i = 1; i < steps; i++) cells.push(translate(from, dir, i));
  return cells;
}

/* ============================================================
 * 盤面アクセス
 * ========================================================== */

export function pieceIdAt(state: GameState, pos: Pos): PieceId | undefined {
  return state.board.get(toKey(pos));
}

export function pieceAt(state: GameState, pos: Pos): Piece | undefined {
  const id = pieceIdAt(state, pos);
  return id === undefined ? undefined : state.pieces.get(id);
}

export function pieceById(state: GameState, id: PieceId): Piece | undefined {
  return state.pieces.get(id);
}

/** 盤内で、かつ駒が置かれていない。盤外は空きマスではない。 */
export function isEmpty(state: GameState, pos: Pos): boolean {
  return inBounds(state.config, pos) && pieceIdAt(state, pos) === undefined;
}

/** 盤外かどうか。挟みでは盤外が壁として働く。 */
export function isOutside(config: BoardConfig, pos: Pos): boolean {
  return !inBounds(config, pos);
}

export function opponent(player: Player): Player {
  return player === "A" ? "B" : "A";
}

/** そのプレイヤーの盤上の駒。boardCells と同じ順に並ぶ。 */
export function piecesOf(state: GameState, player: Player): readonly Piece[] {
  return boardCells(state.config)
    .map((pos) => pieceAt(state, pos))
    .filter((piece): piece is Piece => piece !== undefined && piece.owner === player);
}

/** そのプレイヤーの封じ駒の ID。次の手番で動かす義務があるもの。 */
export function sealedPiecesOf(state: GameState, player: Player): readonly PieceId[] {
  return piecesOf(state, player)
    .filter((piece) => piece.sealed)
    .map((piece) => piece.id);
}

/** 駒が置かれていないマス。打てる場所の候補（打ちの禁止条件は別に判定する）。 */
export function emptyCells(state: GameState): readonly Pos[] {
  return boardCells(state.config).filter((pos) => pieceIdAt(state, pos) === undefined);
}
