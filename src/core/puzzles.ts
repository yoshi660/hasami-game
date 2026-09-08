/**
 * 詰めはさみの問題。
 *
 * 「攻め方が指し始めて、相手がどう受けても N 手で必ず勝つ」局面を並べる。
 *
 * 局面は core/diagram.ts の書き方で持つ。持ち駒は 0 にしてある。
 * 打つ手が混ざると読む手が一気に増えて、答え合わせも受け方の応手も重くなるため。
 *
 * ここに並べたものは puzzles.test.ts が「ちょうど N 手詰め」であることと
 * 「最初の一手が1通りしかない」ことを毎回確かめる。
 * 手で書き足したものが成り立っていなければ、テストが落ちて気づける。
 *
 * 題名は盤の見た目を指すだけで、解き方は明かさない。
 */

import { parseDiagram } from "./diagram";
import type { GameState, Player } from "./types";

export interface Puzzle {
  readonly id: string;
  readonly title: string;
  /** 何手で詰むか。奇数。 */
  readonly plies: number;
  /** 盤の並び。"." 空き / "A" 黒 / "a" 黒の封じ / "B" 白 / "b" 白の封じ */
  readonly rows: readonly string[];
  /** 攻め方。最初の手番。 */
  readonly turn: Player;
  /** 残りの持ち駒。詰めはさみは 0。 */
  readonly hands: Readonly<Record<Player, number>>;
  /** 1手で動ける距離。 */
  readonly moveRange: number;
}

/** 問題の開始局面を作る。 */
export function puzzleState(puzzle: Puzzle): GameState {
  return parseDiagram(puzzle.rows, {
    turn: puzzle.turn,
    hands: puzzle.hands,
    moveRange: puzzle.moveRange,
    // 持ち駒は使わないので、手番表示に空の丸を並べない
    handSize: 0,
  });
}

const NO_HANDS = { A: 0, B: 0 } as const;

