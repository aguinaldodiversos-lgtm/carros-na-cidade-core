/**
 * Prova de integração do núcleo de anúncios (Postgres real):
 * auth → advertiser → createAdNormalized → leitura pública → isolamento entre contas.
 *
 * Execução: `npm run test:integration:ads:full` — ver `docs/testing/integration-ads.md`.
 * `RUN_INTEGRATION_ADS_TESTS=1` força a suíte (via runner) mesmo com SKIP no `.env`.
 */
import dotenv from "dotenv";

dotenv.config({ override: false });
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { pool } from "../../src/infrastructure/database/db.js";
import { createAdNormalized } from "../../src/modules/ads/ads.create.pipeline.service.js";
import { ensurePublishEligibility } from "../../src/modules/ads/ads.publish.eligibility.service.js";
import * as adsService from "../../src/modules/ads/ads.service.js";
import { login, refresh, logout } from "../../src/modules/auth/auth.service.js";
import { getOwnedAd, listOwnedAds } from "../../src/modules/account/account.service.js";
import { ensureAdvertiserForUser } from "../../src/modules/advertisers/advertiser.ensure.service.js";
import {
  shouldRunAdsIntegrationTests,
  assertIntegrationDatabaseReady,
  getFirstCity,
  getSecondCityIfAny,
  createPublishableUser,
  cleanupIntegrationArtifacts,
} from "./helpers/ads-integration-fixtures.js";

const runTag = `t${Date.now()}`;

const shared = {
  city: null,
  secondCity: null,
  userA: null,
  userB: null,
  emails: [],
  adIds: [],
  payload: null,
};

let authSession = null;

function failIntegration(context, cause) {
  return new Error(
    `[integração ads / ${context}] ${cause}. ` +
      "Confira migrations, seed de cidades e `npm run integration:db:prepare`."
  );
}

