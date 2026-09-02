/**
 * 棋譜の表示。新しい手が上に来る。
 *
 * 棋譜そのものは GameSession が持つ。ここは受け取って並べるだけ。
 * 表記は core/notation に置いてあるので、書き方を変えたいときはそちらを直す。
 */

import { SIDE_MARK, moveText, noteText, outcomeText } from "../core/notation";
import type { MoveRecord } from "../core/types";
import "./record.css";

export class RecordView {
  readonly el: HTMLElement;

  #count: HTMLElement;
  #list: HTMLElement;
  #empty: HTMLElement;

  constructor() {
    this.el = document.createElement("section");
    this.el.className = "record";

    const head = document.createElement("div");
    head.className = "record-head";
    const label = document.createElement("span");
    label.textContent = "棋譜";
    this.#count = document.createElement("span");
    this.#count.className = "record-count";
    head.append(label, this.#count);

    this.#list = document.createElement("ol");
    this.#list.className = "record-list";
    this.#list.setAttribute("aria-live", "polite");

    this.#empty = document.createElement("p");
    this.#empty.className = "record-empty";
    this.#empty.textContent = "まだ指していません";

    this.el.append(head, this.#list, this.#empty);
  }

  render(record: readonly MoveRecord[]): void {
    this.#count.textContent = `${record.length} 手`;
    this.#empty.hidden = record.length > 0;

    this.#list.replaceChildren();
    // 新しい手を上に
    for (let i = record.length - 1; i >= 0; i--) {
      this.#list.append(this.#row(record[i]));
    }
  }

  #row(record: MoveRecord): HTMLElement {
    const row = document.createElement("li");

    const ply = document.createElement("span");
    ply.className = "record-n";
    ply.textContent = String(record.ply);

    const side = document.createElement("span");
    side.className = `record-side side-${record.player}`;
    side.textContent = SIDE_MARK[record.player];

    const move = document.createElement("span");
    move.className = "record-move";
    move.textContent = moveText(record);

    row.append(ply, side, move);

    const note = noteText(record);
    if (note !== "") {
      const noteEl = document.createElement("span");
      noteEl.className = "record-note";
      noteEl.textContent = note;
      row.append(noteEl);
    }

    if (record.outcome !== null) {
      const outcome = document.createElement("span");
      outcome.className = "record-outcome";
      outcome.textContent = outcomeText(record.outcome);
      row.append(outcome);
    }

    return row;
  }

  destroy(): void {
    this.el.remove();
  }
}
