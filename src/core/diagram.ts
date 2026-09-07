/**
 * 局面を文字の並びで表す。
 *
 *   .  空きマス
 *   A  先手（黒）の駒 / a  先手の封じ駒
 *   B  後手（白）の駒 / b  後手の封じ駒
 *
 * 問題データにも、テストの局面づくりにも、作問の書き出しにも同じ形を使う。
 * 局面そのものを保存する唯一の形なので、書き方を変えるときはここだけ直す。
 *
 * 読むときは行の中の空白を無視するので、
 * 「. . A . .」と「..A..」のどちらでも同じ局面になる。
 */

import { toKey } from "./board";
import { DEFAULT_CONFIG } from "./rules";
import { repetitionKey } from "./result";
import type { BoardConfig, GameState, Piece, PieceId, Player, PosKey } from "./types";

const OWNER: Record<string, Player> = { A: "A", a: "A", B: "B", b: "B" };

export interface DiagramOptions {
  /** 手番。省略すると先手。 */
  readonly turn?: Player;
  /** 残りの持ち駒。省略すると handSize から盤上の駒数を引いた数。 */
  readonly hands?: Partial<Record<Player, number>>;
  /** 盤の大きさ以外の設定。盤の大きさは図から決まる。 */
  readonly moveRange?: number;
  readonly handSize?: number;
  readonly connectLimit?: number;
}

/** 図の1行を、1マス1文字に均す。 */
function cellsOf(row: string): string[] {
  return row.replace(/\s+/g, "").split("");
}

/**
 * 図から局面を作る。
 *
 * 盤の大きさは図の形から決まる。行の長さが揃っていなければ投げる。
 */
export function parseDiagram(rows: readonly string[], options: DiagramOptions = {}): GameState {
  if (rows.length === 0) throw new Error("図が空です");

  const grid = rows.map(cellsOf);
  const cols = grid[0].length;
  if (cols === 0) throw new Error("図が空です");
  for (const row of grid) {
    if (row.length !== cols) throw new Error(`行の長さが揃っていない: ${row.join("")}`);
  }

  const config: BoardConfig = {
    cols,
    rows: grid.length,
    moveRange: options.moveRange ?? DEFAULT_CONFIG.moveRange,
    handSize: options.handSize ?? DEFAULT_CONFIG.handSize,
    connectLimit: options.connectLimit ?? DEFAULT_CONFIG.connectLimit,
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

  const state: GameState = {
    config,
    board,
    pieces,
    hands: {
      A: options.hands?.A ?? config.handSize - placed.A,
      B: options.hands?.B ?? config.handSize - placed.B,
    },
    turn: options.turn ?? "A",
    nextPieceId,
    ply: 0,
    repetitions: new Map(),
    outcome: null,
  };

  // 開始局面も千日手の数に入れる（createGame と同じ扱い）
  return { ...state, repetitions: new Map([[repetitionKey(state), 1]]) };
}

/** 局面を図に戻す。1行1文字列で、空白は入れない。 */
export function toDiagram(state: GameState): string[] {
  const lines: string[] = [];

  for (let y = 0; y < state.config.rows; y++) {
    let line = "";
    for (let x = 0; x < state.config.cols; x++) {
      const id = state.board.get(toKey({ x, y }));
      const piece = id === undefined ? undefined : state.pieces.get(id);
      if (piece === undefined) line += ".";
      else line += piece.sealed ? piece.owner.toLowerCase() : piece.owner;
    }
    lines.push(line);
  }

  return lines;
}
