const express = require("express");

const app = express();
app.use(express.json({ limit: "1mb" }));

const PORT = process.env.PORT || 3000;
const REQUEST_TIMEOUT = 15000;

// =========================
// HOME
// =========================

app.get("/", (req, res) => {
  res.json({
    success: true,
    service: "Rudra AI Backend",
    providers: ["gemini", "openai", "groq"],
    mode: "parallel-fastest-response",
    fallback: "parallel-race",
    status: "online"
  });
});

// =========================
// GEMINI
// =========================

async function askGemini(prompt, signal) {
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
      }),
      signal
    }
  );

  const data = await response.json();

  if (!response.ok) {
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
    throw new Error("Gemini returned empty response");
  }

  return answer;
}

// =========================
// OPENAI
// =========================

async function askOpenAI(prompt, signal) {
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
      }),
      signal
    }
  );

  const data = await response.json();

  if (!response.ok) {
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
    throw new Error("OpenAI returned empty response");
  }

  return answer;
}

// =========================
// GROQ
// =========================

async function askGroq(prompt, signal) {
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
        ]
      }),
      signal
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data?.error?.message || "Groq API request failed"
    );
  }

  const answer =
    data?.choices?.[0]?.message?.content
      ?.trim() || "";

  if (!answer) {
    throw new Error("Groq returned empty response");
  }

  return answer;
}

// =========================
// PROVIDERS
// =========================

const PROVIDERS = {
  gemini: askGemini,
  openai: askOpenAI,
  groq: askGroq
};

// =========================
// SAFE ABORT
// =========================

function safeAbort(controller) {
  try {
    if (!controller.signal.aborted) {
      controller.abort();
    }
  } catch (error) {
    console.error("Abort error:", error.message);
  }
}

// =========================
// TIMEOUT WRAPPER
// =========================

function withTimeout(provider, task, controller) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      safeAbort(controller);
      reject(
        new Error(`${provider} request timed out`)
      );
    }, REQUEST_TIMEOUT);

    task
      .then(result => {
        clearTimeout(timer);
        resolve(result);
      })
      .catch(error => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

// =========================
// PARALLEL FASTEST RESPONSE
// =========================

async function askFastest(prompt) {
  const controllers = {
    gemini: new AbortController(),
    openai: new AbortController(),
    groq: new AbortController()
  };

  const errors = {};

  const tasks = Object.entries(PROVIDERS).map(
    ([name, fn]) => {

      const task = withTimeout(
        name,
        fn(
          prompt,
          controllers[name].signal
        ),
        controllers[name]
      );

      return task
        .then(answer => ({
          answer,
          provider: name
        }))
        .catch(error => {

          errors[name] =
            error?.name === "AbortError"
              ? `${name} request cancelled`
              : error.message;

          throw error;
        });
    }
  );

  try {

    const winner = await Promise.any(tasks);

    // Cancel remaining requests
    Object.values(controllers).forEach(
      safeAbort
    );

    return winner;

  } catch (error) {

    Object.values(controllers).forEach(
      safeAbort
    );

    throw new Error(
      JSON.stringify({
        message: "All AI providers failed",
        details: errors
      })
    );
  }
}

// =========================
// ASK ROUTE
// =========================

app.post("/ask", async (req, res) => {

  let responded = false;

  const sendOnce = (status, data) => {

    if (responded || res.headersSent) {
      return;
    }

    responded = true;

    return res.status(status).json(data);
  };

  try {

    const prompt = req.body?.prompt;

    const provider = String(
      req.body?.provider || "auto"
    ).toLowerCase();

    if (
      typeof prompt !== "string" ||
      !prompt.trim()
    ) {
      return sendOnce(400, {
        success: false,
        error: "prompt required"
      });
    }

    // =====================
    // MANUAL PROVIDER
    // =====================

    if (provider !== "auto") {

      const selectedProvider =
        provider === "chatgpt"
          ? "openai"
          : provider;

      if (!PROVIDERS[selectedProvider]) {

        return sendOnce(400, {
          success: false,
          error: "Invalid provider",
          available: [
            "auto",
            "gemini",
            "openai",
            "groq"
          ]
        });
      }

      const controller =
        new AbortController();

      try {

        const answer = await withTimeout(
          selectedProvider,
          PROVIDERS[selectedProvider](
            prompt,
            controller.signal
          ),
          controller
        );

        return sendOnce(200, {
          success: true,
          answer,
          provider: selectedProvider,
          mode: "manual"
        });

      } catch (error) {

        safeAbort(controller);

        return sendOnce(500, {
          success: false,
          error: error.message,
          provider: selectedProvider
        });
      }
    }

    // =====================
    // AUTO: PARALLEL RACE
    // =====================

    const result = await askFastest(prompt);

    return sendOnce(200, {
      success: true,
      answer: result.answer,
      provider: result.provider,
      mode: "parallel-fastest"
    });

  } catch (error) {

    console.error("SERVER ERROR:", error);

    return sendOnce(500, {
      success: false,
      error: "All AI providers failed",
      details: error.message
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

  console.log(
    "Mode: PARALLEL FASTEST RESPONSE"
  );

});
