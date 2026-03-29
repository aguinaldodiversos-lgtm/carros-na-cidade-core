/**
 * URL padrão do Postgres de teste (Docker: docker-compose.test.yml).
 * Host 5433 evita conflito com um Postgres de desenvolvimento na 5432.
 */
export const INTEGRATION_TEST_DATABASE_URL_DEFAULT =
  "postgresql://postgres:postgres@127.0.0.1:5433/carros_na_cidade_test";
