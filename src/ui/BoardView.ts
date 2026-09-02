/**
 * 盤面の描画。
 *
 * 局面と「飾り」を受け取って DOM を合わせるだけ。ルールも入力の解釈も持たない。
 * 駒の DOM は PieceId で引ける Map に持つので、駒が動いても同じ要素が動き続ける
 * （設計ルール1。要素を作り直すとアニメーションが切れる）。
 *
 * 動きの指定は CSS 側にある。ここでやるのは transform の値とクラスの差し替えだけで、
 * フレームは一切計算しない（設計ルール6）。
 */

import { SIDE_NAME, cellName, columnLabel } from "../core/notation";
import type { BoardConfig, GameState, Outcome, Piece, PieceId, Pos } from "../core/types";
import "./board.css";

/** 盤に重ねる印。すべて ui 側の状態で、GameState には入れない（設計ルール3）。 */
export interface BoardDecor {
  /** 選択中の駒。 */
  readonly selectedId: PieceId | null;
  /** 選択中の駒の行き先。 */
  readonly destinations: readonly Pos[];
  /** 持ち駒を打てるマス。 */
  readonly placements: readonly Pos[];
  /** つまめる駒。 */
  readonly movableIds: readonly PieceId[];
  /** 直前に動いた駒。 */
  readonly lastPieceId: PieceId | null;
}

/** 挟みが成立した2マスを結ぶ線。壁側は盤の外の座標が入る。 */
export interface FlankLine {
  readonly from: Pos;
  readonly to: Pos;
}

/** 1手のあいだだけ走る演出。 */
export interface BoardEffects {
  /** 打たれた駒。盤に落ちる動き。 */
  readonly droppedId: PieceId | null;
  /** この手で新たに封じられた駒。 */
  readonly sealedIds: readonly PieceId[];
  /** 挟みの線。 */
  readonly flanks: readonly FlankLine[];
}

const SVG_NS = "http://www.w3.org/2000/svg";

const cellKey = (pos: Pos): string => `${pos.x},${pos.y}`;

export type CellListener = (pos: Pos) => void;
export type Unsubscribe = () => void;

export class BoardView {
  readonly el: HTMLElement;

  #config: BoardConfig;
  #board: HTMLElement;
  #grid: HTMLElement;
  #pieceLayer: HTMLElement;
  #fxLayer: HTMLElement;
  #fxSvg: SVGSVGElement;
  #cells: HTMLButtonElement[] = [];
  #pieces = new Map<PieceId, HTMLElement>();
  #verdictNodes: HTMLElement[] = [];
  #listeners = new Set<CellListener>();

  constructor(config: BoardConfig) {
    this.#config = config;

    this.el = document.createElement("div");
    this.el.className = "board-frame";

    this.el.append(
      this.#buildRail("rail-top", config.cols, columnLabel),
      this.#buildRail("rail-left", config.rows, (i) => String(i + 1)),
    );

    this.#board = document.createElement("div");
    this.#board.className = "board";
    this.#board.style.setProperty("--cols", String(config.cols));
    this.#board.style.setProperty("--rows", String(config.rows));

    this.#grid = document.createElement("div");
    this.#grid.className = "grid";
    this.#grid.setAttribute("role", "grid");
    this.#grid.setAttribute("aria-label", "盤面");
    this.#buildCells();

    this.#pieceLayer = document.createElement("div");
    this.#pieceLayer.className = "layer pieces";

    this.#fxLayer = document.createElement("div");
    this.#fxLayer.className = "layer fx";
    this.#fxSvg = document.createElementNS(SVG_NS, "svg");
    this.#fxSvg.setAttribute("class", "fx-svg");
    this.#fxLayer.append(this.#fxSvg);

    this.#board.append(this.#grid, this.#pieceLayer, this.#fxLayer);
    this.el.append(this.#board);

    this.#grid.addEventListener("click", this.#handleClick);
  }

  /* ---------------- 組み立て ---------------- */

  #buildRail(className: string, count: number, label: (i: number) => string): HTMLElement {
    const rail = document.createElement("div");
    rail.className = `rail ${className}`;
    rail.setAttribute("aria-hidden", "true");
    for (let i = 0; i < count; i++) {
      const span = document.createElement("span");
      span.textContent = label(i);
      rail.append(span);
    }
    return rail;
  }

