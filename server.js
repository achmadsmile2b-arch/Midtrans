import express from "express";
import cors from "cors";
import axios from "axios";
import bodyParser from "body-parser";

const app = express();
app.use(cors());
app.use(bodyParser.json());

// 🔑 Semua key dari Environment Render
const MIDTRANS_SERVER_KEY = process.env.MIDTRANS_SERVER_KEY;
const MIDTRANS_API_URL = "https://app.midtrans.com/snap/v1/transactions";
const SHOPIFY_STORE_URL = process.env.SHOPIFY_STORE_URL;
const SHOPIFY_ADMIN_TOKEN = process.env.SHOPIFY_ADMIN_TOKEN;
const SHOPIFY_LOCATION_ID = process.env.SHOPIFY_LOCATION_ID;

// ✅ Root route
app.get("/", (req, res) => {
  res.send("🚀 Midtrans x Shopify Integration API is running successfully!");
});

// 🧾 CREATE TRANSACTION — dipanggil dari Shopify (tombol “Bayar via Midtrans”)
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

// 🔔 WEBHOOK — menerima notifikasi pembayaran dari Midtrans
app.post("/webhook", async (req, res) => {
  try {
    const notification = req.body;
    console.log("🔔 Webhook diterima dari Midtrans:");
    console.log(JSON.stringify(notification, null, 2));

    const { order_id, transaction_status, fraud_status } = notification;

    // Tentukan status pembayaran Shopify berdasarkan status Midtrans
    let shopifyStatus = "pending";
    if (transaction_status === "settlement" && fraud_status === "accept") {
      shopifyStatus = "paid";
    } else if (transaction_status === "pending") {
      shopifyStatus = "pending";
    } else if (
      transaction_status === "deny" ||
      transaction_status === "cancel" ||
      transaction_status === "expire"
    ) {
      shopifyStatus = "voided";
    }

    // 🔐 Pastikan credential tersedia
    if (!SHOPIFY_STORE_URL || !SHOPIFY_ADMIN_TOKEN) {
      console.error("❌ Missing Shopify environment variables");
      return res.status(400).send("Missing Shopify credentials");
    }

    // 🔗 Endpoint update order di Shopify
    const apiUrl = `${SHOPIFY_STORE_URL}/admin/api/2024-10/orders/${order_id}.json`;
    console.log(`📦 Update ke Shopify: ${apiUrl}`);

    // 🧾 Update status pembayaran
    await axios.put(
      apiUrl,
      {
        order: {
          id: order_id,
          financial_status: shopifyStatus,
          note: `💳 Updated by Midtrans webhook: ${transaction_status}`,
        },
      },
      {
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": SHOPIFY_ADMIN_TOKEN,
        },
      }
    );

    console.log(`✅ Shopify order ${order_id} diupdate ke status: ${shopifyStatus}`);

    // 📦 Jika pembayaran sukses → auto fulfillment
    if (shopifyStatus === "paid" && SHOPIFY_LOCATION_ID) {
      const fulfillmentRes = await axios.post(
        `${SHOPIFY_STORE_URL}/admin/api/2024-10/orders/${order_id}/fulfillments.json`,
        {
          fulfillment: {
            location_id: SHOPIFY_LOCATION_ID,
            tracking_number: "",
            notify_customer: true,
          },
        },
        {
          headers: {
            "Content-Type": "application/json",
            "X-Shopify-Access-Token": SHOPIFY_ADMIN_TOKEN,
          },
        }
      );

      console.log(`📦 Order ${order_id} berhasil di-mark Fulfilled`);
      console.log("Fulfillment:", fulfillmentRes.data);
    }

    res.status(200).send("OK");
  } catch (error) {
  console.error("❌ Webhook Error:", error.response?.data || error.message);
  // tetap kirim 200 agar Midtrans anggap sukses
  res.status(200).send("OK");
}
  }
});


// 💌 FITUR TAMBAHAN: LINK “BAYAR SEKARANG” DARI EMAIL
app.get("/pay/:order_id", async (req, res) => {
  try {
    const order_id = req.params.order_id;
    console.log(`🧾 Permintaan pembayaran dari email untuk Order ${order_id}`);

    // Ambil detail order dari Shopify
    const orderRes = await axios.get(
      `${SHOPIFY_STORE_URL}/admin/api/2024-10/orders/${order_id}.json`,
      {
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": SHOPIFY_ADMIN_TOKEN,
        },
      }
    );

    const order = orderRes.data.order;
    const amount = parseInt(order.total_price);
    const customer = {
      first_name: order.customer?.first_name || "Customer",
      email: order.customer?.email || "noemail@unknown.com",
    };

    // Buat transaksi Midtrans
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
          Authorization:
            "Basic " + Buffer.from(MIDTRANS_SERVER_KEY + ":").toString("base64"),
        },
      }
    );

    const snapUrl = midtransRes.data.redirect_url;
    console.log(`✅ Redirect pelanggan ke Midtrans Snap: ${snapUrl}`);

    // Redirect pelanggan langsung ke halaman pembayaran
    res.redirect(snapUrl);
  } catch (error) {
    console.error("❌ Error saat proses link email:", error.response?.data || error.message);
    res.status(500).send("Terjadi kesalahan saat memproses pembayaran.");
  }
});

// ✅ Jalankan server
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
