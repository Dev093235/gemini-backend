const express = require("express");

const app = express();

app.use(express.json());

const PORT = process.env.PORT || 3000;

// =========================
// HOME
// =========================

app.get("/", (req, res) => {
  res.json({
    success: true,
    service: "Rudra AI Backend",
    providers: ["groq"],
    mode: "groq only",
    status: "online"
  });
});

// =========================
// GROQ AI
// =========================

async function askGroq(prompt) {
  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey) {
    throw new Error("GROQ_API_KEY missing");
  }

  const response = await fetch(
    "https://api.groq.com/openai/v1/chat/completions",
    {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },

      body: JSON.stringify({
        model: "openai/gpt-oss-120b",

        messages: [
          {
            role: "user",
            content: prompt
          }
        ],

        temperature: 0.7,
        stream: false
      })
    }
  );

  const data = await response.json();

  if (!response.ok) {
    console.error("GROQ API ERROR:", data);

    throw new Error(
      data?.error?.message || "Groq API request failed"
    );
  }

  const answer =
    data?.choices?.[0]?.message?.content
      ?.trim() || "";

  if (!answer) {
    console.error(
      "GROQ RAW RESPONSE:",
      JSON.stringify(data)
    );

    throw new Error("Groq returned empty response");
  }

  return answer;
}

// =========================
// ASK
// =========================

app.post("/ask", async (req, res) => {
  try {
    const prompt = req.body?.prompt;

    if (!prompt) {
      return res.status(400).json({
        success: false,
        error: "prompt required"
      });
    }

    console.log("Incoming request received");
    console.log("Provider: Groq");

    const answer = await askGroq(prompt);

    return res.json({
      success: true,
      answer,
      provider: "groq",
      mode: "groq-only"
    });

  } catch (error) {
    console.error("GROQ SERVER ERROR:", error);

    return res.status(500).json({
      success: false,
      error: error.message || "Groq request failed",
      provider: "groq"
    });
  }
});

// =========================
// 404 HANDLER
// =========================

app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: "Route not found"
  });
});

// =========================
// START SERVER
// =========================

app.listen(PORT, () => {
  console.log(
    `Rudra AI Backend running on port ${PORT}`
  );

  console.log("Active provider: GROQ ONLY");
});
