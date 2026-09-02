/**
 * 棋譜の再生。
 *
 * 保存してあるのは「開始時の設定」と「指した手の並び」だけなので、
 * 対局と同じ LocalClient / GameSession を作って1手ずつ指し直す。
 * 進むのは submit、戻るのは待った。演出も音も棋譜も対局と同じ経路で出る。
 */

import { GameSession } from "../app/GameSession";
import { LocalClient } from "../app/LocalClient";
import { BoardStage } from "./BoardStage";
import type { SavedGame } from "./RecordStore";
import { formatSavedAt, outcomeSummary } from "./RecordStore";
import type { Sound } from "./Sound";
import "./screens.css";

export interface ReplayScreenOptions {
  readonly game: SavedGame;
  readonly sound: Sound;
  readonly onBack: () => void;
}

export class ReplayScreen {
  readonly el: HTMLElement;

  #game: SavedGame;
  #client: LocalClient;
  #session: GameSession;
  #stage: BoardStage;

  #firstButton: HTMLButtonElement;
  #prevButton: HTMLButtonElement;
  #nextButton: HTMLButtonElement;
  #position: HTMLElement;
  #note: HTMLElement;

  /** 前後の指し直しが重ならないようにする。 */
  #busy = false;
  /** 指し直せなくなった（保存した棋譜と今のルールが合わない）。 */
  #stuck = false;

  constructor(options: ReplayScreenOptions) {
    this.#game = options.game;

    this.#client = new LocalClient({ config: options.game.config });
    this.#session = new GameSession(this.#client);
    this.#stage = new BoardStage({
      session: this.#session,
      sound: options.sound,
      onRendered: () => this.#syncControls(),
    });

    const head = document.createElement("div");
    head.className = "replay-head";
    const title = document.createElement("p");
    title.className = "replay-title";
    title.textContent = `${formatSavedAt(options.game)} · ${outcomeSummary(options.game)}`;
    this.#position = document.createElement("p");
    this.#position.className = "replay-position";
    head.append(title, this.#position);

    this.#firstButton = button("最初へ", () => void this.#seekStart());
    this.#prevButton = button("◀ 前へ", () => void this.#step(-1));
    this.#nextButton = button("次へ ▶", () => void this.#step(1));

    const controls = document.createElement("div");
    controls.className = "controls";
    controls.append(
      this.#firstButton,
      this.#prevButton,
      this.#nextButton,
      button("棋譜一覧へ", options.onBack),
    );

    this.#note = document.createElement("p");
    this.#note.className = "replay-note";
    this.#note.hidden = true;
    this.#note.textContent = "この棋譜は今のルールでは最後までなぞれません。";

    this.el = document.createElement("div");
    this.el.className = "screen play";
    this.el.append(
      head,
      this.#stage.board.el,
      this.#stage.status.el,
      controls,
      this.#note,
      this.#stage.record.el,
    );

    this.#stage.render();
  }

  /* ---------------- 送り ---------------- */

  async #step(direction: 1 | -1): Promise<void> {
    if (this.#busy) return;
    this.#busy = true;
    try {
      if (direction === 1) await this.#forward();
      else await this.#back();
    } finally {
      this.#busy = false;
      this.#syncControls();
    }
  }

  async #forward(): Promise<void> {
    const move = this.#game.moves[this.#session.state.ply];
    if (move === undefined) return;

    const result = await this.#session.submit(move);
    if (!result.accepted) {
      // 保存したときと判定が変わっている。ここで止める
      this.#stuck = true;
      this.#stage.reject();
    }
  }

  async #back(): Promise<void> {
    const mark = this.#stage.rewindMark();
    const result = await this.#session.undo();
    if (result.undone) {
      // 戻れたなら、この先はまた進める
      this.#stuck = false;
      return;
    }
    this.#stage.restoreMark(mark);
  }

  async #seekStart(): Promise<void> {
    if (this.#busy) return;
    this.#busy = true;
    try {
      // 待ったはイベントを流さないので、まとめて戻しても音は鳴らない
      while (this.#session.canUndo) {
        this.#stage.rewindMark();
        const result = await this.#session.undo();
        if (!result.undone) break;
      }
      this.#stuck = false;
    } finally {
      this.#busy = false;
      this.#syncControls();
    }
  }

  /* ---------------- 表示 ---------------- */

  #syncControls(): void {
    const ply = this.#session.state.ply;
    const total = this.#game.moves.length;

    this.#position.textContent = `${ply} / ${total} 手`;
    this.#firstButton.disabled = ply === 0;
    this.#prevButton.disabled = ply === 0;
    this.#nextButton.disabled = ply >= total || this.#stuck;
    this.#note.hidden = !this.#stuck;
  }

  destroy(): void {
    this.#stage.destroy();
    this.#session.dispose();
    this.#client.dispose();
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
