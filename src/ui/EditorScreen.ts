/**
 * 作問の道具。開発者だけが使う。
 *
 * 盤を押して駒を並べ、その場で詰みを読ませ、
 * src/core/puzzles.ts に貼れる形で書き出す。
 *
 * 公開の手順:
 *   1. ここで局面を作り「読む」で ちょうど N 手詰め・答えが1通り を確かめる
 *   2. 「書き出す」の中身を src/core/puzzles.ts の PUZZLES に貼る
 *   3. npm test（puzzles.test.ts が同じことをもう一度確かめる）
 *   4. main に push すると GitHub Pages に出る
 *
 * この画面はどこからも繋がっていない。URL に ?editor を付けたときだけ出る。
 */

import { parseDiagram, toDiagram } from "../core/diagram";
import { cellName } from "../core/notation";
import { allLegalMoves, applyMove } from "../core/rules";
import { canForceWin, findForcedWin } from "../core/solve";
import type { GameState, Move, Player, Pos } from "../core/types";
import { BoardView } from "./BoardView";
import "./editor.css";
import "./screens.css";

/** 押すたびにこの順で変わる。 */
const CYCLE = [".", "A", "B", "a", "b"] as const;

/** 読む手数の上限。これを超える問題は重くなるので作らせない。 */
const MAX_PLIES = 7;

export interface EditorScreenOptions {
  readonly onBack: () => void;
}

export class EditorScreen {
  readonly el: HTMLElement;

  #rows: string[][] = [];
  #size = 5;
  #turn: Player = "A";
  #moveRange = 1;

  #boardHolder: HTMLElement;
  #board: BoardView | null = null;
  #report: HTMLElement;
  #output: HTMLTextAreaElement;
  #titleInput: HTMLInputElement;
  #idInput: HTMLInputElement;

  constructor(options: EditorScreenOptions) {
    this.el = document.createElement("div");
    this.el.className = "screen editor";

    const title = document.createElement("h2");
    title.className = "sheet-title";
    title.textContent = "作問";

    const lede = document.createElement("p");
    lede.className = "sheet-lede";
    lede.textContent = "盤を押して駒を並べ、読ませてから書き出す";

    this.#boardHolder = document.createElement("div");
    this.#boardHolder.className = "editor-board";

    this.#report = document.createElement("p");
    this.#report.className = "editor-report";

    this.#output = document.createElement("textarea");
    this.#output.className = "editor-output";
    this.#output.rows = 11;
    this.#output.readOnly = true;
    this.#output.spellcheck = false;

    this.#idInput = textField("id", "kabe-1");
    this.#titleInput = textField("題名", "壁に押し付ける");

    this.el.append(title, lede, this.#fields(), this.#boardHolder, this.#actions(options), this.#report, this.#output);

    this.#resize(this.#size);
  }

  /* ---------------- 設定 ---------------- */

  #fields(): HTMLElement {
    const wrap = document.createElement("div");
    wrap.className = "editor-fields";

    wrap.append(
      segment("盤の大きさ", [5, 7, 9], () => this.#size, (value) => this.#resize(value)),
      segment("移動できる距離", [1, 2, 3], () => this.#moveRange, (value) => {
        this.#moveRange = value;
        this.#render();
      }),
      choice("攻め方", [
        ["A", "先手 黒"],
        ["B", "後手 白"],
      ], () => this.#turn, (value) => {
        this.#turn = value;
        this.#render();
      }),
    );

    const names = document.createElement("div");
    names.className = "editor-names";
    names.append(this.#idInput.parentElement!, this.#titleInput.parentElement!);
    wrap.append(names);

    return wrap;
  }

  #actions(options: EditorScreenOptions): HTMLElement {
    const row = document.createElement("div");
    row.className = "controls";

    row.append(
      button("読む", () => this.#solve()),
      button("書き出す", () => this.#emit()),
      button("写す", () => void this.#copy()),
      button("すべて消す", () => this.#resize(this.#size)),
      button("トップへ", options.onBack),
    );

    return row;
  }

  /* ---------------- 盤 ---------------- */

  #resize(size: number): void {
    this.#size = size;
    this.#rows = Array.from({ length: size }, () => Array.from({ length: size }, () => "."));

    this.#board?.destroy();
    this.#board = new BoardView({
      cols: size,
      rows: size,
      moveRange: this.#moveRange,
      handSize: 0,
      connectLimit: 4,
    });
    this.#board.onCellSelect(this.#handleCell);
    this.#boardHolder.replaceChildren(this.#board.el);

    this.#render();
  }

