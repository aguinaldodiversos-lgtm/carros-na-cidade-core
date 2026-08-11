// Camada HTTP das notificações internas.
//
// Fina de propósito: traduz request → service e service → response. Nenhuma
// regra de domínio mora aqui, e NENHUMA identidade vem do cliente — todo
// handler passa `req.user.id`, populado pelo authMiddleware a partir do token.
//
// Não existe handler de CRIAÇÃO. Notificação nasce de código interno
// (`createUserNotification`), nunca de request do navegador: quem cria decide
// para quem, e isso não pode ser controlado por quem consome.

import * as service from "./notifications.service.js";

/**
 * Toda resposta desta família é privada e específica de UMA pessoa. `private,
 * no-store` impede cache compartilhado (CDN/proxy) e também o cache do próprio
 * navegador — o contador de não lidas fica errado assim que o usuário marca
 * algo como lido em outra aba.
 */
function applyPrivateHeaders(res) {
  res.set("Cache-Control", "private, no-store");
}

export async function listNotifications(req, res) {
  const result = await service.listMyNotifications(req.user.id, {
    limit: req.query?.limit,
    cursor: req.query?.cursor,
  });

  applyPrivateHeaders(res);
  return res.json({ success: true, ...result });
}

export async function getUnreadCount(req, res) {
  const count = await service.countMyUnread(req.user.id);

  applyPrivateHeaders(res);
  return res.json({ success: true, count });
}

export async function markAsRead(req, res) {
  const notification = await service.markMyNotificationAsRead(req.user.id, req.params.id);

  applyPrivateHeaders(res);
  return res.json({ success: true, notification });
}

export async function markAllAsRead(req, res) {
  const { updated } = await service.markAllMyNotificationsAsRead(req.user.id);

  applyPrivateHeaders(res);
  return res.json({ success: true, updated });
}
