// index.js
import express from "express";
import Razorpay from "razorpay";
import crypto from "crypto";
import bodyParser from "body-parser";
import cors from "cors";
import dotenv from "dotenv";
import { google } from "googleapis";
import { MailerSend, EmailParams, Sender, Recipient } from "mailersend";

dotenv.config();

const app = express();
app.use(cors());
app.use(bodyParser.json());

// ✅ Razorpay Order creation
app.post("/create-order", async (req, res) => {
  try {
    const instance = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });

    const options = {
      amount: 4900, // 49 INR in paise
      currency: "INR",
      receipt: "receipt_order_" + Date.now(),
    };

    const order = await instance.orders.create(options);
    res.json(order);
  } catch (err) {
    console.error("❌ Error creating order:", err);
    res.status(500).json({ error: err.message });
  }
});

// ✅ Payment verification + Google Sheets logging + Email
app.post("/verify-payment", async (req, res) => {
  const {
    razorpay_order_id,
    razorpay_payment_id,
    razorpay_signature,
    name,
    email,
    phone,
  } = req.body;

  try {
    // Step 1: Verify Razorpay signature
    const generated_signature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(razorpay_order_id + "|" + razorpay_payment_id)
      .digest("hex");

    if (generated_signature !== razorpay_signature) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid signature" });
    }

    // Step 2: Append payment info to Google Sheets
    const auth = new google.auth.GoogleAuth({
      credentials: JSON.parse(process.env.GOOGLE_CREDENTIALS),
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });

    const sheets = google.sheets({ version: "v4", auth });
    await sheets.spreadsheets.values.append({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: "Sheet1!A:E", // 👈 must match your tab name
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [
          [new Date().toISOString(), name, email, phone, razorpay_payment_id],
        ],
      },
    });

    // Step 3: Send Email (MailerSend API)
    const mailerSend = new MailerSend({
      apiKey: process.env.MAILERSEND_API_KEY,
    });

    const sentFrom = new Sender(
      "no-reply@test-q3enl6k70k542vwr.mlsender.net", // your MailerSend test domain
      "AI Pro Guide"
    );

    const recipients = [new Recipient(email, name)];

    const emailParams = new EmailParams()
      .setFrom(sentFrom)
      .setTo(recipients)
      .setSubject("Your AI Pro Guide Purchase")
      .setText(
        `Hi ${name},\n\nThanks for your payment of ₹49!\nYour purchase has been verified successfully.\n\nWe’ll send your PDF guide shortly.\n\n🚀 Cheers,\nTeam AI Pro Guide`
      );

    await mailerSend.email.send(emailParams);

    // Step 4: Respond to frontend
    return res.json({
      success: true,
      message: "Payment verified, email sent.",
    });
  } catch (err) {
    console.error("❌ Error in verify-payment:", err);
    return res
      .status(500)
      .json({ success: false, message: "Server error", error: err.message });
  }
});

// ✅ Start server
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
