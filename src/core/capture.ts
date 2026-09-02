/**
 * 挟みの判定。
 *
 * 判定するのは「その手で動かした駒」だけを起点にした挟み。
 * 離れた場所に結果的にできた形は見ない（CLAUDE.md「挟み（封じ）の成立」）。
 *
 * このゲームに駒の取り上げはない。挟まれた駒は盤に残り、封じられる。
 * 関数名の capture / captured は「封じが成立した」という意味で使う。
 */

import { AXES, DIRECTIONS, axisOf, isOutside, opponent, pieceAt, translate } from "./board";
import type { Axis, GameState, Piece, PieceId, Player, Pos } from "./types";

/** 挟みが成立した1件。GameEvent の captured に必要な情報を持つ。 */
export interface Capture {
  /** 封じられた駒。 */
  readonly pieceId: PieceId;
  /** 封じられた駒の持ち主。 */
  readonly owner: Player;
  /** 挟みを成立させた、その手で動かした駒。自分から挟まれに行った場合は pieceId と同じ。 */
  readonly by: PieceId;
  /** 両側から挟んだ2マス。壁として働いた側は盤外の座標になる。 */
  readonly flanks: readonly [Pos, Pos];
  readonly axis: Axis;
}

/** 挟み手の正体。演出で「壁に押し付けた」と「駒で挟んだ」を出し分けられるように残す。 */
export type FlankKind = "piece" | "wall";

/**
 * そのマスが player 側の挟み手として働くか。
 * 盤外は壁で、どちらのプレイヤーの挟み手にもなる。
 */
export function flankAt(state: GameState, pos: Pos, player: Player): FlankKind | null {
  if (isOutside(state.config, pos)) return "wall";
  const piece = pieceAt(state, pos);
  return piece !== undefined && piece.owner === player ? "piece" : null;
}

/**
 * 動かした駒が挟んだ相手の駒。
 *
 * 挟みの距離は常に1マス固定なので、各方向について
 * 「隣が敵駒」「その1つ先が自分の駒か壁」の2マスだけを見る。距離を伸ばす走査はしない。
 *
 * state は着手を反映済みで、mover がすでに mover.pos にいること。
 */
export function capturesBy(state: GameState, mover: Piece): readonly Capture[] {
  const captures: Capture[] = [];

  for (const dir of DIRECTIONS) {
    const midPos = translate(mover.pos, dir);
    const mid = pieceAt(state, midPos);
    if (mid === undefined || mid.owner === mover.owner) continue;

    const farPos = translate(mover.pos, dir, 2);
    if (flankAt(state, farPos, mover.owner) === null) continue;

    captures.push({
      pieceId: mid.id,
      owner: mid.owner,
      by: mover.id,
      flanks: [mover.pos, farPos],
      axis: axisOf(dir),
    });
  }

  return captures;
}

/**
 * 動かした駒が挟んだ相手の駒の ID。
 *
 * 演出に必要な挟み手の位置まで要るときは capturesBy を使う。
 */
export function capturedPieceIds(state: GameState, mover: Piece): readonly PieceId[] {
  return capturesBy(state, mover).map((capture) => capture.pieceId);
}

/**
 * 動かした駒自身が挟まれたか。自分から挟まれる位置に飛び込んだ場合。
 *
 * 両側とも壁の場合は挟みとみなさない（幅1の盤で全駒が封じられるのを防ぐため）。
 */
export function selfCapture(state: GameState, mover: Piece): Capture | null {
  const enemy = opponent(mover.owner);

  for (const { axis, dirs } of AXES) {
    const [one, other] = dirs;
    const onePos = translate(mover.pos, one);
    const otherPos = translate(mover.pos, other);

    const oneFlank = flankAt(state, onePos, enemy);
    const otherFlank = flankAt(state, otherPos, enemy);
    if (oneFlank === null || otherFlank === null) continue;
    if (oneFlank === "wall" && otherFlank === "wall") continue;

    return {
      pieceId: mover.id,
      owner: mover.owner,
      by: mover.id,
      flanks: [onePos, otherPos],
      axis,
    };
  }

  return null;
}

/**
 * その手で成立した挟みをすべて。相手を挟んだ分が先、自分が挟まれた分が後。
 * この順がそのまま captured イベントの並びになる。
 */
export function capturesFrom(state: GameState, mover: Piece): readonly Capture[] {
  const self = selfCapture(state, mover);
  const captures = capturesBy(state, mover);
  return self === null ? captures : [...captures, self];
}
