// index.js
import express from "express";
import Razorpay from "razorpay";
import crypto from "crypto";
import bodyParser from "body-parser";
import cors from "cors";
import dotenv from "dotenv";
import { google } from "googleapis";
import nodemailer from "nodemailer";

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

// ✅ Payment verification + Google Sheets logging + PDF Email
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

    // Step 3: Send Email with PDF (MailerSend SMTP)
    const transporter = nodemailer.createTransport({
      host: "smtp.mailersend.net",
      port: 587,
      auth: {
        user: "api", // always "api"
        pass: process.env.MAILERSEND_API_KEY,
      },
    });

    await transporter.sendMail({
      from: `"AI Pro Guide" <no-reply@test-q3enl6k70k542vwr.mlsender.net>`,
      to: email,
      subject: "Your AI Pro Guide - ₹49",
      text: `Hi ${name},\n\nThanks for your purchase! Find your guide attached.\n\nHappy Learning 🚀`,
      attachments: [
        {
          filename: "Google-AI-Pro-Guide.pdf",
          path: "./assets/guide.pdf", // ensure this file exists in backend repo
        },
      ],
    });

    // Step 4: Respond to frontend
    return res.json({ success: true, message: "Payment verified, PDF sent." });
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
