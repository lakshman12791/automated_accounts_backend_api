import mongoose from "mongoose";

const ReceiptSchema = new mongoose.Schema(
  {
    purchased_at: {
      type: String,
      required: [true, "Purchased date is required"],
    },
    merchant_name: {
      type: String,
      required: [true, "Merchant name is required"],
      trim: true,
    },
    total_amount: {
      type: mongoose.Schema.Types.Decimal128,
      required: [true, "Total amount is required"],
      min: [0, "Total amount cannot be negative"],
    },
    file_path: {
      type: String,
      required: [true, "File path is required"],
      trim: true,
    },
  },
  { timestamps: true }
);

const Receipt = mongoose.model("receipts", ReceiptSchema);

export default Receipt;