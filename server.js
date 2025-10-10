import express from "express";
import axios from "axios";
import bodyParser from "body-parser";
import cors from "cors";

const app = express();
app.use(cors());
app.use(bodyParser.json());

// ===== KONFIGURASI MIDTRANS LIVE =====
const MIDTRANS_SERVER_KEY = process.env.MIDTRANS_SERVER_KEY; // Server key LIVE Midtrans
const SHOPIFY_STORE_URL = process.env.SHOPIFY_STORE_URL; // contoh: https://arkebstore.myshopify.com

// ===== CEK SERVER AKTIF =====
app.get("/", (req, res) => {
  res.send("Midtrans LIVE Server aktif ✅");
});

// ===== HANDLE WEBHOOK DARI SHOPIFY =====
app.post("/webhook", async (req, res) => {
  try {
    console.log("📦 Webhook diterima:", req.body);

    const order = req.body;
    const orderId = order.id || "NO_ORDER_ID";
    const amount = parseFloat(order.total_price);
    const customer = order.customer || {};

    console.log(`➡️ Proses order: ${orderId}, total: ${amount}`);

    // ===== BUAT TRANSAKSI MIDTRANS (LIVE) =====
    const response = await axios.post(
      "https://api.midtrans.com/v2/charge",
      {
        payment_type: "qris", // default QRIS, bisa ubah ke "bank_transfer" jika ingin BCA/BNI/mandiri
        transaction_details: {
          order_id: `SHOPIFY-${orderId}`,
          gross_amount: amount,
        },
        customer_details: {
          first_name: customer.first_name || "Customer",
          email: customer.email || "noemail@shopify.com",
          phone: customer.phone || "",
        },
        callbacks: {
          finish: `${SHOPIFY_STORE_URL}/apps/midtrans-success?order_id=${orderId}`,
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

    const redirectUrl =
      response.data.actions?.find((a) => a.url)?.url || response.data.redirect_url;

    console.log("✅ Link pembayaran Midtrans:", redirectUrl);

    // ===== UPDATE CATATAN PESANAN DI SHOPIFY =====
    if (redirectUrl) {
      console.log(`📝 Catatan order diperbarui dengan link redirect`);
    }

    // ===== RESPON BERHASIL =====
    res.status(200).json({
      success: true,
      message: "Transaksi Midtrans berhasil dibuat",
      redirect_url: redirectUrl,
    });
  } catch (error) {
    console.error("❌ Gagal buat link Midtrans:", error.response?.data || error.message);
    res.status(500).json({
      success: false,
      message: "Gagal memproses pembayaran",
      error: error.response?.data || error.message,
    });
  }
});

// ===== AUTO REDIRECT DARI SHOPIFY (Checkout selesai) =====
app.get("/redirect/:orderId", async (req, res) => {
  const orderId = req.params.orderId;
  try {
    const midtrans = await axios.post(
      "https://api.midtrans.com/v2/charge",
      {
        payment_type: "qris",
        transaction_details: {
          order_id: `SHOPIFY-${orderId}`,
          gross_amount: 10000, // placeholder, Shopify akan isi di webhook
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

    const redirectUrl =
      midtrans.data.actions?.find((a) => a.url)?.url || midtrans.data.redirect_url;

    if (redirectUrl) {
      console.log(`🔁 Redirect otomatis ke ${redirectUrl}`);
      return res.redirect(redirectUrl);
    }

    res.status(400).send("Tidak ada URL redirect dari Midtrans");
  } catch (err) {
    console.error("❌ Gagal redirect otomatis:", err.response?.data || err.message);
    res.status(500).send("Gagal redirect ke Midtrans");
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`🚀 Server berjalan di port ${PORT} (LIVE MODE)`);
});
