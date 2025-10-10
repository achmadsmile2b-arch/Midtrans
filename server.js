import express from "express";
import axios from "axios";
import crypto from "crypto";
import bodyParser from "body-parser";
import cors from "cors";

const app = express();
app.use(cors());
app.use(bodyParser.json());

// ✅ Route untuk cek server
app.get("/", (req, res) => {
  res.send("Midtrans Server aktif ✅");
});

// ✅ Webhook dari Shopify
app.post("/midtrans/create", async (req, res) => {
  console.log("✅ Webhook diterima dari Shopify:", req.body);

  try {
    const order = req.body;
    const orderId = order.id || order.name || `ORD-${Date.now()}`;
    const grossAmount = order.total_price || order.current_total_price || 0;
    const email = order.email || "customer@example.com";
    const name = order.customer?.first_name || "Pelanggan";
    const phone = order.shipping_address?.phone || "08123456789";

    console.log(`🔹 Membuat link Midtrans untuk order ${orderId}`);

    // ✅ Payload Snap Midtrans
    const payload = {
      transaction_details: {
        order_id: orderId,
        gross_amount: parseInt(grossAmount),
      },
      customer_details: {
        first_name: name,
        email: email,
        phone: phone,
      },
      item_details: [
        {
          id: "order-item",
          price: parseInt(grossAmount),
          quantity: 1,
          name: `Pembayaran Order ${orderId}`,
        },
      ],
      credit_card: {
        secure: true,
      },
    };

    // ✅ Request ke Midtrans Snap
    const response = await axios.post(
      "https://app.midtrans.com/snap/v1/transactions",
      payload,
      {
        headers: {
          "Content-Type": "application/json",
          Authorization:
            "Basic " +
            Buffer.from(process.env.MIDTRANS_SERVER_KEY + ":").toString("base64"),
        },
      }
    );

    const snapLink = response.data.redirect_url;
    console.log("✅ Link Snap Midtrans:", snapLink);

    res.status(200).json({ success: true, snapLink });
  } catch (err) {
    console.error("❌ Gagal buat link Midtrans:", err.response?.data || err.message);
    res.status(500).json({ error: err.response?.data || err.message });
  }
});

// ✅ Jalankan server
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Server berjalan di port ${PORT}`));
