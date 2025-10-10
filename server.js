import express from "express";
import axios from "axios";
import bodyParser from "body-parser";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

// ✅ ENV
const {
  SHOPIFY_STORE_URL,
  SHOPIFY_ADMIN_TOKEN,
  SHOPIFY_LOCATION_ID,
  MIDTRANS_SERVER_KEY,
  MIDTRANS_API_URL,
  PORT = 10000,
} = process.env;

// ✅ Root check
app.get("/", (req, res) => {
  res.send("Midtrans-Webhook-Server aktif 🚀");
});

// ✅ WEBHOOK (dari Midtrans)
app.post("/webhook", async (req, res) => {
  try {
    console.log("⚡ Webhook diterima dari Midtrans:");
    console.log(req.body);

    const data = req.body;
    const order_id = data.order_id;
    const status = data.transaction_status;
    const gross_amount = data.gross_amount;

    if (!order_id) {
      console.log("⚠️ Tidak ada order_id dalam webhook, abaikan.");
      return res.status(200).send("OK");
    }

    console.log(`🧾 Order ${order_id}, Status: ${status}, Jumlah: ${gross_amount}`);

    // ✅ Update order di Shopify (jika settlement)
    if (status === "settlement") {
      const url = `${SHOPIFY_STORE_URL}/admin/api/2024-10/orders/${order_id}/transactions.json`;
      await axios.post(
        url,
        {
          transaction: {
            kind: "sale",
            status: "success",
            amount: gross_amount,
          },
        },
        {
          headers: {
            "X-Shopify-Access-Token": SHOPIFY_ADMIN_TOKEN,
            "Content-Type": "application/json",
          },
        }
      );
      console.log(`✅ Order ${order_id} diupdate jadi Paid di Shopify`);
    }

    res.status(200).send("OK");
  } catch (error) {
    console.error("❌ Webhook Error:", error.response?.data || error.message);
    res.status(200).send("OK"); // tetap kirim OK biar Midtrans anggap sukses
  }
});

// ✅ FITUR LINK PEMBAYARAN DARI EMAIL / MANUAL
app.get("/pay/:order_id", async (req, res) => {
  try {
    const order_id = req.params.order_id;
    console.log(`🧩 Permintaan pembayaran dari email untuk Order ${order_id}`);

    // 🔹 Ambil detail order dari Shopify
    const orderRes = await axios.get(
      `${SHOPIFY_STORE_URL}/admin/api/2024-10/orders/${order_id}.json`,
      {
        headers: {
          "X-Shopify-Access-Token": SHOPIFY_ADMIN_TOKEN,
          "Content-Type": "application/json",
        },
      }
    );

    const order = orderRes.data.order;
    const amount = parseInt(order.total_price);
    const customer = {
      first_name: order.customer?.first_name || "Customer",
      email: order.customer?.email || "noemail@unknown.com",
    };

    // 🔹 Buat transaksi Midtrans
    const midtransRes = await axios.post(
      MIDTRANS_API_URL,
      {
        transaction_details: {
          order_id,
          gross_amount: amount,
        },
        customer_details: customer,
        credit_card: { secure: true },
      },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: "Basic " + Buffer.from(MIDTRANS_SERVER_KEY + ":").toString("base64"),
        },
      }
    );

    const snapUrl = midtransRes.data.redirect_url;
    console.log(`💳 Redirect ke Midtrans Snap: ${snapUrl}`);
    res.redirect(snapUrl);
  } catch (error) {
    console.error("❌ Error saat buat link Midtrans:", error.response?.data || error.message);
    res.status(500).send("Gagal membuat link pembayaran");
  }
});

// ✅ Jalankan server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
