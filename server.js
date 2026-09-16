const express = require("express");

const app = express();
app.use(express.json());


// =========================
// HOME
// =========================
app.get("/", (req, res) => {
  res.json({
    status: "online",
    message: "Rudra AI Backend Running",
    providers: ["gemini", "openai"]
  });
});


// =========================
// GEMINI
// =========================
async function askGemini(prompt) {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not configured");
  }

  const response = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/interactions",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": process.env.GEMINI_API_KEY,
        "Api-Revision": "2026-05-20"
      },
      body: JSON.stringify({
        model: "gemini-3.6-flash",
        input: prompt
      }),
      signal: AbortSignal.timeout(60000)
    }
  );

  const data = await response.json();

  if (!response.ok) {
    console.error(
      "GEMINI API ERROR:",
      JSON.stringify(data, null, 2)
    );

    const error = new Error(
      data?.error?.message ||
      data?.message ||
      `Gemini HTTP ${response.status}`
    );

    error.status = response.status;
    error.provider = "gemini";

    throw error;
  }

  const answer =
    data?.steps
      ?.find(step => step.type === "model_output")
      ?.content
      ?.find(item => item.type === "text")
      ?.text || "";

  if (!answer) {
    throw new Error("Gemini returned empty response");
  }

  return answer;
}


// =========================
// OPENAI
// =========================
async function askOpenAI(prompt) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  const response = await fetch(
    "https://api.openai.com/v1/responses",
    {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
      },

      body: JSON.stringify({
        model: "gpt-5.6-luna",
        input: prompt
      }),

      signal: AbortSignal.timeout(120000)
    }
  );

  const data = await response.json();

  if (!response.ok) {
    console.error(
      "OPENAI API ERROR:",
      JSON.stringify(data, null, 2)
    );

    const error = new Error(
      data?.error?.message ||
      `OpenAI HTTP ${response.status}`
    );

    error.status = response.status;
    error.provider = "openai";

    throw error;
  }

  const answer = data?.output_text || "";

  if (!answer) {
    console.error(
      "OPENAI EMPTY RESPONSE:",
      JSON.stringify(data, null, 2)
    );

    throw new Error("OpenAI returned empty response");
  }

  return answer;
}


// =========================
// ASK
// =========================
app.post("/ask", async (req, res) => {
  const { prompt } = req.body;

  if (!prompt) {
    return res.status(400).json({
      success: false,
      error: "prompt is required"
    });
  }

  const provider =
    typeof req.body.provider === "string"
      ? req.body.provider.toLowerCase()
      : null;


  // ==========================================
  // MANUAL OPENAI
  // ==========================================
  if (provider === "openai" || provider === "chatgpt") {
    try {
      const answer = await askOpenAI(prompt);

      return res.json({
        success: true,
        answer,
        provider: "openai"
      });

    } catch (error) {

      console.error(
        "OpenAI request failed:",
        error
      );

      return res.status(error.status || 502).json({
        success: false,
        error: error.message,
        provider: "openai"
      });
    }
  }


  // ==========================================
  // MANUAL GEMINI
  // ==========================================
  if (provider === "gemini") {
    try {
      const answer = await askGemini(prompt);

      return res.json({
        success: true,
        answer,
        provider: "gemini"
      });

    } catch (error) {

      console.error(
        "Gemini request failed:",
        error
      );

      return res.status(error.status || 502).json({
        success: false,
        error: error.message,
        provider: "gemini"
      });
    }
  }


  // ==========================================
  // AUTOMATIC MODE
  //
  // Gemini first
  // ↓
  // Gemini fails
  // ↓
  // OpenAI fallback
  // ==========================================
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

    console.log(
      "Gemini failed. Trying OpenAI fallback..."
    );


    // ==========================================
    // OPENAI FALLBACK
    // ==========================================
    try {

      const answer = await askOpenAI(prompt);

      return res.json({
        success: true,
        answer,
        provider: "openai",
        fallback: true
      });

    } catch (openaiError) {

      console.error(
        "OpenAI fallback failed:",
        openaiError.message
      );

      return res.status(502).json({
        success: false,
        error: "Both Gemini and OpenAI failed",

        gemini: {
          error: geminiError.message,
          status: geminiError.status || null
        },

        openai: {
          error: openaiError.message,
          status: openaiError.status || null
        }
      });
    }
  }
});


// =========================
// SERVER
// =========================
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(
    `Rudra AI Server running on port ${PORT}`
  );
});
