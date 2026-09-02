/**
 * 対局相手との境界。
 *
 * ローカル対戦・オンライン対戦・AI対戦を、UI から見て同じ形にするための interface。
 * ここから先（実装側）が同期か通信かを、UI は知らなくてよい。
 *
 * core を import してよいが、ui は import しない（依存の向き ui → app → core）。
 */

import type { GameEvent, GameState, Move, MoveError, Player } from "../core/types";

/** 購読の解除。呼ぶと以後そのリスナは呼ばれない。 */
export type Unsubscribe = () => void;

export type GameEventListener = (event: GameEvent) => void;
export type StateListener = (state: GameState) => void;

/** 着手が受け付けられなかった理由。 */
export type SubmitError =
  /** ルール上の非合法手。core が返した理由をそのまま渡す。 */
  | { readonly kind: "illegal"; readonly error: MoveError }
  /** このクライアントが指せない側の手番だった。オンラインで相手の手番のとき。 */
  | { readonly kind: "notYourSeat"; readonly turn: Player }
  /** 前の着手がまだ確定していない。二重送信を防ぐ。 */
  | { readonly kind: "busy" }
  /** 通信層の失敗。LocalClient では起きない。 */
  | { readonly kind: "transport"; readonly message: string };

export type SubmitResult =
  | { readonly accepted: true }
  | { readonly accepted: false; readonly reason: SubmitError };

/**
 * 対局の進行を担う相手。
 *
 * ## 通知の順序
 *
 * 1手が確定すると、まず `onEvent` のリスナがイベントの数だけ**描画順**に呼ばれ、
 * そのあと `onStateChange` のリスナが1回だけ呼ばれる。
 *
 * ```
 * onEvent(moved) → onEvent(captured)* → onEvent(turnChanged) → [onEvent(gameEnded)]
 *   → onStateChange(確定した局面)
 * ```
 *
 * イベントは「何が起きたか」（演出のため）、onStateChange は「局面が確定した」
 * （描画を合わせるため）を伝える。どちらも必要なので2系統に分けてある。
 *
 * 相手が指した手も同じ順序で流れる。オンラインではこちらの submitMove と無関係に届く。
 */
export interface GameClient {
  /**
   * このクライアントが指せる側。
   * ローカル対戦は ["A", "B"]、オンラインは自分の側だけ、AI対戦は人間側だけ。
   */
  readonly seats: readonly Player[];

  /** 現在の局面。イベントを取りこぼしても、ここが正。 */
  getState(): GameState;

  /**
   * 着手を送る。
   *
   * 現在の実装は同期に解決するが、後で通信を挟むため必ず await すること（設計ルール5）。
   * 受け付けられた場合、解決する前に onEvent と onStateChange が呼ばれている。
   */
  submitMove(move: Move): Promise<SubmitResult>;

  onEvent(listener: GameEventListener): Unsubscribe;
  onStateChange(listener: StateListener): Unsubscribe;

  /** 購読と接続を捨てる。以後 submitMove は使えない。 */
  dispose(): void;
}