export const PUZZLES: readonly Puzzle[] = [
  /* ---------------- 1手 ---------------- */
  {
    id: "kabe-1",
    title: "壁に押し付ける",
    plies: 1,
    rows: ["B.A", "A..", "..."],
    turn: "A",
    hands: NO_HANDS,
    moveRange: 1,
  },
  {
    id: "hidarishita-1",
    title: "左下をふさぐ",
    plies: 1,
    rows: ["B..A.", "BA...", "....A", ".....", ".A.B."],
    turn: "A",
    hands: NO_HANDS,
    moveRange: 1,
  },
  {
    id: "futatsu-1",
    title: "二つで挟む",
    plies: 1,
    rows: [".B...", ".....", "AA...", "....A", "BB..."],
    turn: "A",
    hands: NO_HANDS,
    moveRange: 1,
  },
  {
    id: "obankado-1",
    title: "大盤の角",
    plies: 1,
    rows: ["BB.....", ".A.....", "...A...", ".......", "A......", ".......", "......."],
    turn: "A",
    hands: NO_HANDS,
    moveRange: 1,
  },
  {
    id: "obanue-1",
    title: "大盤の上辺",
    plies: 1,
    rows: [".....BB", "..A..A.", ".......", "...A...", ".......", ".......", "......."],
    turn: "A",
    hands: NO_HANDS,
    moveRange: 1,
  },

  /* ---------------- 3手 ---------------- */
  {
    id: "sumi-3",
    title: "隅に追う",
    plies: 3,
    rows: ["...AB", "..AB.", "....A", ".....", "B...."],
    turn: "A",
    hands: NO_HANDS,
    moveRange: 1,
  },
  {
    id: "yoko-3",
    title: "横から寄せる",
    plies: 3,
    rows: [".....", "..A..", "..ABB", "....B", "...A."],
    turn: "A",
    hands: NO_HANDS,
    moveRange: 1,
  },
  {
    id: "hidari-3",
    title: "左辺を締める",
    plies: 3,
    rows: ["A.B..", ".A...", "..B.B", "..A.B", "...A."],
    turn: "A",
    hands: NO_HANDS,
    moveRange: 1,
  },
  {
    id: "chirabaru-3",
    title: "散らばる石",
    plies: 3,
    rows: ["..B..", ".....", ".A..A", "A....", ".BB.."],
    turn: "A",
    hands: NO_HANDS,
    moveRange: 1,
  },
  {
    id: "migiue-3",
    title: "右上の攻防",
    plies: 3,
    rows: ["...BB", "..A.A", "B....", ".....", "..A.."],
    turn: "A",
    hands: NO_HANDS,
    moveRange: 1,
  },
  {
    id: "migihen-3",
    title: "右辺に並ぶ",
    plies: 3,
    rows: ["...A.", "..A.B", ".....", "..A.B", "....B"],
    turn: "A",
    hands: NO_HANDS,
    moveRange: 1,
  },
  {
    id: "hidariue-3",
    title: "左上に寄せる",
    plies: 3,
    rows: ["BA.B.", "B.A..", ".A...", ".....", "....."],
    turn: "A",
    hands: NO_HANDS,
    moveRange: 1,
  },
  {
    id: "irikumu-3",
    title: "入り組む",
    plies: 3,
    rows: ["ABB..", ".B...", "..A.A", ".A...", "B...."],
    turn: "A",
    hands: NO_HANDS,
    moveRange: 1,
  },
  {
    id: "hiroba-3",
    title: "広い盤の左下",
    plies: 3,
    rows: [".......", "B....A.", ".......", "A......", ".......", ".B.....", "BA....."],
    turn: "A",
    hands: NO_HANDS,
    moveRange: 1,
  },
  {
    id: "shitahen-3",
    title: "下辺に集める",
    plies: 3,
    rows: [".......", ".......", "....A..", ".......", ".A.....", "A......", "BB.B..."],
    turn: "A",
    hands: NO_HANDS,
    moveRange: 1,
  },

  /* ---------------- 5手 ---------------- */
  {
    id: "kado-5",
    title: "角へ誘う",
    plies: 5,
    rows: ["BA...", "A.A..", "B....", ".....", "B...."],
    turn: "A",
    hands: NO_HANDS,
    moveRange: 1,
  },
  {
    id: "ue-5",
    title: "上辺で仕留める",
    plies: 5,
    rows: ["..B.B", "..AA.", ".B...", ".....", "A...."],
    turn: "A",
    hands: NO_HANDS,
    moveRange: 1,
  },
  {
    id: "migi-5",
    title: "右辺に閉じ込める",
    plies: 5,
    rows: ["....B", "....B", "....A", "..A.B", "..A.."],
    turn: "A",
    hands: NO_HANDS,
    moveRange: 1,
  },
  {
    id: "shita-5",
    title: "下辺の攻防",
    plies: 5,
    rows: [".....", ".....", "B.A..", "..A..", ".A.BB"],
    turn: "A",
    hands: NO_HANDS,
    moveRange: 1,
  },
  {
    id: "jouhen-5",
    title: "上辺と中央",
    plies: 5,
    rows: ["B.B..", ".....", "AA...", "...A.", ".B..."],
    turn: "A",
    hands: NO_HANDS,
    moveRange: 1,
  },
  {
    id: "naname-5",
    title: "斜めに散る",
    plies: 5,
    rows: ["A....", "A.B..", "...A.", "B..A.", "..B.B"],
    turn: "A",
    hands: NO_HANDS,
    moveRange: 1,
  },
  {
    id: "chuoshita-5",
    title: "中央から下へ",
    plies: 5,
    rows: [".....", ".B...", "B..A.", "...A.", "..AB."],
    turn: "A",
    hands: NO_HANDS,
    moveRange: 1,
  },
  {
    id: "oban-5",
    title: "大盤の左上",
    plies: 5,
    rows: ["..A....", "B.A....", "B......", ".......", ".......", ".....A.", ".B....."],
    turn: "A",
    hands: NO_HANDS,
    moveRange: 1,
  },
  {
    id: "sankaku-5",
    title: "下辺の三角",
    plies: 5,
    rows: ["...B...", ".......", ".......", ".......", ".A.A...", ".A.....", "B.B...."],
    turn: "A",
    hands: NO_HANDS,
    moveRange: 1,
  },
  {
    id: "hanareta-5",
    title: "離れた二つ",
    plies: 5,
    rows: ["A....", ".....", "...AA", "B...B", "..B.."],
    turn: "A",
    hands: NO_HANDS,
    moveRange: 1,
  },
];

export function puzzleById(id: string): Puzzle | null {
  return PUZZLES.find((puzzle) => puzzle.id === id) ?? null;
}
