/**
 * 詰めはさみを解く画面。
 *
 * 攻め方は人、受け方は PuzzleClient が読んで指す。
 * 盤の描画は対局とまったく同じ BoardStage を使い、違うのは操作ボタンと知らせだけ。
 */

import { GameSession } from "../app/GameSession";
import { PuzzleClient } from "../app/PuzzleClient";
import { cellName } from "../core/notation";
import type { Puzzle } from "../core/puzzles";
import { describeLine, findForcedWin } from "../core/solve";
import type { GameState, Move, PieceId, Pos } from "../core/types";
import { BoardStage } from "./BoardStage";
import type { BoardDecor } from "./BoardView";
import type { PuzzleProgress } from "./PuzzleProgress";
import type { Sound } from "./Sound";
import "./puzzle.css";
import "./screens.css";

const samePos = (a: Pos, b: Pos): boolean => a.x === b.x && a.y === b.y;

export interface PuzzleScreenOptions {
  readonly puzzle: Puzzle;
  /** その手数の中で何問目か。1から数える。 */
  readonly number: number;
  readonly sound: Sound;
  readonly progress: PuzzleProgress;
  /** 次の問題。最後の問題なら null。 */
  readonly next: Puzzle | null;
  readonly onOpen: (puzzle: Puzzle) => void;
  readonly onBack: () => void;
}

export class PuzzleScreen {
  readonly el: HTMLElement;

  #options: PuzzleScreenOptions;
  #client: PuzzleClient;
  #session: GameSession;
  #stage: BoardStage;

  #note: HTMLElement;
  #answer: HTMLElement;
  #left: HTMLElement;
  #undoButton: HTMLButtonElement;
  #hintButton: HTMLButtonElement;
  #answerButton: HTMLButtonElement;
  #nextButton: HTMLButtonElement;

  /** 選択中の駒。ui 側だけの状態。 */
  #selectedId: PieceId | null = null;

