/**
 * 同じ画面で2人が指すローカル対戦。
 *
 * 局面を持ち、core の applyMove に着手を通し、結果を購読者へ配る。
 * 通信はしないが、後でオンライン実装に差し替えられるよう GameClient に合わせる。
 */

import { applyMove, createGame } from "../core/rules";
import type { BoardConfig, GameEvent, GameState, Move, Player } from "../core/types";
import type {
  GameClient,
  GameEventListener,
  StateListener,
  SubmitResult,
  UndoResult,
  Unsubscribe,
} from "./GameClient";

export interface LocalClientOptions {
  /** 対局設定。省略すると既定（7x7・移動1マス・持ち駒8個）。 */
  readonly config?: BoardConfig;
  /** 途中局面から始める場合に渡す。指定すると config は無視される。 */
  readonly initialState?: GameState;
  /** このクライアントが指せる側。省略すると両方（同じ画面での2人対戦）。 */
  readonly seats?: readonly Player[];
}

export class LocalClient implements GameClient {
  readonly seats: readonly Player[];

  readonly supportsUndo = true;

  #state: GameState;
  /** 待った用の履歴。着手のたびに、その手を指す前の局面を積む。 */
  #history: GameState[] = [];
  #eventListeners = new Set<GameEventListener>();
  #stateListeners = new Set<StateListener>();
  #disposed = false;

  constructor(options: LocalClientOptions = {}) {
    this.#state = options.initialState ?? createGame(options.config);
    this.seats = options.seats ?? ["A", "B"];
  }

  get canUndo(): boolean {
    return !this.#disposed && this.#history.length > 0;
  }

  getState(): GameState {
    return this.#state;
  }

  async submitMove(move: Move): Promise<SubmitResult> {
    if (this.#disposed) {
      return { accepted: false, reason: { kind: "transport", message: "対局は終了している" } };
    }

    if (!this.seats.includes(this.#state.turn)) {
      return { accepted: false, reason: { kind: "notYourSeat", turn: this.#state.turn } };
    }

    const result = applyMove(this.#state, move);
    if ("error" in result) {
      return { accepted: false, reason: { kind: "illegal", error: result.error } };
    }

    this.#history.push(this.#state);
    this.#state = result.state;
    this.#publish(result.events);

    return { accepted: true };
  }

  async undo(): Promise<UndoResult> {
    if (this.#disposed) return { undone: false, reason: { kind: "unsupported" } };

    const previous = this.#history.pop();
    if (previous === undefined) return { undone: false, reason: { kind: "noHistory" } };

    this.#state = previous;
    // 戻った局面には「何が起きたか」がないので、イベントは流さない
    for (const listener of [...this.#stateListeners]) listener(this.#state);

    return { undone: true };
  }

  onEvent(listener: GameEventListener): Unsubscribe {
    this.#eventListeners.add(listener);
    return () => {
      this.#eventListeners.delete(listener);
    };
  }

  onStateChange(listener: StateListener): Unsubscribe {
    this.#stateListeners.add(listener);
    return () => {
      this.#stateListeners.delete(listener);
    };
  }

  dispose(): void {
    this.#disposed = true;
    this.#eventListeners.clear();
    this.#stateListeners.clear();
  }

  /**
   * イベントを描画順に流し、最後に確定した局面を知らせる。
   * 配布中に購読が変わっても崩れないよう、リスナは複製してから回す。
   */
  #publish(events: readonly GameEvent[]): void {
    for (const event of events) {
      for (const listener of [...this.#eventListeners]) listener(event);
    }
    for (const listener of [...this.#stateListeners]) listener(this.#state);
  }
}
