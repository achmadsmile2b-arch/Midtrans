import express from "express";
import axios from "axios";
import bodyParser from "body-parser";
import cors from "cors";

const app = express();
app.use(cors());
app.use(bodyParser.json());

const MIDTRANS_SERVER_KEY = process.env.MIDTRANS_SERVER_KEY;
const SHOPIFY_STORE_URL = process.env.SHOPIFY_STORE_URL;

app.get("/", (req, res) => {
  res.send("✅ Midtrans LIVE server aktif dan siap menerima webhook");
});

// 📦 Webhook Shopify → buat link pembayaran Midtrans
app.post("/webhook", async (req, res) => {
  try {
    const order = req.body;
    console.log("📦 Webhook diterima:", order);

    const orderId = order.id || `ORD-${Date.now()}`;
    const amount = parseFloat(order.total_price) || 0;
    const customer = order.customer || {};

    console.log(`➡️ Proses order: ${orderId}, total: ${amount}`);

    // ======== REQUEST SNAP (LIVE) ========
    const response = await axios.post(
      "https://app.midtrans.com/snap/v1/transactions",
      {
        transaction_details: {
          order_id: orderId,
          gross_amount: amount,
        },
        customer_details: {
          first_name: customer.first_name || "Pelanggan",
          email: customer.email || "unknown@email.com",
          phone: customer.phone || "",
        },
        credit_card: {
          secure: true,
        },
        callbacks: {
          finish: `${SHOPIFY_STORE_URL}/checkout/thank_you`,
        },
      },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization:
            "Basic " +
            Buffer.from(MIDTRANS_SERVER_KEY + ":").toString("base64"),
        },
      }
    );

    const redirectUrl = response.data.redirect_url;
    console.log("✅ Link pembayaran Midtrans:", redirectUrl);
    // ======== Update catatan pesanan di Shopify ========
try {
  const updateNote = {
    order: {
      id: orderId,
      note: `🔗 Link pembayaran Midtrans (LIVE): ${redirectUrl}`,
    },
  };

  const shopifyUrl = `https://${process.env.SHOPIFY_STORE_DOMAIN}/admin/api/2025-10/orders/${orderId}.json`;
  await axios.put(shopifyUrl, updateNote, {
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": process.env.SHOPIFY_ACCESS_TOKEN,
    },
  });

  console.log("📝 Catatan order Shopify diperbarui dengan link Midtrans");
} catch (e) {
  console.error(
    "❌ Gagal memperbarui catatan order Shopify:",
    e.response?.data || e.message
  );
}

    // 📝 (opsional) kirim balasan ke Shopify webhook
    res.status(200).json({
      success: true,
      message: "Transaksi Midtrans berhasil dibuat",
      redirect_url: redirectUrl,
    });
  } catch (err) {
    console.error("❌ Gagal buat link Midtrans:", err.response?.data || err);
    res.status(500).json({
      success: false,
      message: "Gagal membuat transaksi Midtrans",
      error: err.response?.data || err.message,
    });
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`🚀 Server berjalan di port ${PORT} (LIVE MODE)`);
});
