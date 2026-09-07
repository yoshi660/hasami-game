/**
 * 詰めはさみの読み。
 *
 * 「手番側が n 手以内に必ず勝てるか」を調べる。攻め方は1つでも勝ち筋があればよく、
 * 受け方はすべての手で負けるときだけ詰み、という素直な読み。
 *
 * 節点の数に上限を置く。読み切れなかったときは「勝てる」とは言わない。
 * 分からないものを詰みだと言わないための保険で、答えは常に控えめに外れる。
 *
 * 純粋関数。同じ局面には毎回同じ答えを返す（allLegalMoves の並びが決まっているため）。
 */

import { allLegalMoves, applyMove } from "./rules";
import type { GameState, Move, Player } from "./types";

/** 既定の読みの上限。5手詰めがふつうに解ける程度。 */
export const DEFAULT_NODE_LIMIT = 400_000;

export interface SolveOptions {
  /** 読む節点の上限。 */
  readonly nodeLimit?: number;
}

export interface Solution {
  /** 何手で詰むか。奇数。 */
  readonly plies: number;
  /** 最初の一手。 */
  readonly first: Move;
}

interface Budget {
  left: number;
}

/**
 * その局面から attacker が plies 手以内に必ず勝てるか。
 *
 * 読み切れなかった場合は false を返す。「勝てると言い切れない」の意味。
 */
function winsWithin(
  state: GameState,
  plies: number,
  attacker: Player,
  budget: Budget,
): boolean {
  if (state.outcome !== null) {
    return state.outcome.kind === "win" && state.outcome.winner === attacker;
  }
  if (plies <= 0) return false;
  if (budget.left <= 0) return false;

  const moves = allLegalMoves(state);
  // 決着していないなら必ず指せる手がある。念のため
  if (moves.length === 0) return false;

  if (state.turn === attacker) {
    // 攻め方。1つでも勝ち筋があればよい
    for (const move of moves) {
      budget.left--;
      const applied = applyMove(state, move);
      if ("error" in applied) continue;
      if (winsWithin(applied.state, plies - 1, attacker, budget)) return true;
    }
    return false;
  }

  // 受け方。1つでも逃れる手があれば詰みではない
  for (const move of moves) {
    budget.left--;
    const applied = applyMove(state, move);
    if ("error" in applied) continue;
    if (!winsWithin(applied.state, plies - 1, attacker, budget)) return false;
  }
  return true;
}

/**
 * その局面から attacker が plies 手以内に必ず勝てるか。
 *
 * 手番はどちらでもよい。攻め方の手を指したあとに「まだ詰みが続いているか」を
 * 確かめるのに使う。読み切れなかった場合は false。
 */
export function canForceWin(
  state: GameState,
  plies: number,
  attacker: Player,
  options: SolveOptions = {},
): boolean {
  return winsWithin(state, plies, attacker, { left: options.nodeLimit ?? DEFAULT_NODE_LIMIT });
}

/**
 * 手番側が maxPlies 手以内に必ず勝てるなら、最短の手数と最初の一手を返す。
 * 見つからなければ null。
 */
export function findForcedWin(
  state: GameState,
  maxPlies: number,
  options: SolveOptions = {},
): Solution | null {
  if (state.outcome !== null) return null;

  const attacker = state.turn;
  const budget: Budget = { left: options.nodeLimit ?? DEFAULT_NODE_LIMIT };

  // 手数を1手ずつ伸ばして、いちばん短い詰みを見つける
  for (let plies = 1; plies <= maxPlies; plies += 2) {
    for (const move of allLegalMoves(state)) {
      budget.left--;
      const applied = applyMove(state, move);
      if ("error" in applied) continue;
      if (winsWithin(applied.state, plies - 1, attacker, budget)) {
        return { plies, first: move };
      }
    }
  }

  return null;
}

/**
 * その局面が「ちょうど plies 手詰め」か。
 *
 * plies 手では詰み、それより短い手数では詰まない、という意味。
 * 問題として成り立っているかの確認に使う。
 */
export function isExactMate(
  state: GameState,
  plies: number,
  options: SolveOptions = {},
): boolean {
  const found = findForcedWin(state, plies, options);
  return found !== null && found.plies === plies;
}

/**
 * 受け方の最善手。いちばん長く粘れる手を返す。
 *
 * 逃れる手があればそれを選ぶ。どうやっても負けるなら、負けるまでの手数が最も長い手。
 * 指せる手がなければ null（決着済みか、その手番で負けている）。
 */
export function bestDefence(
  state: GameState,
  attacker: Player,
  maxPlies: number,
  options: SolveOptions = {},
): Move | null {
  const moves = allLegalMoves(state);
  if (moves.length === 0) return null;

  const budget: Budget = { left: options.nodeLimit ?? DEFAULT_NODE_LIMIT };

  let best: Move | null = null;
  let bestScore = -1;

  for (const move of moves) {
    const applied = applyMove(state, move);
    if ("error" in applied) continue;

    // 負けるまでの手数。長いほど粘れる。maxPlies を超えたら逃げ切り
    let score = maxPlies + 1;
    for (let plies = 0; plies <= maxPlies; plies++) {
      if (winsWithin(applied.state, plies, attacker, budget)) {
        score = plies;
        break;
      }
    }

    if (score > bestScore) {
      bestScore = score;
      best = move;
    }
  }

  return best;
}
