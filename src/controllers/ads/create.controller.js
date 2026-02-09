const { getOrCreateAdvertiser } = require('../../services/advertiser.service');
const { checkAdLimit } = require('../../services/ads/limit.service');
const { createAd } = require('../../services/ads/create.service');

module.exports = async (req, res) => {
  try {
    const userId = req.user.user_id;

    await checkAdLimit(userId, req.user.email);

    const advertiser = await getOrCreateAdvertiser(req.user.email);

    if (advertiser.status !== 'active') {
      return res.status(403).json({ error: 'Conta bloqueada' });
    }

    const ad = await createAd(advertiser, req.body);

    res.status(201).json(ad);
  } catch (err) {
    if (err.message === 'DOCUMENT_REQUIRED') {
      return res.status(403).json({
        error: 'Você precisa verificar seu CPF ou CNPJ antes de anunciar'
      });
    }

    if (err.message === 'AD_LIMIT_REACHED') {
      return res.status(403).json({
        error: 'Limite de anúncios ativos atingido'
      });
    }

    if (err.message === 'INVALID_DATA') {
      return res.status(400).json({
        error: 'Dados obrigatórios ausentes'
      });
    }

    console.error(err);
    res.status(500).json({ error: 'Erro ao criar anúncio' });
  }
};