describe.skipIf(!shouldRunAdsIntegrationTests())(
  "integração — núcleo de anúncios (DB real)",
  () => {
    beforeAll(async () => {
      await assertIntegrationDatabaseReady(pool);

      const city = await getFirstCity(pool);
      if (!city) {
        throw failIntegration(
          "beforeAll",
          "Nenhuma linha em `cities` (tabela vazia ou inexistente)"
        );
      }
      shared.city = city;
      shared.secondCity = await getSecondCityIfAny(pool, city.id);
      if (!shared.secondCity) {
        const slug = `integration-city-2-${runTag}`.slice(0, 120);
        const ins = await pool.query(
          `
          INSERT INTO cities (name, state, slug)
          VALUES ($1, $2, $3)
          RETURNING id, name, state, slug
          `,
          ["Cidade integração 2", "RJ", slug]
        );
        shared.secondCity = ins.rows[0];
      }

      shared.userA = await createPublishableUser(pool, `${runTag}_a`);
      shared.userB = await createPublishableUser(pool, `${runTag}_b`);
      shared.emails = [shared.userA.email, shared.userB.email];

      await ensurePublishEligibility(
        { id: String(shared.userA.id), plan: "free" },
        { cityId: Number(city.id) }
      );
    });

    afterAll(async () => {
      await cleanupIntegrationArtifacts(pool, {
        emails: shared.emails,
        adIds: shared.adIds,
      });
    });

    describe.sequential("autenticação e sessão", () => {
      it("login com senha retorna access e refresh token", async () => {
        const session = await login(
          shared.userA.email,
          "Integration1!",
          { ip: "127.0.0.1", userAgent: "vitest-integration" }
        );
        expect(
          session.accessToken,
          "accessToken ausente — falha em auth.service / JWT"
        ).toBeTruthy();
        expect(
          session.refreshToken,
          "refreshToken ausente — falha em auth.service"
        ).toBeTruthy();
        expect(String(session.user?.id)).toBe(String(shared.userA.id));
        authSession = session;
      });

      it("refresh emite novo par de tokens", async () => {
        expect(authSession?.refreshToken).toBeTruthy();
        const next = await refresh(authSession.refreshToken, {
          ip: "127.0.0.1",
          userAgent: "vitest-integration-refresh",
        });
        expect(next.accessToken).toBeTruthy();
        expect(next.refreshToken).toBeTruthy();
        authSession = next;
      });
    });

    describe.sequential("advertiser (cadastro de anunciante)", () => {
      it("pré-condição: user A tem advertiser após ensurePublishEligibility", async () => {
        const { rows } = await pool.query(
          `SELECT id, user_id, city_id, slug, name
           FROM advertisers WHERE user_id = $1`,
          [shared.userA.id]
        );
        expect(
          rows.length,
          "Deve existir exatamente um advertiser por user A após publicação elegível"
        ).toBe(1);
        expect(String(rows[0].user_id)).toBe(String(shared.userA.id));
        expect(Number(rows[0].city_id)).toBe(Number(shared.city.id));
        expect(String(rows[0].slug || "").length).toBeGreaterThan(0);
      });

      it("ensureAdvertiserForUser cria linha para user B (primeiro uso)", async () => {
        const adv = await ensureAdvertiserForUser(String(shared.userB.id), {
          cityId: Number(shared.city.id),
          source: "integration.ensure",
        });
        expect(String(adv.user_id ?? shared.userB.id)).toBe(
          String(shared.userB.id)
        );
        const { rows } = await pool.query(
          `SELECT id FROM advertisers WHERE user_id = $1`,
          [shared.userB.id]
        );
        expect(
          rows.length,
          "User B deve ter exatamente um advertiser após ensure"
        ).toBe(1);
      });
    });

    describe.sequential("createAdNormalized e persistência", () => {
      it("cria anúncio ativo e persiste advertiser_id, city_id e campos do veículo", async () => {
        const c = shared.city;
        shared.payload = {
          title: "Carro integração vitest",
          description: "Teste de pipeline",
          price: 42000,
          city_id: Number(c.id),
          city: c.name,
          state: String(c.state).slice(0, 2).toUpperCase(),
          brand: "Fiat",
          model: "Argo",
          year: 2021,
          mileage: 12000,
          body_type: "hatch",
          fuel_type: "flex",
          transmission: "manual",
          below_fipe: false,
        };

        const row = await createAdNormalized(
          shared.payload,
          { id: String(shared.userA.id), plan: "free" },
          { requestId: "integration-happy" }
        );

        expect(row?.id, "createAdNormalized deve retornar linha com id").toBeTruthy();
        expect(Number(row.city_id)).toBe(Number(c.id));
        expect(row.advertiser_id).toBeTruthy();

        const advCheck = await pool.query(
          `SELECT id FROM advertisers WHERE user_id = $1 LIMIT 1`,
          [shared.userA.id]
        );
        expect(advCheck.rows.length).toBe(1);
        expect(String(row.advertiser_id)).toBe(String(advCheck.rows[0].id));

        const { rows: dbRows } = await pool.query(
          `
          SELECT title, brand, model, year, city_id, advertiser_id, status, slug
          FROM ads WHERE id = $1
          `,
          [row.id]
        );
        expect(
          dbRows.length,
          "Linha em `ads` deve existir após insert"
        ).toBe(1);
        const db = dbRows[0];
        expect(db.title).toBe(shared.payload.title);
        expect(db.brand).toBe(shared.payload.brand);
        expect(db.model).toBe(shared.payload.model);
        expect(Number(db.year)).toBe(shared.payload.year);
        expect(Number(db.city_id)).toBe(Number(shared.payload.city_id));
        expect(String(db.advertiser_id)).toBe(String(row.advertiser_id));
        expect(db.status).toBe("active");
        expect(String(db.slug || "").length).toBeGreaterThan(0);

        shared.adIds.push(row.id);
      });

      it("JOIN ads ↔ advertisers — dono do anúncio é user A", async () => {
        const adId = shared.adIds[0];
        const { rows } = await pool.query(
          `
          SELECT a.advertiser_id, adv.user_id
          FROM ads a
          JOIN advertisers adv ON adv.id = a.advertiser_id
          WHERE a.id = $1
          `,
          [adId]
        );
        expect(
          rows.length,
          "Anúncio deve existir com advertiser ligado"
        ).toBe(1);
        expect(String(rows[0].user_id)).toBe(String(shared.userA.id));
      });
    });

    describe.sequential("leitura pública (fachada ads.service.show)", () => {
      it("resolve por slug e expõe os mesmos dados essenciais do banco", async () => {
        expect(shared.adIds.length).toBeGreaterThan(0);
        const { rows } = await pool.query(
          `SELECT id, slug, title, city_id, brand FROM ads WHERE id = $1`,
          [shared.adIds[0]]
        );
        const slug = rows[0]?.slug;
        expect(slug, "slug deve existir na linha ads").toBeTruthy();

        const publicAd = await adsService.show(String(slug));
        expect(publicAd).toBeTruthy();
        expect(String(publicAd.id)).toBe(String(shared.adIds[0]));
        expect(publicAd.title).toBe(rows[0].title);
        expect(Number(publicAd.city_id)).toBe(Number(rows[0].city_id));
        expect(publicAd.brand).toBe(rows[0].brand);
      });
    });

    describe.sequential("painel — dono vs outro usuário", () => {
      it("dono (A) lista e carrega o próprio anúncio", async () => {
        const adId = shared.adIds[0];
        const list = await listOwnedAds(String(shared.userA.id));
        const ids = list.map((a) => String(a.id));
        expect(
          ids.includes(String(adId)),
          "listOwnedAds(A) deve incluir o id do anúncio criado"
        ).toBe(true);

        const owned = await getOwnedAd(String(shared.userA.id), String(adId));
        expect(String(owned.id)).toBe(String(adId));
        expect(owned.title).toBe(shared.payload.title);
      });

      it("usuário B: listOwnedAds vazio (sem vazar anúncio de A)", async () => {
        const list = await listOwnedAds(String(shared.userB.id));
        expect(
          list.length,
          "User B não deve ver anúncios de A no painel"
        ).toBe(0);
      });

      it("usuário B não acessa anúncio de A (getOwnedAd → 404)", async () => {
        const adId = shared.adIds[0];
        await expect(
          getOwnedAd(String(shared.userB.id), String(adId))
        ).rejects.toThrow(/nao encontrado/i);
      });
    });

    describe.sequential("city_id — segundo território", () => {
      it("segundo anúncio persiste city_id distinto do primeiro", async () => {
        expect(
          shared.secondCity,
          "beforeAll deve garantir segunda cidade (seed ou INSERT)"
        ).toBeTruthy();
        const c2 = shared.secondCity;
        const payload = {
          title: "Segundo carro outra cidade",
          description: "Teste city_id",
          price: 33000,
          city_id: Number(c2.id),
          city: c2.name,
          state: String(c2.state).slice(0, 2).toUpperCase(),
          brand: "Honda",
          model: "Civic",
          year: 2019,
          mileage: 50000,
          body_type: "sedan",
          fuel_type: "flex",
          transmission: "automatico",
          below_fipe: false,
        };

        const row = await createAdNormalized(
          payload,
          { id: String(shared.userA.id), plan: "free" },
          { requestId: "integration-city-2" }
        );
        shared.adIds.push(row.id);

        expect(Number(row.city_id)).toBe(Number(c2.id));
        const { rows } = await pool.query(
          `SELECT city_id FROM ads WHERE id = $1`,
          [row.id]
        );
        expect(Number(rows[0].city_id)).toBe(Number(c2.id));
      });
    });

    describe.sequential("schema opcional: CHECK em fuel_type", () => {
      it("INSERT com fuel_type inválido falha com 23514 se existir CHECK no banco", async () => {
        const c = shared.city;
        const { rows: advRows } = await pool.query(
          `SELECT id FROM advertisers WHERE user_id = $1 LIMIT 1`,
          [shared.userA.id]
        );
        expect(advRows.length).toBe(1);
        const advertiserId = advRows[0].id;

        const slug = `invalid-fuel-${Date.now()}`;
        const sql = `
        INSERT INTO ads (
          advertiser_id,
          title,
          description,
          price,
          city_id,
          city,
          state,
          category,
          brand,
          model,
          year,
          mileage,
          body_type,
          fuel_type,
          transmission,
          below_fipe,
          status,
          plan,
          slug,
          created_at,
          updated_at
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, NOW(), NOW()
        )
        RETURNING id
      `;

        const values = [
          advertiserId,
          "Check constraint",
          "teste",
          25000,
          Number(c.id),
          c.name,
          String(c.state).slice(0, 2).toUpperCase(),
          null,
          "VW",
          "Gol",
          2019,
          0,
          "sedan",
          "__integration_invalid_fuel__",
          "manual",
          false,
          "active",
          "free",
          slug,
        ];

        try {
          const { rows: ins } = await pool.query(sql, values);
          if (ins[0]?.id) {
            shared.adIds.push(ins[0].id);
          }
          // Baseline sem CHECK em `fuel_type`: INSERT pode passar — não falha a CI (ver docs/testing/integration-ads.md).
          return;
        } catch (err) {
          if (err.code === "23514") {
            expect(err.code).toBe("23514");
            return;
          }
          throw err;
        }
      });
    });

    describe.sequential("logout invalida refresh", () => {
      it("após logout, refresh com o mesmo token falha", async () => {
        expect(authSession?.refreshToken).toBeTruthy();
        await logout(authSession.refreshToken);
        await expect(
          refresh(authSession.refreshToken, {
            ip: "127.0.0.1",
            userAgent: "vitest-after-logout",
          })
        ).rejects.toThrow();
      });
    });
  }
);
