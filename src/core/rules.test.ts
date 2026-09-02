import { describe, expect, it } from "vitest";

import {
  DEFAULT_CONFIG,
  applyMove,
  createGame,
  legalMoves,
  legalPlacements,
  movablePieceIds,
  moveOf,
} from "./rules";
import { repetitionKey } from "./result";
import { errorOf, eventTypes, idAt, makeState, normalize, render, unwrap } from "./testing";
import type { CapturedEvent, GameEndedEvent, MovedEvent, TurnChangedEvent } from "./types";

describe("legalMoves", () => {
  const open = makeState(`
    . . . . .
    . . . . .
    . . A . .
    . . . . .
    . . . . .
  `);

  it("上下左右に1マスずつ動ける", () => {
    expect(legalMoves(open, { x: 2, y: 2 })).toEqual([
      { x: 2, y: 1 },
      { x: 3, y: 2 },
      { x: 2, y: 3 },
      { x: 1, y: 2 },
    ]);
  });

  it("斜めには動けない", () => {
    expect(legalMoves(open, { x: 2, y: 2 })).not.toContainEqual({ x: 3, y: 3 });
  });

  it("盤端では行き先が減る", () => {
    const corner = makeState(`
      A . .
      . . .
      . . .
    `);
    expect(legalMoves(corner, { x: 0, y: 0 })).toEqual([
      { x: 1, y: 0 },
      { x: 0, y: 1 },
    ]);
  });

  it("空きマスを指定すると空", () => {
    expect(legalMoves(open, { x: 0, y: 0 })).toEqual([]);
  });

  it("相手の駒は動かせない", () => {
    const state = makeState(`
      A . .
      . . .
      . . B
    `);
    expect(legalMoves(state, { x: 2, y: 2 })).toEqual([]);
  });

  it("moveRange まで進み、駒があればその手前で止まる", () => {
    const state = makeState("A . . B .", { config: { moveRange: 3 } });
    expect(legalMoves(state, { x: 0, y: 0 })).toEqual([
      { x: 1, y: 0 },
      { x: 2, y: 0 },
    ]);
  });

  it("封じ駒があるときは封じ駒しか動かせない", () => {
    const state = makeState(`
      . . . . .
      . . a . .
      . . A . .
      . . . . .
      . . . . .
    `);

    expect(legalMoves(state, { x: 2, y: 2 })).toEqual([]);
    expect(legalMoves(state, { x: 2, y: 1 })).toEqual([
      { x: 2, y: 0 },
      { x: 3, y: 1 },
      { x: 1, y: 1 },
    ]);
  });

  it("決着済みなら空", () => {
    const over = {
      ...open,
      outcome: { kind: "win", winner: "A", reason: "noLegalMove" },
    } as const;
    expect(legalMoves(over, { x: 2, y: 2 })).toEqual([]);
  });
});

describe("legalPlacements", () => {
  it("空きマスに打てる", () => {
    const state = makeState(`
      . . .
      . A .
      . . .
    `);
    expect(legalPlacements(state)).toHaveLength(8);
  });

  it("挟みを作る打ち方はできない", () => {
    const state = makeState(`
      . . . . .
      . . . . .
      A B . . .
      . . . . .
      . . . . .
    `);
    // (2,2) に打つと B を A2つで挟んでしまう
    expect(legalPlacements(state)).not.toContainEqual({ x: 2, y: 2 });
  });

  it("自分が挟まれる打ち方もできない", () => {
    const state = makeState(`
      . . . . .
      . . . . .
      . B . B .
      . . . . .
      . . . . .
    `);
    expect(legalPlacements(state)).not.toContainEqual({ x: 2, y: 2 });
  });

  it("封じ駒があるときは打てない", () => {
    const state = makeState(`
      . . .
      . a .
      . . .
    `);
    expect(legalPlacements(state)).toEqual([]);
  });

  it("持ち駒がなければ打てない", () => {
    const state = makeState(`
      . . .
      . A .
      . . .
    `, { hands: { A: 0 } });
    expect(legalPlacements(state)).toEqual([]);
  });
});

