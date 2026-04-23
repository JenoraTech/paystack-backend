const express = require("express");
const axios = require("axios");
const cors = require("cors");
require("dotenv").config();

const app = express();

app.use(cors());
app.use(express.json());

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;

/**
 * INITIATE TRANSACTION
 * This creates a Paystack transaction and returns access_code
 */
app.post("/initialize-payment", async (req, res) => {
  try {
    const { email, amount } = req.body;

    if (!email || !amount) {
      return res.status(400).json({
        error: "Email and amount are required",
      });
    }

    const response = await axios.post(
      "https://api.paystack.co/transaction/initialize",
      {
        email,
        amount: amount, // convert to kobo
      },
      {
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
          "Content-Type": "application/json",
        },
      },
    );

    const data = response.data.data;

    return res.status(200).json({
      access_code: data.access_code,
      reference: data.reference,
      authorization_url: data.authorization_url, // 🔥 REQUIRED
    });
  } catch (error) {
    console.log("Paystack Error:", error.response?.data || error.message);

    return res.status(500).json({
      error: "Payment initialization failed",
    });
  }
});

/**
 * SIMPLE TEST ROUTE
 */
app.get("/", (req, res) => {
  res.send("Paystack backend is running 🚀");
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