  #buildCells(): void {
    const { cols, rows } = this.#config;
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const cell = document.createElement("button");
        cell.type = "button";
        cell.className = "cell";
        if (x === cols - 1) cell.classList.add("edge-right");
        if (y === rows - 1) cell.classList.add("edge-bottom");
        cell.dataset.x = String(x);
        cell.dataset.y = String(y);
        cell.tabIndex = -1;
        cell.setAttribute("role", "gridcell");
        this.#cells.push(cell);
        this.#grid.append(cell);
      }
    }
  }

  /* ---------------- 入力 ---------------- */

  #handleClick = (event: MouseEvent): void => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const cell = target.closest<HTMLElement>(".cell");
    if (cell === null || cell.dataset.x === undefined || cell.dataset.y === undefined) return;

    const pos: Pos = { x: Number(cell.dataset.x), y: Number(cell.dataset.y) };
    for (const listener of [...this.#listeners]) listener(pos);
  };

  /** マスが押されたときに呼ばれる。押せないマスも通すので、判断は呼び出し側で行う。 */
  onCellSelect(listener: CellListener): Unsubscribe {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  /* ---------------- 描画 ---------------- */

  render(state: GameState, decor: BoardDecor): void {
    this.#renderPieces(state, decor);
    this.#renderCells(state, decor);
  }

  #renderPieces(state: GameState, decor: BoardDecor): void {
    const movable = new Set(decor.movableIds);

    // 盤から消えた駒（この対局では起きないが、途中局面の差し替えに備える）
    for (const [id, el] of this.#pieces) {
      if (!state.pieces.has(id)) {
        el.remove();
        this.#pieces.delete(id);
      }
    }

    for (const piece of state.pieces.values()) {
      let el = this.#pieces.get(piece.id);

      if (el === undefined) {
        el = this.#createPiece(piece);
        // DOM に入れる前に置き場所を決める。あとから動かすと (0,0) から滑ってしまう
        el.style.transform = this.#translate(piece.pos);
        this.#pieceLayer.append(el);
        this.#pieces.set(piece.id, el);
      } else {
        // 前の手の一度きりの演出を落としてから、今の状態を反映する
        el.classList.remove("just-dropped", "just-sealed");
        el.style.transform = this.#translate(piece.pos);
      }

      el.classList.toggle("is-sealed", piece.sealed);
      el.classList.toggle("is-selected", piece.id === decor.selectedId);
      el.classList.toggle("is-movable", movable.has(piece.id));
      el.classList.toggle("is-last", piece.id === decor.lastPieceId);
      el.setAttribute("aria-label", this.#pieceLabel(piece));
    }
  }

  #createPiece(piece: Piece): HTMLElement {
    const el = document.createElement("div");
    el.className = `piece p-${piece.owner}`;
    el.dataset.pieceId = String(piece.id);
    el.setAttribute("role", "img");

    const disc = document.createElement("span");
    disc.className = "disc";
    el.append(disc);

    return el;
  }

  #pieceLabel(piece: Piece): string {
    return `${cellName(piece.pos)} ${SIDE_NAME[piece.owner]}${piece.sealed ? " 封じ" : ""}`;
  }

  #translate(pos: Pos): string {
    return `translate(${pos.x * 100}%, ${pos.y * 100}%)`;
  }

  #renderCells(state: GameState, decor: BoardDecor): void {
    const destinations = new Set(decor.destinations.map(cellKey));
    const placements = new Set(decor.placements.map(cellKey));
    const movable = new Set(decor.movableIds);

    for (let i = 0; i < this.#cells.length; i++) {
      const cell = this.#cells[i];
      const pos: Pos = { x: i % this.#config.cols, y: Math.floor(i / this.#config.cols) };
      const key = cellKey(pos);

      const pieceId = state.board.get(`${pos.x},${pos.y}`);
      const isDestination = destinations.has(key);
      const isHot =
        isDestination ||
        placements.has(key) ||
        (pieceId !== undefined && movable.has(pieceId));

      cell.classList.toggle("is-dest", isDestination);
      cell.classList.toggle("is-hot", isHot);
      cell.tabIndex = isHot ? 0 : -1;
      cell.setAttribute("aria-label", this.#cellLabel(pos, state));
      cell.setAttribute("aria-disabled", String(!isHot));
    }
  }

  #cellLabel(pos: Pos, state: GameState): string {
    const pieceId = state.board.get(`${pos.x},${pos.y}`);
    if (pieceId === undefined) return `${cellName(pos)} 空き`;
    const piece = state.pieces.get(pieceId);
    return piece === undefined ? cellName(pos) : this.#pieceLabel(piece);
  }

  /* ---------------- 演出 ---------------- */

  /** 1手ぶんの一度きりの演出。render のあとに呼ぶ。 */
  playEffects(effects: BoardEffects): void {
    if (effects.droppedId === null && effects.sealedIds.length === 0 && effects.flanks.length === 0) {
      return;
    }

    // render() で外した一度きりのクラスを、ここで一度ブラウザに確定させる。
    // 外してすぐ付け直すと同じフレームにまとめられ、
    // 同じ駒が続けて封じられたときに動きが走らない
    void this.el.offsetWidth;

    if (effects.droppedId !== null) {
      this.#pieces.get(effects.droppedId)?.classList.add("just-dropped");
    }

    for (const id of effects.sealedIds) {
      const el = this.#pieces.get(id);
      if (el === undefined) continue;
      el.classList.add("just-sealed");
      this.#ripple(el, "shu");
    }

    for (const flank of effects.flanks) this.#drawFlank(flank);
  }

  /**
   * 波紋。駒の要素の中に入れるので、位置を計算しなくても駒の真上に出る。
   * 消えたら自分で外れる。
   */
  #ripple(pieceEl: HTMLElement, variant?: "shu"): void {
    const ring = document.createElement("span");
    ring.className = variant === undefined ? "ring" : `ring ${variant}`;
    pieceEl.append(ring);
    ring.addEventListener("animationend", () => ring.remove(), { once: true });
  }

  #drawFlank(flank: FlankLine): void {
    const from = this.#center(flank.from);
    const to = this.#center(flank.to);

    const line = document.createElementNS(SVG_NS, "line");
    line.setAttribute("class", "flank-line");
    line.setAttribute("x1", `${from.x}%`);
    line.setAttribute("y1", `${from.y}%`);
    line.setAttribute("x2", `${to.x}%`);
    line.setAttribute("y2", `${to.y}%`);
    line.setAttribute("pathLength", "1");

    this.#fxSvg.append(line);
    line.addEventListener("animationend", (event) => {
      if ((event as AnimationEvent).animationName === "flank-fade") line.remove();
    });
  }

  /** マスの中心を盤に対する百分率で返す。盤外の座標も扱える。 */
  #center(pos: Pos): { x: number; y: number } {
    return {
      x: ((pos.x + 0.5) / this.#config.cols) * 100,
      y: ((pos.y + 0.5) / this.#config.rows) * 100,
    };
  }

  /** 弾いた手を伝える。 */
  shake(): void {
    this.el.classList.remove("is-shaking");
    // 同じクラスを付け直しても animation は走らないので、レイアウトを一度読ませる
    void this.el.offsetWidth;
    this.el.classList.add("is-shaking");
  }

  /* ---------------- 決着 ---------------- */

  /**
   * 決着を出す。
   *
   * highlight には負けの原因になった駒（4つつながった塊）を渡す。
   * その駒だけを幕の上に出して光らせ、ほかを沈める。
   */
  showVerdict(outcome: Outcome, highlight: readonly PieceId[] = []): void {
    this.clearVerdict();

    this.#board.classList.add("has-verdict");
    if (highlight.length > 0) {
      this.#board.classList.add("has-verdict-group");
      for (const id of highlight) this.#pieces.get(id)?.classList.add("is-verdict");
    }

    // 幕と文字を別の要素にして、駒を挟んで重ねる。
    // 幕 → 負けの塊 → 文字 の順に見えるようにするため
    const veil = document.createElement("div");
    veil.className = "verdict-veil";

    const el = document.createElement("div");
    el.className = "verdict";
    el.setAttribute("role", "status");

    const title = document.createElement("p");
    title.className = "verdict-title";
    const reason = document.createElement("p");
    reason.className = "verdict-reason";

    if (outcome.kind === "draw") {
      title.textContent = "引き分け";
      reason.textContent = "同一局面が3回";
    } else {
      title.textContent = `${SIDE_NAME[outcome.winner]}の勝ち`;
      reason.textContent = VERDICT_REASON[outcome.reason];
    }

    el.append(title, reason);
    this.#board.append(veil, el);
    this.#verdictNodes = [veil, el];
  }

  clearVerdict(): void {
    this.#board.classList.remove("has-verdict", "has-verdict-group");
    for (const el of this.#pieces.values()) el.classList.remove("is-verdict");
    for (const node of this.#verdictNodes) node.remove();
    this.#verdictNodes = [];
  }

  destroy(): void {
    this.#grid.removeEventListener("click", this.#handleClick);
    this.#listeners.clear();
    this.#pieces.clear();
    this.el.remove();
  }
}

const VERDICT_REASON: Record<string, string> = {
  sealedPieceStuck: "封じられた駒が動けない",
  noLegalMove: "指せる手がない",
  overConnected: "自分の駒を4つつなげた",
};
