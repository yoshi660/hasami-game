/**
 * 詰めはさみの対局相手。
 *
 * 攻め方は人、受け方はこのクライアントが読んで指す。
 * 対局と同じ GameClient なので、UI は対局画面とほとんど同じものが使える。
 *
 * 中身は LocalClient をそのまま使い、受け方の手を続けて指すだけ。
 * 局面・履歴・イベントの配り方は対局と同じ経路を通る。
 */

import { canForceWin, bestDefence } from "../core/solve";
import { opponent } from "../core/board";
import { puzzleState } from "../core/puzzles";
import type { Puzzle } from "../core/puzzles";
import type { GameState, Move, Player } from "../core/types";
import type {
  GameClient,
  GameEventListener,
  StateListener,
  SubmitResult,
  UndoResult,
  Unsubscribe,
} from "./GameClient";
import { LocalClient } from "./LocalClient";

/** 攻め方の手を見せてから受け方が指すまでの間。CSS の移動時間より少し長く取る。 */
const REPLY_DELAY_MS = 480;

export type PuzzleStatus =
  /** 詰み筋の上にいる。 */
  | "playing"
  /** まだ負けてはいないが、この手順では詰まない。 */
  | "offTrack"
  /** 詰ませた。 */
  | "solved"
  /** 負けた、または引き分けた。 */
  | "failed";

export interface PuzzleClientOptions {
  readonly puzzle: Puzzle;
  /** 受け方が指すまでの間。テストでは 0 にする。 */
  readonly replyDelayMs?: number;
}

const sleep = (ms: number): Promise<void> =>
  ms <= 0 ? Promise.resolve() : new Promise((resolve) => setTimeout(resolve, ms));

export class PuzzleClient implements GameClient {
  readonly puzzle: Puzzle;
  readonly seats: readonly Player[];
  readonly supportsUndo = true;

  #attacker: Player;
  #defender: Player;
  #inner: LocalClient;
  #replyDelayMs: number;

  constructor(options: PuzzleClientOptions) {
    this.puzzle = options.puzzle;
    this.#attacker = options.puzzle.turn;
    this.#defender = opponent(this.#attacker);
    this.seats = [this.#attacker];
    this.#replyDelayMs = options.replyDelayMs ?? REPLY_DELAY_MS;

    // 中の client は両方の側を指せる。受け方の手をこちらから入れるため
    this.#inner = new LocalClient({ initialState: puzzleState(options.puzzle) });
  }

  getState(): GameState {
    return this.#inner.getState();
  }

  /** 残りの手数。0 になったら詰んでいるはず。 */
  get pliesLeft(): number {
    return Math.max(0, this.puzzle.plies - this.getState().ply);
  }

  get status(): PuzzleStatus {
    const state = this.getState();

    if (state.outcome !== null) {
      const won = state.outcome.kind === "win" && state.outcome.winner === this.#attacker;
      return won ? "solved" : "failed";
    }

    // 受け方の番なら、残りの手数で詰ませ切れるかを見る
    return canForceWin(state, this.pliesLeft, this.#attacker) ? "playing" : "offTrack";
  }

  get canUndo(): boolean {
    return this.#inner.canUndo;
  }

  /**
   * 攻め方の手を指し、続けて受け方が返す。
   *
   * 受け方は「いちばん長く粘る手」を選ぶ。攻め方が正解を外していれば、
   * 逃れる手があるのでそれを指す。
   */
  async submitMove(move: Move): Promise<SubmitResult> {
    const state = this.getState();
    if (state.turn !== this.#attacker) {
      return { accepted: false, reason: { kind: "notYourSeat", turn: state.turn } };
    }

    const result = await this.#inner.submitMove(move);
    if (!result.accepted) return result;

    await this.#reply();
    return { accepted: true };
  }

  async #reply(): Promise<void> {
    const state = this.getState();
    if (state.outcome !== null) return;
    if (state.turn !== this.#defender) return;

    // 詰みまでの残りより少し広く読ませる。攻め方が外した局面でも受け方が迷わないように
    const reply = bestDefence(state, this.#attacker, this.pliesLeft + 2);
    if (reply === null) return;

    await sleep(this.#replyDelayMs);
    await this.#inner.submitMove(reply);
  }

  /**
   * 攻め方の手番に戻るまで戻す。
   * 受け方の応手だけが取り消された状態にはしない。
   */
  async undo(): Promise<UndoResult> {
    let undone = false;

    while (this.#inner.canUndo) {
      const result = await this.#inner.undo();
      if (!result.undone) break;
      undone = true;
      if (this.getState().turn === this.#attacker) break;
    }

    return undone ? { undone: true } : { undone: false, reason: { kind: "noHistory" } };
  }

  onEvent(listener: GameEventListener): Unsubscribe {
    return this.#inner.onEvent(listener);
  }

  onStateChange(listener: StateListener): Unsubscribe {
    return this.#inner.onStateChange(listener);
  }

  dispose(): void {
    this.#inner.dispose();
  }
}
