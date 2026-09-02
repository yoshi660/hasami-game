import { describe, expect, it, vi } from "vitest";

import { DEFAULT_CONFIG } from "../core/rules";
import { idAt, makeState } from "../core/testing";
import type { BoardConfig, GameEvent, GameState, Move } from "../core/types";
import { LocalClient } from "./LocalClient";

const SMALL: BoardConfig = { ...DEFAULT_CONFIG, cols: 5, rows: 5 };

const PLACE: Move = { kind: "place", to: { x: 2, y: 2 } };

/** onEvent と onStateChange の呼ばれ方を1本の並びに記録する。 */
function traced(client: LocalClient): string[] {
  const log: string[] = [];
  client.onEvent((event: GameEvent) => log.push(`event:${event.type}`));
  client.onStateChange((state: GameState) => log.push(`state:${state.ply}`));
  return log;
}

describe("LocalClient: 着手", () => {
  it("submitMove は Promise を返す", () => {
    const client = new LocalClient({ config: SMALL });
    const returned = client.submitMove(PLACE);

    expect(returned).toBeInstanceOf(Promise);
    return expect(returned).resolves.toEqual({ accepted: true });
  });

  it("合法手なら局面が進む", async () => {
    const client = new LocalClient({ config: SMALL });

    expect(await client.submitMove(PLACE)).toEqual({ accepted: true });
    expect(client.getState().turn).toBe("B");
    expect(client.getState().ply).toBe(1);
    expect(client.getState().hands).toEqual({ A: 7, B: 8 });
  });

  it("非合法手は理由つきで断り、局面を進めない", async () => {
    const client = new LocalClient({ config: SMALL });
    await client.submitMove(PLACE);
    const before = client.getState();

    const result = await client.submitMove(PLACE);

    expect(result).toEqual({
      accepted: false,
      reason: { kind: "illegal", error: { code: "cellOccupied", pos: { x: 2, y: 2 } } },
    });
    expect(client.getState()).toBe(before);
  });

  it("指せない側の手番なら notYourSeat", async () => {
    const client = new LocalClient({ config: SMALL, seats: ["A"] });

    expect(await client.submitMove(PLACE)).toEqual({ accepted: true });
    expect(await client.submitMove({ kind: "place", to: { x: 0, y: 0 } })).toEqual({
      accepted: false,
      reason: { kind: "notYourSeat", turn: "B" },
    });
  });

  it("ローカル対戦は両方の側を指せる", async () => {
    const client = new LocalClient({ config: SMALL });

    expect(client.seats).toEqual(["A", "B"]);
    await client.submitMove(PLACE);
    expect(await client.submitMove({ kind: "place", to: { x: 0, y: 0 } })).toEqual({
      accepted: true,
    });
  });

  it("途中局面から始められる", async () => {
    const initialState = makeState(`
      . . . . .
      . . . . .
      A B . A .
      . . . . .
      . . . . .
    `);
    const client = new LocalClient({ initialState });

    expect(client.getState()).toBe(initialState);
    expect(
      await client.submitMove({
        kind: "move",
        pieceId: idAt(initialState, 3, 2),
        to: { x: 2, y: 2 },
      }),
    ).toEqual({ accepted: true });
  });
});

describe("LocalClient: 通知", () => {
  it("イベントを描画順に流し、最後に局面確定を知らせる", async () => {
    const initialState = makeState(`
      . . . . .
      . . . . .
      A B . A .
      . . . . .
      . . . . .
    `);
    const client = new LocalClient({ initialState });
    const log = traced(client);

    await client.submitMove({
      kind: "move",
      pieceId: idAt(initialState, 3, 2),
      to: { x: 2, y: 2 },
    });

    expect(log).toEqual([
      "event:moved",
      "event:captured",
      "event:turnChanged",
      "state:1",
    ]);
  });

  it("打つ手では captured が流れない", async () => {
    const client = new LocalClient({ config: SMALL });
    const log = traced(client);

    await client.submitMove(PLACE);

    expect(log).toEqual(["event:moved", "event:turnChanged", "state:1"]);
  });

  it("断られた手では何も流れない", async () => {
    const client = new LocalClient({ config: SMALL });
    await client.submitMove(PLACE);
    const log = traced(client);

    await client.submitMove(PLACE);

    expect(log).toEqual([]);
  });

  it("onStateChange は確定した局面を渡す", async () => {
    const client = new LocalClient({ config: SMALL });
    const seen: GameState[] = [];
    client.onStateChange((state) => seen.push(state));

    await client.submitMove(PLACE);

    expect(seen).toHaveLength(1);
    expect(seen[0]).toBe(client.getState());
  });

  it("解除したリスナは呼ばれない", async () => {
    const client = new LocalClient({ config: SMALL });
    const onEvent = vi.fn();
    const onState = vi.fn();
    const stopEvent = client.onEvent(onEvent);
    const stopState = client.onStateChange(onState);

    stopEvent();
    stopState();
    await client.submitMove(PLACE);

    expect(onEvent).not.toHaveBeenCalled();
    expect(onState).not.toHaveBeenCalled();
  });

  it("配布中に購読を解除しても崩れない", async () => {
    const client = new LocalClient({ config: SMALL });
    const later = vi.fn();
    const stopLater = client.onEvent(later);
    client.onEvent(() => stopLater());

    await expect(client.submitMove(PLACE)).resolves.toEqual({ accepted: true });
  });

  it("解決する前にイベントを配り終えている", async () => {
    const client = new LocalClient({ config: SMALL });
    const log = traced(client);

    await client.submitMove(PLACE).then(() => log.push("resolved"));

    expect(log).toEqual(["event:moved", "event:turnChanged", "state:1", "resolved"]);
  });
});

