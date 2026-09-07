/**
 * 解いた問題の記録。ブラウザに残す。
 *
 * 中身は id の並びだけ。壊れていたら黙って捨てる。
 */

const STORAGE_KEY = "hasami:solved";

export class PuzzleProgress {
  #solved: Set<string> = new Set(read());

  isSolved(id: string): boolean {
    return this.#solved.has(id);
  }

  get solvedCount(): number {
    return this.#solved.size;
  }

  markSolved(id: string): void {
    if (this.#solved.has(id)) return;
    this.#solved.add(id);
    write([...this.#solved]);
  }

  clear(): void {
    this.#solved.clear();
    write([]);
  }
}

function read(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is string => typeof id === "string");
  } catch {
    return [];
  }
}

function write(ids: readonly string[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
  } catch {
    // 保存できなくても解くことはできる
  }
}
