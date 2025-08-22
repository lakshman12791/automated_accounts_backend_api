import express from 'express';
import multer from 'multer';
import fs from 'fs';
import cors from "cors";
import path from 'path';
import moment from "moment";
import PDFDocument from 'pdfkit';
import { GoogleGenerativeAI } from '@google/generative-ai';
import mongoose from 'mongoose';
import db from "./model/index.js";
import dotenv from 'dotenv';
dotenv.config();

// Validate required environment variables
const requiredEnvVars = ['MONGO_URL', 'GEMINI_API_KEY'];
const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);

if (missingEnvVars.length > 0) {
  console.error('❌ Missing required environment variables:', missingEnvVars.join(', '));
  console.error('Please create a .env file with the required variables');
  process.exit(1);
}

const app = express();
const port = process.env.PORT || 3000;


// const allowedOrigins = process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : ['http://localhost:3000'];

const allowedOrigins = ['http://localhost:5173'];

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin) {
      return callback(null, true);
    }

    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`Origin ${origin} not allowed by CORS`));
    }
  },
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "X-Requested-With",
    "Accept",
    "Origin",
  ],
  credentials: true,
  preflightContinue: false,
  optionsSuccessStatus: 204,
  maxAge: 86400, // 24 hours
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.get("/", (req, res) => {
  res.json({ message: "Welcome to Automate Accounts." });
});


// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});



const ReceiptFileData = db.receiptFileInfo;
const ReceiptData = db.receiptInfo;



// Load API Key from environment
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_API_KEY) {
  console.warn('GEMINI_API_KEY is not set. Set it in your .env file.');
}
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY || '');


mongoose
  .connect(process.env.MONGO_URL, {
    serverSelectionTimeoutMS: 10000,
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => {
    console.log("✅ MongoDB Connected");
  })
  .catch((err) => {
    console.error("🤷‍♂️ DB Connection Error:", err);
    process.exit(1);
  });

// Multer setup for file uploads
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });



// Prompts for different document types
const PROMPTS = {
  RECEIPTS: `Extract ONLY the following in JSON format:
{
  "merchant_name": "[name]",
  "receipt_date":"[date]",
  "amount": "[CREDITS]"
}
Return ONLY JSON, no extra text.`
};

// Process image with Gemini
async function processImage(file, prompt) {
  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const imagePart = {
      inlineData: {
        data: file.buffer.toString('base64'),
        mimeType: file.mimetype
      }
    };
    const result = await model.generateContent([prompt, imagePart]);
    const text = result.response.text();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    return jsonMatch ? JSON.parse(jsonMatch[0]) : { error: "No JSON found" };
  } catch (error) {
    throw new Error(`Processing failed: ${error.message}`);
  }
}

