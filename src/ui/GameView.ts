/**
 * 対局画面。盤に入力をつなぎ、操作ボタンを並べる。
 *
 * 盤・手番表示・棋譜の描画は BoardStage が持つ。ここが持つのは
 * 「選択中の駒」と入力の解釈だけ。選択は GameState に入れない（設計ルール3）。
 */

import type { GameSession } from "../app/GameSession";
import type { GameState, Move, PieceId, Pos } from "../core/types";
import { moveOf } from "../core/rules";
import { BoardStage } from "./BoardStage";
import type { BoardDecor } from "./BoardView";
import type { RecordStore } from "./RecordStore";
import type { Sound } from "./Sound";
import "./screens.css";

const samePos = (a: Pos, b: Pos): boolean => a.x === b.x && a.y === b.y;

export interface GameViewOptions {
  /** 対局をまたいで持ち回る音。 */
  readonly sound: Sound;
  /** 棋譜の保存先。 */
  readonly store: RecordStore;
  /** 同じ設定で始め直す。 */
  readonly onRematch: () => void;
  /** 対局設定へ。 */
  readonly onSettings: () => void;
  /** 最初の画面へ戻る。 */
  readonly onHome: () => void;
}

export class GameView {
  readonly el: HTMLElement;

  #session: GameSession;
  #stage: BoardStage;
  #store: RecordStore;
  #undoButton: HTMLButtonElement;
  #saveButton: HTMLButtonElement;

  /** 選択中の駒。ui 側だけの状態。 */
  #selectedId: PieceId | null = null;
  /** 保存済みの手数。指し進めたり戻したりしたら、また保存できる。 */
  #savedPlies: number | null = null;

  constructor(session: GameSession, options: GameViewOptions) {
    this.#session = session;
    this.#store = options.store;

    this.#stage = new BoardStage({
      session,
      sound: options.sound,
      decor: (state, lastPieceId) => this.#decor(state, lastPieceId),
      onRendered: () => this.#syncControls(),
    });

    this.#stage.board.onCellSelect(this.#handleCell);

    this.#undoButton = button("待った", () => void this.#undo());
    this.#undoButton.classList.add("btn-danger");
    this.#undoButton.hidden = !session.supportsUndo;

    this.#saveButton = button("棋譜を保存", () => this.#save());
    this.#saveButton.hidden = true;

    const controls = document.createElement("div");
    controls.className = "controls";
    controls.append(
      this.#undoButton,
      this.#saveButton,
      button("もう一局", options.onRematch),
      button("対局設定", options.onSettings),
      button("トップへ", options.onHome),
    );

    this.el = document.createElement("div");
    this.el.className = "screen play";
    this.el.append(this.#stage.board.el, this.#stage.status.el, controls, this.#stage.record.el);

    this.#stage.render();
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
        this.#stage.reject();
      }
      this.#stage.render();
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
      this.#stage.render();
      return;
    }
    if (session.sealedPieceIds().length === 0 && session.handCount(state.turn) > 0) {
      this.#stage.reject();
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
      this.#stage.reject();
      this.#stage.render();
    }
  }

  /** 待った。1手戻す。 */
  async #undo(): Promise<void> {
    this.#selectedId = null;

    // 描き直しは onStateChange の側で起きるので、その前に印を戻しておく
    const mark = this.#stage.rewindMark();

    const result = await this.#session.undo();
    if (result.undone) return;

    this.#stage.restoreMark(mark);
    this.#stage.reject();
    this.#stage.render();
  }

  /* ---------------- 棋譜の保存 ---------------- */

  #save(): void {
    const record = this.#session.record;
    if (record.length === 0) return;

    this.#store.save({
      config: this.#session.state.config,
      moves: record.map(moveOf),
      plies: record.length,
      outcome: this.#session.state.outcome,
    });

    this.#savedPlies = record.length;
    this.#syncControls();
  }

  /* ---------------- 描画 ---------------- */

  #syncControls(): void {
    const session = this.#session;
    this.#undoButton.disabled = !session.canUndo;

    // 決着してから出す。指し直したり戻したりしたら、また保存できる
    const plies = session.record.length;
    this.#saveButton.hidden = !session.isOver || plies === 0;
    const saved = this.#savedPlies === plies;
    this.#saveButton.disabled = saved;
    this.#saveButton.textContent = saved ? "保存しました" : "棋譜を保存";
  }

  #decor(state: GameState, lastPieceId: PieceId | null): BoardDecor {
    const session = this.#session;

    if (!session.canAct) {
      return {
        selectedId: null,
        destinations: [],
        placements: [],
        movableIds: [],
        lastPieceId,
      };
    }

    const selected = this.#selectedPiecePos(state);

    return {
      selectedId: this.#selectedId,
      destinations: selected === null ? [] : session.legalMovesFrom(selected),
      placements: session.legalPlacements(),
      movableIds: session.movablePieceIds(),
      lastPieceId,
    };
  }

  destroy(): void {
    this.#stage.destroy();
    this.el.remove();
  }
}

function button(label: string, onClick: () => void): HTMLButtonElement {
  const el = document.createElement("button");
  el.type = "button";
  el.className = "btn";
  el.textContent = label;
  el.addEventListener("click", onClick);
  return el;
}
