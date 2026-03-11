const express = require("express");
const cors = require("cors");
const fetch = require("node-fetch");
require("dotenv").config();

const app = express();
const PORT = 3001;

const GROQ_API_KEY = process.env.GROQ_API_KEY;
if (!GROQ_API_KEY) {
  console.error("❌ Missing GROQ_API_KEY in .env file");
  process.exit(1);
}

app.use(cors({ origin: "http://localhost:3000" }));
app.use(express.json({ limit: "20mb" }));

app.post("/api/messages", async (req, res) => {
  try {
    const { messages, system } = req.body;

    const groqMessages = [];
    if (system) groqMessages.push({ role: "system", content: system });
    messages.forEach(m => groqMessages.push({
      role: m.role,
      content: typeof m.content === "string" ? m.content : m.displayText || ""
    }));

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: groqMessages,
        max_tokens: 1000,
        temperature: 0.7,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("Groq API error:", data);
      return res.status(response.status).json({
        error: { message: data.error?.message || "Groq API error" },
      });
    }

    const text = data.choices?.[0]?.message?.content || "No response.";
    res.json({ content: [{ type: "text", text }] });

  } catch (err) {
    console.error("Proxy error:", err);
    res.status(500).json({ error: { message: err.message } });
  }
});

app.listen(PORT, () => {
  console.log(`✅ Nova proxy running at http://localhost:${PORT}`);
  console.log(`🤖 Using Groq - LLaMA 3.3 70B (free)`);
});