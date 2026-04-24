const express = require("express");
const axios = require("axios");
const crypto = require("crypto");

// =========================
// ✅ ADDED: Purchase Model
// =========================
const Purchase = require("../models/Purchase");

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

        // =========================
        // ✅ FIXED: convert to kobo
        // =========================
        amount: amount * 100,

        // =========================
        // ✅ ADDED: optional redirect (safe for future use)
        // =========================
        callback_url: "https://your-domain.com/payment-success",

        // =========================
        // KEEP YOUR EXISTING METADATA
        // =========================
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
      // ✅ REQUIRED FOR FLUTTER FLOW
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

    // =========================
    // 🔥 ADDED: SAVE PURCHASE (ONE-TIME UNLOCK)
    // =========================
    await Purchase.findOneAndUpdate(
      { deviceId },
      {
        deviceId,
        email: data.customer.email,
        reference: data.reference,
        amount: data.amount / 100,
        isPremium: true,
      },
      {
        upsert: true,
        new: true,
      },
    );

    return res.status(200).json({
      message: "Payment verified successfully",
      reference: data.reference,
      amount: data.amount / 100,
      email: data.customer.email,
      deviceId: deviceId,
      status: "verified",
      premium: true,
    });
  } catch (error) {
    console.log("VERIFY ERROR:", error.response?.data || error.message);

    return res.status(500).json({
      error: "Payment verification failed",
      details: error.response?.data || error.message,
    });
  }
});

// =========================
// 🔥 PAYSTACK WEBHOOK
// =========================
router.post("/webhook", async (req, res) => {
  try {
    const secret = PAYSTACK_SECRET_KEY;

    const hash = crypto
      .createHmac("sha512", secret)
      .update(JSON.stringify(req.body))
      .digest("hex");

    // =========================
    // VERIFY PAYSTACK SIGNATURE
    // =========================
    if (hash !== req.headers["x-paystack-signature"]) {
      return res.status(401).send("Invalid signature");
    }

    const event = req.body;

    // =========================
    // HANDLE SUCCESSFUL PAYMENT
    // =========================
    if (event.event === "charge.success") {
      const data = event.data;

      const reference = data.reference;
      const amount = data.amount / 100;
      const email = data.customer.email;
      const deviceId = data.metadata?.deviceId;

      console.log("✅ PAYMENT SUCCESS (WEBHOOK):", {
        reference,
        amount,
        email,
        deviceId,
      });

      // =========================
      // 🔥 ADDED: SAVE PURCHASE (ONE-TIME UNLOCK)
      // =========================
      if (deviceId) {
        await Purchase.findOneAndUpdate(
          { deviceId },
          {
            deviceId,
            email,
            reference,
            amount,
            isPremium: true,
          },
          { upsert: true, new: true },
        );
      }

      return res.status(200).send("Webhook received");
    }

    res.status(200).send("Event ignored");
  } catch (error) {
    console.log("WEBHOOK ERROR:", error.message);
    res.status(500).send("Webhook error");
  }
});
/**
 * CHECK PREMIUM STATUS
 * Flutter uses this ONLY to unlock app
 */
router.post("/check-premium", async (req, res) => {
  try {
    const { deviceId } = req.body;

    if (!deviceId) {
      return res.status(400).json({
        error: "deviceId is required",
      });
    }

    const user = await Purchase.findOne({ deviceId });

    return res.status(200).json({
      premium: !!user,
    });
  } catch (error) {
    console.log("CHECK PREMIUM ERROR:", error.message);

    return res.status(500).json({
      error: "Failed to check premium status",
    });
  }
});

module.exports = router;
