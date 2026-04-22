exports.handler = async function (event) {

  // CORS headers — required so the browser accepts the response
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
  };

  // Handle preflight
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: cors, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: cors, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  // Check API key is configured
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
    return { statusCode: 400, headers: cors, body: JSON.stringify({ error: "Invalid JSON in request body" }) };
  }

  const { engineer, area, reason, engRole, weekNum, weekDate } = body;

  if (!area || !engineer) {
    return { statusCode: 400, headers: cors, body: JSON.stringify({ error: "Missing required fields: engineer and area" }) };
  }

  const systemPrompt = `You are a field service scheduling assistant for medical equipment service engineers based in Davao City, Philippines.
You know the geography of Mindanao well. Generate practical, optimized emergency field itineraries.
Respond ONLY in this JSON format (no markdown, no extra text):
{"title":"short title","departure":"city","days":[{"day":1,"stops":["City A → City B → City C"],"overnight":"City C"}],"return":"return route to Davao","notes":"brief operational notes","estimatedDays":1}`;

  const userMsg = `Generate an emergency field service itinerary.
Engineer: ${engineer}
Current assigned role this week: ${engRole || "Unknown"}
Emergency area/destination: ${area}
Reason: ${reason || "Urgent service call"}
Week: ${weekNum} starting ${weekDate}
Base city: Davao City, Philippines
Optimize route for Mindanao geography. If day trip, estimatedDays=1. If overnight needed, plan accordingly.`;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
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
        body: JSON.stringify({ error: "Anthropic error: " + (data.error.message || JSON.stringify(data.error)) }),
      };
    }

    const raw = (data.content || []).map((b) => b.text || "").join("");

    let parsed;
    try {
      parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());
    } catch {
      parsed = {
        title: "Emergency Field Trip",
        days: [{ day: 1, stops: [area], overnight: "" }],
        notes: raw || "Area: " + area,
        estimatedDays: 1,
        return: "Return to Davao",
      };
    }

    return {
      statusCode: 200,
      headers: cors,
      body: JSON.stringify(parsed),
    };

  } catch (err) {
    return {
      statusCode: 500,
      headers: cors,
      body: JSON.stringify({ error: "Server error: " + err.message }),
    };
  }
};
