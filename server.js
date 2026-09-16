const express = require("express");

const app = express();
app.use(express.json());

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
      })
    }
  );

  const data = await response.json();

  if (!response.ok) {
    const error = new Error(
      data?.error?.message || "Gemini request failed"
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
      })
    }
  );

  const data = await response.json();

  if (!response.ok) {
    const error = new Error(
      data?.error?.message || "Grok request failed"
    );

    error.status = response.status;
    throw error;
  }

  const answer = data?.output_text || "";

  if (!answer) {
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

  // User manually provider choose kar sakta hai
  const provider = req.body.provider?.toLowerCase();

  try {

    // =========================
    // MANUAL GROK
    // =========================
    if (provider === "grok") {
      const answer = await askGrok(prompt);

      return res.json({
        success: true,
        answer,
        provider: "grok"
      });
    }


    // =========================
    // MANUAL GEMINI
    // =========================
    if (provider === "gemini") {
      const answer = await askGemini(prompt);

      return res.json({
        success: true,
        answer,
        provider: "gemini"
      });
    }


    // =========================
    // AUTOMATIC MODE
    // Gemini first
    // Gemini fail/429 -> Grok
    // =========================
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

      console.log("Trying Grok fallback...");

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
          "Grok failed:",
          grokError.message
        );

        return res.status(502).json({
          success: false,
          error: "Both Gemini and Grok failed",
          gemini_error: geminiError.message,
          grok_error: grokError.message
        });
      }
    }

  } catch (error) {

    console.error(error);

    return res.status(500).json({
      success: false,
      error: error.message
    });
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
