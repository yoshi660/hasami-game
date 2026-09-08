/**
 * 詰めはさみの入口。何手詰めを解くかを選ぶ。
 */

import type { Puzzle } from "../core/puzzles";
import type { PuzzleProgress } from "./PuzzleProgress";
import "./puzzle.css";
import "./screens.css";

/** 出題する手数。少ない順。 */
export const PUZZLE_PLIES: readonly number[] = [1, 3, 5, 7];

export interface PuzzleMenuScreenOptions {
  readonly puzzles: readonly Puzzle[];
  readonly progress: PuzzleProgress;
  readonly onSelect: (plies: number) => void;
  readonly onBack: () => void;
}

export class PuzzleMenuScreen {
  readonly el: HTMLElement;

  constructor(options: PuzzleMenuScreenOptions) {
    this.el = document.createElement("div");
    this.el.className = "screen puzzle-menu";

    const title = document.createElement("h2");
    title.className = "sheet-title";
    title.textContent = "詰めはさみ";

    const list = document.createElement("ul");
    list.className = "menu-list";

    for (const plies of PUZZLE_PLIES) {
      list.append(this.#row(plies, options));
    }

    const foot = document.createElement("div");
    foot.className = "sheet-foot";
    const back = document.createElement("button");
    back.type = "button";
    back.className = "btn";
    back.textContent = "もどる";
    back.addEventListener("click", options.onBack);
    foot.append(back);

    this.el.append(title, list, foot);
  }

  #row(plies: number, options: PuzzleMenuScreenOptions): HTMLElement {
    const group = options.puzzles.filter((puzzle) => puzzle.plies === plies);
    const solved = group.filter((puzzle) => options.progress.isSolved(puzzle.id)).length;

    const item = document.createElement("li");

    const button = document.createElement("button");
    button.type = "button";
    button.className = "menu-card";
    button.disabled = group.length === 0;
    if (group.length > 0 && solved === group.length) button.classList.add("is-done");

    const head = document.createElement("span");
    head.className = "menu-plies";
    head.textContent = `${plies}手詰`;

    const count = document.createElement("span");
    count.className = "menu-count";
    count.textContent = `${solved} / ${group.length}`;

    button.append(head, count);
    button.addEventListener("click", () => options.onSelect(plies));

    item.append(button);
    return item;
  }

  destroy(): void {
    this.el.remove();
  }
}
