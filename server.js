import express from "express";
import cors from "cors";
import axios from "axios";
import bodyParser from "body-parser";

const app = express();
app.use(cors());
app.use(bodyParser.json());

// 🏷️ Ganti dengan LIVE Server Key Midtrans kamu
const MIDTRANS_SERVER_KEY = "Mid-server-XXXXXXXXXXXX"; // <- GANTI
const MIDTRANS_API_URL = "https://app.midtrans.com/snap/v1/transactions";

// ✅ Root route (biar tidak muncul “Cannot GET /”)
app.get("/", (req, res) => {
  res.send("🚀 Midtrans x Shopify API is running successfully!");
});

// 🧾 Endpoint untuk buat transaksi Snap
app.post("/create-transaction", async (req, res) => {
  try {
    const { amount, customer, order_id } = req.body;

    if (!amount) {
      return res.status(400).json({ error: "Missing amount" });
    }

    const payload = {
      transaction_details: {
        order_id: order_id || `ORDER-${Date.now()}`,
        gross_amount: amount,
      },
      customer_details: {
        first_name: customer?.first_name || "Guest",
        email: customer?.email || "noemail@unknown.com",
      },
      credit_card: { secure: true },
    };

    const response = await axios.post(MIDTRANS_API_URL, payload, {
      headers: {
        "Content-Type": "application/json",
        Authorization:
          "Basic " + Buffer.from(MIDTRANS_SERVER_KEY + ":").toString("base64"),
      },
    });

    console.log("✅ Transaksi dibuat:", response.data.token);
    res.json(response.data);
  } catch (err) {
    console.error("❌ Midtrans Error:", err.response?.data || err.message);
    res.status(500).json({ error: "Failed to create transaction" });
  }
});

// 🔔 Webhook Notifikasi Midtrans
app.post("/webhook", (req, res) => {
  try {
    const notification = req.body;
    console.log("🔔 Webhook diterima dari Midtrans:");
    console.log(JSON.stringify(notification, null, 2));

    // Kamu bisa tambahkan logic update order Shopify di sini
    // contoh: kirim PATCH ke API Shopify untuk ubah status pesanan

    res.status(200).send("OK");
  } catch (error) {
    console.error("❌ Webhook Error:", error.message);
    res.status(500).send("Webhook processing failed");
  }
});

// ✅ Jalankan server
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
