import express from "express";
import cors from "cors";
import axios from "axios";
import bodyParser from "body-parser";

const app = express();
app.use(cors());
app.use(bodyParser.json());

// 🔑 Gunakan Server Key Live kamu dari Midtrans
const MIDTRANS_SERVER_KEY = "Mid-server-xxxxxxxxxxxxxxx";
const MIDTRANS_API_URL = "https://app.midtrans.com/snap/v1/transactions";

// 🔹 Endpoint untuk buat transaksi Snap
app.post("/create-transaction", async (req, res) => {
  try {
    const { amount, customer, order_id } = req.body;

    const response = await axios.post(
      MIDTRANS_API_URL,
      {
        transaction_details: {
          order_id: order_id || `ORDER-${Date.now()}`,
          gross_amount: amount,
        },
        customer_details: customer,
        credit_card: { secure: true },
      },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization:
            "Basic " + Buffer.from(MIDTRANS_SERVER_KEY + ":").toString("base64"),
        },
      }
    );

    res.json(response.data); // kirim link redirect ke Shopify
  } catch (err) {
    console.error("Midtrans Error:", err.response?.data || err.message);
    res.status(500).json({ error: err.message });
  }
});

// 🔹 Webhook untuk notifikasi status transaksi
app.post("/webhook", async (req, res) => {
  console.log("Webhook diterima:", req.body);
  res.status(200).send("OK");
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
