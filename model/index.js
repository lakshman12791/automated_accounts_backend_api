import mongoose from "mongoose";
import receiptModel from "./receipt.model.js";
import receiptFileModel from "./receipt_file.model.js";

const db = {
  mongoose,
  receiptInfo: receiptModel,
  receiptFileInfo: receiptFileModel,
};

export default db;
