/**
 * 詰めはさみの対局相手。
 *
 * 攻め方は人、受け方はこのクライアントが読んで指す。
 * 対局と同じ GameClient なので、UI は対局画面とほとんど同じものが使える。
 *
 * 中身は LocalClient をそのまま使い、受け方の手を続けて指すだけ。
 * 局面・履歴・イベントの配り方は対局と同じ経路を通る。
 */

import { proveForcedWin, solutionLine } from "../core/solve";
import { opponent } from "../core/board";
import { puzzleState } from "../core/puzzles";
import type { Puzzle } from "../core/puzzles";
import type { GameState, Move, Player } from "../core/types";
import { bestDefence } from "../core/solve";
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

/**
 * 受け方の読みに使う節点の上限。
 *
 * 受け方は最善でなくてよい。詰み筋の上にいるかの判定は status が別に読むので、
 * ここが控えめでも正誤は狂わない。盤が大きいと読みが伸びて画面が固まるため、
 * 待ち時間に見合う範囲で切る。
 */
const REPLY_NODE_LIMIT = 120_000;

/**
 * 受け方が先まで読む深さの上限。
 *
 * 問題が成り立っている以上、受け方はどう指しても負ける。読みの深さは
 * 「すぐ詰む手」と「もう少し粘れる手」を分けるためだけに要る。
 * 深く読んでも選び方はほとんど変わらないので、盤が大きいときに固まらない深さで切る。
 */
const REPLY_MAX_PLIES = 3;

/**
 * 詰み筋の上にいるかを読むときの節点の上限。
 *
 * 7手詰めは奥が深いので、上限に当たることがある。当たったときは
 * 「詰まない」ではなく「分からない」が返るので、外れた印は出さない。
 * 正しく解いている人に「この手順では詰みません」と言ってしまう方が困る。
 */
const STATUS_NODE_LIMIT = 300_000;

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
  /**
   * status は読むたびに詰みを読み直すので重い。
   * 局面は指すたびに新しい物になるので、同じ物なら前の答えを返す。
   */
  #statusCache: { state: GameState; status: PuzzleStatus } | null = null;

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
    if (this.#statusCache?.state === state) return this.#statusCache.status;

    const status = this.#readStatus(state);
    this.#statusCache = { state, status };
    return status;
  }

  #readStatus(state: GameState): PuzzleStatus {
    if (state.outcome !== null) {
      const won = state.outcome.kind === "win" && state.outcome.winner === this.#attacker;
      return won ? "solved" : "failed";
    }

    // 残りの手数で詰ませ切れるかを見る。
    // 読み切れなかった（"unknown"）ときは、詰み筋の上にいるものとして扱う
    const proof = proveForcedWin(state, this.pliesLeft, this.#attacker, {
      nodeLimit: STATUS_NODE_LIMIT,
    });
    return proof === "no" ? "offTrack" : "playing";
  }

  get canUndo(): boolean {
    return this.#inner.canUndo;
  }

  /**
   * いまの局面からの正解手順。攻め方と受け方の手が交互に並ぶ。
   *
   * 受け方の読みは実際に指すときと同じ深さにする。揃えないと、
   * 出した手順の通りに指しても違う応手が返ってくる。
   */
  solution(): readonly Move[] {
    return solutionLine(this.getState(), this.pliesLeft, {
      defenceMaxPlies: REPLY_MAX_PLIES,
      defenceNodeLimit: REPLY_NODE_LIMIT,
    });
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

    // 先に待つ。読んでから待つと、攻め方の手が描かれる前に固まってしまう
    await sleep(this.#replyDelayMs);

    const reply = bestDefence(
      state,
      this.#attacker,
      Math.min(this.pliesLeft, REPLY_MAX_PLIES),
      { nodeLimit: REPLY_NODE_LIMIT },
    );
    if (reply === null) return;

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