describe("LocalClient: dispose", () => {
  it("dispose 後は着手できない", async () => {
    const client = new LocalClient({ config: SMALL });
    client.dispose();

    const result = await client.submitMove(PLACE);

    expect(result.accepted).toBe(false);
    expect(result.accepted === false && result.reason.kind).toBe("transport");
  });

  it("dispose すると購読も切れる", async () => {
    const client = new LocalClient({ config: SMALL });
    const onEvent = vi.fn();
    client.onEvent(onEvent);

    client.dispose();
    await client.submitMove(PLACE);

    expect(onEvent).not.toHaveBeenCalled();
  });
});

describe("LocalClient: 待った", () => {
  it("最初は戻せる手がない", () => {
    const client = new LocalClient({ config: SMALL });

    expect(client.supportsUndo).toBe(true);
    expect(client.canUndo).toBe(false);
  });

  it("1手戻すと局面も持ち駒も戻る", async () => {
    const client = new LocalClient({ config: SMALL });
    const before = client.getState();

    await client.submitMove(PLACE);
    expect(client.canUndo).toBe(true);

    expect(await client.undo()).toEqual({ undone: true });
    expect(client.getState()).toBe(before);
    expect(client.getState().turn).toBe("A");
    expect(client.getState().hands).toEqual({ A: 8, B: 8 });
    expect(client.canUndo).toBe(false);
  });

  it("何手でも最初まで戻せる", async () => {
    const client = new LocalClient({ config: SMALL });
    const before = client.getState();

    await client.submitMove(PLACE);
    await client.submitMove({ kind: "place", to: { x: 0, y: 0 } });
    await client.submitMove({ kind: "place", to: { x: 4, y: 4 } });

    await client.undo();
    await client.undo();
    await client.undo();

    expect(client.getState()).toBe(before);
    expect(client.canUndo).toBe(false);
  });

  it("戻せる手がなければ断る", async () => {
    const client = new LocalClient({ config: SMALL });

    expect(await client.undo()).toEqual({
      undone: false,
      reason: { kind: "noHistory" },
    });
  });

  it("封じも一緒に戻る", async () => {
    const initialState = makeState(`
      . . . . .
      . . . . .
      A B . A .
      . . . . .
      . . . . .
    `);
    const client = new LocalClient({ initialState });
    const sealedId = idAt(initialState, 1, 2);

    await client.submitMove({
      kind: "move",
      pieceId: idAt(initialState, 3, 2),
      to: { x: 2, y: 2 },
    });
    expect(client.getState().pieces.get(sealedId)!.sealed).toBe(true);

    await client.undo();
    expect(client.getState().pieces.get(sealedId)!.sealed).toBe(false);
  });

  it("決着したあとでも戻せる", async () => {
    const initialState = makeState(`
      B . A
      A . .
      . . .
    `);
    const client = new LocalClient({ initialState });

    await client.submitMove({
      kind: "move",
      pieceId: idAt(initialState, 2, 0),
      to: { x: 1, y: 0 },
    });
    expect(client.getState().outcome).not.toBeNull();

    await client.undo();

    expect(client.getState().outcome).toBeNull();
    expect(await client.submitMove({ kind: "place", to: { x: 2, y: 2 } })).toEqual({
      accepted: true,
    });
  });

  it("GameEvent は流さず、局面確定だけを知らせる", async () => {
    const client = new LocalClient({ config: SMALL });
    await client.submitMove(PLACE);

    const log = traced(client);
    await client.undo();

    expect(log).toEqual(["state:0"]);
  });

  it("断られた待ったでは何も流れない", async () => {
    const client = new LocalClient({ config: SMALL });
    const log = traced(client);

    await client.undo();

    expect(log).toEqual([]);
  });
});
