/**
 * 対局のルール。合法手の生成と、1手の適用。
 *
 * applyMove は新しい局面と GameEvent[] の両方を返す（設計ルール2）。
 * 局面は破壊的に更新しない（設計ルール4）。
 */

import {
  DIRECTIONS,
  cellsBetween,
  distance,
  emptyCells,
  inBounds,
  isOrthogonal,
  opponent,
  pieceAt,
  pieceById,
  pieceIdAt,
  piecesOf,
  sealedPiecesOf,
  toKey,
  translate,
} from "./board";
import { capturesBy, capturesFrom, selfCapture } from "./capture";
import type { Capture } from "./capture";
import {
  overConnectedOutcome,
  repetitionKey,
  repetitionOutcome,
  turnStartOutcome,
} from "./result";
import type {
  GameEvent,
  GameState,
  Move,
  MoveError,
  MovedEvent,
  Outcome,
  Piece,
  PieceId,
  Player,
  Pos,
  PosKey,
  Result,
} from "./types";

/* ============================================================
 * 局面の更新（すべて新しい GameState を返す）
 * ========================================================== */

function decrementHand(
  hands: Readonly<Record<Player, number>>,
  player: Player,
): Record<Player, number> {
  return {
    A: player === "A" ? hands.A - 1 : hands.A,
    B: player === "B" ? hands.B - 1 : hands.B,
  };
}

/** 持ち駒から1枚を盤に置いた局面と、置かれた駒。 */
function withPlacedPiece(
  state: GameState,
  owner: Player,
  to: Pos,
): { state: GameState; piece: Piece } {
  const piece: Piece = { id: state.nextPieceId, owner, pos: to, sealed: false };

  const board = new Map<PosKey, PieceId>(state.board);
  board.set(toKey(to), piece.id);
  const pieces = new Map<PieceId, Piece>(state.pieces);
  pieces.set(piece.id, piece);

  return {
    state: {
      ...state,
      board,
      pieces,
      nextPieceId: state.nextPieceId + 1,
      hands: decrementHand(state.hands, owner),
    },
    piece,
  };
}

/** 駒を動かした局面。動かした駒の封じは、その移動で解ける。 */
function withMovedPiece(state: GameState, piece: Piece, to: Pos): GameState {
  const board = new Map<PosKey, PieceId>(state.board);
  board.delete(toKey(piece.pos));
  board.set(toKey(to), piece.id);

  const pieces = new Map<PieceId, Piece>(state.pieces);
  pieces.set(piece.id, { ...piece, pos: to, sealed: false });

  return { ...state, board, pieces };
}

/** 指定した駒を封じた局面。すでに封じられている駒に重ねても変わらない。 */
function withSealedPieces(state: GameState, ids: readonly PieceId[]): GameState {
  if (ids.length === 0) return state;

  const pieces = new Map<PieceId, Piece>(state.pieces);
  for (const id of ids) {
    const piece = pieces.get(id);
    if (piece !== undefined) pieces.set(id, { ...piece, sealed: true });
  }

  return { ...state, pieces };
}

/* ============================================================
 * 合法手
 * ========================================================== */

/**
 * 手番やルールを一切見ずに、その駒が幾何的に届くマス。
 * 上下左右へ 1〜moveRange マス、途中に駒があればその手前まで。
 */
function reachableCells(state: GameState, piece: Piece): readonly Pos[] {
  const cells: Pos[] = [];

  for (const dir of DIRECTIONS) {
    for (let step = 1; step <= state.config.moveRange; step++) {
      const pos = translate(piece.pos, dir, step);
      if (!inBounds(state.config, pos)) break;
      if (pieceIdAt(state, pos) !== undefined) break;
      cells.push(pos);
    }
  }

  return cells;
}

/**
 * from にいる駒を動かせるマス。
 *
 * 動かせない場合（駒がない、相手の駒、封じ駒があるのに封じ駒でない、決着済み）は空。
 */
export function legalMoves(state: GameState, from: Pos): readonly Pos[] {
  if (state.outcome !== null) return [];

  const piece = pieceAt(state, from);
  if (piece === undefined || piece.owner !== state.turn) return [];

  const sealed = sealedPiecesOf(state, state.turn);
  if (sealed.length > 0 && !piece.sealed) return [];

  return reachableCells(state, piece);
}

/** 打てない理由。打てるなら null。 */
function placementError(state: GameState, to: Pos): MoveError | null {
  if (state.outcome !== null) return { code: "gameOver" };
  if (!inBounds(state.config, to)) return { code: "outOfBoard", pos: to };
  if (pieceIdAt(state, to) !== undefined) return { code: "cellOccupied", pos: to };

  const sealed = sealedPiecesOf(state, state.turn);
  if (sealed.length > 0) return { code: "mustMoveSealedPiece", sealed };

  if (state.hands[state.turn] <= 0) return { code: "handEmpty" };

  // 打った形が挟みを作らないかを、実際に置いた局面で確かめる。
  const { state: candidate, piece } = withPlacedPiece(state, state.turn, to);
  if (capturesBy(candidate, piece).length > 0) return { code: "placementWouldSeal" };
  if (selfCapture(candidate, piece) !== null) return { code: "placementWouldBeSealed" };

  return null;
}

