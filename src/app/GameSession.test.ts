import { describe, expect, it, vi } from "vitest";

import { DEFAULT_CONFIG, createGame } from "../core/rules";
import { idAt, makeState } from "../core/testing";
import type { BoardConfig, GameState, Move, Player } from "../core/types";
import { GameSession } from "./GameSession";
import { LocalClient } from "./LocalClient";
import type { GameClient, SubmitResult, UndoResult, Unsubscribe } from "./GameClient";

const SMALL: BoardConfig = { ...DEFAULT_CONFIG, cols: 5, rows: 5 };
const PLACE: Move = { kind: "place", to: { x: 2, y: 2 } };

function localSession(options: { seats?: readonly Player[]; initialState?: GameState } = {}) {
  const client = new LocalClient({ config: SMALL, ...options });
  return { client, session: new GameSession(client) };
}

/** submitMove の解決をテスト側から握るクライアント。通信の遅延を模す。 */
class ManualClient implements GameClient {
  readonly seats: readonly Player[] = ["A", "B"];
  readonly supportsUndo = false;
  readonly canUndo = false;

  #state: GameState = createGame(SMALL);
  #release: ((result: SubmitResult) => void) | null = null;

  getState(): GameState {
    return this.#state;
  }

  async undo(): Promise<UndoResult> {
    return { undone: false, reason: { kind: "unsupported" } };
  }

  submitMove(): Promise<SubmitResult> {
    return new Promise<SubmitResult>((resolve) => {
      this.#release = resolve;
    });
  }

  release(result: SubmitResult): void {
    const resolve = this.#release;
    this.#release = null;
    resolve?.(result);
  }

  onEvent(): Unsubscribe {
    return () => {};
  }

  onStateChange(): Unsubscribe {
    return () => {};
  }

  dispose(): void {}
}

describe("GameSession: 局面の読み出し", () => {
  it("client の局面をそのまま見せる", () => {
    const { client, session } = localSession();

    expect(session.state).toBe(client.getState());
    expect(session.turn).toBe("A");
    expect(session.seats).toEqual(["A", "B"]);
    expect(session.isOver).toBe(false);
    expect(session.outcome).toBeNull();
    expect(session.handCount("A")).toBe(8);
  });

  it("着手すると読み出しも追随する", async () => {
    const { session } = localSession();

    await session.submit(PLACE);

    expect(session.turn).toBe("B");
    expect(session.state.ply).toBe(1);
    expect(session.handCount("A")).toBe(7);
  });
});

describe("GameSession: 合法手の問い合わせ", () => {
  it("空の盤では全マスに打てる", () => {
    const { session } = localSession();
    expect(session.legalPlacements()).toHaveLength(25);
  });

  it("駒を動かせるマスを返す", () => {
    const initialState = makeState(`
      . . . . .
      . . . . .
      . . A . .
      . . . . .
      . . . . .
    `);
    const { session } = localSession({ initialState });

    expect(session.legalMovesFrom({ x: 2, y: 2 })).toHaveLength(4);
    expect(session.legalMovesFrom({ x: 0, y: 0 })).toEqual([]);
  });

  it("封じ駒があるときは打てず、封じ駒だけが動かせる", () => {
    const initialState = makeState(`
      . . . . .
      . . a . .
      . . A . .
      . . . . .
      . . . . .
    `);
    const { session } = localSession({ initialState });

    expect(session.sealedPieceIds()).toEqual([idAt(initialState, 2, 1)]);
    expect(session.legalPlacements()).toEqual([]);
    expect(session.movablePieceIds()).toEqual([idAt(initialState, 2, 1)]);
    expect(session.legalMovesFrom({ x: 2, y: 2 })).toEqual([]);
  });
});

describe("GameSession: canAct", () => {
  it("自分の手番で決着前なら指せる", () => {
    const { session } = localSession();
    expect(session.canAct).toBe(true);
  });

  it("指せない側の手番なら false", async () => {
    const { session } = localSession({ seats: ["A"] });

    expect(session.controls("B")).toBe(false);
    await session.submit(PLACE);
    expect(session.turn).toBe("B");
    expect(session.canAct).toBe(false);
  });

  it("決着後は false", async () => {
    const initialState = makeState(`
      B . A
      A . .
      . . .
    `);
    const { session } = localSession({ initialState });

    await session.submit({
      kind: "move",
      pieceId: idAt(initialState, 2, 0),
      to: { x: 1, y: 0 },
    });

    expect(session.isOver).toBe(true);
    expect(session.outcome).toEqual({ kind: "win", winner: "A", reason: "sealedPieceStuck" });
    expect(session.canAct).toBe(false);
  });
});

