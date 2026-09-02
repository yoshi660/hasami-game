/**
 * 音。
 *
 * 音源のファイルは持たず、その場で合成する。駒の当たる音は
 * 「短い雑音を帯域で削ったもの」＋「低い胴の響き」で作る。
 *
 * 設計ルール6は「演出の変更は CSS に閉じる」だが、音だけは CSS で作れない。
 * 代わりに音の指定をこのファイルだけに閉じ込め、他のどこにも鳴らす処理を置かない。
 *
 * 鳴らす時刻は AudioContext の時計で予約する（setTimeout でも requestAnimationFrame
 * でもない）。挟みの音を移動が終わる頃に置きたい、といった調整をここだけでできる。
 */

import type { GameEvent } from "../core/types";

const STORAGE_KEY = "hasami:sound";

/** 移動が終わる頃。CSS の --t-slide に合わせてある。 */
const AFTER_SLIDE = 0.2;
/** 複数枚を同時に封じたときの間隔。 */
const CAPTURE_STAGGER = 0.07;
/** 決着の幕が下りる頃。CSS の verdict-in の遅れに合わせてある。 */
const AFTER_VERDICT = 0.55;

function readEnabled(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== "off";
  } catch {
    return true;
  }
}

export class Sound {
  #ctx: AudioContext | null = null;
  #enabled: boolean = readEnabled();
  /** 1手のうち何枚目の封じか。鳴らす時刻をずらすのに使う。 */
  #captureIndex = 0;

  get enabled(): boolean {
    return this.#enabled;
  }

  setEnabled(on: boolean): void {
    this.#enabled = on;
    try {
      localStorage.setItem(STORAGE_KEY, on ? "on" : "off");
    } catch {
      // 保存できなくても鳴らすことはできる
    }
    if (on) this.#context();
  }

  /** 1手のイベントを音にする。GameView から、届いた順にそのまま渡す。 */
  play(event: GameEvent): void {
    const ctx = this.#context();
    if (ctx === null) return;
    const now = ctx.currentTime;

    switch (event.type) {
      case "moved":
        this.#captureIndex = 0;
        if (event.from === null) this.#drop(ctx, now);
        else this.#slide(ctx, now);
        break;

      case "captured":
        this.#seal(ctx, now + AFTER_SLIDE + CAPTURE_STAGGER * this.#captureIndex);
        this.#captureIndex++;
        break;

      case "gameEnded":
        if (event.outcome.kind === "draw") this.#draw(ctx, now + AFTER_VERDICT);
        else this.#win(ctx, now + AFTER_VERDICT);
        break;

      case "turnChanged":
        break;
    }
  }

  /** 指せない手を弾いたとき。 */
  reject(): void {
    const ctx = this.#context();
    if (ctx === null) return;
    this.#tone(ctx, ctx.currentTime, 104, 0.09, 0.16, "square");
  }

  /* ---------------- 音の中身 ---------------- */

  /** 盤に打つ。低めの胴が乗る */
  #drop(ctx: AudioContext, at: number): void {
    this.#clack(ctx, at, 168, 0.5);
  }

  /** 盤の上を滑らせる。打つより軽い */
  #slide(ctx: AudioContext, at: number): void {
    this.#clack(ctx, at, 232, 0.34);
  }

  /** 封じ。締まる感じに、少し下がる二音 */
  #seal(ctx: AudioContext, at: number): void {
    this.#tone(ctx, at, 318, 0.1, 0.2, "triangle");
    this.#tone(ctx, at + 0.055, 212, 0.11, 0.34, "triangle");
  }

  /** 決着 */
  #win(ctx: AudioContext, at: number): void {
    [392, 523.25, 659.25].forEach((freq, i) => {
      this.#tone(ctx, at + i * 0.11, freq, 0.1, 0.55, "triangle");
    });
  }

  /** 引き分け。上がらずに落ち着く */
  #draw(ctx: AudioContext, at: number): void {
    this.#tone(ctx, at, 349.23, 0.09, 0.5, "triangle");
    this.#tone(ctx, at + 0.13, 293.66, 0.09, 0.7, "triangle");
  }

  /** 駒が当たる音。短い雑音＋低い響き */
  #clack(ctx: AudioContext, at: number, body: number, gain: number): void {
    const length = 2048;
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      // 頭が強く、すぐ落ちる雑音
      data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 3;
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const band = ctx.createBiquadFilter();
    band.type = "bandpass";
    band.frequency.value = 1500;
    band.Q.value = 2.4;

    const level = ctx.createGain();
    level.gain.setValueAtTime(gain, at);
    level.gain.exponentialRampToValueAtTime(0.001, at + 0.14);

    noise.connect(band).connect(level).connect(ctx.destination);
    noise.start(at);
    noise.stop(at + 0.16);

    this.#tone(ctx, at, body, gain * 0.34, 0.12, "sine");
  }

  #tone(
    ctx: AudioContext,
    at: number,
    freq: number,
    gain: number,
    duration: number,
    type: OscillatorType,
  ): void {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, at);

    const level = ctx.createGain();
    // 頭を切らないように、ごく短く立ち上げてから落とす
    level.gain.setValueAtTime(0, at);
    level.gain.linearRampToValueAtTime(gain, at + 0.008);
    level.gain.exponentialRampToValueAtTime(0.0001, at + duration);

    osc.connect(level).connect(ctx.destination);
    osc.start(at);
    osc.stop(at + duration + 0.02);
  }

  /**
   * 音を出す入れ物。最初に鳴らすときに作る。
   * 自動再生の制限があるので、必ず操作の流れの中から呼ばれること。
   */
  #context(): AudioContext | null {
    if (!this.#enabled) return null;

    if (this.#ctx === null) {
      if (typeof AudioContext === "undefined") return null;
      try {
        this.#ctx = new AudioContext();
      } catch {
        return null;
      }
    }

    if (this.#ctx.state === "suspended") void this.#ctx.resume();
    return this.#ctx;
  }
}
