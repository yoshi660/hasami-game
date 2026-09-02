/**
 * 対局の進行。UI が話しかける相手。
 *
 * GameClient を包んで、
 *   - 盤を描くのに必要な問い合わせ（どこに動かせるか、どこに打てるか）
 *   - 二重送信の抑止
 *   - イベントと局面確定の購読
 * をまとめる。UI はここだけを見れば済み、core を直接 import しなくてよい。
 *
 * 選択中の駒・ハイライト・アニメの進行度は持たない。それは ui/ 側の状態（設計ルール3）。
 */

import { sealedPiecesOf } from "../core/board";
import { legalMoves, legalPlacements, movablePieceIds } from "../core/rules";
import type { GameState, Move, Outcome, PieceId, Player, Pos } from "../core/types";
import type {
  GameClient,
  GameEventListener,
  StateListener,
  SubmitResult,
  UndoResult,
  Unsubscribe,
} from "./GameClient";

export class GameSession {
  #client: GameClient;
  #unsubscribeEvent: Unsubscribe;
  #unsubscribeState: Unsubscribe;
  #eventListeners = new Set<GameEventListener>();
  #stateListeners = new Set<StateListener>();
  #pending: Promise<unknown> | null = null;

  constructor(client: GameClient) {
    this.#client = client;
    this.#unsubscribeEvent = client.onEvent((event) => {
      for (const listener of [...this.#eventListeners]) listener(event);
    });
    this.#unsubscribeState = client.onStateChange((state) => {
      for (const listener of [...this.#stateListeners]) listener(state);
    });
  }

  /* ---------- 局面の読み出し ---------- */

  get state(): GameState {
    return this.#client.getState();
  }

  /** このセッションが指せる側。 */
  get seats(): readonly Player[] {
    return this.#client.seats;
  }

  get turn(): Player {
    return this.state.turn;
  }

  get outcome(): Outcome | null {
    return this.state.outcome;
  }

  get isOver(): boolean {
    return this.state.outcome !== null;
  }

  /** 着手の送信中。UI はこの間、入力を止めるとよい。 */
  get isBusy(): boolean {
    return this.#pending !== null;
  }

  /** その側をこのセッションが指せるか。 */
  controls(player: Player): boolean {
    return this.seats.includes(player);
  }

  /** いま着手できる状態か。決着済み・相手の手番・送信中はいずれも false。 */
  get canAct(): boolean {
    return !this.isOver && !this.isBusy && this.controls(this.turn);
  }

  /* ---------- 合法手の問い合わせ ---------- */

  /** from にいる駒を動かせるマス。 */
  legalMovesFrom(from: Pos): readonly Pos[] {
    return legalMoves(this.state, from);
  }

  /** 持ち駒を打てるマス。 */
  legalPlacements(): readonly Pos[] {
    return legalPlacements(this.state);
  }

  /** 手番側で動かせる駒。 */
  movablePieceIds(): readonly PieceId[] {
    return movablePieceIds(this.state, this.turn);
  }

  /** 手番側の封じ駒。次にどれかを動かす義務がある。 */
  sealedPieceIds(): readonly PieceId[] {
    return sealedPiecesOf(this.state, this.turn);
  }

  /** 手番側の持ち駒の数。 */
  handCount(player: Player): number {
    return this.state.hands[player];
  }

  /* ---------- 着手 ---------- */

  /**
   * 着手を送る。
   *
   * 前の着手がまだ確定していない間は busy で断る。
   * 通信が入ると往復に時間がかかるため、連打で二重に送らせない。
   */
  async submit(move: Move): Promise<SubmitResult> {
    if (this.#pending !== null) {
      return { accepted: false, reason: { kind: "busy" } };
    }

    const pending = this.#client.submitMove(move);
    this.#pending = pending;

    try {
      return await pending;
    } finally {
      this.#pending = null;
    }
  }

  /** 待ったのボタンを出すか。オンライン対戦では false。 */
  get supportsUndo(): boolean {
    return this.#client.supportsUndo;
  }

  /** いま待ったを押せるか。 */
  get canUndo(): boolean {
    return this.#client.canUndo && !this.isBusy;
  }

  /**
   * 直前の1手を取り消す。決着したあとでも戻せる。
   * 戻った局面は onStateChange で流れる。GameEvent は流れない。
   */
  async undo(): Promise<UndoResult> {
    if (this.#pending !== null) {
      return { undone: false, reason: { kind: "busy" } };
    }

    const pending = this.#client.undo();
    this.#pending = pending;

    try {
      return await pending;
    } finally {
      this.#pending = null;
    }
  }

  /* ---------- 購読 ---------- */

  /** 1手ごとに、起きたことが描画順に流れてくる。 */
  onEvent(listener: GameEventListener): Unsubscribe {
    this.#eventListeners.add(listener);
    return () => {
      this.#eventListeners.delete(listener);
    };
  }

  /** イベントを流し終えて局面が確定したときに1回だけ呼ばれる。 */
  onStateChange(listener: StateListener): Unsubscribe {
    this.#stateListeners.add(listener);
    return () => {
      this.#stateListeners.delete(listener);
    };
  }

  /** 購読を捨てる。包んでいる client は閉じない（作った側が閉じる）。 */
  dispose(): void {
    this.#unsubscribeEvent();
    this.#unsubscribeState();
    this.#eventListeners.clear();
    this.#stateListeners.clear();
  }
}
