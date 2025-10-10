import express from "express";
import axios from "axios";
import bodyParser from "body-parser";
import cors from "cors";

const app = express();
app.use(cors());
app.use(bodyParser.json());

// ---- CONFIG ----
const MIDTRANS_API_URL = process.env.MIDTRANS_API_URL || "https://api.sandbox.midtrans.com/v2/charge";
const MIDTRANS_SERVER_KEY = process.env.MIDTRANS_SERVER_KEY;
const SHOPIFY_STORE = process.env.SHOPIFY_STORE_URL || "https://arkebstore.myshopify.com";

// ---- TEST ROUTE ----
app.get("/", (req, res) => {
  res.send("✅ Midtrans server aktif & siap menerima webhook!");
});

// ---- WEBHOOK ROUTE ----
app.post("/webhook", async (req, res) => {
  try {
    const order = req.body;
    console.log("🟢 Webhook diterima:", order);

    if (!order.order_id || !order.total_price) {
      console.error("❌ Data tidak lengkap:", order);
      return res.status(400).json({ error: "Data order tidak lengkap" });
    }

    const payload = {
      transaction_details: {
        order_id: order.order_id,
        gross_amount: order.total_price,
      },
      customer_details: {
        first_name: order.customer_name || "Customer",
        email: order.customer_email || "noemail@arkebstore.com",
        phone: order.customer_phone || "0000000000",
      },
      credit_card: {
        secure: true,
      },
    };

    const response = await axios.post(MIDTRANS_API_URL, payload, {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${Buffer.from(MIDTRANS_SERVER_KEY + ":").toString("base64")}`,
      },
    });

    const redirectUrl = response.data.redirect_url;
    console.log("✅ Link pembayaran Midtrans:", redirectUrl);

    res.status(200).json({ message: "OK", redirect_url: redirectUrl });
  } catch (err) {
    console.error("❌ Gagal proses webhook:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ---- START SERVER ----
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`🚀 Server berjalan di port ${PORT} (LIVE MODE)`);
  console.log(`🌐 Midtrans API URL: ${MIDTRANS_API_URL}`);
});
