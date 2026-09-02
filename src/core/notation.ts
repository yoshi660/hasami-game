/**
 * 棋譜の表記。
 *
 * 純粋関数のみ。盤の見た目にも棋譜の書き出しにも同じ表記を使うので、
 * ここを直せば両方が揃う。
 */

import type { MoveRecord, Outcome, Player, Pos } from "./types";

/** 先手・後手の印。 */
export const SIDE_MARK: Record<Player, string> = { A: "▲", B: "△" };

/** 側の名前。 */
export const SIDE_NAME: Record<Player, string> = { A: "螺鈿", B: "黒漆" };

/** 列の記号。左から A, B, C... */
export function columnLabel(x: number): string {
  return String.fromCharCode(65 + x);
}

/** マスの名前。左上が A1。 */
export function cellName(pos: Pos): string {
  return `${columnLabel(pos.x)}${pos.y + 1}`;
}

/** 手そのもの。打ちは「打 D4」、移動は「E4→D4」。 */
export function moveText(record: MoveRecord): string {
  if (record.from === null) return `打 ${cellName(record.to)}`;
  return `${cellName(record.from)}→${cellName(record.to)}`;
}

/**
 * その手で起きたこと。何も起きていなければ空文字。
 * 封じの成立、自分から挟まれたこと、封じが解けたことを並べる。
 */
export function noteText(record: MoveRecord): string {
  const notes: string[] = [];
  if (record.released) notes.push("解除");
  if (record.sealed.length > 0) notes.push(`封じ${record.sealed.length}`);
  if (record.selfSealed) notes.push("自封");
  return notes.join(" ");
}

/** 決着の理由。 */
export function outcomeText(outcome: Outcome): string {
  if (outcome.kind === "draw") return "同一局面が3回で引き分け";

  const winner = SIDE_NAME[outcome.winner];
  switch (outcome.reason) {
    case "sealedPieceStuck":
      return `封じられた駒が動けず ${winner}の勝ち`;
    case "noLegalMove":
      return `指せる手がなく ${winner}の勝ち`;
    case "overConnected":
      return `4つつなげて ${winner}の勝ち`;
  }
}

/** 棋譜の1行。「12 △ E4→D4 封じ1」 */
export function recordLine(record: MoveRecord): string {
  const note = noteText(record);
  const head = `${record.ply} ${SIDE_MARK[record.player]} ${moveText(record)}`;
  return note === "" ? head : `${head} ${note}`;
}
