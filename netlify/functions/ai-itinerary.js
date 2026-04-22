exports.handler = async function (event) {
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: cors, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: cors, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return {
      statusCode: 500,
      headers: cors,
      body: JSON.stringify({ error: "ANTHROPIC_API_KEY is not set in Netlify environment variables." }),
    };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, headers: cors, body: JSON.stringify({ error: "Invalid JSON body" }) };
  }

  const { engineer, area, reason, engRole, weekNum, weekDate } = body;

  if (!area || !engineer) {
    return { statusCode: 400, headers: cors, body: JSON.stringify({ error: "Missing engineer or area" }) };
  }

  const systemPrompt = `You are a field service scheduling assistant for medical equipment service engineers based in Davao City, Philippines. You know the geography of Mindanao well. Generate practical, optimized emergency field itineraries. Respond ONLY in this JSON format (no markdown, no extra text): {"title":"short title","departure":"city","days":[{"day":1,"stops":["City A to City B"],"overnight":"City C"}],"return":"return route to Davao","notes":"brief operational notes","estimatedDays":1}`;

  const userMsg = `Generate an emergency field service itinerary. Engineer: ${engineer}. Role this week: ${engRole || "Unknown"}. Emergency destination: ${area}. Reason: ${reason || "Urgent service call"}. Week ${weekNum} starting ${weekDate}. Base: Davao City, Philippines. Optimize for Mindanao geography.`;

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
        max_tokens: 1000,
        system: systemPrompt,
        messages: [{ role: "user", content: userMsg }],
      }),
    });

    const data = await response.json();

    if (data.error) {
      return {
        statusCode: 500,
        headers: cors,
        body: JSON.stringify({ error: "Anthropic: " + (data.error.message || JSON.stringify(data.error)) }),
      };
    }

    const raw = (data.content || []).map((b) => b.text || "").join("");

    let parsed;
    try {
      parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());
    } catch {
      parsed = {
        title: "Emergency Field Trip to " + area,
        days: [{ day: 1, stops: [area], overnight: "" }],
        notes: raw || "Destination: " + area,
        estimatedDays: 1,
        return: "Return to Davao",
      };
    }

    return { statusCode: 200, headers: cors, body: JSON.stringify(parsed) };

  } catch (err) {
    return {
      statusCode: 500,
      headers: cors,
      body: JSON.stringify({ error: "Server error: " + err.message }),
    };
  }
};
