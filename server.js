import express from "express";
import axios from "axios";
import bodyParser from "body-parser";
import cors from "cors";

const app = express();
app.use(cors());
app.use(bodyParser.json());

const PORT = process.env.PORT || 10000;

// === KONFIGURASI LIVE ===
const MIDTRANS_SERVER_KEY = process.env.MIDTRANS_SERVER_KEY; // 🔑 pakai server key LIVE
const MIDTRANS_BASE_URL = "https://api.midtrans.com/v2/charge"; // ⬅️ bukan sandbox lagi
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const SHOPIFY_STORE = process.env.SHOPIFY_STORE; // contoh: arkebstore.myshopify.com

// === Webhook Shopify untuk redirect otomatis ke Midtrans ===
app.post("/webhook", async (req, res) => {
  try {
    const order = req.body;
    console.log("🟢 Webhook diterima:", order.id);

    const orderId = order.id;
    const total = order.total_price;
    const email = order.email || "pelanggan@domain.com";
    const name =
      (order.shipping_address?.first_name || "") +
      " " +
      (order.shipping_address?.last_name || "");
    const phone = order.shipping_address?.phone || "0000000000";

    // === Payload ke Midtrans LIVE ===
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
        bank: "bca", // bisa diganti bni, bri, permata, dll
      },
    };

    console.log("📦 Kirim payload ke Midtrans LIVE:", payload);

    const response = await axios.post(MIDTRANS_BASE_URL, payload, {
      headers: {
        Authorization:
          "Basic " + Buffer.from(MIDTRANS_SERVER_KEY + ":").toString("base64"),
        "Content-Type": "application/json",
      },
    });

    const snapLink = response.data.redirect_url;
    console.log("✅ Link Midtrans LIVE:", snapLink);

    // Simpan ke catatan order Shopify
    await axios.put(
      `https://${SHOPIFY_STORE}/admin/api/2025-10/orders/${orderId}.json`,
      {
        order: {
          id: orderId,
          note: `Link pembayaran Midtrans (LIVE): ${snapLink}`,
        },
      },
      {
        headers: {
          "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN,
          "Content-Type": "application/json",
        },
      }
    );

    console.log("📝 Catatan order Shopify diperbarui");

    // === Redirect pelanggan ke halaman Midtrans ===
    const redirectHTML = `
      <html>
        <head>
          <meta http-equiv="refresh" content="0;url=${snapLink}" />
          <script>window.location.href="${snapLink}";</script>
        </head>
        <body>
          <p>Mengalihkan ke halaman pembayaran Midtrans...</p>
        </body>
      </html>
    `;

    return res.status(200).send(redirectHTML);
  } catch (err) {
    console.error("❌ Gagal membuat link Midtrans LIVE:", err.response?.data || err.message);
    return res.status(500).json({ error: err.message });
  }
});

app.get("/", (req, res) => {
  res.send("🚀 Server Auto Redirect Midtrans LIVE aktif!");
});

app.listen(PORT, () => {
  console.log(`✅ Server berjalan di port ${PORT} (LIVE MODE)`);
});
