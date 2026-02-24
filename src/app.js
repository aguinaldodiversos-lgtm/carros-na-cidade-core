// src/app.js

import express from "express";
import cors from "cors";

import { requestIdMiddleware } from "./shared/middlewares/requestId.middleware.js";
import { httpLoggerMiddleware } from "./shared/middlewares/httpLogger.middleware.js";
import { errorHandler } from "./shared/middlewares/error.middleware.js";

import leadsRoutes from "./modules/leads/leads.routes.js";
import authRoutes from "./modules/auth/auth.routes.js";

const app = express();

/* =====================================================
   CORS
===================================================== */

const allowedOrigins = [
  "https://carrosnacidade.com",
  "http://localhost:3000",
];

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
  })
);

/* =====================================================
   MIDDLEWARES GLOBAIS (ANTES DAS ROTAS)
===================================================== */

app.use(express.json());
app.use(requestIdMiddleware);
app.use(httpLoggerMiddleware);

/* =====================================================
   ROTAS
===================================================== */

app.use("/api/auth", authRoutes);
app.use("/api/leads", leadsRoutes);

/* =====================================================
   HEALTH CHECK
===================================================== */

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    requestId: req.requestId,
  });
});

/* =====================================================
   ERROR HANDLER (SEMPRE ÚLTIMO)
===================================================== */

app.use(errorHandler);

export default app;