describe("GameSession: 二重送信の抑止", () => {
  it("送信中は busy で断る", async () => {
    const client = new ManualClient();
    const session = new GameSession(client);

    const first = session.submit(PLACE);
    expect(session.isBusy).toBe(true);

    expect(await session.submit(PLACE)).toEqual({
      accepted: false,
      reason: { kind: "busy" },
    });

    client.release({ accepted: true });
    expect(await first).toEqual({ accepted: true });
    expect(session.isBusy).toBe(false);
  });

  it("送信中は canAct が false", () => {
    const client = new ManualClient();
    const session = new GameSession(client);

    void session.submit(PLACE);

    expect(session.canAct).toBe(false);
  });

  it("解決すれば次の手を送れる", async () => {
    const { session } = localSession();

    await session.submit(PLACE);
    expect(session.isBusy).toBe(false);
    expect(await session.submit({ kind: "place", to: { x: 0, y: 0 } })).toEqual({
      accepted: true,
    });
  });

  it("断られた手のあとも busy のままにしない", async () => {
    const { session } = localSession();
    await session.submit(PLACE);

    expect(await session.submit(PLACE)).toMatchObject({ accepted: false });
    expect(session.isBusy).toBe(false);
  });
});

describe("GameSession: 購読", () => {
  it("client のイベントと局面確定を同じ順で中継する", async () => {
    const initialState = makeState(`
      . . . . .
      . . . . .
      A B . A .
      . . . . .
      . . . . .
    `);
    const { session } = localSession({ initialState });
    const log: string[] = [];
    session.onEvent((event) => log.push(`event:${event.type}`));
    session.onStateChange((state) => log.push(`state:${state.ply}`));

    await session.submit({
      kind: "move",
      pieceId: idAt(initialState, 3, 2),
      to: { x: 2, y: 2 },
    });

    expect(log).toEqual(["event:moved", "event:captured", "event:turnChanged", "state:1"]);
  });

  it("解除したリスナは呼ばれない", async () => {
    const { session } = localSession();
    const onEvent = vi.fn();
    const stop = session.onEvent(onEvent);

    stop();
    await session.submit(PLACE);

    expect(onEvent).not.toHaveBeenCalled();
  });

  it("dispose すると中継が止まる", async () => {
    const { client, session } = localSession();
    const onEvent = vi.fn();
    session.onEvent(onEvent);

    session.dispose();
    await client.submitMove(PLACE);

    expect(onEvent).not.toHaveBeenCalled();
  });

  it("dispose しても client は閉じない", async () => {
    const { client, session } = localSession();

    session.dispose();

    expect(await client.submitMove(PLACE)).toEqual({ accepted: true });
  });
});

describe("GameSession: 待った", () => {
  it("client の対応をそのまま見せる", async () => {
    const { session } = localSession();

    expect(session.supportsUndo).toBe(true);
    expect(session.canUndo).toBe(false);

    await session.submit(PLACE);
    expect(session.canUndo).toBe(true);
  });

  it("1手戻す", async () => {
    const { session } = localSession();
    await session.submit(PLACE);

    expect(await session.undo()).toEqual({ undone: true });
    expect(session.turn).toBe("A");
    expect(session.state.ply).toBe(0);
  });

  it("戻すと onStateChange だけが流れる", async () => {
    const { session } = localSession();
    await session.submit(PLACE);

    const log: string[] = [];
    session.onEvent((event) => log.push(`event:${event.type}`));
    session.onStateChange((state) => log.push(`state:${state.ply}`));

    await session.undo();

    expect(log).toEqual(["state:0"]);
  });

  it("送信中は busy で断る", async () => {
    const client = new ManualClient();
    const session = new GameSession(client);

    const first = session.submit(PLACE);

    expect(await session.undo()).toEqual({ undone: false, reason: { kind: "busy" } });

    client.release({ accepted: true });
    await first;
  });

  it("待ったに対応しない client なら canUndo は false", () => {
    const session = new GameSession(new ManualClient());

    expect(session.supportsUndo).toBe(false);
    expect(session.canUndo).toBe(false);
  });
});

