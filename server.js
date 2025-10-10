import express from "express";
import axios from "axios";
import bodyParser from "body-parser";
import cors from "cors";

const app = express();
app.use(cors());
app.use(bodyParser.json());

// ✅ Render akan otomatis inject ini dari Environment Variable
const {
  SHOPIFY_STORE_URL,
  SHOPIFY_ADMIN_TOKEN,
  MIDTRANS_SERVER_KEY,
  MIDTRANS_API_URL,
  PORT
} = process.env;

// === HEADER UNTUK SHOPIFY ===
const shopifyHeaders = {
  "X-Shopify-Access-Token": SHOPIFY_ADMIN_TOKEN,
  "Content-Type": "application/json",
};

// === MIDTRANS CHECKOUT ===
app.post("/midtrans/create", async (req, res) => {
  try {
    const { order_id, gross_amount, customer } = req.body;

    console.log(`🧾 Permintaan pembayaran diterima untuk Order ID: ${order_id}`);

    // === Buat transaksi di Midtrans ===
    const payload = {
      transaction_details: {
        order_id,
        gross_amount,
      },
      customer_details: {
        first_name: customer?.first_name || "Customer",
        email: customer?.email || "noemail@example.com",
        phone: customer?.phone || "",
      },
      enabled_payments: ["bank_transfer", "qris", "gopay", "credit_card"],
    };

    const midtransResponse = await axios.post(MIDTRANS_API_URL, payload, {
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Basic ${Buffer.from(MIDTRANS_SERVER_KEY + ":").toString("base64")}`,
      },
    });

    const redirectUrl = midtransResponse.data.redirect_url;
    console.log("✅ Midtrans redirect URL:", redirectUrl);

    // === SIMPAN LINK KE CATATAN ORDER DI SHOPIFY ===
    try {
      const orderUpdateUrl = `${SHOPIFY_STORE_URL}/admin/api/2023-10/orders/${order_id}.json`;

      const response = await axios({
        method: "put",
        url: orderUpdateUrl,
        headers: shopifyHeaders,
        data: {
          order: {
            id: order_id,
            note: redirectUrl, // simpan link Midtrans ke catatan order
          },
        },
      });

      console.log(`✅ Link Midtrans berhasil disimpan di Shopify (status ${response.status})`);
    } catch (shopifyErr) {
      console.error("⚠️ Gagal update note di Shopify:", shopifyErr.response?.data || shopifyErr.message);
      console.error("⚠️ Pastikan SHOPIFY_ADMIN_TOKEN kamu adalah token Admin API (bukan Storefront).");
    }

    // === Kembalikan response ke client ===
    res.json({
      success: true,
      redirectUrl,
    });

  } catch (err) {
    console.error("❌ Gagal buat link Midtrans:", err.response?.data || err.message);
    res.status(500).json({
      success: false,
      error: err.response?.data || err.message,
    });
  }
});

// === WEBHOOK MIDTRANS ===
app.post("/midtrans/webhook", async (req, res) => {
  try {
    const notification = req.body;
    console.log("🔔 Notifikasi dari Midtrans diterima:", notification);

    // kirim respon OK supaya Midtrans gak retry
    res.status(200).send("OK");
  } catch (err) {
    console.error("❌ Gagal memproses webhook:", err.message);
    res.status(500).send("Error");
  }
});

// === TES KONEKSI SERVER ===
app.get("/", (req, res) => {
  res.send("✅ Midtrans-Server Connected dan Aktif");
});

// === JALANKAN SERVER ===
const port = PORT || 10000;
app.listen(port, () => {
  console.log(`🚀 Server berjalan di port ${port}`);
});