// Routes
app.post('/api/receipts/upload-receipt', upload.single('file'), async (req, res) => {
  try {

    if (!req.file) return res.status(400).json({ message: 'No file uploaded' });
    // Validate PDF file type
    if (req.file.mimetype !== 'application/pdf') {
      return res.status(400).json({ message: 'Please Upload Pdf File only' });
    }

    // 1) Check whether the file exists in database
    const existingFile = await ReceiptFileData.findOne({ file_name: req.file.originalname });
    if (existingFile && existingFile.is_processed === true) {
      // 2) If existing file is already processed, respond that file exists
      return res.status(400).json({ message: 'File already exists' });
    }

    // 3) Process the file since it is either new or not processed yet
    const result = await processImage(req.file, PROMPTS.RECEIPTS);
    const doc = new PDFDocument();

    // Save the uploaded file to disk
    const outputDir = path.resolve('receipt_directory');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    const outputPath = path.join(outputDir, req.file.originalname);
    fs.writeFileSync(outputPath, req.file.buffer);


    // 4) Save the file info to receipt file model
    if (existingFile) {
      await ReceiptFileData.updateOne(
        { _id: existingFile._id },
        {
          $set: {
            file_path: outputPath,
            invalid_reason: null,
            is_processed: true,
          },
        }
      );
    } else {
      await ReceiptFileData.create({
        file_name: req.file.originalname,
        file_path: outputPath,
        invalid_reason: null,
        is_processed: true,
      });
    }


    let checkMerchant = false;

    const checkMerchantInfo = await ReceiptData?.find({ "merchant_name": result?.merchant_name })

    if (checkMerchantInfo?.length > 0) {
      checkMerchant = true
    }


    let saveReceipts = null;

    const rawAmount = result?.amount

    // let cleanedAmount = rawAmount.replace(/,/g, ''); // "1937.66"
    let cleanedAmount = rawAmount.replace(/[^0-9.-]+/g, ''); // "1937.66"


    const formattedDate = moment(result?.receipt_date).format("DD-MM-YYYY")



    const saveData = {
      merchant_name: result?.merchant_name,
      purchased_at: formattedDate,
      file_path: outputPath,
      total_amount: cleanedAmount
    }
    const response = saveReceipts = await ReceiptData?.create(saveData)
    if (response) {
      res.json(result);
    }

    // 5) Respond with extracted data

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


app.post('/api/receipts/upload', upload.single('file'), async (req, res) => {
  try {
    console.log("req.file", req.file?.originalname)
    if (!req.file) return res.status(400).json({ message: 'No file uploaded' });

    // Validate PDF file type
    if (req.file.mimetype !== 'application/pdf') {
      return res.status(400).json({ message: 'Please Upload Pdf File only' });
    }

    // 1) Check whether the file exists in database
    const existingFile = await ReceiptFileData.findOne({ file_name: req.file.originalname });
    if (existingFile && existingFile.is_processed === true) {
      // 2) If existing file is already processed, respond that file exists
      return res.status(400).json({ message: 'File already exists' });
    }

    // 3) Process the file since it is either new or not processed yet
    const result = await processImage(req.file, PROMPTS.RECEIPTS);
    const doc = new PDFDocument();

    // Save the uploaded file to disk
    const outputDir = path.resolve('receipt_directory');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    const outputPath = path.join(outputDir, req.file.originalname);
    fs.writeFileSync(outputPath, req.file.buffer);
    console.log('PDF saved to', outputPath);

    // 4) Save the file info to receipt file model
    if (existingFile) {
      await ReceiptFileData.updateOne(
        { _id: existingFile._id },
        {
          $set: {
            file_path: outputPath,
            invalid_reason: null,
            is_processed: true,
          },
        }
      );
    } else {
      await ReceiptFileData.create({
        file_name: req.file.originalname,
        file_path: outputPath,
        invalid_reason: null,
        is_processed: true,
      });
    }

    // 5) Respond with extracted data
    res.json(result);

  } catch (error) {
    console.log("error in upload API:", error)
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/receipts/validate', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No file uploaded' });

    let isFileValid = true;

    // Validate PDF file type
    if (req.file.mimetype !== 'application/pdf') {
      const is_valid_response = false;
      isFileValid = false;
      const invalid_reason_response = `Uploaded file is not Pdf, its ${req.file.mimetype} `;
      await ReceiptFileData.create({
        file_name: req.file.originalname,
        file_path: null,
        is_valid: is_valid_response,
        invalid_reason: invalid_reason_response,
        is_processed: false,
      });
      // return res.status(400).json({ message: 'Please Upload Pdf File only' });
    }




    if (isFileValid === true) {
      // 1) Check whether the file exists in database
      const existingFile = await ReceiptFileData.findOne({ file_name: req.file.originalname });
      if (existingFile && existingFile.is_processed === true) {
        // 2) If existing file is already processed, respond that file exists
        return res.status(400).json({ message: 'File already exists' });
      }

      // 3) Process the file since it is either new or not processed yet
      const doc = new PDFDocument();

      // Save the uploaded file to disk
      const outputDir = path.resolve('receipt_directory');
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }
      const outputPath = path.join(outputDir, req.file.originalname);
      fs.writeFileSync(outputPath, req.file.buffer);



      // 4) Save the file info to receipt file model

      // 4) Save the file info to receipt file model
      if (existingFile) {
        await ReceiptFileData.updateOne(
          { _id: existingFile._id },
          {
            $set: {
              file_path: outputPath,
              invalid_reason: null,
              is_processed: true,
            },
          }
        );
      } else {
        await ReceiptFileData.create({
          file_name: req.file.originalname,
          file_path: outputPath,
          invalid_reason: null,
          is_processed: true,
        });
      }
      // 5) Respond with extracted data
      res.json({ isValid: true, "message": "Uploaded File is Valid" });
    }
    else {
      res.json({ isValid: false, "message": "Uploaded File is Invalid and Updated the status for invalid_reason" });
    }

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


app.post('/api/receipts/process', upload.single('file'), async (req, res) => {
  try {

    if (!req.file) return res.status(400).json({ isProcessed: false, message: 'No file uploaded' });
    // Validate PDF file type
    if (req.file.mimetype !== 'application/pdf') {
      return res.status(400).json({ isProcessed: false, message: 'Please Upload Pdf File only' });
    }

    // 1) Check whether the file exists in database
    const existingFile = await ReceiptFileData.findOne({ file_name: req.file.originalname });
    console.log("existingFile", existingFile)
    if (existingFile && existingFile.is_processed === true) {
      // 2) If existing file is already processed, respond that file exists
      return res.status(400).json({ isProcessed: false, message: 'File already exists' });
    }

    // 3) Process the file since it is either new or not processed yet
    const result = await processImage(req.file, PROMPTS.RECEIPTS);
    const doc = new PDFDocument();

    // Save the uploaded file to disk
    const outputDir = path.resolve('receipt_directory');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    const outputPath = path.join(outputDir, req.file.originalname);
    fs.writeFileSync(outputPath, req.file.buffer);


    // 4) Save the file info to receipt file model
    if (existingFile) {
      await ReceiptFileData.updateOne(
        { _id: existingFile._id },
        {
          $set: {
            file_path: outputPath,
            invalid_reason: null,
            is_processed: true,
          },
        }
      );
    } else {
      await ReceiptFileData.create({
        file_name: req.file.originalname,
        file_path: outputPath,
        invalid_reason: null,
        is_processed: true,
      });
    }


    let checkMerchant = false;

    const checkMerchantInfo = await ReceiptData?.find({ "merchant_name": result?.merchant_name })

    if (checkMerchantInfo?.length > 0) {
      checkMerchant = true
    }


    let saveReceipts = null;

    const rawAmount = result?.amount

    // let cleanedAmount = rawAmount.replace(/,/g, ''); // "1937.66"
    let cleanedAmount = rawAmount.replace(/[^0-9.-]+/g, ''); // "1937.66"


    const formattedDate = moment(result?.receipt_date).format("DD-MM-YYYY")



    const saveData = {
      merchant_name: result?.merchant_name,
      purchased_at: formattedDate,
      file_path: outputPath,
      total_amount: cleanedAmount
    }
    const response = saveReceipts = await ReceiptData?.create(saveData)
    if (response) {
      res.json({ isProcessed: true, message: "File processed", result });
    }

    // 5) Respond with extracted data

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/receipts/list-receipts', async (req, res) => {
  try {
    const response = await ReceiptData.find();

    // Map and format each receipt
    const simplifiedReceipts = response.map(receipt => {
      const {
        _id,
        purchased_at,
        merchant_name,
        total_amount,
        createdAt,
        __v
      } = receipt;

      return {
        _id,
        purchased_at,
        merchant_name,
        total_amount: parseFloat(total_amount?.$numberDecimal || total_amount), // handle Decimal128 or raw number
        createdAt,
        __v
      };
    });

    // Send final response
    res.status(200).json({ receiptsArray: simplifiedReceipts });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


app.get('/api/receipts/get-receipt-detail/:receiptId', async (req, res) => {
  try {
    const response = await ReceiptData.findById(req.params.receiptId);

    if (!response) {
      return res.status(404).json({ error: 'Receipt not found' });
    }

    const {
      _id,
      purchased_at,
      merchant_name,
      total_amount,
      createdAt,
      __v
    } = response;

    const StructuredObject = {
      _id,
      purchased_at,
      merchant_name,
      total_amount: parseFloat(total_amount?.$numberDecimal || total_amount), // handle Decimal128 or raw number
      createdAt,
      __v
    }

    // Send final response
    res.status(200).json({ receiptDetails: StructuredObject });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});



// Start server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
