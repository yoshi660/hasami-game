/**
 * 保存した棋譜の一覧。ここから再生に入る。
 */

import type { RecordStore, SavedGame } from "./RecordStore";
import { configSummaryOf, formatSavedAt, outcomeSummary } from "./RecordStore";
import "./screens.css";

export interface LibraryScreenOptions {
  readonly store: RecordStore;
  readonly onPlay: (game: SavedGame) => void;
  readonly onBack: () => void;
}

export class LibraryScreen {
  readonly el: HTMLElement;

  #options: LibraryScreenOptions;
  #list: HTMLElement;
  #empty: HTMLElement;

  constructor(options: LibraryScreenOptions) {
    this.#options = options;

    this.el = document.createElement("div");
    this.el.className = "screen library";

    const title = document.createElement("h2");
    title.className = "sheet-title";
    title.textContent = "棋譜";

    const lede = document.createElement("p");
    lede.className = "sheet-lede";
    lede.textContent = "保存した対局をなぞる";

    this.#list = document.createElement("ul");
    this.#list.className = "library-list";

    this.#empty = document.createElement("p");
    this.#empty.className = "library-empty";
    this.#empty.textContent =
      "保存した棋譜はありません。対局が終わったら「棋譜を保存」で残せます。";

    const foot = document.createElement("div");
    foot.className = "sheet-foot";
    const back = document.createElement("button");
    back.type = "button";
    back.className = "btn";
    back.textContent = "もどる";
    back.addEventListener("click", options.onBack);
    foot.append(back);

    this.el.append(title, lede, this.#list, this.#empty, foot);
    this.render();
  }

  render(): void {
    const games = this.#options.store.list();

    this.#empty.hidden = games.length > 0;
    this.#list.replaceChildren();
    for (const game of games) this.#list.append(this.#row(game));
  }

  #row(game: SavedGame): HTMLElement {
    const row = document.createElement("li");
    row.className = "library-row";

    const text = document.createElement("div");
    text.className = "library-text";

    const head = document.createElement("p");
    head.className = "library-head";
    head.textContent = `${formatSavedAt(game)} · ${game.plies}手 · ${outcomeSummary(game)}`;

    const sub = document.createElement("p");
    sub.className = "library-sub";
    sub.textContent = configSummaryOf(game);

    text.append(head, sub);

    const actions = document.createElement("div");
    actions.className = "library-actions";

    const play = document.createElement("button");
    play.type = "button";
    play.className = "btn";
    play.textContent = "再生";
    play.addEventListener("click", () => this.#options.onPlay(game));

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "btn btn-danger";
    remove.textContent = "削除";
    remove.addEventListener("click", () => {
      this.#options.store.remove(game.id);
      this.render();
    });

    actions.append(play, remove);
    row.append(text, actions);
    return row;
  }

  destroy(): void {
    this.el.remove();
  }
}
