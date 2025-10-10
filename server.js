import express from "express";
import axios from "axios";
import bodyParser from "body-parser";
import crypto from "crypto";
import cors from "cors";

const app = express();
app.use(cors());
app.use(bodyParser.json());

// ✅ Render butuh port dari environment
const PORT = process.env.PORT || 10000;

// === KONFIGURASI MIDTRANS & SHOPIFY ===
const MIDTRANS_SERVER_KEY = process.env.MIDTRANS_SERVER_KEY;
const MIDTRANS_BASE_URL = "https://api.sandbox.midtrans.com/v2/charge";

const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const SHOPIFY_STORE = process.env.SHOPIFY_STORE; // contoh: arkebstore.myshopify.com

// === Fungsi bantu buat Signature (opsional untuk keamanan) ===
function generateSignature(orderId, grossAmount) {
  const payload = orderId + grossAmount + MIDTRANS_SERVER_KEY;
  return crypto.createHash("sha512").update(payload).digest("hex");
}

// === ROUTE WEBHOOK ===
app.post("/webhook", async (req, res) => {
  try {
    const order = req.body;
    console.log("🟢 Webhook diterima:", order.id, order.email);

    const orderId = order.id;
    const total = order.total_price;
    const email = order.email || "noemail@example.com";
    const name = order.shipping_address?.first_name + " " + order.shipping_address?.last_name;
    const phone = order.shipping_address?.phone || "0000000000";

    // === Buat payload Midtrans ===
    const payload = {
      payment_type: "bank_transfer",
      transaction_details: {
        order_id: `SHOPIFY-${orderId}`,
        gross_amount: Math.round(total),
      },
      customer_details: {
        first_name: name,
        email: email,
        phone: phone,
      },
      bank_transfer: {
        bank: "bca",
      },
    };

    console.log("📦 Mengirim ke Midtrans:", payload);

    const response = await axios.post(MIDTRANS_BASE_URL, payload, {
      headers: {
        Authorization:
          "Basic " +
          Buffer.from(MIDTRANS_SERVER_KEY + ":").toString("base64"),
        "Content-Type": "application/json",
      },
    });

    const snapLink = response.data.redirect_url;
    console.log("✅ Link pembayaran Midtrans:", snapLink);

    // === Update catatan order Shopify (agar tersimpan juga) ===
    await axios({
      method: "PUT",
      url: `https://${SHOPIFY_STORE}/admin/api/2025-10/orders/${orderId}.json`,
      headers: {
        "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN,
        "Content-Type": "application/json",
      },
      data: {
        order: {
          id: orderId,
          note: `Link pembayaran Midtrans: ${snapLink}`,
        },
      },
    });

    console.log("📝 Catatan order diperbarui di Shopify");

    // === Kirim redirect ===
    return res.status(200).json({
      success: true,
      redirect_url: snapLink,
    });
  } catch (err) {
    console.error("❌ Gagal buat link Midtrans:", err.response?.data || err.message);
    return res.status(500).json({ error: err.message });
  }
});

// === Tes Route Manual ===
app.get("/", (req, res) => {
  res.send("🚀 Server Midtrans Redirect aktif!");
});

// === Jalankan Server ===
app.listen(PORT, () => {
  console.log(`✅ Server berjalan di port ${PORT}`);
});
