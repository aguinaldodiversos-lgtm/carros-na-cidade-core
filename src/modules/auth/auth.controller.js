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

export async function refresh(req, res, next) {
  try {
    const { refreshToken } = req.body;

    const token = await authService.refresh(refreshToken);

    res.json(token);
  } catch (err) {
    next(err);
  }
}
