import express from "express";
import axios from "axios";
import crypto from "crypto";
import bodyParser from "body-parser";
import cors from "cors";

const app = express();
app.use(cors());
app.use(bodyParser.json());

// === Environment Variable (Render otomatis inject) ===
const {
  SHOPIFY_STORE_URL,
  SHOPIFY_ADMIN_TOKEN,
  MIDTRANS_SERVER_KEY,
  MIDTRANS_API_URL,
  PORT
} = process.env;

// === Fungsi utilitas ===
const shopifyHeaders = {
  "X-Shopify-Access-Token": SHOPIFY_ADMIN_TOKEN,
  "Content-Type": "application/json",
};

// === Endpoint utama buat Midtrans checkout ===
app.post("/midtrans/create", async (req, res) => {
  try {
    const { order_id, gross_amount, customer } = req.body;

    // Buat transaksi di Midtrans
    const payload = {
      transaction_details: {
        order_id,
        gross_amount,
      },
      customer_details: {
        first_name: customer.first_name,
        email: customer.email,
        phone: customer.phone,
      },
      enabled_payments: ["bank_transfer", "qris", "gopay", "credit_card"],
    };

    const midtransRes = await axios.post(MIDTRANS_API_URL, payload, {
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Basic ${Buffer.from(MIDTRANS_SERVER_KEY + ":").toString("base64")}`,
      },
    });

    const redirectUrl = midtransRes.data.redirect_url;

    console.log("✅ Midtrans redirect URL:", redirectUrl);

    // === Simpan link ke Shopify Order Note ===
    const orderUpdateUrl = `${SHOPIFY_STORE_URL}/admin/api/2023-10/orders/${order_id}.json`;
    await axios.put(
      orderUpdateUrl,
      {
        order: {
          id: order_id,
          note: redirectUrl, // simpan link Midtrans ke note
        },
      },
      { headers: shopifyHeaders }
    );

    console.log("✅ Link Midtrans berhasil disimpan di note order Shopify.");

    res.json({
      success: true,
      redirectUrl,
    });
  } catch (err) {
    console.error("❌ Gagal membuat transaksi Midtrans:", err.response?.data || err.message);
    res.status(500).json({
      success: false,
      error: err.response?.data || err.message,
    });
  }
});

// === Webhook notifikasi Midtrans ===
app.post("/midtrans/webhook", async (req, res) => {
  try {
    const notification = req.body;
    console.log("🔔 Notifikasi Midtrans:", notification);
    res.status(200).send("OK");
  } catch (err) {
    console.error("Webhook error:", err.message);
    res.status(500).send("Error");
  }
});

// === Tes koneksi ===
app.get("/", (req, res) => {
  res.send("Midtrans-Server Connected ✅");
});

// === Jalankan server ===
const port = PORT || 10000;
app.listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);
});