describe("applyMove: 打つ", () => {
  const empty = makeState(`
    . . . . .
    . . . . .
    . . . . .
    . . . . .
    . . . . .
  `);

  it("events は moved → turnChanged の順", () => {
    const { events } = unwrap(applyMove(empty, { kind: "place", to: { x: 2, y: 2 } }));
    expect(eventTypes(events)).toEqual(["moved", "turnChanged"]);
  });

  it("打った駒は from が null", () => {
    const { events } = unwrap(applyMove(empty, { kind: "place", to: { x: 2, y: 2 } }));
    const moved = events[0] as MovedEvent;
    expect(moved.from).toBeNull();
    expect(moved.to).toEqual({ x: 2, y: 2 });
    expect(moved.owner).toBe("A");
    expect(moved.released).toBe(false);
  });

  it("持ち駒が減り、手番が移る", () => {
    const { state } = unwrap(applyMove(empty, { kind: "place", to: { x: 2, y: 2 } }));
    expect(state.hands).toEqual({ A: 7, B: 8 });
    expect(state.turn).toBe("B");
    expect(state.ply).toBe(1);
    expect(render(state)).toBe(
      normalize(`
        . . . . .
        . . . . .
        . . A . .
        . . . . .
        . . . . .
      `),
    );
  });
});

describe("applyMove: 挟む", () => {
  const state = makeState(`
    . . . . .
    . . . . .
    A B . A .
    . . . . .
    . . . . .
  `);
  const applied = unwrap(
    applyMove(state, { kind: "move", pieceId: idAt(state, 3, 2), to: { x: 2, y: 2 } }),
  );

  it("events は moved → captured → turnChanged の順", () => {
    expect(eventTypes(applied.events)).toEqual(["moved", "captured", "turnChanged"]);
  });

  it("captured は封じられた駒と挟んだ2マスを持つ", () => {
    const captured = applied.events[1] as CapturedEvent;
    expect(captured.pieceId).toBe(idAt(state, 1, 2));
    expect(captured.owner).toBe("B");
    expect(captured.by).toBe(idAt(state, 3, 2));
    expect(captured.flanks).toEqual([
      { x: 2, y: 2 },
      { x: 0, y: 2 },
    ]);
  });

  it("挟まれた駒は盤から消えず、封じられる", () => {
    expect(render(applied.state)).toBe(
      normalize(`
        . . . . .
        . . . . .
        A b A . .
        . . . . .
        . . . . .
      `),
    );
    expect(applied.state.pieces.size).toBe(3);
  });

  it("turnChanged は次に動かす義務のある駒を伝える", () => {
    const turn = applied.events[2] as TurnChangedEvent;
    expect(turn.from).toBe("A");
    expect(turn.to).toBe("B");
    expect(turn.ply).toBe(1);
    expect(turn.sealed).toEqual([idAt(state, 1, 2)]);
  });
});

describe("applyMove: 封じの解除", () => {
  it("封じ駒を動かすと released が立つ", () => {
    const state = makeState(`
      . . . . .
      . . a . .
      . . . . .
      . . . B .
      . . . . .
    `);
    const { state: next, events } = unwrap(
      applyMove(state, { kind: "move", pieceId: idAt(state, 2, 1), to: { x: 2, y: 2 } }),
    );

    expect(eventTypes(events)).toEqual(["moved", "turnChanged"]);
    expect((events[0] as MovedEvent).released).toBe(true);
    expect(next.pieces.get(idAt(state, 2, 1))!.sealed).toBe(false);
  });
});

describe("applyMove: 自分から挟まれに行く", () => {
  it("動かした駒自身が封じられ、captured が出る", () => {
    const state = makeState(`
      . . . . .
      . . A . .
      . B . B .
      . . . . .
      . . . . .
    `);
    const moverId = idAt(state, 2, 1);
    const { state: next, events } = unwrap(
      applyMove(state, { kind: "move", pieceId: moverId, to: { x: 2, y: 2 } }),
    );

    expect(eventTypes(events)).toEqual(["moved", "captured", "turnChanged"]);
    const captured = events[1] as CapturedEvent;
    expect(captured.pieceId).toBe(moverId);
    expect(captured.by).toBe(moverId);
    expect(captured.owner).toBe("A");
    expect(next.pieces.get(moverId)!.sealed).toBe(true);
  });
});

