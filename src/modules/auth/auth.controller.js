// src/modules/auth/auth.controller.js

import * as authService from "./auth.service.js";

export async function login(req, res, next) {
  try {
    const { email, password } = req.body;

    const tokens = await authService.login(email, password);

    res.json(tokens);
  } catch (err) {
    next(err);
  }
}
