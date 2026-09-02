import { defineConfig } from "vite";

/**
 * GitHub Pages はリポジトリ名のサブパス（例 /hasami-game/）に置かれるので、
 * そのままだと読み込み先が全部ずれる。
 *
 * リポジトリ名をここに書かず、GitHub Actions が渡す GITHUB_REPOSITORY から決める。
 * リポジトリ名を変えても、他所へ移しても、直すところがない。
 * 手元では未設定なので "/" のまま。dev も build も今までどおり動く。
 */
const repository = process.env.GITHUB_REPOSITORY?.split("/")[1];

/** user.github.io のような個人サイトは、サブパスではなく根に置かれる。 */
const isUserSite = repository?.endsWith(".github.io") ?? false;

export default defineConfig({
  base: repository === undefined || isUserSite ? "/" : `/${repository}/`,
});