describe("applyMove: 決着", () => {
  it("封じ駒が動かせないと負け、gameEnded は最後に出る", () => {
    const state = makeState(`
      B . A
      A . .
      . . .
    `);
    const { state: next, events } = unwrap(
      applyMove(state, { kind: "move", pieceId: idAt(state, 2, 0), to: { x: 1, y: 0 } }),
    );

    expect(eventTypes(events)).toEqual(["moved", "captured", "turnChanged", "gameEnded"]);
    const ended = events[3] as GameEndedEvent;
    expect(ended.outcome).toEqual({ kind: "win", winner: "A", reason: "sealedPieceStuck" });
    expect(next.outcome).toEqual(ended.outcome);
  });

  it("4つつなげると指した側の負け", () => {
    const state = makeState(`
      . A . . .
      A A . A .
      . . . . .
      . . . . .
      . . . . .
    `);
    const { state: next, events } = unwrap(
      applyMove(state, { kind: "move", pieceId: idAt(state, 3, 1), to: { x: 2, y: 1 } }),
    );

    expect(eventTypes(events)).toEqual(["moved", "turnChanged", "gameEnded"]);
    const ended = events[2] as GameEndedEvent;
    expect(ended.outcome).toEqual({ kind: "win", winner: "B", reason: "overConnected" });
    expect(ended.connectedGroup).toHaveLength(4);
    expect(next.outcome).toEqual(ended.outcome);
  });

  it("3つまでの塊なら負けにならない", () => {
    const state = makeState(`
      . . . . .
      A A . A .
      . . . . .
      . . . . .
      . . . . .
    `);
    const { state: next } = unwrap(
      applyMove(state, { kind: "move", pieceId: idAt(state, 3, 1), to: { x: 2, y: 1 } }),
    );
    expect(next.outcome).toBeNull();
  });

  it("同一局面が3回で引き分け", () => {
    const state = makeState(`
      . . . . .
      . . A . .
      . . . . .
      . . . B .
      . . . . .
    `);
    const move = { kind: "move", pieceId: idAt(state, 2, 1), to: { x: 2, y: 2 } } as const;

    const first = unwrap(applyMove(state, move));
    expect(first.state.outcome).toBeNull();

    const primed = { ...state, repetitions: new Map([[repetitionKey(first.state), 2]]) };
    const again = unwrap(applyMove(primed, move));

    expect(again.state.outcome).toEqual({ kind: "draw", reason: "repetition" });
    expect(eventTypes(again.events)).toEqual(["moved", "turnChanged", "gameEnded"]);
  });

  it("決着後は指せない", () => {
    const state = makeState(`
      B . A
      A . .
      . . .
    `);
    const { state: over } = unwrap(
      applyMove(state, { kind: "move", pieceId: idAt(state, 2, 0), to: { x: 1, y: 0 } }),
    );

    expect(errorOf(applyMove(over, { kind: "place", to: { x: 2, y: 2 } }))).toEqual({
      code: "gameOver",
    });
  });
});

