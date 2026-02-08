const express = require('express');
const router = express.Router();

// Listar anúncios (exemplo inicial)
router.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Rota de anúncios funcionando'
  });
});

module.exports = router;
