import { describe, expect, it } from "vitest";

import {
  cellName,
  columnLabel,
  moveText,
  noteText,
  outcomeText,
  recordLine,
} from "./notation";
import type { MoveRecord } from "./types";

function record(overrides: Partial<MoveRecord> = {}): MoveRecord {
  return {
    ply: 1,
    player: "A",
    pieceId: 1,
    from: null,
    to: { x: 3, y: 3 },
    sealed: [],
    selfSealed: false,
    released: false,
    outcome: null,
    ...overrides,
  };
}

describe("マスの名前", () => {
  it("左上が A1", () => {
    expect(cellName({ x: 0, y: 0 })).toBe("A1");
  });

  it("列は文字、行は1から数える", () => {
    expect(cellName({ x: 3, y: 3 })).toBe("D4");
    expect(cellName({ x: 6, y: 6 })).toBe("G7");
  });

  it("列の記号は左から順に進む", () => {
    expect(columnLabel(0)).toBe("A");
    expect(columnLabel(8)).toBe("I");
  });
});

describe("moveText", () => {
  it("打ちは行き先だけ", () => {
    expect(moveText(record({ from: null, to: { x: 3, y: 3 } }))).toBe("打 D4");
  });

  it("移動は元と先を結ぶ", () => {
    expect(moveText(record({ from: { x: 4, y: 3 }, to: { x: 3, y: 3 } }))).toBe("E4→D4");
  });
});

describe("noteText", () => {
  it("何も起きていなければ空", () => {
    expect(noteText(record())).toBe("");
  });

  it("封じた枚数を出す", () => {
    expect(noteText(record({ sealed: [2, 3] }))).toBe("封じ2");
  });

  it("自分から挟まれたことを出す", () => {
    expect(noteText(record({ selfSealed: true }))).toBe("自封");
  });

  it("封じが解けたことを出す", () => {
    expect(noteText(record({ released: true }))).toBe("解除");
  });

  it("同時に起きたら並べる", () => {
    expect(noteText(record({ released: true, sealed: [2], selfSealed: true }))).toBe(
      "解除 封じ1 自封",
    );
  });
});

describe("outcomeText", () => {
  it("封じ駒が動けない負け", () => {
    expect(outcomeText({ kind: "win", winner: "A", reason: "sealedPieceStuck" })).toBe(
      "封じられた駒が動けず 黒の勝ち",
    );
  });

  it("指せる手がない負け", () => {
    expect(outcomeText({ kind: "win", winner: "B", reason: "noLegalMove" })).toBe(
      "指せる手がなく 白の勝ち",
    );
  });

  it("4つつなげた負け", () => {
    expect(outcomeText({ kind: "win", winner: "B", reason: "overConnected" })).toBe(
      "4つつなげて 白の勝ち",
    );
  });

  it("引き分け", () => {
    expect(outcomeText({ kind: "draw", reason: "repetition" })).toBe("同一局面が3回で引き分け");
  });
});

describe("recordLine", () => {
  it("手数と側の印をつける", () => {
    expect(recordLine(record({ ply: 1, player: "A" }))).toBe("1 ▲ 打 D4");
  });

  it("後手は別の印", () => {
    expect(recordLine(record({ ply: 2, player: "B" }))).toBe("2 △ 打 D4");
  });

  it("起きたことがあれば後ろにつける", () => {
    expect(
      recordLine(record({ ply: 7, player: "B", from: { x: 4, y: 3 }, sealed: [2] })),
    ).toBe("7 △ E4→D4 封じ1");
  });
});
