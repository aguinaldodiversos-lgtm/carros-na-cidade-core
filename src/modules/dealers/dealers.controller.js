import * as dealersService from "./dealers.service.js";

export async function listCityDealers(req, res, next) {
  try {
    const limit = Number(req.query.limit || 20);
    const data = await dealersService.getTopDealersByCity(req.params.slug, limit);

    res.json({
      success: true,
      data,
    });
  } catch (err) {
    next(err);
  }
}

export async function showDealerProfile(req, res, next) {
  try {
    const id = Number(req.params.id);
    const data = await dealersService.getDealerProfile(id);

    res.json({
      success: true,
      data,
    });
  } catch (err) {
    next(err);
  }
}
