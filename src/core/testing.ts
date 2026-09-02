/**
 * テスト用の局面づくり。
 *
 * 挟みのテストは「盤の形」がすべてなので、ASCII 図から局面を組めるようにする。
 *
 *   .  空きマス
 *   A  先手の駒 / a  先手の封じ駒
 *   B  後手の駒 / b  後手の封じ駒
 *
 * 駒 ID は上の行から順に、行内は左から 1, 2, 3... と振る。
 *
 * 製品コードからは import しない。core の純粋性を保つため DOM にも通信にも触れない。
 */

import { toKey } from "./board";
import type {
  BoardConfig,
  GameEvent,
  GameState,
  MoveError,
  Piece,
  PieceId,
  Player,
  PosKey,
  Result,
} from "./types";

const OWNER: Record<string, Player> = { A: "A", a: "A", B: "B", b: "B" };

export interface StateOptions {
  readonly turn?: Player;
  readonly hands?: Partial<Record<Player, number>>;
  readonly config?: Partial<BoardConfig>;
}

/** ASCII 図を行ごとのセル配列にする。 */
function parse(diagram: string): string[][] {
  const grid = diagram
    .trim()
    .split("\n")
    .map((line) => line.trim().split(/\s+/));
  const cols = grid[0].length;
  for (const row of grid) {
    if (row.length !== cols) throw new Error(`行の長さが揃っていない: ${row.join(" ")}`);
  }
  return grid;
}

export function makeState(diagram: string, options: StateOptions = {}): GameState {
  const grid = parse(diagram);

  const config: BoardConfig = {
    cols: grid[0].length,
    rows: grid.length,
    moveRange: 1,
    handSize: 8,
    connectLimit: 4,
    ...options.config,
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
}

/** 局面を ASCII 図に戻す。makeState に渡せる形。 */
export function render(state: GameState): string {
  const lines: string[] = [];
  for (let y = 0; y < state.config.rows; y++) {
    const cells: string[] = [];
    for (let x = 0; x < state.config.cols; x++) {
      const id = state.board.get(toKey({ x, y }));
      const piece = id === undefined ? undefined : state.pieces.get(id);
      if (piece === undefined) cells.push(".");
      else cells.push(piece.sealed ? piece.owner.toLowerCase() : piece.owner);
    }
    lines.push(cells.join(" "));
  }
  return lines.join("\n");
}

/** render の出力と比べられるように、図の空白を揃える。 */
export function normalize(diagram: string): string {
  return parse(diagram)
    .map((row) => row.join(" "))
    .join("\n");
}

/** 局面にいる駒の ID を座標で引く。 */
export function idAt(state: GameState, x: number, y: number): PieceId {
  const id = state.board.get(toKey({ x, y }));
  if (id === undefined) throw new Error(`(${x},${y}) に駒がない`);
  return id;
}

/** 成功するはずの Result を開く。 */
export function unwrap(result: Result): { state: GameState; events: readonly GameEvent[] } {
  if ("error" in result) {
    throw new Error(`合法手のはずが拒否された: ${JSON.stringify(result.error)}`);
  }
  return result;
}

/** 拒否されるはずの Result から理由を取り出す。 */
export function errorOf(result: Result): MoveError {
  if (!("error" in result)) throw new Error("拒否されるはずの手が通った");
  return result.error;
}

/** events の型だけを並べる。描画順の検証に使う。 */
export function eventTypes(events: readonly GameEvent[]): string[] {
  return events.map((event) => event.type);
}
