/**
 * 手番と持ち駒の表示。
 *
 * 局面を受け取って表示を合わせるだけ。ルールも入力も持たない。
 */

import { SIDE_NAME, SIDE_ROLE } from "../core/notation";
import type { BoardConfig, GameState, Player } from "../core/types";
import "./status.css";

interface SideElements {
  readonly root: HTMLElement;
  readonly count: HTMLElement;
  readonly dots: readonly HTMLElement[];
  readonly alert: HTMLElement;
}

export class StatusView {
  readonly el: HTMLElement;

  #sides: Record<Player, SideElements>;

  constructor(config: BoardConfig) {
    this.el = document.createElement("div");
    this.el.className = "status";

    this.#sides = {
      A: this.#buildSide("A", config.handSize),
      B: this.#buildSide("B", config.handSize),
    };

    this.el.append(this.#sides.A.root, this.#sides.B.root);
  }

  #buildSide(player: Player, handSize: number): SideElements {
    const root = document.createElement("section");
    root.className = `side side-${player.toLowerCase()}`;

    const role = document.createElement("p");
    role.className = "side-role";
    role.textContent = SIDE_ROLE[player];

    const name = document.createElement("p");
    name.className = "side-name";
    name.textContent = SIDE_NAME[player];

    const turn = document.createElement("p");
    turn.className = "side-turn";
    turn.textContent = "手番";

    const head = document.createElement("div");
    head.className = "stock-head";
    const label = document.createElement("span");
    label.textContent = "持ち駒";
    const count = document.createElement("span");
    count.className = "stock-count";
    head.append(label, count);

    const dotsRow = document.createElement("div");
    dotsRow.className = "stock-dots";
    const dots: HTMLElement[] = [];
    for (let i = 0; i < handSize; i++) {
      const dot = document.createElement("span");
      dot.className = "stock-dot";
      dots.push(dot);
      dotsRow.append(dot);
    }

    const alert = document.createElement("p");
    alert.className = "side-alert";
    alert.textContent = "封じられた駒がある。次の手番でその駒を動かすこと。";

    root.append(role, name, turn, head, dotsRow, alert);

    return { root, count, dots, alert };
  }

  render(state: GameState): void {
    for (const player of ["A", "B"] as const) {
      const side = this.#sides[player];
      const hand = state.hands[player];

      side.root.classList.toggle("is-active", state.turn === player && state.outcome === null);
      side.count.textContent = String(hand);

      // 使った分から先に消していく
      side.dots.forEach((dot, i) => {
        dot.classList.toggle("is-spent", i >= hand);
      });

      const sealed = [...state.pieces.values()].some(
        (piece) => piece.owner === player && piece.sealed,
      );
      side.alert.classList.toggle("is-on", sealed);
    }
  }

  destroy(): void {
    this.el.remove();
  }
}
