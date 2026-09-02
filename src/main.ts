/**
 * 組み立てだけを行う。ここにルールも描画も置かない。
 */

import "./ui/theme.css";
import { App } from "./ui/App";

document.querySelector<HTMLDivElement>("#app")!.append(new App().el);
