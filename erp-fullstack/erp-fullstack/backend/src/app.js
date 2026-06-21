import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import routes from "./routes/index.js";
import { ApiError } from "./utils/http.js";

dotenv.config();

export function createApp() {
  const app = express();

  app.use(cors({ origin: process.env.CORS_ORIGIN || "*" }));
  app.use(express.json({ limit: "8mb" })); // logo upload (base64) có thể vượt 1mb

  app.get("/health", (req, res) => res.json({ ok: true }));
  app.use("/api", routes);

  // 404
  app.use((req, res) => res.status(404).json({ error: "Route không tồn tại" }));

  // Error handler tập trung
  app.use((err, req, res, next) => {
    const status = err instanceof ApiError ? err.status : 500;
    if (status === 500) console.error(err);
    res.status(status).json({ error: err.message || "Lỗi máy chủ" });
  });

  return app;
}
