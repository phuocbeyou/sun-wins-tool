import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import cors from "cors"; // 👈 thêm

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = 3000;

app.use(cors()); // 👈 bật CORS cho tất cả request
app.use(express.json());

// Serve static HTML
app.use("/html", express.static(path.join(__dirname, "src/utils/html")));

// 🔹 API load config theo gameName
app.get("/api/config/:game", (req, res) => {
  const game = req.params.game;
  const configPath = path.join(__dirname, "src/config", `${game}.json`);

  if (!fs.existsSync(configPath)) {
    return res.status(404).json({ error: `Không tìm thấy config cho game: ${game}` });
  }

  try {
    const data = fs.readFileSync(configPath, "utf8");
    res.json(JSON.parse(data));
  } catch (err) {
    res.status(500).json({ error: "Không đọc được file config" });
  }
});

// 🔹 API lưu config theo gameName
app.post("/api/config/:game", (req, res) => {
  const game = req.params.game;
  const configPath = path.join(__dirname, "src/config", `${game}.json`);

  try {
    fs.writeFileSync(configPath, JSON.stringify(req.body, null, 2), "utf8");
    res.json({ success: true, message: `Đã lưu config cho ${game}!` });
  } catch (err) {
    res.status(500).json({ error: "Không lưu được file config" });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server chạy tại http://localhost:${PORT}`);
  console.log(`👉 Truy cập UI: http://localhost:${PORT}/html/dragon-hunt-settings.html`);
});