  constructor(options: PuzzleScreenOptions) {
    this.#options = options;

    this.#client = new PuzzleClient({ puzzle: options.puzzle });
    this.#session = new GameSession(this.#client);
    this.#stage = new BoardStage({
      session: this.#session,
      sound: options.sound,
      decor: (state, lastPieceId) => this.#decor(state, lastPieceId),
      onRendered: () => this.#sync(),
    });

    this.#stage.board.onCellSelect(this.#handleCell);

    const head = document.createElement("div");
    head.className = "puzzle-head";
    const title = document.createElement("p");
    title.className = "puzzle-title";
    title.textContent = `第${options.number}問 · ${options.puzzle.plies}手詰`;
    this.#left = document.createElement("p");
    this.#left.className = "puzzle-left";
    head.append(title, this.#left);

    this.#note = document.createElement("p");
    this.#note.className = "puzzle-note";

    this.#answer = document.createElement("p");
    this.#answer.className = "puzzle-answer";
    this.#answer.hidden = true;

    this.#undoButton = button("待った", () => void this.#undo());
    this.#undoButton.classList.add("btn-danger");
    this.#hintButton = button("ヒント", () => this.#hint());
    this.#answerButton = button("正解", () => this.#showAnswer());
    this.#nextButton = button("次の問題", () => {
      if (options.next !== null) options.onOpen(options.next);
    });
    this.#nextButton.hidden = options.next === null;

    const controls = document.createElement("div");
    controls.className = "controls";
    controls.append(
      this.#undoButton,
      button("最初から", () => this.#restart()),
      this.#hintButton,
      this.#answerButton,
      this.#nextButton,
      button("一覧へ", options.onBack),
    );

    this.el = document.createElement("div");
    this.el.className = "screen play";
    this.el.append(
      head,
      this.#stage.board.el,
      this.#note,
      this.#answer,
      controls,
      this.#stage.record.el,
    );

    this.#stage.render();
  }

  /* ---------------- 入力 ---------------- */

  #handleCell = (pos: Pos): void => {
    const session = this.#session;
    if (!session.canAct) return;

    const state = session.state;

    const selected = this.#selectedPiecePos(state);
    if (selected !== null && session.legalMovesFrom(selected).some((p) => samePos(p, pos))) {
      void this.#submit({ kind: "move", pieceId: this.#selectedId!, to: pos });
      return;
    }

    const pieceId = state.board.get(`${pos.x},${pos.y}`);
    if (pieceId !== undefined) {
      if (session.movablePieceIds().includes(pieceId)) {
        this.#selectedId = this.#selectedId === pieceId ? null : pieceId;
      } else {
        this.#selectedId = null;
        this.#stage.reject();
      }
      this.#stage.render();
      return;
    }

    // 詰めはさみは持ち駒がないので、空きマスは選択を解くだけ
    if (this.#selectedId !== null) {
      this.#selectedId = null;
      this.#stage.render();
    }
  };

  #selectedPiecePos(state: GameState): Pos | null {
    if (this.#selectedId === null) return null;
    return state.pieces.get(this.#selectedId)?.pos ?? null;
  }

  async #submit(move: Move): Promise<void> {
    this.#selectedId = null;
    this.#hideAnswer();

    const result = await this.#session.submit(move);
    if (!result.accepted) {
      this.#stage.reject();
      this.#stage.render();
      return;
    }

    if (this.#client.status === "solved") {
      this.#options.progress.markSolved(this.#options.puzzle.id);
    }
    this.#sync();
  }

  async #undo(): Promise<void> {
    this.#selectedId = null;
    this.#hideAnswer();
    const mark = this.#stage.rewindMark();

    const result = await this.#session.undo();
    if (result.undone) {
      // 受け方の応手ぶんも戻っているので、印をもう1つ戻す
      this.#stage.rewindMark();
      return;
    }

    this.#stage.restoreMark(mark);
    this.#stage.reject();
    this.#stage.render();
  }

  #restart(): void {
    this.#options.onOpen(this.#options.puzzle);
  }

  /**
   * いまの局面からの正解手順を出す。
   * 受け方の読みは実際に指すときと同じなので、この通りに指せばこの通りに進む。
   */
  #showAnswer(): void {
    const line = this.#client.solution();
    this.#answer.hidden = false;

    if (line.length === 0) {
      this.#answer.textContent = "この局面から詰ませる手順はありません。待ったで戻してください。";
      return;
    }

    this.#answer.textContent = `正解  ${describeLine(this.#session.state, line)}`;
  }

  #hideAnswer(): void {
    this.#answer.hidden = true;
    this.#answer.textContent = "";
  }

  #hint(): void {
    const found = findForcedWin(this.#session.state, this.#client.pliesLeft);
    if (found === null) {
      this.#note.textContent = "この局面から詰ませる手はありません。待ったで戻してください。";
      return;
    }

    const move = found.first;
    if (move.kind === "place") {
      this.#note.textContent = `ヒント: ${cellName(move.to)} に打つ`;
      return;
    }

    const piece = this.#session.state.pieces.get(move.pieceId);
    const from = piece === undefined ? "" : `${cellName(piece.pos)}の駒を `;
    this.#note.textContent = `ヒント: ${from}${cellName(move.to)} へ`;
  }

  /* ---------------- 表示 ---------------- */

  #sync(): void {
    const status = this.#client.status;
    const left = this.#client.pliesLeft;

    this.#left.textContent = status === "solved" ? "" : `あと ${left} 手`;
    const over = status === "solved" || status === "failed";
    this.#undoButton.disabled = !this.#session.canUndo;
    this.#hintButton.disabled = over;
    this.#answerButton.disabled = over;

    this.#note.className = "puzzle-note";
    switch (status) {
      case "solved":
        this.#note.classList.add("is-solved");
        this.#note.textContent = "正解。詰みました。";
        this.#options.progress.markSolved(this.#options.puzzle.id);
        break;
      case "offTrack":
        this.#note.classList.add("is-off");
        this.#note.textContent = "この手順では詰みません。待ったで戻せます。";
        break;
      case "failed":
        this.#note.classList.add("is-off");
        this.#note.textContent = "詰ませられませんでした。最初からやり直せます。";
        break;
      case "playing":
        this.#note.textContent = "";
        break;
    }
  }

  #decor(state: GameState, lastPieceId: PieceId | null): BoardDecor {
    const session = this.#session;

    if (!session.canAct) {
      return {
        selectedId: null,
        destinations: [],
        placements: [],
        movableIds: [],
        lastPieceId,
      };
    }

    const selected = this.#selectedPiecePos(state);

    return {
      selectedId: this.#selectedId,
      destinations: selected === null ? [] : session.legalMovesFrom(selected),
      placements: [],
      movableIds: session.movablePieceIds(),
      lastPieceId,
    };
  }

  destroy(): void {
    this.#stage.destroy();
    this.#session.dispose();
    this.#client.dispose();
    this.el.remove();
  }
}

function button(label: string, onClick: () => void): HTMLButtonElement {
  const el = document.createElement("button");
  el.type = "button";
  el.className = "btn";
  el.textContent = label;
  el.addEventListener("click", onClick);
  return el;
}
