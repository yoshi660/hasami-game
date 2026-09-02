/**
 * 挟みゲームの中核型。
 *
 * ここに置いてよいのは「オンライン対戦で相手に送る必要がある情報」だけ。
 * 選択中の駒・ハイライト・アニメ進行度は ui/ 側が持つ（設計ルール3）。
 *
 * 実装は別ファイル。このファイルは型のみ。
 */

/* ============================================================
 * 座標とプレイヤー
 * ========================================================== */

/** 盤上の座標。左上が (0,0)、x は列（右が正）、y は行（下が正）。 */
export interface Pos {
  readonly x: number;
  readonly y: number;
}

/**
 * 盤面 Map のキー。`${x},${y}` に固定する。
 * Pos をそのままキーにすると参照比較になるため文字列化する（設計ルール1）。
 */
export type PosKey = `${number},${number}`;

/** A = 先手（黒）、B = 後手（白）。 */
export type Player = "A" | "B";

/* ============================================================
 * 駒
 * ========================================================== */

/**
 * 駒の識別子。盤面には駒種ではなくこの ID を置く。
 * 同じ駒が動き続けても ID は不変で、UI はこれで DOM 要素を追跡する（設計ルール1）。
 */
export type PieceId = number;

export interface Piece {
  readonly id: PieceId;
  readonly owner: Player;
  readonly pos: Pos;
  /**
   * 挟まれて封じられている状態。駒は盤から取り除かれない。
   * 封じ駒を持つプレイヤーは、次の自分の手番でそのいずれかを必ず動かす。
   */
  readonly sealed: boolean;
}

/* ============================================================
 * 対局設定
 * ========================================================== */

/** 対局開始時に固定され、以後変化しないパラメータ。 */
export interface BoardConfig {
  /** 盤の列数。既定 7 */
  readonly cols: number;
  /** 盤の行数。既定 7 */
  readonly rows: number;
  /** 1手で動ける最大マス数。既定 1 */
  readonly moveRange: number;
  /** 開始時の持ち駒数。既定 8 */
  readonly handSize: number;
  /** 同じ側の駒がこの数以上つながると、その持ち主の負け。既定 4 */
  readonly connectLimit: number;
}

/* ============================================================
 * 局面
 * ========================================================== */

/** 決着の理由。 */
export type WinReason =
  /** 封じ駒があるのに、そのどれも動かせなかった */
  | "sealedPieceStuck"
  /** 打つことも動かすこともできない */
  | "noLegalMove"
  /** 自分の駒が connectLimit 個以上つながった（自滅） */
  | "overConnected";

export type Outcome =
  | { readonly kind: "win"; readonly winner: Player; readonly reason: WinReason }
  | { readonly kind: "draw"; readonly reason: "repetition" };

/**
 * 局面。すべて readonly で、applyMove は新しい GameState を返す（設計ルール4）。
 */
export interface GameState {
  readonly config: BoardConfig;

  /** マス → そこにいる駒の ID。空きマスはキーごと存在しない。 */
  readonly board: ReadonlyMap<PosKey, PieceId>;
  /** 駒の実体。盤上の駒のみを持つ（駒は取り除かれないので、打った駒は増える一方）。 */
  readonly pieces: ReadonlyMap<PieceId, Piece>;

  /** まだ打っていない持ち駒の数。 */
  readonly hands: Readonly<Record<Player, number>>;

  /** 手番。 */
  readonly turn: Player;
  /** 次に打つ駒に振る ID。 */
  readonly nextPieceId: PieceId;
  /** 経過手数。 */
  readonly ply: number;

  /**
   * 千日手判定用のカウンタ。
   * キーは「盤上の各マスの所有者 + 手番 + 封じ駒の集合」から作る。
   * 駒 ID は含めない（同じ形なら同一局面とみなす）。
   */
  readonly repetitions: ReadonlyMap<string, number>;

  /** 未決着なら null。 */
  readonly outcome: Outcome | null;
}

/* ============================================================
 * 指し手
 * ========================================================== */

/**
 * 指し手。どちらのプレイヤーの手かは state.turn で決まるため持たない。
 * オンライン化のときは、この型をそのまま送信ペイロードにする。
 */
export type Move =
  /** 持ち駒を空きマスに打つ。 */
  | { readonly kind: "place"; readonly to: Pos }
  /** 盤上の自分の駒を上下左右に動かす。 */
  | { readonly kind: "move"; readonly pieceId: PieceId; readonly to: Pos };

