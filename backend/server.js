import express from "express";
import cors from "cors";
import multer from "multer"
import {PDFParse} from "pdf-parse";
import fs from "fs";
import { chunkText } from "./utils/chunkText.js";
import "dotenv/config";
import { createEmbedding } from "./utils/createEmbeddings.js";
import { Pinecone } from "@pinecone-database/pinecone";
import { storeVectors } from "./utils/storeVector.js";
import { searchVectors } from "./utils/searchVectors.js";
import { generateAnswer } from "./utils/generateAnswer.js";

const pc = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY
});


const app = express();
const index = pc.index("ragg-index");

app.use(cors());
app.use(express.json());

const upload = multer({ dest: "uploads/" });
app.get("/", (req, res) => {
    res.json({
        message: "RAG Backend is running!"
    });
});

app.get("/api/test",(req,res)=>{
    res.json({
        message : "hlw from backend"
    })
})

app.post("/api/upload", upload.single("document"), async (req, res) => {
  try {
    const filePath = req.file.path;

    const dataBuffer = fs.readFileSync(filePath);

    // Create PDFParse object
    const parser = new PDFParse({
      data: dataBuffer
    });

    // Extract text
    const data = await parser.getText();
    const chunks = chunkText(data.text);
    

    console.log("Number of chunks:", chunks.length);
    console.log("First chunk:", chunks[0]);
    
    await storeVectors(index, chunks);
    // console.log(data.text);
    
    // Clean up parser
    await parser.destroy();

    res.json({
      message: "PDF processed successfully!",
      filename: req.file.originalname,
      text: data.text
    });

  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Error processing PDF"
    });
  }
});

app.get("/api/search", async (req, res) => {
  try {
    const query = req.query.q;

    const results = await searchVectors(index, query);
    const answer = await generateAnswer(query, results);

    res.json({
      answer: answer,
      sources: results
    });

  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Search failed"
    });
  }
});

const PORT = 5000;

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});


