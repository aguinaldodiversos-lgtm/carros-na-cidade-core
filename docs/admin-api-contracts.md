# Admin API — Endpoint Contracts

All endpoints require `Authorization: Bearer <token>` from a user with `role=admin`.
Unauthorized requests return `403 Forbidden`.

---

## GET /api/admin/dashboard/overview

Platform-wide counts.

**Response:**

```json
{
  "ok": true,
  "data": {
    "ads": {
      "total": 1250,
      "active": 980,
      "paused": 150,
      "deleted": 100,
      "blocked": 20,
      "highlighted": 45
    },
    "advertisers": {
      "total": 320,
      "active": 310,
      "suspended": 5,
      "blocked": 5
    },
    "users": {
      "total": 1500,
      "admins": 2,
      "regular": 1498
    },
    "cities": {
      "total": 5570
    }
  }
}
```

**Notes:** `highlighted` counts ads where `highlight_until > NOW() AND status = 'active'`.

---

## GET /api/admin/dashboard/kpis?period_days=30

KPIs for a configurable period (default 30 days).

**Response:**

```json
{
  "ok": true,
  "data": {
    "period_days": 30,
    "new_ads": 85,
    "new_users": 42,
    "revenue": {
      "total_approved": "4500.00",
      "approved_count": 15,
      "plan_revenue": "3200.00",
      "boost_revenue": "1300.00"
    },
    "top_cities": [
      { "name": "São Paulo", "state": "SP", "ads_count": 120 },
      { "name": "Campinas", "state": "SP", "ads_count": 45 }
    ]
  }
}
```

**Notes:**

- `revenue` may have `_warning: "payment_intents not available"` if the table doesn't exist yet.
- Revenue amounts are GROSS checkout values (see financial limitations below).

---

## GET /api/admin/ads?limit=50&offset=0&status=active&city_id=1&advertiser_id=5

Paginated ad listing with optional filters.

**Response:**

```json
{
  "ok": true,
  "data": [
    {
      "id": "123",
      "title": "Honda Civic 2020",
      "slug": "honda-civic-2020-sao-paulo",
      "status": "active",
      "price": "89000.00",
      "city": "São Paulo",
      "state": "SP",
      "brand": "Honda",
      "model": "Civic",
      "year": 2020,
      "plan": "free",
      "priority": 5,
      "highlight_until": "2026-05-01T00:00:00.000Z",
      "created_at": "2026-03-15T10:30:00.000Z",
      "updated_at": "2026-04-01T14:20:00.000Z",
      "blocked_reason": null,
      "blocked_at": null,
      "advertiser_id": "45",
      "advertiser_name": "Auto Center SP",
      "advertiser_user_id": "u-78"
    }
  ],
  "total": 980,
  "limit": 50,
  "offset": 0
}
```

---

## GET /api/admin/ads/:id

Full ad detail with advertiser + city data.

**Response:** Same shape as list item but includes additional fields:
`description`, `mileage`, `body_type`, `fuel_type`, `transmission`, `images`,
`city_name`, `city_slug`, `advertiser_email`, `advertiser_status`.

---

## PATCH /api/admin/ads/:id/status

**Request:** `{ "status": "blocked", "reason": "Policy violation" }`

**Response:** `{ "ok": true, "data": { ...updated ad row } }`

Valid statuses: `active`, `paused`, `blocked`. Cannot restore `deleted` ads.

---

## PATCH /api/admin/ads/:id/highlight

Grant manual boost (free highlight).

**Request (option A — by days):** `{ "days": 7, "reason": "Promotional" }`

**Request (option B — by date):** `{ "highlight_until": "2026-05-15T00:00:00.000Z" }`

**Response:** `{ "ok": true, "data": { ...updated ad } }`

---

## PATCH /api/admin/ads/:id/priority

**Request:** `{ "priority": 50 }`

Valid range: 0–100. Higher = more prominent in rankings.

**Response:** `{ "ok": true, "data": { ...updated ad } }`

---

## GET /api/admin/ads/:id/metrics

**Response:**

```json
{
  "ok": true,
  "data": {
    "ad_id": "123",
    "views": 450,
    "clicks": 32,
    "leads": 8,
    "ctr": 0.071111,
    "updated_at": "2026-04-07T18:00:00.000Z"
  }
}
```

**Notes:** If no events exist, returns zeros. Data is aggregated from `ad_events` via UPSERT.

---

## GET /api/admin/ads/:id/events?limit=50

**Response:**

```json
{
  "ok": true,
  "data": [
    { "id": "1", "ad_id": "123", "event_type": "view", "created_at": "2026-04-07T10:00:00Z" },
    { "id": "2", "ad_id": "123", "event_type": "click", "created_at": "2026-04-07T10:01:00Z" }
  ]
}
```

**Notes:** Returns empty array `[]` if `ad_events` table doesn't exist or has no data.

---

## GET /api/admin/advertisers?limit=50&offset=0&status=active

**Response:**