describe("GameSession: 棋譜", () => {
  it("最初は空", () => {
    const { session } = localSession();
    expect(session.record).toEqual([]);
  });

  it("打った手を1件積む", async () => {
    const { session } = localSession();

    await session.submit(PLACE);

    expect(session.record).toHaveLength(1);
    expect(session.record[0]).toMatchObject({
      ply: 1,
      player: "A",
      from: null,
      to: { x: 2, y: 2 },
      sealed: [],
      selfSealed: false,
      released: false,
      outcome: null,
    });
  });

  it("封じた相手の駒を記録する", async () => {
    const initialState = makeState(`
      . . . . .
      . . . . .
      A B . A .
      . . . . .
      . . . . .
    `);
    const { session } = localSession({ initialState });

    await session.submit({
      kind: "move",
      pieceId: idAt(initialState, 3, 2),
      to: { x: 2, y: 2 },
    });

    expect(session.record[0]).toMatchObject({
      from: { x: 3, y: 2 },
      to: { x: 2, y: 2 },
      sealed: [idAt(initialState, 1, 2)],
      selfSealed: false,
    });
  });

  it("自分から挟まれた手は封じた枚数に数えない", async () => {
    const initialState = makeState(`
      . . . . .
      . . A . .
      . B . B .
      . . . . .
      . . . . .
    `);
    const { session } = localSession({ initialState });

    await session.submit({
      kind: "move",
      pieceId: idAt(initialState, 2, 1),
      to: { x: 2, y: 2 },
    });

    expect(session.record[0]).toMatchObject({ sealed: [], selfSealed: true });
  });

  it("封じが解けたことを記録する", async () => {
    const initialState = makeState(`
      . . . . .
      . . a . .
      . . . . .
      . . . B .
      . . . . .
    `);
    const { session } = localSession({ initialState });

    await session.submit({
      kind: "move",
      pieceId: idAt(initialState, 2, 1),
      to: { x: 2, y: 2 },
    });

    expect(session.record[0]).toMatchObject({ released: true });
  });

  it("決着はその手に付く", async () => {
    const initialState = makeState(`
      B . A
      A . .
      . . .
    `);
    const { session } = localSession({ initialState });

    await session.submit({
      kind: "move",
      pieceId: idAt(initialState, 2, 0),
      to: { x: 1, y: 0 },
    });

    expect(session.record).toHaveLength(1);
    expect(session.record[0].outcome).toEqual({
      kind: "win",
      winner: "A",
      reason: "sealedPieceStuck",
    });
  });

  it("手数のぶんだけ積み上がる", async () => {
    const { session } = localSession();

    await session.submit(PLACE);
    await session.submit({ kind: "place", to: { x: 0, y: 0 } });
    await session.submit({ kind: "place", to: { x: 4, y: 4 } });

    expect(session.record.map((r) => r.ply)).toEqual([1, 2, 3]);
    expect(session.record.map((r) => r.player)).toEqual(["A", "B", "A"]);
  });

  it("待ったで戻したぶんは消える", async () => {
    const { session } = localSession();

    await session.submit(PLACE);
    await session.submit({ kind: "place", to: { x: 0, y: 0 } });
    expect(session.record).toHaveLength(2);

    await session.undo();
    expect(session.record).toHaveLength(1);
    expect(session.record[0].player).toBe("A");

    await session.undo();
    expect(session.record).toEqual([]);
  });

  it("戻したあとに指し直すと、そこから積み直す", async () => {
    const { session } = localSession();

    await session.submit(PLACE);
    await session.undo();
    await session.submit({ kind: "place", to: { x: 0, y: 0 } });

    expect(session.record).toHaveLength(1);
    expect(session.record[0].to).toEqual({ x: 0, y: 0 });
  });

  it("断られた手は積まない", async () => {
    const { session } = localSession();
    await session.submit(PLACE);

    await session.submit(PLACE);

    expect(session.record).toHaveLength(1);
  });
});
