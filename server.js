const express = require("express");
const cors = require("cors");

const app = express();
app.use(express.json({ limit: "10mb" }));
app.use(cors());

// ─── Rate limiting (simple in-memory) ───
const userCalls = {};
const LIMIT_PER_HOUR = 20; // free tier: 20 calls/hour per IP

function rateLimit(req, res, next) {
  const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown";
  const now = Date.now();
  if (!userCalls[ip]) userCalls[ip] = [];
  // Remove calls older than 1 hour
  userCalls[ip] = userCalls[ip].filter(t => now - t < 60 * 60 * 1000);
  if (userCalls[ip].length >= LIMIT_PER_HOUR) {
    return res.status(429).json({ error: "Rate limit exceeded. Try again in an hour." });
  }
  userCalls[ip].push(now);
  next();
}

// ─── Proxy endpoint ───
app.post("/api/chat", rateLimit, async (req, res) => {
  const { messages, system, max_tokens } = req.body;

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: "Invalid request format." });
  }

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: max_tokens || 1000,
        system: system || "",
        messages,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({ error: data.error?.message || "API error" });
    }

    res.json(data);
  } catch (err) {
    console.error("Proxy error:", err);
    res.status(500).json({ error: "Server error. Please try again." });
  }
});

// ─── Health check ───
app.get("/", (req, res) => res.json({ status: "Seekho AI Backend running ✅" }));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
