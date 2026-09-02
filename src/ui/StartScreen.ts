/**
 * スタート画面。ここから対局設定へ進む。
 */

import type { BoardConfig } from "../core/types";
import "./screens.css";

export interface StartScreenOptions {
  /** いまの対局設定。札に出すだけで、変えるのは対局設定の画面。 */
  readonly config: BoardConfig;
  readonly onPlay: () => void;
  readonly onRules: () => void;
  readonly onLibrary: () => void;
}

export function configSummary(config: BoardConfig): string {
  return `${config.cols}×${config.rows} · 移動${config.moveRange} · 持ち駒${config.handSize}`;
}

export class StartScreen {
  readonly el: HTMLElement;

  constructor(options: StartScreenOptions) {
    this.el = document.createElement("div");
    this.el.className = "screen start";

    const top = document.createElement("div");
    top.className = "start-top";
    const chip = document.createElement("p");
    chip.className = "chip";
    chip.textContent = configSummary(options.config);
    top.append(chip);

    const wordmark = document.createElement("h1");
    wordmark.className = "start-wordmark";
    wordmark.textContent = "挟将棋";

    const sub = document.createElement("p");
    sub.className = "start-sub";
    sub.textContent = "in a pinch";

    const panel = document.createElement("div");
    panel.className = "start-panel";

    // 疑似要素は1要素に2つまでなので、残り2つの鉤はこの印だけの要素が持つ
    const corners = document.createElement("span");
    corners.className = "start-corners";
    corners.setAttribute("aria-hidden", "true");

    const play = document.createElement("button");
    play.type = "button";
    play.className = "btn-primary";
    play.textContent = "対局";
    play.addEventListener("click", options.onPlay);

    const note = document.createElement("p");
    note.className = "start-note";
    note.textContent = "同じ画面で2人が交互に指します";

    panel.append(corners, play, note);

    const row = document.createElement("div");
    row.className = "start-row";
    const rules = document.createElement("button");
    rules.type = "button";
    rules.className = "btn";
    rules.innerHTML = '<span class="btn-icon">?</span>ルール';
    rules.addEventListener("click", options.onRules);

    const library = document.createElement("button");
    library.type = "button";
    library.className = "btn";
    library.textContent = "棋譜";
    library.addEventListener("click", options.onLibrary);

    row.append(rules, library);

    this.el.append(top, wordmark, sub, panel, row);
  }

  destroy(): void {
    this.el.remove();
  }
}
