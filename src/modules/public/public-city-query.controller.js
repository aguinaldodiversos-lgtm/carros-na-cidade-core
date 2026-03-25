import * as citiesRepository from "../cities/cities.repository.js";

export async function resolveCity(req, res, next) {
  try {
    const q = String(req.query.q ?? "").trim();
    const uf = String(req.query.uf ?? "").trim();
    if (!q || uf.length < 2) {
      return res.status(400).json({
        success: false,
        message: "Informe o nome da cidade (q) e a UF.",
      });
    }

    const row = await citiesRepository.resolveCityByNameAndUf(q, uf);
    if (!row) {
      return res.status(404).json({
        success: false,
        message: "Cidade não encontrada.",
      });
    }

    res.json({
      success: true,
      data: {
        id: row.id,
        name: row.name,
        state: row.state,
        slug: row.slug,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function searchCities(req, res, next) {
  try {
    const q = String(req.query.q ?? "").trim();
    const uf = String(req.query.uf ?? "").trim();
    if (uf.length !== 2) {
      return res.status(400).json({
        success: false,
        message: "UF inválida.",
      });
    }

    if (q.length < 2) {
      return res.json({ success: true, data: [] });
    }

    const limit = Math.min(30, Math.max(1, Number(req.query.limit) || 12));
    const rows = await citiesRepository.searchCitiesByUfAndQuery(uf, q, limit);

    res.json({
      success: true,
      data: rows.map((r) => ({
        id: r.id,
        name: r.name,
        state: r.state,
        slug: r.slug,
      })),
    });
  } catch (err) {
    next(err);
  }
}

export async function getCityById(req, res, next) {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({
        success: false,
        message: "ID de cidade inválido.",
      });
    }

    const row = await citiesRepository.findCityById(id);
    if (!row) {
      return res.status(404).json({
        success: false,
        message: "Cidade não encontrada.",
      });
    }

    res.json({
      success: true,
      data: {
        id: row.id,
        name: row.name,
        state: row.state,
        slug: row.slug,
      },
    });
  } catch (err) {
    next(err);
  }
}
