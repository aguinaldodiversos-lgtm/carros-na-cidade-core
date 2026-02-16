const express = require("express");
const authMiddleware = require("../../middlewares/auth");

// Controllers de autenticação
const registerController = require("../../controllers/auth/register.controller");
const loginController = require("../../controllers/auth/login.controller");

// Controller de verificação de documento
const {
  verifyUserDocument,
} = require("../../controllers/auth/verifyDocument.controller");

const router = express.Router();

/* =====================================================
   ROTAS PÚBLICAS
===================================================== */

// Cadastro
router.post("/register", registerController);

// Login
router.post("/login", loginController);

/* =====================================================
   ROTAS PROTEGIDAS
===================================================== */

// Verificação de CPF/CNPJ
router.post("/verify-document", authMiddleware, verifyUserDocument);

module.exports = router;
