const express = require("express");
const cors = require("cors");
const fetch = require("node-fetch");
require("dotenv").config();

const app = express();
const PORT = 3001;

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_API_KEY) {
  console.error("❌ Missing GEMINI_API_KEY in .env file");
  process.exit(1);
}

app.use(cors({ origin: "http://localhost:3000" }));
app.use(express.json({ limit: "20mb" }));

app.post("/api/messages", async (req, res) => {
  try {
    const { messages, system } = req.body;

    // Convert messages to Gemini format
    const contents = messages.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [
        {
          text:
            typeof m.content === "string"
              ? m.content
              : m.content
                  .filter((c) => c.type === "text")
                  .map((c) => c.text)
                  .join("\n") || "[file attached]",
        },
      ],
    }));

    const body = {
      contents,
      generationConfig: {
        maxOutputTokens: 1000,
        temperature: 0.7,
      },
    };

    // Add system instruction if provided
    if (system) {
      body.systemInstruction = {
        parts: [{ text: system }],
      };
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("Gemini API error:", data);
      return res.status(response.status).json({
        error: { message: data.error?.message || "Gemini API error" },
      });
    }

    // Convert Gemini response to Anthropic-style format
    const text =
      data.candidates?.[0]?.content?.parts?.[0]?.text || "No response.";

    res.json({
      content: [{ type: "text", text }],
    });
  } catch (err) {
    console.error("Proxy error:", err);
    res.status(500).json({ error: { message: err.message } });
  }
});

app.listen(PORT, () => {
  console.log(`✅ Nova proxy running at http://localhost:${PORT}`);
  console.log(`🤖 Using Google Gemini (free tier)`);
});