/** 持ち駒を打てるマス。 */
export function legalPlacements(state: GameState): readonly Pos[] {
  if (state.outcome !== null) return [];
  if (sealedPiecesOf(state, state.turn).length > 0) return [];
  if (state.hands[state.turn] <= 0) return [];

  return emptyCells(state).filter((pos) => placementError(state, pos) === null);
}

/** 動かせる駒。封じ駒があるなら、その中で動かせるもの。 */
export function movablePieceIds(state: GameState, player: Player): readonly PieceId[] {
  const sealed = sealedPiecesOf(state, player);
  const pool =
    sealed.length > 0
      ? sealed.map((id) => pieceById(state, id)!)
      : piecesOf(state, player);

  return pool.filter((piece) => reachableCells(state, piece).length > 0).map((p) => p.id);
}

/* ============================================================
 * 着手の適用
 * ========================================================== */

/** 駒を動かせない理由。動かせるなら null。 */
function moveError(state: GameState, pieceId: PieceId, to: Pos): MoveError | null {
  if (state.outcome !== null) return { code: "gameOver" };

  const piece = pieceById(state, pieceId);
  if (piece === undefined) return { code: "pieceNotFound", pieceId };
  if (piece.owner !== state.turn) return { code: "notYourPiece", pieceId };

  const sealed = sealedPiecesOf(state, state.turn);
  if (sealed.length > 0 && !piece.sealed) return { code: "mustMoveSealedPiece", sealed };

  if (!inBounds(state.config, to)) return { code: "outOfBoard", pos: to };
  if (!isOrthogonal(piece.pos, to)) return { code: "notOrthogonal" };

  const steps = distance(piece.pos, to);
  if (steps === null || steps > state.config.moveRange) {
    return { code: "outOfRange", max: state.config.moveRange };
  }

  for (const pos of cellsBetween(piece.pos, to) ?? []) {
    if (pieceIdAt(state, pos) !== undefined) return { code: "pathBlocked", at: pos };
  }

  if (pieceIdAt(state, to) !== undefined) return { code: "cellOccupied", pos: to };

  return null;
}

/**
 * 1手を適用する。
 *
 * events は描画順に並べる: moved → captured → turnChanged → (gameEnded)。
 * UI はこの順にアニメーションを流すので、順序を変えると演出が崩れる。
 */
export function applyMove(state: GameState, move: Move): Result {
  const mover = state.turn;

  if (move.kind === "place") {
    const error = placementError(state, move.to);
    if (error !== null) return { error };

    const { state: placed, piece } = withPlacedPiece(state, mover, move.to);
    const moved: MovedEvent = {
      type: "moved",
      pieceId: piece.id,
      owner: mover,
      from: null,
      to: move.to,
      released: false,
    };
    // 打ちで挟みは成立しない（placementError が弾いている）。
    return finish(placed, mover, moved, []);
  }

  const error = moveError(state, move.pieceId, move.to);
  if (error !== null) return { error };

  const before = pieceById(state, move.pieceId)!;
  const after = withMovedPiece(state, before, move.to);
  const piece = pieceById(after, move.pieceId)!;

  const captures = capturesFrom(after, piece);
  const sealedState = withSealedPieces(after, captures.map((capture) => capture.pieceId));

  const moved: MovedEvent = {
    type: "moved",
    pieceId: piece.id,
    owner: mover,
    from: before.pos,
    to: move.to,
    released: before.sealed,
  };

  return finish(sealedState, mover, moved, captures);
}

/**
 * 着手を反映した局面から、手番を渡して決着を見るところまで。
 *
 * 4連結の自滅が成立したら、その時点で負けが確定する。
 * 手番は形式上相手に渡すが（イベント順を揃えるため）、詰みと千日手の判定は行わない。
 */
function finish(
  after: GameState,
  mover: Player,
  moved: MovedEvent,
  captures: readonly Capture[],
): Result {
  const events: GameEvent[] = [moved];

  for (const capture of captures) {
    events.push({
      type: "captured",
      pieceId: capture.pieceId,
      owner: capture.owner,
      by: capture.by,
      flanks: capture.flanks,
      axis: capture.axis,
    });
  }

  const selfDestruct = overConnectedOutcome(after, mover);

  const next = opponent(mover);
  let state: GameState = { ...after, turn: next, ply: after.ply + 1 };

  events.push({
    type: "turnChanged",
    from: mover,
    to: next,
    ply: state.ply,
    sealed: sealedPiecesOf(state, next),
  });

  let outcome: Outcome | null = null;
  let connectedGroup: readonly PieceId[] = [];

  if (selfDestruct !== null) {
    outcome = selfDestruct.outcome;
    connectedGroup = selfDestruct.group;
  } else {
    outcome = turnStartOutcome(next, {
      sealed: sealedPiecesOf(state, next),
      canMove: movablePieceIds(state, next).length > 0,
      canPlace: legalPlacements(state).length > 0,
    });

    const key = repetitionKey(state);
    const count = (state.repetitions.get(key) ?? 0) + 1;
    const repetitions = new Map(state.repetitions);
    repetitions.set(key, count);
    state = { ...state, repetitions };

    if (outcome === null) outcome = repetitionOutcome(count);
  }

  if (outcome !== null) {
    state = { ...state, outcome };
    events.push({ type: "gameEnded", outcome, connectedGroup });
  }

  return { state, events };
}
