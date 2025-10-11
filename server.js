import express from "express";
import axios from "axios";
import bodyParser from "body-parser";
import cors from "cors";

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));

// 🔑 Variabel environment wajib (atur di Render Dashboard)
const MIDTRANS_SERVER_KEY = process.env.MIDTRANS_SERVER_KEY;
const SHOPIFY_STORE_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN;
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;

// ✅ Tes koneksi server
app.get("/", (req, res) => {
  res.send("✅ Midtrans LIVE server aktif dan siap menerima request.");
});

// -----------------------------------------------------------------------------
// 1. Webhook dari Shopify (order sudah dibuat)
// -----------------------------------------------------------------------------
app.post("/webhook", async (req, res) => {
  try {
    const order = req.body;
    console.log("📦 Webhook Shopify diterima:", order);

    const orderId =
      order.admin_graphql_api_id
        ? order.admin_graphql_api_id.split("/").pop()
        : order.id || `ORD-${Date.now()}`;
    const amount = Math.round(parseFloat(order.total_price)) || 0;
    const customer = order.customer || {};

    console.log(`➡️ Proses order: ${orderId}, total: ${amount}`);

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
        credit_card: { secure: true },
        callbacks: {
          finish: `https://${SHOPIFY_STORE_DOMAIN}/checkout/thank_you`,
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

    const redirectUrl = midtransResponse.data.redirect_url;
    console.log("✅ Link Midtrans:", redirectUrl);

    // Update catatan order di Shopify
    try {
      const updateNote = {
        order: { note: `✅ Link pembayaran Midtrans: ${redirectUrl}` },
      };
      const restUrl = `https://${SHOPIFY_STORE_DOMAIN}/admin/api/2024-07/orders/${orderId}.json`;

      await axios.put(restUrl, updateNote, {
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN,
        },
      });

      console.log("📝 Catatan order Shopify diperbarui.");
    } catch (e) {
      console.error("❌ Gagal update note Shopify:", e.response?.data || e.message);
    }

    res.status(200).json({
      success: true,
      message: "Transaksi Midtrans berhasil dibuat.",
      redirect_url: redirectUrl,
    });
  } catch (err) {
    console.error("🔥 Gagal proses webhook:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// -----------------------------------------------------------------------------
// 2. Endpoint baru: buat transaksi langsung dari halaman CART
// -----------------------------------------------------------------------------
app.post("/create-payment", async (req, res) => {
  try {
    const { items, total_price, customer } = req.body;
    const orderId = `CART-${Date.now()}`;
    const amount = Math.round(parseFloat(total_price)) || 0;

    console.log(`➡️ Membuat transaksi langsung dari CART: ${orderId}`);

    const midtransResponse = await axios.post(
      "https://app.midtrans.com/snap/v1/transactions",
      {
        transaction_details: {
          order_id: orderId,
          gross_amount: amount,
        },
        item_details: items.map((i) => ({
          id: i.id,
          price: i.price,
          quantity: i.quantity,
          name: i.title,
        })),
        customer_details: {
          first_name: customer?.first_name || "Guest",
          email: customer?.email || "unknown@example.com",
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

    const redirectUrl = midtransResponse.data.redirect_url;
    console.log("✅ Redirect URL Midtrans:", redirectUrl);
    res.json({ success: true, redirect_url: redirectUrl });
  } catch (error) {
    console.error("❌ Gagal buat transaksi langsung:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ------------------------------------------------------------
// Start server
// ------------------------------------------------------------
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`🚀 Server berjalan di port ${PORT} (LIVE MODE, Render Ready)`);
});
