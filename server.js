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
    providers: ["gemini", "openai", "deepseek"],
    fallback: "gemini -> openai -> deepseek",
    status: "online"
  });
});

// =========================
// GEMINI
// =========================

async function askGemini(prompt) {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error("GEMINI_API_KEY missing");
  }

  const response = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/interactions",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey
      },
      body: JSON.stringify({
        model: "gemini-3.6-flash",
        input: prompt
      })
    }
  );

  const data = await response.json();

  if (!response.ok) {
    console.error("GEMINI API ERROR:", data);
    throw new Error(
      data?.error?.message || "Gemini API request failed"
    );
  }

  const answer =
    data?.steps
      ?.filter(step => step.type === "model_output")
      ?.flatMap(step => step.content || [])
      ?.filter(item => item.type === "text")
      ?.map(item => item.text)
      ?.join("\n")
      ?.trim() || "";

  if (!answer) {
    console.error(
      "GEMINI RAW RESPONSE:",
      JSON.stringify(data)
    );

    throw new Error("Gemini returned empty response");
  }

  return answer;
}

// =========================
// OPENAI
// =========================

async function askOpenAI(prompt) {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY missing");
  }

  const response = await fetch(
    "https://api.openai.com/v1/responses",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "gpt-5.6-luna",
        input: prompt
      })
    }
  );

  const data = await response.json();

  if (!response.ok) {
    console.error("OPENAI API ERROR:", data);
    throw new Error(
      data?.error?.message || "OpenAI API request failed"
    );
  }

  const answer =
    data?.output
      ?.filter(item => item.type === "message")
      ?.flatMap(item => item.content || [])
      ?.filter(item => item.type === "output_text")
      ?.map(item => item.text)
      ?.join("\n")
      ?.trim() || "";

  if (!answer) {
    console.error(
      "OPENAI RAW RESPONSE:",
      JSON.stringify(data)
    );

    throw new Error("OpenAI returned empty response");
  }

  return answer;
}

// =========================
// DEEPSEEK
// =========================

async function askDeepSeek(prompt) {
  const apiKey = process.env.DEEPSEEK_API_KEY;

  if (!apiKey) {
    throw new Error("DEEPSEEK_API_KEY missing");
  }

  const response = await fetch(
    "https://api.deepseek.com/chat/completions",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [
          {
            role: "user",
            content: prompt
          }
        ]
      })
    }
  );

  const data = await response.json();

  if (!response.ok) {
    console.error("DEEPSEEK API ERROR:", data);
    throw new Error(
      data?.error?.message || "DeepSeek API request failed"
    );
  }

  const answer =
    data?.choices?.[0]?.message?.content
      ?.trim() || "";

  if (!answer) {
    console.error(
      "DEEPSEEK RAW RESPONSE:",
      JSON.stringify(data)
    );

    throw new Error("DeepSeek returned empty response");
  }

  return answer;
}

// =========================
// ASK
// =========================

app.post("/ask", async (req, res) => {
  try {
    const prompt = req.body?.prompt;

    const provider = (
      req.body?.provider || "auto"
    ).toLowerCase();

    if (!prompt) {
      return res.status(400).json({
        success: false,
        error: "prompt required"
      });
    }

    // =====================
    // MANUAL GEMINI
    // =====================

    if (provider === "gemini") {
      const answer = await askGemini(prompt);

      return res.json({
        success: true,
        answer,
        provider: "gemini"
      });
    }

    // =====================
    // MANUAL OPENAI
    // =====================

    if (
      provider === "openai" ||
      provider === "chatgpt"
    ) {
      const answer = await askOpenAI(prompt);

      return res.json({
        success: true,
        answer,
        provider: "openai"
      });
    }

    // =====================
    // MANUAL DEEPSEEK
    // =====================

    if (provider === "deepseek") {
      const answer = await askDeepSeek(prompt);

      return res.json({
        success: true,
        answer,
        provider: "deepseek"
      });
    }

    // =====================
    // AUTO FALLBACK
    // Gemini -> OpenAI -> DeepSeek
    // =====================

    try {
      const answer = await askGemini(prompt);

      return res.json({
        success: true,
        answer,
        provider: "gemini"
      });

    } catch (geminiError) {

      console.error(
        "Gemini failed:",
        geminiError.message
      );

      try {
        const answer = await askOpenAI(prompt);

        return res.json({
          success: true,
          answer,
          provider: "openai"
        });

      } catch (openaiError) {

        console.error(
          "OpenAI failed:",
          openaiError.message
        );

        try {
          const answer = await askDeepSeek(prompt);

          return res.json({
            success: true,
            answer,
            provider: "deepseek"
          });

        } catch (deepseekError) {

          console.error(
            "DeepSeek failed:",
            deepseekError.message
          );

          return res.status(500).json({
            success: false,
            error: "All AI providers failed",
            details: {
              gemini: geminiError.message,
              openai: openaiError.message,
              deepseek: deepseekError.message
            }
          });
        }
      }
    }

  } catch (error) {

    console.error("SERVER ERROR:", error);

    return res.status(500).json({
      success: false,
      error: error.message || "Server error"
    });
  }
});

// =========================
// START SERVER
// =========================

app.listen(PORT, () => {
  console.log(
    `Rudra AI Backend running on port ${PORT}`
  );
});
