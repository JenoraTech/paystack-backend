const express = require("express");
const axios = require("axios");

const router = express.Router();

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;

/**
 * INITIATE PAYMENT
 * Creates Paystack transaction and returns access_code + authorization_url
 */
router.post("/initialize-payment", async (req, res) => {
  try {
    const { email, amount, deviceId } = req.body;

    // VALIDATION
    if (!email || !amount) {
      return res.status(400).json({
        error: "Email and amount are required",
      });
    }

    // DEVICE ID WARNING (added safely, does NOT break old apps)
    if (!deviceId) {
      return res.status(400).json({
        error: "deviceId is required for subscription binding",
      });
    }

    const response = await axios.post(
      "https://api.paystack.co/transaction/initialize",
      {
        email,
        amount: amount * 100, // convert to kobo

        // ✅ ADDED: device tracking without breaking your flow
        metadata: {
          deviceId: deviceId,
        },
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
      // =========================
      // KEEP YOUR EXISTING OUTPUT
      // =========================
      access_code: data.access_code,
      reference: data.reference,

      // =========================
      // ✅ ADDED (CRITICAL FIX FOR BETA SDK FLOW)
      // =========================
      authorization_url: data.authorization_url,
    });
  } catch (error) {
    console.log("PAYSTACK ERROR:", error.response?.data || error.message);

    return res.status(500).json({
      error: "Payment initialization failed",
      details: error.response?.data || error.message,
    });
  }
});

/**
 * VERIFY PAYMENT
 */
router.post("/verify-payment", async (req, res) => {
  try {
    const { reference } = req.body;

    if (!reference) {
      return res.status(400).json({
        error: "Reference is required",
      });
    }

    // STEP 1: VERIFY WITH PAYSTACK SERVER
    const response = await axios.get(
      `https://api.paystack.co/transaction/verify/${reference}`,
      {
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
        },
      },
    );

    const data = response.data.data;

    // STEP 2: CHECK IF PAYMENT IS SUCCESSFUL
    if (data.status !== "success") {
      return res.status(400).json({
        error: "Payment not successful",
        status: data.status,
      });
    }

    // STEP 3: EXTRACT DEVICE ID FROM METADATA
    const deviceId = data.metadata?.deviceId;

    if (!deviceId) {
      return res.status(400).json({
        error: "Device ID not found in transaction metadata",
      });
    }

    // STEP 4: (NEXT PHASE) SAVE SUBSCRIPTION
    // We'll connect database in next step

    return res.status(200).json({
      message: "Payment verified successfully",
      reference: data.reference,
      amount: data.amount / 100,
      email: data.customer.email,
      deviceId: deviceId,
      status: "verified",
    });
  } catch (error) {
    console.log("VERIFY ERROR:", error.response?.data || error.message);

    return res.status(500).json({
      error: "Payment verification failed",
      details: error.response?.data || error.message,
    });
  }
});

module.exports = router;
