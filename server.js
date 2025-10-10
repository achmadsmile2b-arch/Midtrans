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
app.post("/webhook", express.json(), async (req, res) => {
  try {
    const order = req.body;
    console.log("📦 Webhook diterima:", order);

    const orderId =
  (typeof order.id === "string" && order.id.includes("/"))
    ? order.id.split("/").pop()
    : order.id || `ORD-${Date.now()}`;
    const amount = parseFloat(order.total_price) || 0;
    const customer = order.customer || {};

    console.log(`➡️ Proses order: ${orderId}, total: ${amount}`);

    // ====== 1. Buat transaksi Midtrans ======
    const midtransResponse = await axios.post(
      "https://app.midtrans.com/snap/v1/transactions",
      {
        transaction_details: {
          order_id: orderId,
          gross_amount: amount,
        },
        customer_details: {
          first_name: customer.first_name || "Pelanggan",
          email: customer.email || "unknown@example.com",
          phone: customer.phone || "",
        },
        credit_card: {
          secure: true,
        },
        callbacks: {
          finish: `${process.env.SHOPIFY_STORE_URL}/checkout/thank_you`,
        },
      },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization:
            "Basic " +
            Buffer.from(process.env.MIDTRANS_SERVER_KEY + ":").toString("base64"),
        },
      }
    );

    const redirectUrl = midtransResponse.data.redirect_url;
    console.log("✅ Link pembayaran Midtrans:", redirectUrl);

    // ====== 2. Update catatan order di Shopify ======
    const updateNote = {
      order: {
        id: orderId,
        note: `✅ Link pembayaran Midtrans: ${redirectUrl}`,
      },
    };

    // pastikan ID yang dikirim ke Shopify REST API bukan GID
const cleanOrderId =
  typeof orderId === "string" && orderId.includes("/")
    ? orderId.split("/").pop()
    : orderId;

// lalu ubah URL update catatan jadi:
const shopifyUrl = `https://${process.env.SHOPIFY_STORE_DOMAIN}/admin/api/2025-10/orders/${cleanOrderId}.json`;
    try {
      await axios.put(shopifyUrl, updateNote, {
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": process.env.SHOPIFY_ACCESS_TOKEN,
        },
      });
      console.log("📝 Catatan order Shopify diperbarui dengan link Midtrans");
    } catch (err) {
      console.error("❌ Gagal memperbarui catatan order Shopify:", err.response?.data || err.message);
    }

    // ====== 3. Kirim respon ke Shopify ======
    res.status(200).json({
      success: true,
      message: "Transaksi Midtrans berhasil dibuat",
      redirect_url: redirectUrl,
    });
  } catch (error) {
    console.error("🔥 Gagal proses webhook:", error.message);
    res.status(500).json({ success: false, message: "Gagal proses webhook", error: error.message });
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`🚀 Server berjalan di port ${PORT} (LIVE MODE)`);
});
