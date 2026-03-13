const express = require("express");
const cors = require("cors");
const axios = require("axios");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.static('.'));

// ─── Helper: call Gemini ────────────────────────────────────────────────────
async function callGemini(parts, maxTokens = 1000) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`;
  const response = await axios.post(url, {
    contents: [{ parts }],
    generationConfig: { maxOutputTokens: maxTokens }
  });
  const text = response.data.candidates[0].content.parts[0].text;
  return text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
}

// ─── 1. Analyze food from photo ─────────────────────────────────────────────
app.post("/analyze-image", async (req, res) => {
  try {
    const { imageBase64, mediaType } = req.body;
    if (!imageBase64) return res.status(400).json({ error: "No image provided" });

    const raw = await callGemini([
      {
        text: `Look at this food photo. Identify the dish, estimate the portion shown, and give nutrition for that portion.
Reply with ONLY a JSON object, no other text. Use exactly these keys: "emoji" (one food emoji), "name" (dish name), "portion" (e.g. 1 plate), "cal" (calories number), "p" (protein g), "c" (carbs g), "f" (fat g), "f_fiber" (fiber g).
Example: {"emoji":"🍛","name":"Pav Bhaji","portion":"1 plate","cal":450,"p":12,"c":55,"f":18,"f_fiber":6}`
      },
      {
        inlineData: {
          mimeType: mediaType || "image/jpeg",
          data: imageBase64
        }
      }
    ], 512);

    res.json(JSON.parse(raw));
  } catch (error) {
    console.error("analyze-image error:", error.response?.data || error.message);
    res.status(500).json({ error: "Image analysis failed" });
  }
});

// ─── 2. Search food by text ──────────────────────────────────────────────────
app.post("/search-food", async (req, res) => {
  try {
    const { query, goal } = req.body;
    if (!query) return res.status(400).json({ error: "No query provided" });

    const raw = await callGemini([{
      text: `You are a nutrition database. Food: "${query}". Goal: ${goal || "general health"}.
Return real nutrition for a standard serving.
Only valid JSON with keys: emoji, name, portion, cal, p, c, f, f_fiber (all numbers except emoji/name/portion). No markdown.`
    }], 400);

    res.json(JSON.parse(raw));
  } catch (error) {
    console.error("search-food error:", error.response?.data || error.message);
    res.status(500).json({ error: "Food search failed" });
  }
});

// ─── 3. Generate recipes from pantry ingredients ─────────────────────────────
app.post("/generate-recipes", async (req, res) => {
  try {
    const { ingredients, goal, cuisines, calorieGoal, proteinFloor } = req.body;
    if (!ingredients || ingredients.length === 0)
      return res.status(400).json({ error: "No ingredients provided" });

    const goalInstructions = {
      lose: `For WEIGHT LOSS: Rank recipes by highest Satiety-to-Calorie ratio (Fiber×5 + Protein×3) / (Calories/100). Prefer boiled/steamed over fried.`,
      muscle: `For MUSCLE GAIN: Rank recipes by highest bioavailable protein content. Target protein-to-carb ratio of at least 1:2.`,
      maintain: `For MAINTENANCE: Rank recipes by macro balance — aim for ~30% protein, 40% carbs, 30% fat.`,
      athletic: `For ATHLETIC PERFORMANCE: Rank recipes by carbohydrate availability for energy + protein for recovery.`
    };

    const cuisineContext = cuisines && cuisines.length > 0 ? cuisines.join(", ") : "Indian, Mediterranean, General";

    const prompt = `You are a Senior Clinical Nutritionist and Chef.
User's available ingredients: ${ingredients.join(", ")}
User's goal: ${goal || "maintain"}
Preferred cuisines: ${cuisineContext}
Protein floor: ${proteinFloor || 120}g/day, Calorie target: ${calorieGoal || 2000} kcal

${goalInstructions[goal] || goalInstructions.maintain}

Generate exactly 3 healthy recipes. Rank them 1 (best match) to 3.
Respond ONLY with a valid JSON array, no markdown, no backticks:
[
  {
    "rank": 1,
    "emoji": "<single emoji>",
    "name": "<specific dish name>",
    "description": "<2 sentence description>",
    "goalMatchPct": <integer 70-98>,
    "goalMatchReason": "<one line why this fits their goal>",
    "cal": <integer>,
    "protein": <integer grams>,
    "carbs": <integer grams>,
    "fat": <integer grams>,
    "fiber": <integer grams>,
    "portion": "<e.g. 1 bowl (300g)>",
    "ingredientsUsed": ["<ingredient>"],
    "optionalBoosts": ["<optional ingredient>"],
    "cookingSteps": ["<step 1>", "<step 2>", "<step 3>", "<step 4>"],
    "nutritionistTweak": "<specific cooking modification>",
    "satietyScore": <float e.g. 4.2>
  }
]`;

    const raw = await callGemini([{ text: prompt }], 3000);
    const parsed = JSON.parse(raw);
    res.json(Array.isArray(parsed) ? parsed : parsed.recipes || []);
  } catch (error) {
    console.error("generate-recipes error:", error.response?.data || error.message);
    res.status(500).json({ error: "Recipe generation failed" });
  }
});

// ─── Start server ────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`NutriAI backend running on port ${PORT}`));