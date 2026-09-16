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
    providers: ["gemini", "grok"]
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
// GROK
// =========================
async function askGrok(prompt) {
  if (!process.env.XAI_API_KEY) {
    throw new Error("XAI_API_KEY is not configured");
  }

  const response = await fetch(
    "https://api.x.ai/v1/responses",
    {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.XAI_API_KEY}`
      },

      body: JSON.stringify({
        model: "grok-4.6",
        input: prompt
      }),

      signal: AbortSignal.timeout(120000)
    }
  );

  const data = await response.json();

  // IMPORTANT:
  // Actual xAI error Render logs mein dikhega
  if (!response.ok) {
    console.error(
      "GROK API ERROR:",
      JSON.stringify(data, null, 2)
    );

    const error = new Error(
      data?.error?.message ||
      data?.message ||
      `Grok HTTP ${response.status}`
    );

    error.status = response.status;
    error.provider = "grok";

    throw error;
  }

  // xAI Responses API ka normal output
  const answer = data?.output_text || "";

  if (!answer) {
    console.error(
      "GROK EMPTY RESPONSE:",
      JSON.stringify(data, null, 2)
    );

    throw new Error("Grok returned empty response");
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
  // MANUAL GROK
  // ==========================================
  if (provider === "grok") {
    try {
      const answer = await askGrok(prompt);

      return res.json({
        success: true,
        answer,
        provider: "grok"
      });

    } catch (error) {

      console.error(
        "Grok request failed:",
        error
      );

      return res.status(error.status || 502).json({
        success: false,
        error: error.message,
        provider: "grok"
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
  // Grok fallback
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
      "Gemini failed. Trying Grok fallback..."
    );


    // ==========================================
    // GROK FALLBACK
    // ==========================================
    try {

      const answer = await askGrok(prompt);

      return res.json({
        success: true,
        answer,
        provider: "grok",
        fallback: true
      });

    } catch (grokError) {

      console.error(
        "Grok fallback failed:",
        grokError.message
      );

      return res.status(502).json({
        success: false,
        error: "Both Gemini and Grok failed",

        gemini: {
          error: geminiError.message,
          status: geminiError.status || null
        },

        grok: {
          error: grokError.message,
          status: grokError.status || null
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
