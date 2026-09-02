/**
 * 勝敗判定。
 *
 * rules.ts から使われるが、rules.ts を import しない（循環を作らないため）。
 * 合法手を数える必要がある判定は、数えた結果を TurnAbility として受け取る。
 */

import { boardCells, neighbors, opponent, pieceAt, pieceById, piecesOf } from "./board";
import type { GameState, Outcome, Piece, PieceId, Player } from "./types";

/* ============================================================
 * 連結（4つ以上つなげたら負け）
 * ========================================================== */

/**
 * その駒とつながっている同じ側の駒。自分自身を含む。
 * 連結は上下左右のみ。斜めはつながっているとみなさない。
 */
export function connectedGroupOf(state: GameState, id: PieceId): readonly PieceId[] {
  const start = pieceById(state, id);
  if (start === undefined) return [];

  const seen = new Set<PieceId>([start.id]);
  const queue: Piece[] = [start];
  const group: PieceId[] = [];

  while (queue.length > 0) {
    const piece = queue.shift()!;
    group.push(piece.id);
    for (const pos of neighbors(state.config, piece.pos)) {
      const next = pieceAt(state, pos);
      if (next === undefined || next.owner !== start.owner || seen.has(next.id)) continue;
      seen.add(next.id);
      queue.push(next);
    }
  }

  return group;
}

export interface OverConnected {
  readonly outcome: Outcome;
  /** 負けの原因になった塊。演出でここを光らせる。 */
  readonly group: readonly PieceId[];
}

/**
 * そのプレイヤーの駒が connectLimit 個以上つながっていたら負け。
 * 判定するのは手を指した側だけでよい（自分の手で相手の駒は動かないため）。
 */
export function overConnectedOutcome(state: GameState, player: Player): OverConnected | null {
  const seen = new Set<PieceId>();

  for (const piece of piecesOf(state, player)) {
    if (seen.has(piece.id)) continue;
    const group = connectedGroupOf(state, piece.id);
    for (const id of group) seen.add(id);

    if (group.length >= state.config.connectLimit) {
      return {
        outcome: { kind: "win", winner: opponent(player), reason: "overConnected" },
        group,
      };
    }
  }

  return null;
}

/* ============================================================
 * 手番開始時の詰み
 * ========================================================== */

/** 手番を迎えたプレイヤーに何ができるか。rules.ts が合法手を数えて渡す。 */
export interface TurnAbility {
  /** 封じ駒。1つでもあれば、打てず、封じ駒しか動かせない。 */
  readonly sealed: readonly PieceId[];
  /** 動かせる駒が1つでもあるか（封じ駒があるなら、その中に動かせるものがあるか）。 */
  readonly canMove: boolean;
  /** 打てるマスが1つでもあるか。 */
  readonly canPlace: boolean;
}

/**
 * 手番が移った時点の判定。
 * 封じ駒が動かせない、または打つことも動かすこともできなければ、その手番のプレイヤーの負け。
 */
export function turnStartOutcome(player: Player, ability: TurnAbility): Outcome | null {
  if (ability.sealed.length > 0) {
    if (ability.canMove) return null;
    return { kind: "win", winner: opponent(player), reason: "sealedPieceStuck" };
  }

  if (!ability.canMove && !ability.canPlace) {
    return { kind: "win", winner: opponent(player), reason: "noLegalMove" };
  }

  return null;
}

/* ============================================================
 * 千日手
 * ========================================================== */

/** 同一局面が何回現れたら引き分けか。 */
export const REPETITION_LIMIT = 3;

/**
 * 局面の同一性を表すキー。
 *
 * 盤上の各マスの「所有者と封じ状態」＋手番だけで作り、駒 ID は含めない。
 * 同じ形なら、どの駒がそこにいるかに関わらず同一局面とみなす。
 * 持ち駒の数は盤上の駒数から決まるので含めなくてよい。
 */
export function repetitionKey(state: GameState): string {
  const cells = boardCells(state.config)
    .map((pos) => {
      const piece = pieceAt(state, pos);
      if (piece === undefined) return ".";
      return piece.sealed ? piece.owner.toLowerCase() : piece.owner;
    })
    .join("");

  return `${cells}#${state.turn}`;
}

export function repetitionOutcome(count: number): Outcome | null {
  return count >= REPETITION_LIMIT ? { kind: "draw", reason: "repetition" } : null;
}
