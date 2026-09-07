/**
 * 詰めはさみの問題一覧。
 */

import { PUZZLES } from "../core/puzzles";
import type { Puzzle } from "../core/puzzles";
import type { PuzzleProgress } from "./PuzzleProgress";
import "./puzzle.css";
import "./screens.css";

export interface PuzzleListScreenOptions {
  readonly progress: PuzzleProgress;
  readonly onOpen: (puzzle: Puzzle) => void;
  readonly onBack: () => void;
}

export class PuzzleListScreen {
  readonly el: HTMLElement;

  constructor(options: PuzzleListScreenOptions) {
    this.el = document.createElement("div");
    this.el.className = "screen puzzle-list";

    const title = document.createElement("h2");
    title.className = "sheet-title";
    title.textContent = "詰めはさみ";

    const lede = document.createElement("p");
    lede.className = "sheet-lede";
    lede.textContent = "相手がどう受けても、決まった手数で詰ませる";

    const count = document.createElement("p");
    count.className = "puzzle-count";
    count.textContent = `${options.progress.solvedCount} / ${PUZZLES.length} 問`;

    const list = document.createElement("ul");
    list.className = "puzzle-grid";

    for (const puzzle of PUZZLES) {
      list.append(this.#card(puzzle, options));
    }

    const foot = document.createElement("div");
    foot.className = "sheet-foot";
    const back = document.createElement("button");
    back.type = "button";
    back.className = "btn";
    back.textContent = "もどる";
    back.addEventListener("click", options.onBack);
    foot.append(back);

    this.el.append(title, lede, count, list, foot);
  }

  #card(puzzle: Puzzle, options: PuzzleListScreenOptions): HTMLElement {
    const item = document.createElement("li");

    const button = document.createElement("button");
    button.type = "button";
    button.className = "puzzle-card";
    if (options.progress.isSolved(puzzle.id)) button.classList.add("is-solved");

    const plies = document.createElement("span");
    plies.className = "puzzle-plies";
    plies.textContent = `${puzzle.plies}手詰`;

    const name = document.createElement("span");
    name.className = "puzzle-name";
    name.textContent = puzzle.title;

    const mark = document.createElement("span");
    mark.className = "puzzle-mark";
    mark.textContent = options.progress.isSolved(puzzle.id) ? "済" : "";

    button.append(plies, name, mark);
    button.addEventListener("click", () => options.onOpen(puzzle));

    item.append(button);
    return item;
  }

  destroy(): void {
    this.el.remove();
  }
}
