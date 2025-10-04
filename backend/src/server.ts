import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import apiRouter from "./routes";
import authGoogleRouter from './routes/auth-google';

// Load env
dotenv.config({ path: path.join(__dirname, "../../.env") });

const app = express();
const PORT = Number(process.env.PORT) || 3001;

// Core middleware
app.use(
  cors({
    origin: ["http://localhost:4200", "http://127.0.0.1:4200"],
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "x-user-id"],
    credentials: true,
  })
);
app.use(express.json());


// Simple request logger (optional, but handy)
app.use((req, _res, next) => {
  console.log(`${req.method} ${req.url}`);
  next();
});

// Mount all API routes under /api
app.use("/api", apiRouter);

app.use('/api', authGoogleRouter);

// ---- SINGLE app.listen ----
app.listen(PORT, () => {
  console.log("====================================");
  console.log(`____   ____._____.          _________ .__                   __    
\\   \\ /   /|__\\_ |__   ____ \\_   ___ \\|  |__   ____   ____ |  | __
 \\   Y   / |  || __ \\_/ __ \\/    \\  \\/|  |  \\_/ __ \\_/ ___\\|  |/ /
  \\     /  |  || \\_\\ \\  ___/\\     \\___|   Y  \\  ___/\\  \\___|    < 
   \\___/   |__||___  /\\___  >\\______  /___|  /\\___  >\\___  >__|_ \\
                   \\/     \\/        \\/     \\/     \\/     \\/     \\/`);
  console.log("====================================");
  console.log(
    "\n\n Followings are simple endpoints for testing if the server is functional or not:\n"
  );
  console.log(`🚀 Server: http://localhost:${PORT}`);
  console.log(`🔍 Test DB: http://localhost:${PORT}/api/test-db`);
  console.log(`🤖 Test Client: http://localhost:${PORT}/api/test-client`);
  console.log(`⚙️ Setup: POST http://localhost:${PORT}/api/setup`);
  console.log(`🏥 Health: http://localhost:${PORT}/api/health`);
});