describe("applyMove: 拒否", () => {
  const state = makeState(`
    . . . . .
    . . . . .
    . . A . B
    . . . . .
    . . . . .
  `);

  it("相手の駒は動かせない", () => {
    expect(errorOf(applyMove(state, { kind: "move", pieceId: idAt(state, 4, 2), to: { x: 4, y: 1 } })))
      .toEqual({ code: "notYourPiece", pieceId: idAt(state, 4, 2) });
  });

  it("存在しない駒は動かせない", () => {
    expect(errorOf(applyMove(state, { kind: "move", pieceId: 999, to: { x: 0, y: 0 } }))).toEqual({
      code: "pieceNotFound",
      pieceId: 999,
    });
  });

  it("斜めには動けない", () => {
    expect(errorOf(applyMove(state, { kind: "move", pieceId: idAt(state, 2, 2), to: { x: 3, y: 3 } })))
      .toEqual({ code: "notOrthogonal" });
  });

  it("moveRange を超えて動けない", () => {
    expect(errorOf(applyMove(state, { kind: "move", pieceId: idAt(state, 2, 2), to: { x: 2, y: 0 } })))
      .toEqual({ code: "outOfRange", max: 1 });
  });

  it("経路に駒があると動けない", () => {
    const blocked = makeState("A B . .", { config: { moveRange: 3 } });
    expect(errorOf(applyMove(blocked, { kind: "move", pieceId: idAt(blocked, 0, 0), to: { x: 2, y: 0 } })))
      .toEqual({ code: "pathBlocked", at: { x: 1, y: 0 } });
  });

  it("盤外には動けない", () => {
    expect(errorOf(applyMove(state, { kind: "move", pieceId: idAt(state, 2, 2), to: { x: 5, y: 2 } })))
      .toEqual({ code: "outOfBoard", pos: { x: 5, y: 2 } });
  });

  it("駒のあるマスには打てない", () => {
    expect(errorOf(applyMove(state, { kind: "place", to: { x: 2, y: 2 } }))).toEqual({
      code: "cellOccupied",
      pos: { x: 2, y: 2 },
    });
  });

  it("持ち駒がなければ打てない", () => {
    const empty = makeState(`
      . . .
      . A .
      . . .
    `, { hands: { A: 0 } });
    expect(errorOf(applyMove(empty, { kind: "place", to: { x: 0, y: 0 } }))).toEqual({
      code: "handEmpty",
    });
  });

  it("封じ駒があるときは打てず、封じ駒以外も動かせない", () => {
    const sealed = makeState(`
      . . . . .
      . . a . .
      . . A . .
      . . . . .
      . . . . .
    `);
    const sealedId = idAt(sealed, 2, 1);

    expect(errorOf(applyMove(sealed, { kind: "place", to: { x: 0, y: 0 } }))).toEqual({
      code: "mustMoveSealedPiece",
      sealed: [sealedId],
    });
    expect(errorOf(applyMove(sealed, { kind: "move", pieceId: idAt(sealed, 2, 2), to: { x: 3, y: 2 } })))
      .toEqual({ code: "mustMoveSealedPiece", sealed: [sealedId] });
  });

  it("打ちで挟みは作れない", () => {
    const pinch = makeState(`
      . . . . .
      . . . . .
      A B . . .
      . . . . .
      . . . . .
    `);
    expect(errorOf(applyMove(pinch, { kind: "place", to: { x: 2, y: 2 } }))).toEqual({
      code: "placementWouldSeal",
    });
  });

  it("打った駒が挟まれる形にもできない", () => {
    const trap = makeState(`
      . . . . .
      . . . . .
      . B . B .
      . . . . .
      . . . . .
    `);
    expect(errorOf(applyMove(trap, { kind: "place", to: { x: 2, y: 2 } }))).toEqual({
      code: "placementWouldBeSealed",
    });
  });
});

describe("movablePieceIds", () => {
  it("封じ駒があるならその中から返す", () => {
    const state = makeState(`
      . . . . .
      . . a . .
      . . A . .
      . . . . .
      . . . . .
    `);
    expect(movablePieceIds(state, "A")).toEqual([idAt(state, 2, 1)]);
  });

  it("動けない駒は含まない", () => {
    const state = makeState(`
      A A
      A A
    `);
    expect(movablePieceIds(state, "A")).toEqual([]);
  });
});

describe("applyMove: 参照透過", () => {
  it("元の局面を書き換えない", () => {
    const state = makeState(`
      . . . . .
      . . . . .
      A B . A .
      . . . . .
      . . . . .
    `);
    const before = {
      board: JSON.stringify([...state.board]),
      pieces: JSON.stringify([...state.pieces]),
      hands: JSON.stringify(state.hands),
      turn: state.turn,
      ply: state.ply,
    };

    unwrap(applyMove(state, { kind: "move", pieceId: idAt(state, 3, 2), to: { x: 2, y: 2 } }));
    unwrap(applyMove(state, { kind: "place", to: { x: 4, y: 4 } }));

    expect(JSON.stringify([...state.board])).toBe(before.board);
    expect(JSON.stringify([...state.pieces])).toBe(before.pieces);
    expect(JSON.stringify(state.hands)).toBe(before.hands);
    expect(state.turn).toBe(before.turn);
    expect(state.ply).toBe(before.ply);
  });
});

