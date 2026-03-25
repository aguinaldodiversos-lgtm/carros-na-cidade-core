import * as citiesService from "../cities/cities.service.js";
import { inferUfFromSlug } from "../../shared/utils/inferUfFromSlug.js";

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

    const ufNorm = uf.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 2);

    const row = await citiesService.resolveCityByNameAndUf(q, uf);
    if (!row) {
      return res.status(404).json({
        success: false,
        message: "Cidade não encontrada.",
      });
    }

    const stateOut =
      row.state != null && String(row.state).trim() !== ""
        ? String(row.state).trim()
        : ufNorm || inferUfFromSlug(row.slug);

    res.json({
      success: true,
      data: {
        id: row.id,
        name: row.name,
        state: stateOut,
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
    const uf = String(req.query.uf ?? "")
      .trim()
      .toUpperCase()
      .replace(/[^A-Z]/g, "")
      .slice(0, 2);
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
    const rows = await citiesService.searchCitiesByUfAndPartialName(uf, q, limit);
    const ufNorm = uf;

    res.json({
      success: true,
      data: rows.map((r) => ({
        id: r.id,
        name: r.name,
        state:
          r.state != null && String(r.state).trim() !== ""
            ? String(r.state).trim()
            : ufNorm || inferUfFromSlug(r.slug),
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

    const row = await citiesService.getCityById(id);
    if (!row) {
      return res.status(404).json({
        success: false,
        message: "Cidade não encontrada.",
      });
    }

    const stateOut =
      row.state != null && String(row.state).trim() !== ""
        ? String(row.state).trim()
        : inferUfFromSlug(row.slug);

    res.json({
      success: true,
      data: {
        id: row.id,
        name: row.name,
        state: stateOut,
        slug: row.slug,
      },
    });
  } catch (err) {
    next(err);
  }
}
