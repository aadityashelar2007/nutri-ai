const express = require("express");
const cors = require("cors");
const axios = require("axios");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));

app.post("/analyze-food", async (req, res) => {
  try {
    const { imageBase64 } = req.body;

    if (!imageBase64) {
      return res.status(400).json({ error: "No image provided" });
    }

    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        contents: [
          {
            parts: [
              {
                text: "Identify the food in this image and estimate calories, protein, carbs, and fat. Return ONLY JSON like this: { name, calories, protein, carbs, fat }"
              },
              {
                inline_data: {
                  mime_type: "image/jpeg",
                  data: imageBase64.split(",")[1]
                }
              }
            ]
          }
        ]
      }
    );

    res.json(response.data);
  } catch (error) {
    console.error("Error:", error.response?.data || error.message);
    res.status(500).json({ error: "Food analysis failed" });
  }
});

app.listen(5000, () => {
  console.log("Server running on port 5000");
});