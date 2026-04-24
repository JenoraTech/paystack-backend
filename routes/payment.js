const express = require("express");
const axios = require("axios");
const crypto = require("crypto");

// =========================
// 🔥 REPLACED: Mongo Model → PostgreSQL
// =========================
const pool = require("../config/db");

const router = express.Router();

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;

/**
 * INITIATE PAYMENT
 */
router.post("/initialize-payment", async (req, res) => {
  try {
    const { email, amount, deviceId } = req.body;

    if (!email || !amount) {
      return res.status(400).json({
        error: "Email and amount are required",
      });
    }

    if (!deviceId) {
      return res.status(400).json({
        error: "deviceId is required for subscription binding",
      });
    }

    const response = await axios.post(
      "https://api.paystack.co/transaction/initialize",
      {
        email,
        amount: amount * 100,
        callback_url: "https://your-domain.com/payment-success",
        metadata: { deviceId },
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
      authorization_url: data.authorization_url,
    });
  } catch (error) {
    console.log(error.response?.data || error.message);

    return res.status(500).json({
      error: "Payment initialization failed",
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

    const response = await axios.get(
      `https://api.paystack.co/transaction/verify/${reference}`,
      {
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
        },
      },
    );

    const data = response.data.data;

    if (data.status !== "success") {
      return res.status(400).json({
        error: "Payment not successful",
      });
    }

    const deviceId = data.metadata?.deviceId;

    if (!deviceId) {
      return res.status(400).json({
        error: "Device ID not found",
      });
    }

    // =========================
    // 🔥 POSTGRESQL UPSERT (REPLACED MONGOOSE)
    // =========================
    await pool.query(
      `
      INSERT INTO purchases (device_id, email, reference, amount, is_premium)
      VALUES ($1, $2, $3, $4, TRUE)
      ON CONFLICT (device_id)
      DO UPDATE SET
        email = EXCLUDED.email,
        reference = EXCLUDED.reference,
        amount = EXCLUDED.amount,
        is_premium = TRUE,
        updated_at = CURRENT_TIMESTAMP
      `,
      [deviceId, data.customer.email, data.reference, data.amount / 100],
    );

    return res.status(200).json({
      message: "Payment verified",
      premium: true,
    });
  } catch (error) {
    return res.status(500).json({
      error: "Verification failed",
    });
  }
});

/**
 * WEBHOOK
 */
router.post("/webhook", async (req, res) => {
  try {
    const hash = crypto
      .createHmac("sha512", PAYSTACK_SECRET_KEY)
      .update(JSON.stringify(req.body))
      .digest("hex");

    if (hash !== req.headers["x-paystack-signature"]) {
      return res.status(401).send("Invalid signature");
    }

    const event = req.body;

    if (event.event === "charge.success") {
      const data = event.data;

      const deviceId = data.metadata?.deviceId;

      if (deviceId) {
        await pool.query(
          `
          INSERT INTO purchases (device_id, email, reference, amount, is_premium)
          VALUES ($1, $2, $3, $4, TRUE)
          ON CONFLICT (device_id)
          DO UPDATE SET
            email = EXCLUDED.email,
            reference = EXCLUDED.reference,
            amount = EXCLUDED.amount,
            is_premium = TRUE,
            updated_at = CURRENT_TIMESTAMP
          `,
          [deviceId, data.customer.email, data.reference, data.amount / 100],
        );
      }

      return res.status(200).send("OK");
    }

    return res.status(200).send("Ignored");
  } catch (err) {
    return res.status(500).send("Webhook error");
  }
});

/**
 * CHECK PREMIUM
 */
router.post("/check-premium", async (req, res) => {
  try {
    const { deviceId } = req.body;

    const result = await pool.query(
      "SELECT * FROM purchases WHERE device_id = $1",
      [deviceId],
    );

    return res.json({
      premium: result.rows.length > 0,
    });
  } catch (err) {
    return res.status(500).json({
      error: "Check failed",
    });
  }
});

module.exports = router;
