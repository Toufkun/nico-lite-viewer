import express from "express";
import cors from "cors";
import morgan from "morgan";
import compression from "compression";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(morgan("dev"));
app.use(cors());
app.use(compression());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ====== ID抽出ユーティリティ ======
const ID_RE = /(sm|so|nm)\d+/i;    // 代表的なニコ動ID
function extractId(input = "") {
  if (!input) return "";
  const m = String(input).match(ID_RE);
  return m ? m[0] : "";
}

// ====== API: URL/ID → 埋め込み用情報 ======
// 例: GET /api/parse?q=https://www.nicovideo.jp/watch/sm9
app.get("/api/parse", (req, res) => {
  const q = (req.query.q || "").toString().trim();
  const id = extractId(q);
  if (!id) return res.status(400).json({ ok: false, error: "動画IDが見つかりません (sm/so/nm+数字)" });

  // 公式の埋め込みプレイヤーURL
  // iframe方式： https://embed.nicovideo.jp/watch/{id}
  // script方式： https://embed.nicovideo.jp/watch/{id}/script?w=640&h=360
  const iframe = `https://embed.nicovideo.jp/watch/${id}`;
  const script = `https://embed.nicovideo.jp/watch/${id}/script?w=640&h=360`;

  return res.json({ ok: true, id, iframe, script, watch: `https://www.nicovideo.jp/watch/${id}` });
});

// 静的ファイル（クライアント）
app.use(express.static("public"));

app.listen(PORT, () => {
  console.log(`nico-lite-viewer running on http://localhost:${PORT}`);
});
