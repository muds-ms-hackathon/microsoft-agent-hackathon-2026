import { defineConfig } from "prisma/config";
import { config } from "dotenv";

// .env ファイルをロードして環境変数を設定
config();

export default defineConfig({
  datasource: {
    // process.env を直接参照し、.env ロード前の評価でも例外を出さない
    url: process.env.DATABASE_URL,
  },
});
