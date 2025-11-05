import express from "express";
import axios from "axios";
import bodyParser from "body-parser";
import cors from "cors";

const app = express();

// ================================
// 🧩 Middleware
// ================================
app.use(bodyParser.json());
app.use(
  cors({
    origin: [
      "https://arkebstore.myshopify.com",
      "https://arkebstore.my.id",
    ],
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// ================================
// 🔑 Environment Variables
// ================================
const MIDTRANS_SERVER_KEY = process.env.MIDTRANS_SERVER_KEY;
const SHOPIFY_STORE_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN;
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const SHOPIFY_STORE_URL = process.env.SHOPIFY_STORE_URL;

// ================================
// 🧠 Tes koneksi server
// ================================
app.get("/", (req, res) => {
  res.send("✅ Midtrans LIVE server aktif dan siap menerima request (Kredivo Ready).");
});

// ================================
// 📦 Webhook Shopify → Buat link Midtrans
// ================================
app.post("/webhook", async (req, res) => {
  try {
    const order = req.body;
    console.log("📦 Webhook Shopify diterima:", order);

    const orderId =
      order.admin_graphql_api_id?.split("/").pop() ||
      order.id ||
      `ORD-${Date.now()}`;

    const items = order.line_items || [];

    // 💡 Hitung total amount otomatis
    const totalAmount = items.reduce((sum, i) => sum + (parseFloat(i.price) * i.quantity), 0);

    // 🧹 Sanitasi data item agar sesuai format Midtrans
    const sanitizedItems = items.map((i) => ({
      id: i.id || "1",
      name: (i.title || "Produk").substring(0, 50), // batasi nama 50 karakter
      price: Math.round(parseFloat(i.price)) || 0,
      quantity: i.quantity || 1,
      category: i.category || "General",
      url: i.url || `${SHOPIFY_STORE_URL}/products/${i.handle || ""}`,
    }));

    const customer = order.customer || {};

    console.log(`➡️ Proses order: ${orderId}, total: ${totalAmount}`);

    // 🔗 Buat transaksi Midtrans
    const midtransResponse = await axios.post(
      "https://app.midtrans.com/snap/v1/transactions",
      {
        transaction_details: {
          order_id: orderId,
          gross_amount: Math.round(totalAmount),
        },
        item_details: sanitizedItems,
        customer_details: {
          first_name: customer?.first_name || "Guest",
          email: customer?.email || "unknown@example.com",
          phone: customer?.phone || "",
        },
        credit_card: { secure: true },
        callbacks: {
          finish: `${SHOPIFY_STORE_URL}/checkout/thank_you`,
        },
      },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization:
            "Basic " + Buffer.from(MIDTRANS_SERVER_KEY + ":").toString("base64"),
        },
      }
    );

    const redirectUrl = midtransResponse.data.redirect_url;
    console.log("✅ Link pembayaran Midtrans:", redirectUrl);

    // 📝 Simpan link ke catatan order Shopify
    try {
      const updateNote = {
        order: {
          note: `✅ Link pembayaran Midtrans (LIVE): ${redirectUrl}`,
        },
      };

      const restUrl = `https://${SHOPIFY_STORE_DOMAIN}/admin/api/2024-07/orders/${orderId}.json`;

      await axios.put(restUrl, updateNote, {
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN,
        },
      });

      console.log("📝 Catatan order Shopify berhasil diperbarui");
    } catch (e) {
      console.error("❌ Gagal update note Shopify:", e.response?.data || e.message);
    }

    res.status(200).json({
      success: true,
      message: "Transaksi Midtrans berhasil dibuat.",
      redirect_url: redirectUrl,
    });
  } catch (err) {
    console.error("🔥 Gagal proses webhook:", err.response?.data || err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ================================
// 💳 Buat transaksi langsung dari Cart
// ================================
app.post("/create-payment", async (req, res) => {
  try {
    const { items = [], total_price, customer } = req.body;
    const orderId = `CART-${Date.now()}`;

    // 💡 Hitung ulang total amount biar pasti sama
    const totalAmount = items.reduce((sum, i) => sum + (parseFloat(i.price) * i.quantity), 0);

    console.log(`➡️ Membuat transaksi langsung dari CART: ${orderId}`);

    const midtransResponse = await axios.post(
      "https://app.midtrans.com/snap/v1/transactions",
      {
        transaction_details: {
          order_id: orderId,
          gross_amount: Math.round(totalAmount),
        },
        item_details: items.map((i) => ({
          id: i.id || "1",
          name: (i.title || "Produk").substring(0, 50), // batasi 50 karakter
          price: Math.round(parseFloat(i.price)) || 0,
          quantity: i.quantity || 1,
          category: i.category || "General",
          url: i.url || `${SHOPIFY_STORE_URL}/products/${i.handle || ""}`,
        })),
        customer_details: {
          first_name: customer?.first_name || "Guest",
          email: customer?.email || "unknown@example.com",
          phone: customer?.phone || "",
        },
      },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization:
            "Basic " + Buffer.from(MIDTRANS_SERVER_KEY + ":").toString("base64"),
        },
      }
    );

    const redirectUrl = midtransResponse.data.redirect_url;
    console.log("✅ Redirect URL Midtrans:", redirectUrl);
    res.json({ success: true, redirect_url: redirectUrl });
  } catch (error) {
    console.error("❌ Gagal buat transaksi langsung:", error.response?.data || error.message);
    res.status(500).json({
      success: false,
      error: error.response?.data || error.message,
    });
  }
});

// ================================
// 📬 Midtrans Webhook → Update status di Shopify
// ================================
app.post("/midtrans-webhook", async (req, res) => {
  try {
    const data = req.body;
    console.log("📬 Webhook dari Midtrans diterima:", data);

    const orderId = data.order_id;
    const transactionStatus = data.transaction_status;

    let statusText = "❌ Pembayaran gagal";
    if (transactionStatus === "settlement") statusText = "✅ Pembayaran berhasil";
    else if (transactionStatus === "pending") statusText = "⏳ Menunggu pembayaran";

    console.log(`🟢 Status order ${orderId}: ${statusText}`);

    if (/^\d+$/.test(orderId)) {
      const updateUrl = `https://${SHOPIFY_STORE_DOMAIN}/admin/api/2024-07/orders/${orderId}.json`;
      await axios.put(
        updateUrl,
        { order: { id: orderId, note: statusText } },
        {
          headers: {
            "Content-Type": "application/json",
            "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN,
          },
        }
      );
      console.log("📝 Status order Shopify berhasil diperbarui");
    } else {
      console.log("⚠️ Bukan order Shopify (tes dari Midtrans), lewati update Shopify.");
    }

    res.sendStatus(200);
  } catch (err) {
    console.error("❌ Gagal proses webhook Midtrans:", err.message);
    res.sendStatus(500);
  }
});

// ================================
// 🚀 Jalankan Server
// ================================
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`🚀 Server berjalan di port ${PORT} (LIVE MODE + Kredivo Ready)`);
});
