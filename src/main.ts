/**
 * 組み立てだけを行う。ここにルールも描画も置かない。
 */

import "./ui/theme.css";
import { GameSession } from "./app/GameSession";
import { LocalClient } from "./app/LocalClient";
import { GameView } from "./ui/GameView";

const client = new LocalClient();
const session = new GameSession(client);
const view = new GameView(session);

document.querySelector<HTMLDivElement>("#app")!.append(view.el);
