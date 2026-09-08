/**
 * 詰めはさみの問題一覧。手数ごとに出す。
 */

import type { Puzzle } from "../core/puzzles";
import { isDraftId } from "./PuzzleDraftStore";
import type { PuzzleProgress } from "./PuzzleProgress";
import "./puzzle.css";
import "./screens.css";

export interface PuzzleListScreenOptions {
  readonly plies: number;
  /** その手数の問題だけを、並べる順に渡す。 */
  readonly puzzles: readonly Puzzle[];
  readonly progress: PuzzleProgress;
  readonly onOpen: (puzzle: Puzzle) => void;
  /** 下書きを消す。組み込みの問題では呼ばれない。 */
  readonly onDelete: (puzzle: Puzzle) => void;
  readonly onBack: () => void;
}

export class PuzzleListScreen {
  readonly el: HTMLElement;

  #options: PuzzleListScreenOptions;
  #list: HTMLElement;
  #count: HTMLElement;

  constructor(options: PuzzleListScreenOptions) {
    this.#options = options;

    this.el = document.createElement("div");
    this.el.className = "screen puzzle-list";

    const title = document.createElement("h2");
    title.className = "sheet-title";
    title.textContent = `${options.plies}手詰`;

    this.#count = document.createElement("p");
    this.#count.className = "puzzle-count";

    this.#list = document.createElement("ul");
    this.#list.className = "puzzle-grid";

    const foot = document.createElement("div");
    foot.className = "sheet-foot";
    const back = document.createElement("button");
    back.type = "button";
    back.className = "btn";
    back.textContent = "もどる";
    back.addEventListener("click", options.onBack);
    foot.append(back);

    this.el.append(title, this.#count, this.#list, foot);
    this.render(options.puzzles);
  }

  render(puzzles: readonly Puzzle[]): void {
    const solved = puzzles.filter((puzzle) => this.#options.progress.isSolved(puzzle.id)).length;
    this.#count.textContent = `${solved} / ${puzzles.length} 問`;

    this.#list.replaceChildren();
    puzzles.forEach((puzzle, index) => this.#list.append(this.#card(puzzle, index + 1)));
  }

  #card(puzzle: Puzzle, number: number): HTMLElement {
    const item = document.createElement("li");
    item.className = "puzzle-item";

    const button = document.createElement("button");
    button.type = "button";
    button.className = "puzzle-card";
    if (this.#options.progress.isSolved(puzzle.id)) button.classList.add("is-solved");

    const label = document.createElement("span");
    label.className = "puzzle-number";
    label.textContent = `第${number}問`;

    const size = document.createElement("span");
    size.className = "puzzle-plies";
    size.textContent = `${puzzle.rows[0].replace(/\s+/g, "").length}路`;

    const mark = document.createElement("span");
    mark.className = "puzzle-mark";
    mark.textContent = this.#options.progress.isSolved(puzzle.id) ? "済" : "";

    button.append(label, size, mark);
    button.addEventListener("click", () => this.#options.onOpen(puzzle));
    item.append(button);

    // 自分で足した問題だけ消せる
    if (isDraftId(puzzle.id)) {
      button.classList.add("is-draft");
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "btn btn-danger puzzle-remove";
      remove.textContent = "消す";
      remove.setAttribute("aria-label", `第${number}問 を消す`);
      remove.addEventListener("click", () => this.#options.onDelete(puzzle));
      item.append(remove);
    }

    return item;
  }

  destroy(): void {
    this.el.remove();
  }
}
