import express from "express";
import axios from "axios";
import bodyParser from "body-parser";
import cors from "cors";

const app = express();
app.use(cors());
app.use(bodyParser.json());

const PORT = process.env.PORT || 10000;

// === Konfigurasi Environment ===
const MIDTRANS_SERVER_KEY = process.env.MIDTRANS_SERVER_KEY; // 🔑 server key LIVE Midtrans
const MIDTRANS_BASE_URL = "https://api.midtrans.com/v2/charge";
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const SHOPIFY_STORE = process.env.SHOPIFY_STORE; // contoh: arkebstore.myshopify.com

// ✅ Tempat menyimpan link pembayaran sementara di memori (bisa pakai DB nanti)
const paymentLinks = new Map();

// === Webhook dari Shopify ===
app.post("/webhook", async (req, res) => {
  try {
    const order = req.body;
    const orderId = order.id;
    const total = Math.round(order.total_price);
    const email = order.email || "pelanggan@domain.com";
    const name =
      (order.shipping_address?.first_name || "") +
      " " +
      (order.shipping_address?.last_name || "");
    const phone = order.shipping_address?.phone || "0000000000";

    console.log(`🟢 Webhook diterima: Order ${orderId}`);

    // === Payload Midtrans (LIVE) ===
    const payload = {
      payment_type: "bank_transfer",
      transaction_details: {
        order_id: `SHOPIFY-${orderId}`,
        gross_amount: total,
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

    // === Request ke Midtrans
    const response = await axios.post(MIDTRANS_BASE_URL, payload, {
      headers: {
        Authorization:
          "Basic " + Buffer.from(MIDTRANS_SERVER_KEY + ":").toString("base64"),
        "Content-Type": "application/json",
      },
    });

    const snapLink = response.data.redirect_url;
    console.log("✅ Link pembayaran Midtrans:", snapLink);

    // Simpan link ke Map sementara
    paymentLinks.set(String(orderId), snapLink);

    // Tambahkan catatan ke order Shopify
    await axios.put(
      `https://${SHOPIFY_STORE}/admin/api/2025-10/orders/${orderId}.json`,
      {
        order: { id: orderId, note: `Link pembayaran: https://midtrans.onrender.com/pay/${orderId}` },
      },
      {
        headers: {
          "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN,
          "Content-Type": "application/json",
        },
      }
    );

    console.log("📝 Catatan order diperbarui dengan link redirect");

    return res.status(200).send("Webhook processed ✅");
  } catch (err) {
    console.error("❌ Gagal proses webhook:", err.response?.data || err.message);
    return res.status(500).json({ error: err.message });
  }
});

// === Halaman Redirect /pay/:orderId ===
app.get("/pay/:orderId", (req, res) => {
  const orderId = req.params.orderId;
  const snapLink = paymentLinks.get(String(orderId));

  if (!snapLink) {
    return res
      .status(404)
      .send("<h3>⚠️ Link pembayaran tidak ditemukan. Silakan cek email atau hubungi admin.</h3>");
  }

  // Redirect otomatis ke Midtrans
  const html = `
    <html>
      <head>
        <meta http-equiv="refresh" content="1;url=${snapLink}" />
        <script>window.location.href="${snapLink}";</script>
      </head>
      <body style="font-family:sans-serif;text-align:center;margin-top:100px;">
        <h2>💳 Mengalihkan ke halaman pembayaran Midtrans...</h2>
        <p>Jika tidak berpindah otomatis, <a href="${snapLink}">klik di sini</a>.</p>
      </body>
    </html>
  `;
  res.send(html);
});

// === Tes Route ===
app.get("/", (req, res) => {
  res.send("🚀 Server Midtrans Redirect aktif (LIVE)");
});

app.listen(PORT, () => console.log(`✅ Server berjalan di port ${PORT} (LIVE)`));
