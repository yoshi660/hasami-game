/**
 * テスト用の局面づくり。
 *
 * 図の読み書きそのものは core/diagram.ts が持つ。ここはテストから使いやすい形に包むだけ。
 *
 * 製品コードからは import しない。core の純粋性を保つため DOM にも通信にも触れない。
 */

import { toKey } from "./board";
import { parseDiagram, toDiagram } from "./diagram";
import type {
  BoardConfig,
  GameEvent,
  GameState,
  MoveError,
  PieceId,
  Player,
  Result,
} from "./types";

export interface StateOptions {
  readonly turn?: Player;
  readonly hands?: Partial<Record<Player, number>>;
  readonly config?: Partial<BoardConfig>;
}

export function makeState(diagram: string, options: StateOptions = {}): GameState {
  return parseDiagram(diagram.trim().split("\n"), {
    turn: options.turn,
    hands: options.hands,
    moveRange: options.config?.moveRange,
    handSize: options.config?.handSize,
    connectLimit: options.config?.connectLimit,
  });
}

/** 局面を図に戻す。読みやすいように1マスずつ空ける。 */
export function render(state: GameState): string {
  return toDiagram(state)
    .map((line) => line.split("").join(" "))
    .join("\n");
}

/** render の出力と比べられるように、図の空白を揃える。 */
export function normalize(diagram: string): string {
  return diagram
    .trim()
    .split("\n")
    .map((line) => line.replace(/\s+/g, "").split("").join(" "))
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
