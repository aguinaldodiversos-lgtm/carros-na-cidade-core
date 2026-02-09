const express = require("express");

const loginController = require("../../controllers/auth/login.controller");
const registerController = require("../../controllers/auth/register.controller");
const forgotPasswordController = require("../../controllers/auth/forgotPassword.controller");
const resetPasswordController = require("../../controllers/auth/resetPassword.controller");

const router = express.Router();

// registro
router.post("/register", registerController);

// login
router.post("/login", loginController);

// recuperação de senha
router.post("/forgot-password", forgotPasswordController);
router.post("/reset-password", resetPasswordController);

module.exports = router;
