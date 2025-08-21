import mongoose from "mongoose";

const ReceiptFileSchema = new mongoose.Schema(
  {
    file_name: {
      type: String,
      required: [true, "File Name is required"],
      trim: true,
    },
    file_path: {
      type: String,
      required: [false, "File Path is required"],
      trim: true,
    },
    is_valid: {
      type: Boolean,
      default: false,
    },
    invalid_reason: {
      type: String,
      default: null,
      trim: true,
    },
    is_processed: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

const ReceiptFile = mongoose.model("receipt_files", ReceiptFileSchema);

export default ReceiptFile;