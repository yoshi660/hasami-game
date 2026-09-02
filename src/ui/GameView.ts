/**
 * 盤・表示・操作をつなぐ。
 *
 * 選択中の駒はここが持つ。GameState には入れない（設計ルール3）。
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
import type { GameEvent, GameState, Move, PieceId, Pos } from "../core/types";
import { BoardView } from "./BoardView";
import type { BoardDecor, FlankLine } from "./BoardView";
import { RecordView } from "./RecordView";
import type { Sound } from "./Sound";
import { StatusView } from "./StatusView";
import "./screens.css";

const samePos = (a: Pos, b: Pos): boolean => a.x === b.x && a.y === b.y;

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

export interface GameViewOptions {
  /** 対局をまたいで持ち回る音。 */
  readonly sound: Sound;
  /** 同じ設定で始め直す。 */
  readonly onRematch: () => void;
  /** 対局設定へ戻る。 */
  readonly onSettings: () => void;
}

export class GameView {
  readonly el: HTMLElement;

  #session: GameSession;
  #board: BoardView;
  #status: StatusView;
  #record: RecordView;
  #sound: Sound;
  #undoButton: HTMLButtonElement;
  #unsubscribes: Unsubscribe[] = [];

  /** 選択中の駒。ui 側だけの状態。 */
  #selectedId: PieceId | null = null;
  /** 直前に動いた駒。印を残すためだけに覚えておく。 */
  #lastPieceId: PieceId | null = null;
  /** 待ったで戻せるように、手ごとの「直前に動いた駒」を積んでおく。 */
  #lastPieceIdHistory: (PieceId | null)[] = [];
  /** 次の描画で流す演出。onEvent で集めて onStateChange で使う。 */
  #effects: PendingEffects = noEffects();

  constructor(session: GameSession, options: GameViewOptions) {
    this.#session = session;
    this.#sound = options.sound;

    const config = session.state.config;
    this.#board = new BoardView(config);
    this.#status = new StatusView(config);
    this.#record = new RecordView();

    const controls = document.createElement("div");
    controls.className = "controls";

    this.#undoButton = this.#button("待った", () => void this.#undo());
    this.#undoButton.classList.add("btn-danger");
    this.#undoButton.hidden = !session.supportsUndo;

    controls.append(
      this.#undoButton,
      this.#button("もう一局", options.onRematch),
      this.#button("対局設定", options.onSettings),
    );

    this.el = document.createElement("div");
    this.el.className = "screen play";
    this.el.append(this.#board.el, this.#status.el, controls, this.#record.el);

    this.#unsubscribes.push(
      this.#board.onCellSelect(this.#handleCell),
      session.onEvent(this.#handleEvent),
      session.onStateChange(this.#handleStateChange),
    );

    this.#render(session.state);
  }

  /** 指せない操作を弾く。揺らして鳴らす。 */
  #reject(): void {
    this.#board.shake();
    this.#sound.reject();
  }

  #button(label: string, onClick: () => void): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "btn";
    button.textContent = label;
    button.addEventListener("click", onClick);
    return button;
  }

  /* ---------------- 入力 ---------------- */

  #handleCell = (pos: Pos): void => {
    const session = this.#session;
    if (!session.canAct) return;

    const state = session.state;

    // 1. 選んでいる駒の行き先なら動かす
    const selected = this.#selectedPiecePos(state);
    if (selected !== null && session.legalMovesFrom(selected).some((p) => samePos(p, pos))) {
      void this.#submit({ kind: "move", pieceId: this.#selectedId!, to: pos });
      return;
    }

    const pieceId = state.board.get(`${pos.x},${pos.y}`);

    // 2. 自分の駒なら、つまむ／つまみ直す
    if (pieceId !== undefined) {
      if (session.movablePieceIds().includes(pieceId)) {
        this.#selectedId = this.#selectedId === pieceId ? null : pieceId;
      } else {
        this.#selectedId = null;
        this.#reject();
      }
      this.#render(state);
      return;
    }

    // 3. 空きマスなら打つ
    if (session.legalPlacements().some((p) => samePos(p, pos))) {
      void this.#submit({ kind: "place", to: pos });
      return;
    }

    // 4. 打てない空きマス。選択を解くか、打てるはずなのに打てないことを伝える
    if (this.#selectedId !== null) {
      this.#selectedId = null;
      this.#render(state);
      return;
    }
    if (session.sealedPieceIds().length === 0 && session.handCount(state.turn) > 0) {
      this.#reject();
    }
  };

  #selectedPiecePos(state: GameState): Pos | null {
    if (this.#selectedId === null) return null;
    return state.pieces.get(this.#selectedId)?.pos ?? null;
  }

  async #submit(move: Move): Promise<void> {
    this.#selectedId = null;

    const result = await this.#session.submit(move);
    if (!result.accepted) {
      // 盤に出していない手が弾かれた場合。描き直して知らせる
      this.#reject();
      this.#render(this.#session.state);
    }
  }

  /** 待った。1手戻す。 */
  async #undo(): Promise<void> {
    this.#selectedId = null;

    // 描き直しは onStateChange の側で起きるので、その前に印を戻しておく
    const previousLast = this.#lastPieceIdHistory.pop() ?? null;
    this.#lastPieceId = previousLast;

    const result = await this.#session.undo();
    if (result.undone) return;

    // 戻せなかったので印も積み直す
    this.#lastPieceIdHistory.push(previousLast);
    this.#reject();
    this.#render(this.#session.state);
  }

  /* ---------------- 対局からの通知 ---------------- */

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
    this.#selectedId = null;
    this.#render(state);

    this.#board.playEffects(this.#effects);

    if (state.outcome === null) {
      // 待ったで決着前に戻ったとき、幕を上げる
      this.#board.clearVerdict();
    } else {
      this.#board.showVerdict(state.outcome, this.#effects.verdictGroup);
    }

    this.#effects = noEffects();
  };

  /* ---------------- 描画 ---------------- */

  #render(state: GameState): void {
    this.#board.render(state, this.#decor(state));
    this.#status.render(state);
    this.#record.render(this.#session.record);
    this.#undoButton.disabled = !this.#session.canUndo;
  }

  #decor(state: GameState): BoardDecor {
    const session = this.#session;

    if (!session.canAct) {
      return {
        selectedId: null,
        destinations: [],
        placements: [],
        movableIds: [],
        lastPieceId: this.#lastPieceId,
      };
    }

    const selected = this.#selectedPiecePos(state);

    return {
      selectedId: this.#selectedId,
      destinations: selected === null ? [] : session.legalMovesFrom(selected),
      placements: session.legalPlacements(),
      movableIds: session.movablePieceIds(),
      lastPieceId: this.#lastPieceId,
    };
  }

  destroy(): void {
    for (const unsubscribe of this.#unsubscribes) unsubscribe();
    this.#unsubscribes = [];
    this.#board.destroy();
    this.#status.destroy();
    this.#record.destroy();
    this.el.remove();
  }
}
