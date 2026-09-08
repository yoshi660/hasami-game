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
import { PUZZLES } from "../core/puzzles";
import type { Puzzle } from "../core/puzzles";
import type { BoardConfig } from "../core/types";
import { EditorScreen } from "./EditorScreen";
import { GameView } from "./GameView";
import { LibraryScreen } from "./LibraryScreen";
import { RecordStore } from "./RecordStore";
import type { SavedGame } from "./RecordStore";
import { PuzzleDraftStore } from "./PuzzleDraftStore";
import { PuzzleListScreen } from "./PuzzleListScreen";
import { PuzzleMenuScreen } from "./PuzzleMenuScreen";
import { PuzzleProgress } from "./PuzzleProgress";
import { PuzzleScreen } from "./PuzzleScreen";
import { ReplayScreen } from "./ReplayScreen";
import { RulesSheet } from "./RulesSheet";
import { SettingsScreen } from "./SettingsScreen";
import { Sound } from "./Sound";
import { StartScreen } from "./StartScreen";
import "./screens.css";

interface Screen {
  readonly el: HTMLElement;
  destroy(): void;
}

/** ?editor か #editor が付いていたら作問の道具を開く。 */
function wantsEditor(): boolean {
  try {
    if (new URLSearchParams(location.search).has("editor")) return true;
    return location.hash.replace("#", "") === "editor";
  } catch {
    return false;
  }
}

export class App {
  readonly el: HTMLElement;

  #head: HTMLElement;
  #mark: HTMLElement;
  #soundButton: HTMLButtonElement;
  #stage: HTMLElement;
  #config: BoardConfig = DEFAULT_CONFIG;
  /** 対局をまたいで持ち回る。設定はブラウザに残る。 */
  #sound = new Sound();
  /** 保存した棋譜の置き場。 */
  #store = new RecordStore();
  /** 解いた問題の記録。 */
  #progress = new PuzzleProgress();
  /** 作問の画面から足した問題。この端末にだけ残る。 */
  #drafts = new PuzzleDraftStore();

  #screen: Screen | null = null;
  #overlay: Screen | null = null;
  #client: LocalClient | null = null;
  #session: GameSession | null = null;

  constructor() {
    this.el = document.createElement("div");
    this.el.className = "app";

    this.#head = document.createElement("header");
    this.#head.className = "app-head";

    // 題字はスタート画面には大きなものがあるので、そこでは出さない
    this.#mark = document.createElement("div");
    this.#mark.className = "app-head-mark";
    this.#mark.innerHTML = '<span class="app-head-glyph">挟将棋</span><span class="app-head-sub">in a pinch</span>';

    this.#soundButton = document.createElement("button");
    this.#soundButton.type = "button";
    this.#soundButton.className = "btn btn-toggle app-head-sound";
    this.#soundButton.addEventListener("click", () => {
      this.#sound.setEnabled(!this.#sound.enabled);
      this.#syncSound();
    });
    this.#syncSound();

    this.#head.append(this.#mark, this.#soundButton);

    this.#stage = document.createElement("main");
    this.#stage.className = "app-stage";

    this.el.append(this.#head, this.#stage);

    // 作問の道具はどこからも繋がっていない。URL に ?editor を付けたときだけ出る
    if (wantsEditor()) this.#showEditor();
    else this.#showStart();
  }

  #syncSound(): void {
    const on = this.#sound.enabled;
    this.#soundButton.textContent = on ? "音 ON" : "音 OFF";
    this.#soundButton.setAttribute("aria-pressed", String(on));
  }

  /* ---------------- 画面 ---------------- */

  #swap(screen: Screen, showMark: boolean): void {
    this.#closeOverlay();
    this.#screen?.destroy();
    this.#screen = screen;
    this.#mark.hidden = !showMark;
    this.#stage.append(screen.el);
  }

  #showStart(): void {
    this.#endGame();
    this.#swap(
      new StartScreen({
        config: this.#config,
        onPlay: () => this.#showSettings(),
        onRules: () => this.#openRules(),
        onLibrary: () => this.#showLibrary(),
        onPuzzles: () => this.#showPuzzles(),
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
        sound: this.#sound,
        store: this.#store,
        onRematch: () => this.#startGame(config),
        onSettings: () => this.#openSettings(),
        onHome: () => this.#showStart(),
      }),
      true,
    );
  }

  /* ---------------- 棋譜 ---------------- */

  #showLibrary(): void {
    this.#endGame();
    this.#swap(
      new LibraryScreen({
        store: this.#store,
        onPlay: (game) => this.#showReplay(game),
        onBack: () => this.#showStart(),
      }),
      true,
    );
  }

  #showReplay(game: SavedGame): void {
    this.#endGame();
    this.#swap(
      new ReplayScreen({
        game,
        sound: this.#sound,
        onBack: () => this.#showLibrary(),
      }),
      true,
    );
  }

  /* ---------------- 作問 ---------------- */

  #showEditor(): void {
    this.#endGame();
    this.#swap(
      new EditorScreen({
        onAdd: (puzzle) => this.#drafts.add(puzzle),
        onBack: () => this.#showStart(),
      }),
      true,
    );
  }

  /* ---------------- 詰めはさみ ---------------- */

  /** 組み込みの問題と、作問の画面から足した問題。 */
  #allPuzzles(): readonly Puzzle[] {
    return [...PUZZLES, ...this.#drafts.list()];
  }

  #groupOf(plies: number): readonly Puzzle[] {
    return this.#allPuzzles().filter((puzzle) => puzzle.plies === plies);
  }

  /** 手数を選ぶ画面。 */
  #showPuzzles(): void {
    this.#endGame();
    this.#swap(
      new PuzzleMenuScreen({
        puzzles: this.#allPuzzles(),
        progress: this.#progress,
        onSelect: (plies) => this.#showPuzzleList(plies),
        onBack: () => this.#showStart(),
      }),
      true,
    );
  }

  /** その手数の問題一覧。 */
  #showPuzzleList(plies: number): void {
    this.#endGame();

    const screen = new PuzzleListScreen({
      plies,
      puzzles: this.#groupOf(plies),
      progress: this.#progress,
      onOpen: (puzzle) => this.#showPuzzle(puzzle),
      onDelete: (puzzle) => {
        this.#drafts.remove(puzzle.id);
        screen.render(this.#groupOf(plies));
      },
      onBack: () => this.#showPuzzles(),
    });

    this.#swap(screen, true);
  }

  #showPuzzle(puzzle: Puzzle): void {
    this.#endGame();

    // 次の問題は同じ手数の中から選ぶ
    const group = this.#groupOf(puzzle.plies);
    const index = group.findIndex((item) => item.id === puzzle.id);
    const next = index >= 0 ? (group[index + 1] ?? null) : null;

    this.#swap(
      new PuzzleScreen({
        puzzle,
        sound: this.#sound,
        progress: this.#progress,
        next,
        onOpen: (target) => this.#showPuzzle(target),
        onBack: () => this.#showPuzzleList(puzzle.plies),
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
