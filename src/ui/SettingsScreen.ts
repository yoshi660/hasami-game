/**
 * 対局設定。盤の大きさ・移動できる距離・持ち駒の数を決めて対局に入る。
 *
 * 決めた設定は BoardConfig にまとめて渡すだけ。ルールの判断はここではしない。
 */

import type { BoardConfig } from "../core/types";
import "./screens.css";

export interface SettingsScreenOptions {
  readonly config: BoardConfig;
  readonly onStart: (config: BoardConfig) => void;
  readonly onBack: () => void;
  /** 対局中から開いたときの表示。文言と戻り先が変わる。 */
  readonly duringGame?: boolean;
}

interface FieldSpec {
  readonly label: string;
  readonly hint: string;
  readonly values: readonly number[];
  readonly read: (config: BoardConfig) => number;
  readonly write: (config: BoardConfig, value: number) => BoardConfig;
}

const FIELDS: readonly FieldSpec[] = [
  {
    label: "盤の大きさ",
    hint: "大きいほど逃げ場が増える",
    values: [5, 7, 9],
    read: (config) => config.cols,
    write: (config, value) => ({ ...config, cols: value, rows: value }),
  },
  {
    label: "移動できる距離",
    hint: "長いほど攻めが速くなる。挟みは1マスのまま",
    values: [1, 2, 3],
    read: (config) => config.moveRange,
    write: (config, value) => ({ ...config, moveRange: value }),
  },
  {
    label: "持ち駒の数",
    hint: "少ないほど塊を作りにくい",
    values: [6, 8, 12],
    read: (config) => config.handSize,
    write: (config, value) => ({ ...config, handSize: value }),
  },
];

export class SettingsScreen {
  readonly el: HTMLElement;

  #config: BoardConfig;
  #segments: { spec: FieldSpec; buttons: HTMLButtonElement[] }[] = [];

  constructor(options: SettingsScreenOptions) {
    this.#config = options.config;

    this.el = document.createElement("div");
    this.el.className = "screen settings";

    const title = document.createElement("h2");
    title.className = "sheet-title";
    title.textContent = "対局設定";

    const lede = document.createElement("p");
    lede.className = "sheet-lede";
    lede.textContent = options.duringGame === true
      ? "変えると新しい対局が始まります"
      : "決めたら対局が始まります";

    this.el.append(title, lede);
    for (const spec of FIELDS) this.el.append(this.#buildField(spec));

    const foot = document.createElement("div");
    foot.className = "sheet-foot";

    const back = document.createElement("button");
    back.type = "button";
    back.className = "btn";
    back.textContent = options.duringGame === true ? "やめる" : "もどる";
    back.addEventListener("click", options.onBack);

    const start = document.createElement("button");
    start.type = "button";
    start.className = "btn";
    start.textContent = "この設定で始める";
    start.addEventListener("click", () => options.onStart(this.#config));

    foot.append(back, start);
    this.el.append(foot);
  }

  #buildField(spec: FieldSpec): HTMLElement {
    const field = document.createElement("div");
    field.className = "field";

    const text = document.createElement("div");
    const label = document.createElement("span");
    label.className = "field-label";
    label.textContent = spec.label;
    const hint = document.createElement("span");
    hint.className = "field-hint";
    hint.textContent = spec.hint;
    text.append(label, hint);

    const seg = document.createElement("div");
    seg.className = "seg";
    seg.setAttribute("role", "radiogroup");
    seg.setAttribute("aria-label", spec.label);

    const buttons = spec.values.map((value) => {
      const button = document.createElement("button");
      button.type = "button";
      button.setAttribute("role", "radio");
      button.textContent = String(value);
      button.addEventListener("click", () => {
        this.#config = spec.write(this.#config, value);
        this.#syncSegments();
      });
      seg.append(button);
      return button;
    });

    this.#segments.push({ spec, buttons });
    field.append(text, seg);
    return field;
  }

  #syncSegments(): void {
    for (const { spec, buttons } of this.#segments) {
      const current = spec.read(this.#config);
      buttons.forEach((button, i) => {
        button.setAttribute("aria-checked", String(spec.values[i] === current));
      });
    }
  }

  /** 表示前に一度呼んで、いまの設定を反映させる。 */
  render(): void {
    this.#syncSegments();
  }

  destroy(): void {
    this.el.remove();
  }
}
