const express = require("express");

const app = express();
app.use(express.json());

app.get("/", (req, res) => {
  res.json({
    status: "online",
    message: "Gemini Backend Server Running"
  });
});

app.post("/ask", async (req, res) => {
  try {
    const { prompt } = req.body;

    if (!prompt) {
      return res.status(400).json({
        error: "prompt is required"
      });
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
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json(data);
    }

    const answer =
      data?.steps
        ?.find(step => step.type === "model_output")
        ?.content
        ?.find(item => item.type === "text")
        ?.text || "No response";

    res.json({
      success: true,
      answer
    });

  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
