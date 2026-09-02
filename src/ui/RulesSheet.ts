/**
 * ルールの説明。画面に重ねて出す。
 *
 * 文言は CLAUDE.md のゲームルールに合わせる。片方を直したらもう片方も直す。
 */

import "./screens.css";

const RULES: readonly string[] = [
  "手番では<b>持ち駒を空きマスに打つ</b>か、<b>盤上の自分の駒を上下左右に動かす</b>かのどちらかを行う。移動は設定した距離まで、手前に駒があればそこで止まる。",
  "駒を動かした結果、敵の駒が自分の駒（または盤の端）に両側から挟まれたら、その駒は<b>封じられる</b>。駒は盤から取り除かれない。",
  "封じられた駒の持ち主は、<b>次の手番でその駒を動かさなければならない</b>。封じ駒があるあいだは打てない。",
  "盤の端は<b>壁</b>として働き、どちらの側の挟み手にもなる。角に寄った駒は片側を壁に取られているので最も危ない。",
  "自分から挟まれる位置に飛び込んだ場合も、同じく封じられる。",
  "駒を打つことで挟みの形を作ることはできない。挟みは<b>必ず移動で成立させる</b>。",
  "自分の駒が上下左右で<b>4つ以上つながったら、その手を指した側の負け</b>。斜めはつながっていない。",
  "封じられた駒がひとつも動かせないまま手番が来たら負け。打つことも動かすこともできなくなった場合も負け。",
  "同じ局面が3回現れたら引き分け。",
];

export class RulesSheet {
  readonly el: HTMLElement;

  #onClose: () => void;

  constructor(onClose: () => void) {
    this.#onClose = onClose;

    this.el = document.createElement("div");
    this.el.className = "veil";
    this.el.setAttribute("role", "dialog");
    this.el.setAttribute("aria-modal", "true");
    this.el.setAttribute("aria-label", "ルール");

    const sheet = document.createElement("div");
    sheet.className = "rules";

    const title = document.createElement("h2");
    title.className = "sheet-title";
    title.textContent = "挟みのルール";

    const lede = document.createElement("p");
    lede.className = "sheet-lede";
    lede.textContent = "two players · one screen";

    const list = document.createElement("ol");
    RULES.forEach((rule, i) => {
      const item = document.createElement("li");
      const n = document.createElement("span");
      n.className = "rule-n";
      n.textContent = String(i + 1).padStart(2, "0");
      const body = document.createElement("span");
      body.innerHTML = rule;
      item.append(n, body);
      list.append(item);
    });

    const foot = document.createElement("div");
    foot.className = "sheet-foot";
    const close = document.createElement("button");
    close.type = "button";
    close.className = "btn";
    close.textContent = "閉じる";
    close.addEventListener("click", onClose);
    foot.append(close);

    sheet.append(title, lede, list, foot);
    this.el.append(sheet);

    // 幕の外を押しても閉じる
    this.el.addEventListener("click", (event) => {
      if (event.target === this.el) onClose();
    });
    document.addEventListener("keydown", this.#handleKey);

    // preventScroll を付けないと、下端の閉じるボタンへ飛んで中身が最後まで送られる
    queueMicrotask(() => close.focus({ preventScroll: true }));
  }

  #handleKey = (event: KeyboardEvent): void => {
    if (event.key === "Escape") this.#onClose();
  };

  destroy(): void {
    document.removeEventListener("keydown", this.#handleKey);
    this.el.remove();
  }
}
