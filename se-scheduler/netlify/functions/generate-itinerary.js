exports.handler = async function(event, context) {
  // Only allow POST
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  // CORS headers so the browser can call this function
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json"
  };

  try {
    const { engineer, role, area, reason, weekNum, weekDate } = JSON.parse(event.body);

    if (!area || !area.trim()) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "Area is required" }) };
    }

    const systemPrompt = `You are a field service scheduling assistant for medical equipment service engineers based in Davao City, Philippines.
You know the geography of Mindanao well. Generate practical, optimized emergency field itineraries.
Respond ONLY in this JSON format (no markdown, no extra text):
{"title":"short title","departure":"city","days":[{"day":1,"stops":["City A → City B → City C"],"overnight":"City C"}],"return":"return route to Davao","notes":"brief operational notes","estimatedDays":1}`;

    const userMsg = `Generate an emergency field service itinerary.
Engineer: ${engineer}
Current assigned role this week: ${role}
Emergency area/destination: ${area}
Reason: ${reason || "Urgent service call"}
Base city: Davao City, Philippines
Week: ${weekNum} starting ${weekDate}
Optimize route for Mindanao geography. If day trip, estimatedDays=1. If overnight needed, plan accordingly.`;

    // API key is stored securely in Netlify environment variables — never exposed to browser
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1000,
        system: systemPrompt,
        messages: [{ role: "user", content: userMsg }]
      })
    });

    if (!response.ok) {
      const err = await response.text();
      console.error("Anthropic API error:", err);
      return { statusCode: 502, headers, body: JSON.stringify({ error: "AI service error. Please try again." }) };
    }

    const data = await response.json();
    const raw = (data.content || []).map(b => b.text || "").join("");

    let parsed;
    try {
      parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());
    } catch {
      parsed = {
        title: "Emergency Field Trip",
        days: [{ day: 1, stops: [area], overnight: area }],
        notes: raw,
        estimatedDays: 1,
        return: "→ Davao"
      };
    }

    return { statusCode: 200, headers, body: JSON.stringify({ itinerary: parsed }) };

  } catch (err) {
    console.error("Function error:", err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: "Server error. Please try again." }) };
  }
};