```json
{
  "ok": true,
  "data": [
    {
      "id": "45",
      "name": "Auto Center SP",
      "email": "contato@autocenter.com",
      "phone": "11999990000",
      "company_name": "Auto Center LTDA",
      "status": "active",
      "plan": "free",
      "user_id": "u-78",
      "city_id": "1",
      "suspended_at": null,
      "blocked_at": null,
      "status_reason": null,
      "user_role": "user",
      "document_type": "cnpj",
      "active_ads_count": "12",
      "total_ads_count": "15"
    }
  ],
  "total": 320,
  "limit": 50,
  "offset": 0
}
```

---

## GET /api/admin/advertisers/:id

Same as list item plus: `user_email`, `user_name`, `user_plan`.

---

## PATCH /api/admin/advertisers/:id/status

**Request:** `{ "status": "suspended", "reason": "Under review" }`

Valid statuses: `active`, `suspended`, `blocked`.

---

## GET /api/admin/advertisers/:id/ads

List of ads belonging to this advertiser.

---

## GET /api/admin/payments?limit=50&offset=0&status=approved&context=boost

**Response:**

```json
{
  "ok": true,
  "data": [
    {
      "id": "pi-uuid-1",
      "user_id": "u-78",
      "context": "boost",
      "plan_id": null,
      "ad_id": "123",
      "boost_option_id": "boost-7d",
      "amount": "39.90",
      "status": "approved",
      "checkout_resource_type": "preference",
      "payment_resource_id": "mp-12345",
      "created_at": "2026-04-01T10:00:00Z",
      "updated_at": "2026-04-01T10:05:00Z",
      "user_name": "João Silva",
      "user_email": "joao@email.com"
    }
  ],
  "total": 150,
  "limit": 50,
  "offset": 0
}
```

**Notes:** Returns `_warning` field if `payment_intents` table doesn't exist.

---

## GET /api/admin/payments/summary?period_days=30

**Response:**

```json
{
  "ok": true,
  "data": {
    "total_intents": 150,
    "approved_count": 90,
    "pending_count": 30,
    "rejected_count": 20,
    "canceled_count": 10,
    "total_approved_amount": "12500.00",
    "total_pending_amount": "4200.00",
    "plan_approved_count": 60,
    "boost_approved_count": 30,
    "plan_approved_amount": "8500.00",
    "boost_approved_amount": "4000.00"
  }
}
```

**FINANCIAL LIMITATIONS:**

- All amounts are GROSS checkout values from local `payment_intents`.
- No Mercado Pago reconciliation (no net/fee data).
- No refund tracking.
- No monthly breakdown.
- `plan_approved_amount + boost_approved_amount = total_approved_amount`.
- In mock mode (dev without MP_ACCESS_TOKEN), status=approved is simulated.

---

## GET /api/admin/metrics/ads/top?limit=20

**Response:**

```json
{
  "ok": true,
  "data": [
    {
      "id": "123",
      "title": "Honda Civic 2020",
      "slug": "honda-civic-2020-sp",
      "city": "São Paulo",
      "state": "SP",
      "brand": "Honda",
      "model": "Civic",
      "status": "active",
      "priority": 15,
      "highlight_until": null,
      "views": 450,
      "clicks": 32,
      "leads": 8,
      "ctr": 0.071
    }
  ]
}
```

---

## GET /api/admin/metrics/cities?limit=30

**Response:**

```json
{
  "ok": true,
  "data": [
    {
      "id": "1",
      "name": "São Paulo",
      "slug": "sao-paulo",
      "state": "SP",
      "visits": 5000,
      "leads": 120,
      "ads_count": 250,
      "advertisers_count": 80,
      "conversion_rate": 2.4,
      "demand_score": 85.5,
      "metrics_updated_at": "2026-04-07T06:00:00Z"
    }
  ]
}
```

**Notes:** `visits`, `leads`, etc. come from `city_metrics` (populated by `city_metrics.worker.js`).
In fresh environments, these will be 0 until the worker runs.

---

## GET /api/admin/metrics/events/recent?limit=50

**Response:**

```json
{
  "ok": true,
  "data": [
    {
      "id": "evt-1",
      "ad_id": "123",
      "event_type": "view",
      "created_at": "2026-04-07T10:00:00Z",
      "ad_title": "Honda Civic 2020",
      "ad_city": "São Paulo"
    }
  ]
}
```

**Notes:** Returns `[]` if `ad_events` table doesn't exist.

---

## GET /api/admin/metrics/seo/cities?limit=30

**Response:**

```json
{
  "ok": true,
  "data": [
    {
      "date": "2026-04-07",
      "city": "São Paulo",
      "impressions": 15000,
      "clicks": 800,
      "ctr": 0.053,
      "avg_position": 12.5,
      "sessions": 3200,
      "users_count": 2800,
      "conversions": 45,
      "source": "google",
      "created_at": "2026-04-07T06:00:00Z"
    }
  ]
}
```

**Notes:** Returns `[]` in fresh environments until SEO collectors run.
Canonical table is `seo_city_metrics` (migration 015).