  #handleCell = (pos: Pos): void => {
    const current = this.#rows[pos.y][pos.x];
    const index = CYCLE.indexOf(current as (typeof CYCLE)[number]);
    this.#rows[pos.y][pos.x] = CYCLE[(index + 1) % CYCLE.length];
    this.#render();
  };

  /** いまの盤から局面を作る。読めない並びなら null。 */
  #state(): GameState | null {
    try {
      return parseDiagram(this.#rows.map((row) => row.join("")), {
        turn: this.#turn,
        hands: { A: 0, B: 0 },
        moveRange: this.#moveRange,
        handSize: 0,
      });
    } catch {
      return null;
    }
  }

  #render(): void {
    const state = this.#state();
    if (state === null || this.#board === null) return;

    this.#board.render(state, {
      selectedId: null,
      destinations: [],
      placements: [],
      movableIds: [],
      lastPieceId: null,
    });
  }

  /* ---------------- 読む ---------------- */

  #solve(): void {
    const state = this.#state();
    if (state === null) {
      this.#say("盤が読めません", true);
      return;
    }
    if (state.pieces.size === 0) {
      this.#say("駒がありません", true);
      return;
    }
    if (allLegalMoves(state).length === 0) {
      this.#say("この局面では指せる手がありません", true);
      return;
    }

    const found = findForcedWin(state, MAX_PLIES);
    if (found === null) {
      this.#say(`${MAX_PLIES}手以内の詰みは見つかりません`, true);
      return;
    }

    const answers = this.#firstMoves(state, found.plies);
    const first = describe(state, found.first);

    if (answers.length === 1) {
      this.#say(`ちょうど ${found.plies}手詰。答えは1通り（${first}）。問題にできます。`, false);
    } else {
      this.#say(
        `${found.plies}手詰ですが、最初の一手が ${answers.length} 通りあります（例 ${first}）。` +
          "答えが定まらないので、駒を足すか動かしてください。",
        true,
      );
    }
  }

  /** ちょうど plies 手で詰ませられる最初の一手。 */
  #firstMoves(state: GameState, plies: number): Move[] {
    const attacker = state.turn;
    const winning: Move[] = [];

    for (const move of allLegalMoves(state)) {
      const applied = applyMove(state, move);
      if ("error" in applied) continue;
      if (canForceWin(applied.state, plies - 1, attacker)) winning.push(move);
    }

    return winning;
  }

  #say(message: string, bad: boolean): void {
    this.#report.textContent = message;
    this.#report.classList.toggle("is-bad", bad);
  }

  /* ---------------- 書き出す ---------------- */

  #emit(): void {
    const state = this.#state();
    if (state === null) {
      this.#say("盤が読めません", true);
      return;
    }

    const found = findForcedWin(state, MAX_PLIES);
    const plies = found?.plies ?? 0;
    const rows = toDiagram(state)
      .map((row) => `"${row}"`)
      .join(", ");

    const id = this.#idInput.value.trim() || "id-here";
    const title = this.#titleInput.value.trim() || "題名";

    this.#output.value = [
      "  {",
      `    id: "${id}",`,
      `    title: "${title}",`,
      `    plies: ${plies},`,
      `    rows: [${rows}],`,
      `    turn: "${this.#turn}",`,
      "    hands: NO_HANDS,",
      `    moveRange: ${this.#moveRange},`,
      "  },",
    ].join("\n");

    if (found === null) {
      this.#say("詰みが見つからないので plies が 0 のままです。直してから貼ってください。", true);
    } else {
      this.#say("src/core/puzzles.ts の PUZZLES に貼って、npm test を通してください。", false);
    }
  }

  async #copy(): Promise<void> {
    if (this.#output.value === "") this.#emit();

    try {
      await navigator.clipboard.writeText(this.#output.value);
      this.#say("写しました", false);
    } catch {
      // 権限がない場合は選択だけしておく
      this.#output.select();
      this.#say("選択しました。手で写してください。", true);
    }
  }

  destroy(): void {
    this.#board?.destroy();
    this.el.remove();
  }
}

/* ---------------- 部品 ---------------- */

function button(label: string, onClick: () => void): HTMLButtonElement {
  const el = document.createElement("button");
  el.type = "button";
  el.className = "btn";
  el.textContent = label;
  el.addEventListener("click", onClick);
  return el;
}

function textField(label: string, placeholder: string): HTMLInputElement {
  const wrap = document.createElement("label");
  wrap.className = "editor-field";

  const text = document.createElement("span");
  text.textContent = label;

  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = placeholder;

  wrap.append(text, input);
  return input;
}

function segment(
  label: string,
  values: readonly number[],
  read: () => number,
  write: (value: number) => void,
): HTMLElement {
  return choice(
    label,
    values.map((value) => [value, String(value)] as const),
    read,
    write,
  );
}

function choice<T extends string | number>(
  label: string,
  options: ReadonlyArray<readonly [T, string]>,
  read: () => T,
  write: (value: T) => void,
): HTMLElement {
  const field = document.createElement("div");
  field.className = "field";

  const text = document.createElement("span");
  text.className = "field-label";
  text.textContent = label;

  const seg = document.createElement("div");
  seg.className = "seg";
  seg.setAttribute("role", "radiogroup");
  seg.setAttribute("aria-label", label);

  const buttons = options.map(([value, caption]) => {
    const el = document.createElement("button");
    el.type = "button";
    el.setAttribute("role", "radio");
    el.textContent = caption;
    el.addEventListener("click", () => {
      write(value);
      sync();
    });
    seg.append(el);
    return [el, value] as const;
  });

  const sync = (): void => {
    const current = read();
    for (const [el, value] of buttons) {
      el.setAttribute("aria-checked", String(value === current));
    }
  };
  sync();

  field.append(text, seg);
  return field;
}

function describe(state: GameState, move: Move): string {
  if (move.kind === "place") return `打 ${cellName(move.to)}`;
  const piece = state.pieces.get(move.pieceId);
  const from = piece === undefined ? "" : cellName(piece.pos);
  return `${from}→${cellName(move.to)}`;
}
