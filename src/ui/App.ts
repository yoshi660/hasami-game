/**
 * 画面の出し入れと、対局の作り直し。
 *
 *   スタート → 対局設定 → 対局
 *
 * 対局中の「対局設定」は幕に重ねて出す。やめれば対局はそのまま続く。
 * 「もう一局」は同じ設定で対局を作り直す。局面を戻すのではなく作り直すので、
 * 待ったの履歴も持ち駒もまとめて初期化される。
 */

import { GameSession } from "../app/GameSession";
import { LocalClient } from "../app/LocalClient";
import { DEFAULT_CONFIG } from "../core/rules";
import type { BoardConfig } from "../core/types";
import { GameView } from "./GameView";
import { RulesSheet } from "./RulesSheet";
import { SettingsScreen } from "./SettingsScreen";
import { StartScreen } from "./StartScreen";
import "./screens.css";

interface Screen {
  readonly el: HTMLElement;
  destroy(): void;
}

export class App {
  readonly el: HTMLElement;

  #head: HTMLElement;
  #stage: HTMLElement;
  #config: BoardConfig = DEFAULT_CONFIG;

  #screen: Screen | null = null;
  #overlay: Screen | null = null;
  #client: LocalClient | null = null;
  #session: GameSession | null = null;

  constructor() {
    this.el = document.createElement("div");
    this.el.className = "app";

    // スタート画面には大きな題字があるので、そこでは出さない
    this.#head = document.createElement("header");
    this.#head.className = "app-head";
    this.#head.innerHTML = '<span class="app-head-mark">挟</span><span class="app-head-sub">in a pinch</span>';

    this.#stage = document.createElement("main");
    this.#stage.className = "app-stage";

    this.el.append(this.#head, this.#stage);
    this.#showStart();
  }

  /* ---------------- 画面 ---------------- */

  #swap(screen: Screen, showHead: boolean): void {
    this.#closeOverlay();
    this.#screen?.destroy();
    this.#screen = screen;
    this.#head.hidden = !showHead;
    this.#stage.append(screen.el);
  }

  #showStart(): void {
    this.#endGame();
    this.#swap(
      new StartScreen({
        config: this.#config,
        onPlay: () => this.#showSettings(),
        onRules: () => this.#openRules(),
      }),
      false,
    );
  }

  #showSettings(): void {
    this.#endGame();

    const screen = new SettingsScreen({
      config: this.#config,
      onStart: (config) => this.#startGame(config),
      onBack: () => this.#showStart(),
    });

    this.#swap(screen, true);
    screen.render();
  }

  #startGame(config: BoardConfig): void {
    this.#config = config;
    this.#endGame();

    const client = new LocalClient({ config });
    const session = new GameSession(client);
    this.#client = client;
    this.#session = session;

    this.#swap(
      new GameView(session, {
        onRematch: () => this.#startGame(config),
        onSettings: () => this.#openSettings(),
      }),
      true,
    );
  }

  #endGame(): void {
    this.#session?.dispose();
    this.#client?.dispose();
    this.#session = null;
    this.#client = null;
  }

  /* ---------------- 重ねる画面 ---------------- */

  #mountOverlay(content: HTMLElement, destroy: () => void): void {
    this.#closeOverlay();
    const veil = document.createElement("div");
    veil.className = "veil";
    veil.append(content);
    veil.addEventListener("click", (event) => {
      if (event.target === veil) this.#closeOverlay();
    });

    this.#overlay = {
      el: veil,
      destroy: () => {
        destroy();
        veil.remove();
      },
    };
    this.el.append(veil);
  }

  #closeOverlay(): void {
    this.#overlay?.destroy();
    this.#overlay = null;
  }

  /** 対局中の設定。やめれば対局はそのまま続く。 */
  #openSettings(): void {
    const screen = new SettingsScreen({
      config: this.#config,
      duringGame: true,
      onStart: (config) => {
        this.#closeOverlay();
        this.#startGame(config);
      },
      onBack: () => this.#closeOverlay(),
    });

    this.#mountOverlay(screen.el, () => screen.destroy());
    screen.render();
  }

  #openRules(): void {
    // RulesSheet は自分で幕を持つので、そのまま重ねる
    this.#closeOverlay();
    const sheet = new RulesSheet(() => this.#closeOverlay());
    this.#overlay = sheet;
    this.el.append(sheet.el);
  }

  destroy(): void {
    this.#closeOverlay();
    this.#screen?.destroy();
    this.#endGame();
    this.el.remove();
  }
}