describe("createGame", () => {
  it("既定は 7x7・移動1マス・持ち駒8個・連結上限4", () => {
    expect(DEFAULT_CONFIG).toEqual({
      cols: 7,
      rows: 7,
      moveRange: 1,
      handSize: 8,
      connectLimit: 4,
    });
  });

  it("盤上に駒はなく、先手から始まる", () => {
    const state = createGame();

    expect(state.board.size).toBe(0);
    expect(state.pieces.size).toBe(0);
    expect(state.hands).toEqual({ A: 8, B: 8 });
    expect(state.turn).toBe("A");
    expect(state.ply).toBe(0);
    expect(state.nextPieceId).toBe(1);
    expect(state.outcome).toBeNull();
  });

  it("開始局面も千日手の数に入れる", () => {
    const state = createGame();
    expect(state.repetitions.get(repetitionKey(state))).toBe(1);
  });

  it("設定を渡せる", () => {
    const state = createGame({ ...DEFAULT_CONFIG, cols: 5, rows: 5, handSize: 6 });

    expect(state.config.cols).toBe(5);
    expect(state.hands).toEqual({ A: 6, B: 6 });
  });

  it("開始局面ではどのマスにも打てる", () => {
    expect(legalPlacements(createGame())).toHaveLength(49);
  });

  it("最初の1手を指せる", () => {
    const { state } = unwrap(applyMove(createGame(), { kind: "place", to: { x: 3, y: 3 } }));

    expect(state.turn).toBe("B");
    expect(state.hands).toEqual({ A: 7, B: 8 });
    expect(state.pieces.size).toBe(1);
  });
});

describe("moveOf", () => {
  it("打ちは行き先だけの着手に戻る", () => {
    const move = moveOf({
      ply: 1,
      player: "A",
      pieceId: 1,
      from: null,
      to: { x: 3, y: 3 },
      sealed: [],
      selfSealed: false,
      released: false,
      outcome: null,
    });

    expect(move).toEqual({ kind: "place", to: { x: 3, y: 3 } });
  });

  it("移動は駒と行き先の着手に戻る", () => {
    const move = moveOf({
      ply: 2,
      player: "B",
      pieceId: 7,
      from: { x: 4, y: 3 },
      to: { x: 3, y: 3 },
      sealed: [],
      selfSealed: false,
      released: false,
      outcome: null,
    });

    expect(move).toEqual({ kind: "move", pieceId: 7, to: { x: 3, y: 3 } });
  });

  it("棋譜を流し直すと同じ局面になる", () => {
    const start = createGame({ ...DEFAULT_CONFIG, cols: 5, rows: 5 });

    // 適当に何手か指す
    let live = start;
    const played = [
      { kind: "place", to: { x: 2, y: 2 } },
      { kind: "place", to: { x: 0, y: 0 } },
      { kind: "place", to: { x: 4, y: 4 } },
      { kind: "place", to: { x: 0, y: 4 } },
    ] as const;
    const records = [];
    for (const move of played) {
      const applied = unwrap(applyMove(live, move));
      live = applied.state;
      // moveOf に渡せる形を、指した手から作る
      const moved = applied.events[0];
      if (moved.type !== "moved") throw new Error("moved が先頭にない");
      records.push({
        ply: live.ply,
        player: moved.owner,
        pieceId: moved.pieceId,
        from: moved.from,
        to: moved.to,
        sealed: [],
        selfSealed: false,
        released: moved.released,
        outcome: null,
      });
    }

    // 棋譜から指し直す
    let replayed = start;
    for (const record of records) {
      replayed = unwrap(applyMove(replayed, moveOf(record))).state;
    }

    expect(render(replayed)).toBe(render(live));
    expect(replayed.ply).toBe(live.ply);
    expect(replayed.hands).toEqual(live.hands);
  });
});
