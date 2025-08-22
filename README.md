# automated_accounts_backend_api

Node.js + Express backend API for Receipt Management, using MongoDB for persistence and Google Gemini for receipt field extraction from uploaded PDFs.

## 1. Node Js API Info

- Tech: Node.js (ES Modules), Express, Mongoose, Multer, PDFKit, Google Generative AI
- Data store: MongoDB
- File storage: Saved PDFs to `receipt_directory/`
- CORS: Allows `http://localhost:5173` by default (Vite dev server)
- Default base URL: `http://localhost:3000/api` (set `PORT` if you need a different port)

## 2. Configure in local

Prerequisites:
- Node.js 18+
- A running MongoDB instance and connection string

Steps:
1. Install dependencies
   ```bash
   npm install
   ```
2. Create a `.env` file in the project root with at least the following:
   ```env
   MONGO_URL=mongodb://localhost:27017/automated_accounts
   GEMINI_API_KEY=your_google_generative_ai_key
   # Optional overrides
   PORT=3000           # set to 3002 to match the frontend default
   # ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000
   ```
3. Start the server
   ```bash
   npm run dev
   # or
   npm start
   ```
4. The API will be available at `http://localhost:${PORT||3000}/api`

Notes:
- Ensure MongoDB is reachable via `MONGO_URL` before starting.
- Uploaded PDFs are written to `receipt_directory/` (created automatically if missing).
- If you want to use the React frontend as-is (expects `http://localhost:3002/api`), either:
  - set `PORT=3002` in `.env`, or
  - update the frontend API base URL.

## 3. Env details

Required:
- `MONGO_URL`: MongoDB connection string (e.g., `mongodb://localhost:27017/automated_accounts`).
- `GEMINI_API_KEY`: Google Generative AI API key used to extract receipt fields.

Optional:
- `PORT`: Port for the Express server (default `3000`).
- `ALLOWED_ORIGINS`: Comma-separated list of allowed origins for CORS. The code currently allows `http://localhost:5173` by default; wire this env if you need to customize.

## 4. API Route Information

Base URL: `http://localhost:${PORT||3000}/api`

- `POST /receipts/upload` (multipart/form-data)
  - Body: `file` (PDF)
  - Validates type, saves file metadata, extracts fields with Gemini, persists file info
  - Response example:
    ```json
    {
      "merchant_name": "Store A",
      "receipt_date": "2024-04-01",
      "amount": "23.45"
    }
    ```

- `POST /receipts/validate` (multipart/form-data)
  - Body: `file` (PDF)
  - Validates file type and records validity; stores the file when valid
  - Response (valid):
    ```json
    { "isValid": true, "message": "Uploaded File is Valid" }
    ```
  - Response (invalid type):
    ```json
    { "isValid": false, "message": "Uploaded File is Invalid and Updated the status for invalid_reason" }
    ```

- `POST /receipts/process` (multipart/form-data)
  - Body: `file` (PDF)
  - Validates, extracts fields via Gemini, saves receipt summary to DB, and stores file
  - Response example:
    ```json
    {
      "isProcessed": true,
      "message": "File processed",
      "result": {
        "merchant_name": "Store A",
        "receipt_date": "2024-04-01",
        "amount": "23.45"
      }
    }
    ```

- `GET /receipts/list-receipts`
  - Returns a simplified list of receipts stored in MongoDB
  - Response example:
    ```json
    {
      "receiptsArray": [
        {
          "_id": "65f...",
          "merchant_name": "Store A",
          "purchased_at": "01-04-2024",
          "total_amount": 23.45,
          "createdAt": "2024-04-02T10:20:30.000Z"
        }
      ]
    }
    ```

- `GET /receipts/get-receipt-detail/:receiptId`
  - Path param: `receiptId`
  - Returns full details of a single receipt
  - Response example:
    ```json
    {
      "receiptDetails": {
        "_id": "65f...",
        "merchant_name": "Store A",
        "purchased_at": "01-04-2024",
        "total_amount": 23.45,
        "createdAt": "2024-04-02T10:20:30.000Z"
      }
    }
    ```

Notes:
- All multipart routes expect a form field named `file` with a PDF.
- Amounts are normalized to numeric on read APIs; stored as decimal in DB.
- Dates are saved as formatted strings (`DD-MM-YYYY`).

## 5. Brief about project in docs

This backend powers a receipt management workflow: upload → validate → process → list → view. It stores uploaded PDFs, extracts key fields using Google Gemini, and persists receipt summaries in MongoDB. It is designed to work with a React/Vite frontend that displays JSON-like responses for quick integration and debugging. Configure `PORT` and CORS to match your frontend environment.