/** 指し手が非合法だった理由。UI はこれを見てメッセージを出す。 */
export type MoveError =
  | { readonly code: "gameOver" }
  | { readonly code: "outOfBoard"; readonly pos: Pos }
  | { readonly code: "cellOccupied"; readonly pos: Pos }
  | { readonly code: "handEmpty" }
  | { readonly code: "pieceNotFound"; readonly pieceId: PieceId }
  | { readonly code: "notYourPiece"; readonly pieceId: PieceId }
  /** 封じ駒があるのに、打とうとした／封じ駒以外を動かそうとした。 */
  | { readonly code: "mustMoveSealedPiece"; readonly sealed: readonly PieceId[] }
  /** 斜め、または同じマスへの移動。 */
  | { readonly code: "notOrthogonal" }
  /** 経路上に駒がある。 */
  | { readonly code: "pathBlocked"; readonly at: Pos }
  /** moveRange を超えている。 */
  | { readonly code: "outOfRange"; readonly max: number }
  /** 打った結果、敵駒を挟む形になる（挟みは移動でのみ成立させる）。 */
  | { readonly code: "placementWouldSeal" }
  /** 打った駒自身が挟まれる形になる。 */
  | { readonly code: "placementWouldBeSealed" };

/* ============================================================
 * 出来事
 * ========================================================== */

/** 挟みが成立した軸。 */
export type Axis = "horizontal" | "vertical";

/**
 * 駒が動いた／打たれた。
 * from が null なら持ち駒からの打ち（盤外から現れる）。
 */
export interface MovedEvent {
  readonly type: "moved";
  readonly pieceId: PieceId;
  readonly owner: Player;
  readonly from: Pos | null;
  readonly to: Pos;
  /** この移動によって自分の封じが解けたか。 */
  readonly released: boolean;
}

/**
 * 駒が挟まれた。
 *
 * 注意: このゲームに駒の取り上げはない。"captured" は
 * 「挟まれて封じられた（次の手番で動かす義務を負った）」ことを指す。
 * 駒は盤上に残り続ける。
 */
export interface CapturedEvent {
  readonly type: "captured";
  /** 封じられた駒。 */
  readonly pieceId: PieceId;
  /** 封じられた駒の持ち主。 */
  readonly owner: Player;
  /**
   * 挟みを成立させた、その手で動かした駒。
   * 自分から挟まれる位置に飛び込んだ場合は pieceId と同じ値になる。
   */
  readonly by: PieceId;
  /**
   * 封じられた駒を両側から挟んだ2マス。
   * 盤の端が壁として働いた側は、盤外の座標が入る。
   */
  readonly flanks: readonly [Pos, Pos];
  readonly axis: Axis;
}

/** 手番が移った。 */
export interface TurnChangedEvent {
  readonly type: "turnChanged";
  readonly from: Player;
  readonly to: Player;
  readonly ply: number;
  /** 次の手番で必ずどれかを動かさなければならない駒。 */
  readonly sealed: readonly PieceId[];
}

/** 対局が終わった。 */
export interface GameEndedEvent {
  readonly type: "gameEnded";
  readonly outcome: Outcome;
  /**
   * overConnected のとき、負けの原因になった連結した駒。
   * それ以外は空。
   */
  readonly connectedGroup: readonly PieceId[];
}

/**
 * 1手の結果として起きたこと。発生順に並ぶ。
 * 盤面の差分比較では復元できないため、applyMove が明示的に返す（設計ルール2）。
 */
export type GameEvent =
  | MovedEvent
  | CapturedEvent
  | TurnChangedEvent
  | GameEndedEvent;

/* ============================================================
 * 棋譜
 * ========================================================== */

/**
 * 棋譜の1手。GameEvent から組み立てる。
 *
 * 局面そのものは持たない。並べれば何が起きたかを読み返せる、という粒度。
 */
export interface MoveRecord {
  /** 何手目か。1から数える。 */
  readonly ply: number;
  readonly player: Player;
  readonly pieceId: PieceId;
  /** 打ちなら null。 */
  readonly from: Pos | null;
  readonly to: Pos;
  /** この手で封じた相手の駒。 */
  readonly sealed: readonly PieceId[];
  /** 自分から挟まれる位置に入って封じられた。 */
  readonly selfSealed: boolean;
  /** この移動で自分の封じが解けた。 */
  readonly released: boolean;
  /** この手で決着したなら、その結果。 */
  readonly outcome: Outcome | null;
}

/* ============================================================
 * applyMove の戻り値
 * ========================================================== */

/**
 * applyMove の結果。
 * 成功なら新しい局面と出来事、失敗なら理由だけを返す（設計ルール2）。
 * 判別は `"error" in result` で行う。
 */
export type Result =
  | { readonly state: GameState; readonly events: readonly GameEvent[] }
  | { readonly error: MoveError };
