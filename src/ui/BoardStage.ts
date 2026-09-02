/**
 * 盤・手番表示・棋譜をまとめて、対局の通知に合わせて描き直す。
 *
 * 対局画面と再生画面で同じものを使う。違うのは「何で手が進むか」だけなので、
 * 入力も操作ボタンもここには持たない。
 *
 * イベントと局面確定の2系統を、次のように使い分ける。
 *   onEvent       … 一度きりの演出を集める（打った駒、封じられた駒、挟みの線）
 *   onStateChange … 集めた演出を添えて描き直す
 * こうすると盤の差分を取らずに済み、演出の指定は CSS 側に残る（設計ルール6）。
 *
 * 待ったは GameEvent を流さないので、onStateChange だけで描き直される。
 * 駒は ID で追えるので、戻った局面へ CSS の transition がそのまま滑って戻る。
 */

import type { GameSession } from "../app/GameSession";
import type { Unsubscribe } from "../app/GameClient";
import type { GameEvent, GameState, PieceId } from "../core/types";
import { BoardView } from "./BoardView";
import type { BoardDecor, FlankLine } from "./BoardView";
import { RecordView } from "./RecordView";
import type { Sound } from "./Sound";
import { StatusView } from "./StatusView";

interface PendingEffects {
  droppedId: PieceId | null;
  sealedIds: PieceId[];
  flanks: FlankLine[];
  /** 負けの原因になった塊。決着したときだけ入る */
  verdictGroup: PieceId[];
}

const noEffects = (): PendingEffects => ({
  droppedId: null,
  sealedIds: [],
  flanks: [],
  verdictGroup: [],
});

export interface BoardStageOptions {
  readonly session: GameSession;
  readonly sound: Sound;
  /**
   * 盤に重ねる印。省くと印なしで描く（再生画面のように入力を受けない場合）。
   * 直前に動いた駒だけは stage が覚えているので、引数で渡す。
   */
  readonly decor?: (state: GameState, lastPieceId: PieceId | null) => BoardDecor;
  /** 描き直したあとに呼ばれる。ボタンの有効・無効を合わせるのに使う。 */
  readonly onRendered?: () => void;
}

export class BoardStage {
  readonly board: BoardView;
  readonly status: StatusView;
  readonly record: RecordView;

  #session: GameSession;
  #sound: Sound;
  #decorOf: BoardStageOptions["decor"];
  #onRendered: (() => void) | undefined;
  #unsubscribes: Unsubscribe[] = [];

  /** 直前に動いた駒。印を残すためだけに覚えておく。 */
  #lastPieceId: PieceId | null = null;
  /** 待ったで戻せるように、手ごとの「直前に動いた駒」を積んでおく。 */
  #lastPieceIdHistory: (PieceId | null)[] = [];
  /** 次の描画で流す演出。onEvent で集めて onStateChange で使う。 */
  #effects: PendingEffects = noEffects();

  constructor(options: BoardStageOptions) {
    this.#session = options.session;
    this.#sound = options.sound;
    this.#decorOf = options.decor;
    this.#onRendered = options.onRendered;

    const config = options.session.state.config;
    this.board = new BoardView(config);
    this.status = new StatusView(config);
    this.record = new RecordView();

    this.#unsubscribes.push(
      options.session.onEvent(this.#handleEvent),
      options.session.onStateChange(this.#handleStateChange),
    );
  }

  get lastPieceId(): PieceId | null {
    return this.#lastPieceId;
  }

  /** 現在の局面で描き直す。 */
  render(): void {
    const state = this.#session.state;
    this.board.render(state, this.#decor(state));
    this.status.render(state);
    this.record.render(this.#session.record);
    this.#onRendered?.();
  }

  /**
   * 待ったの前に呼ぶ。直前に動いた駒の印を1つ前に戻す。
   * 戻せなかった場合は restoreMark で積み直す。
   */
  rewindMark(): PieceId | null {
    const previous = this.#lastPieceIdHistory.pop() ?? null;
    this.#lastPieceId = previous;
    return previous;
  }

  restoreMark(mark: PieceId | null): void {
    this.#lastPieceIdHistory.push(mark);
  }

  /** 弾いた操作を伝える。 */
  reject(): void {
    this.board.shake();
    this.#sound.reject();
  }

  #decor(state: GameState): BoardDecor {
    if (this.#decorOf !== undefined) return this.#decorOf(state, this.#lastPieceId);
    return {
      selectedId: null,
      destinations: [],
      placements: [],
      movableIds: [],
      lastPieceId: this.#lastPieceId,
    };
  }

  #handleEvent = (event: GameEvent): void => {
    this.#sound.play(event);

    switch (event.type) {
      case "moved":
        // 1手ぶんのイベントは必ず moved で始まる。ここで前の手の分を捨てる
        this.#effects = noEffects();
        this.#effects.droppedId = event.from === null ? event.pieceId : null;
        this.#lastPieceIdHistory.push(this.#lastPieceId);
        this.#lastPieceId = event.pieceId;
        break;

      case "captured":
        this.#effects.sealedIds.push(event.pieceId);
        this.#effects.flanks.push({ from: event.flanks[0], to: event.flanks[1] });
        break;

      case "gameEnded":
        this.#effects.verdictGroup = [...event.connectedGroup];
        break;

      case "turnChanged":
        break;
    }
  };

  #handleStateChange = (state: GameState): void => {
    this.render();

    this.board.playEffects(this.#effects);

    if (state.outcome === null) {
      // 待ったで決着前に戻ったとき、幕を上げる
      this.board.clearVerdict();
    } else {
      this.board.showVerdict(state.outcome, this.#effects.verdictGroup);
    }

    this.#effects = noEffects();
  };

  destroy(): void {
    for (const unsubscribe of this.#unsubscribes) unsubscribe();
    this.#unsubscribes = [];
    this.board.destroy();
    this.status.destroy();
    this.record.destroy();
  }
}
