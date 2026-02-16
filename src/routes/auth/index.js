const express = require("express");
const authMiddleware = require("../../middlewares/auth");

// Controllers principais
const registerController = require("../../controllers/auth/register.controller");
const loginController = require("../../controllers/auth/login.controller");
const {
  verifyUserDocument,
} = require("../../controllers/auth/verifyDocument.controller");

const {
  sendCode,
  confirmCode,
} = require("../../controllers/auth/phoneVerification.controller");

const router = express.Router();

/* =====================================================
   ROTAS PÚBLICAS
===================================================== */

router.post("/register", registerController);
router.post("/login", loginController);

/* =====================================================
   ROTAS PROTEGIDAS
===================================================== */

// Verificação de CPF/CNPJ
router.post("/verify-document", authMiddleware, verifyUserDocument);

// Verificação de telefone
router.post("/send-phone-code", authMiddleware, sendCode);
router.post("/confirm-phone-code", authMiddleware, confirmCode);

module.exports = router;
