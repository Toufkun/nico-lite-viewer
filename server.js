// server.js 〔完全版 / ESM〕
import express from "express";
import cors from "cors";
import morgan from "morgan";
import compression from "compression";

const app = express();
const PORT = process.env.PORT || 3000;

// --- middlewares
app.use(morgan("dev"));
app.use(cors());
app.use(compression());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- 共通: 動画ID抽出
const ID_RE = /(sm|so|nm)\d+/i;
const extractId = (s = "") => (s.match(ID_RE) || [])[0] || "";

// --- /api/parse: URL/ID → 埋め込み情報
app.get("/api/parse", (req, res) => {
  const q = (req.query.q || "").toString();
  const id = extractId(q);
  if (!id) return res.status(400).json({ ok:false, error:"動画IDが見つからない" });
  res.json({
    ok: true,
    id,
    script: `https://embed.nicovideo.jp/watch/${id}/script?w=1280&h=720`,
    watch:  `https://www.nicovideo.jp/watch/${id}`
  });
});

// --- /api/search: ニコニコ検索API中継（403対策）
app.get("/api/search", async (req, res) => {
  try {
    const q = (req.query.q || "").toString().trim();
    if (!q) return res.status(400).json({ ok:false, error:"キーワードが空です" });

    const limit  = Math.min(parseInt(req.query.limit || "24", 10), 50);
    const offset = Math.max(parseInt(req.query.offset || "0",   10), 0);
    const sortKey = String(req.query.sort || "popular");
    const sortMap = { popular: "-viewCounter", new: "-startTime", comments: "-commentCounter" };
    const _sort = sortMap[sortKey] || sortMap.popular;

    const params = new URLSearchParams({
      q,
      targets: "title,description,tags",
      fields: "contentId,title,thumbnailUrl,viewCounter,commentCounter,startTime,lengthSeconds",
      _sort,
      _offset: String(offset),
      _limit:  String(limit),
      _context: "nico-lite-viewer"
    });
    // 軽いフィルタ（負荷軽減）
    params.set("filters[viewCounter][gte]", "50");

    const hosts = [
      "https://api.search.nicovideo.jp",
      "https://snapshot.search.nicovideo.jp"
    ];

    let data = null, last = null;
    for (const base of hosts) {
      const url = `${base}/api/v2/snapshot/video/contents/search?${params}`;
      try {
        const r = await fetch(url, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X) AppleWebKit/537.36 (KHTML, like Gecko) Chrome Safari",
            "Accept": "application/json",
            "Accept-Language": "ja,en;q=0.8",
            "Referer": "https://www.nicovideo.jp/",
            "Origin":  "https://www.nicovideo.jp"
          }
        });
        if (!r.ok) {
          last = { status: r.status, base };
          if ([403,429,503].includes(r.status)) continue;
          return res.status(r.status).json({ ok:false, error:`search api ${r.status}` });
        }
        data = await r.json();
        break;
      } catch (e) {
        last = { status: -1, base, err: String(e) };
        continue;
      }
    }

    if (!data) return res.status(502).json({ ok:false, error:"search failed", detail:last });

    const items = (data.data || []).map(v => ({
      id: v.contentId,
      title: v.title,
      thumb: v.thumbnailUrl,
      views: v.viewCounter,
      comments: v.commentCounter,
      startTime: v.startTime,
      lengthSeconds: v.lengthSeconds
    }));
    res.json({ ok:true, totalCount: data.meta?.totalCount ?? items.length, items, nextOffset: offset + items.length });
  } catch (e) {
    res.status(500).json({ ok:false, error:e.message || "search failed" });
  }
});

// --- 静的配信
app.use(express.static("public"));

// --- 診断API（ここに追記でOK。listen の“上”に置く）
app.get("/api/diag/:id", async (req, res) => {
  const id = (req.params.id || "").toString();
  if (!/(sm|so|nm)\d+/i.test(id)) return res.json({ ok:false, error:"bad id" });
  try {
    const u = `https://api.nicovideo.jp/api/watch/v3_guest/${id}`;
    const r = await fetch(u, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Accept": "application/json",
        "Referer": "https://www.nicovideo.jp/"
      }
    });
    const text = await r.text();
    res.json({ ok: r.ok, status: r.status, sample: text.slice(0, 500) });
  } catch (e) {
    res.json({ ok:false, error:String(e) });
  }
});

// --- 起動
app.listen(PORT, () => console.log(`✅ http://localhost:${PORT}`));
