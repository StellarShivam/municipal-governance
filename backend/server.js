require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const cron = require("node-cron");

const dataFetchController = require("./controller/dataSync");

const app = express();
const PORT = process.env.PORT || 5000;

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(
  cors({
    origin: ["http://localhost:5173", "https://yourfrontend.com"],
    methods: "GET,POST,PUT,DELETE",
    allowedHeaders: "Content-Type,Authorization",
  })
);

// MongoDB Connection
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch((err) => console.error("❌ MongoDB Connection Error:", err));

// Schedule cron job to run at 6:00 PM IST (Asia/Kolkata)
cron.schedule("0 18 * * *", dataFetchController.syncGoogleSheetData, {
  scheduled: true,
  timezone: "Asia/Kolkata",
});

// API Route for manual sync
app.get("/api/sync", async (req, res) => {
  try {
    await dataFetchController.syncGoogleSheetData();
    // await dataFetchController.syncGoogleSheetToPDF();
    res.status(200).send("✅ Google Sheet data synced.");
  } catch (error) {
    res.status(500).send("❌ Error syncing data: " + error.message);
  }
});

app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
