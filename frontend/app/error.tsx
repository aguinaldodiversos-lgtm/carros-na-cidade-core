"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Erro capturado em app/error.tsx:", error);
  }, [error]);

  return (
    <html lang="pt-BR">
      <body
        style={{
          margin: 0,
          fontFamily: "Arial, sans-serif",
          background: "#F5F7FB",
          color: "#1D2440",
        }}
      >
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "24px",
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: "640px",
              background: "#fff",
              border: "1px solid #E5E9F2",
              borderRadius: "20px",
              padding: "32px",
              boxShadow: "0 10px 30px rgba(16,24,40,0.08)",
            }}
          >
            <h1 style={{ marginTop: 0, fontSize: "28px" }}>Ocorreu um erro ao carregar a página</h1>

            <p style={{ color: "#6E748A", lineHeight: 1.6 }}>
              Houve uma falha inesperada na interface. Tente recarregar a página. Se o problema
              continuar, revise o console do navegador para identificar o componente que está
              quebrando.
            </p>

            <div style={{ marginTop: "20px" }}>
              <button
                onClick={() => reset()}
                style={{
                  background: "#1F66E5",
                  color: "#fff",
                  border: "none",
                  borderRadius: "12px",
                  padding: "12px 18px",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Tentar novamente
              </button>
            </div>

            {process.env.NODE_ENV !== "production" && error?.message ? (
              <pre
                style={{
                  marginTop: "24px",
                  padding: "16px",
                  background: "#F5F7FB",
                  borderRadius: "12px",
                  overflowX: "auto",
                  fontSize: "12px",
                  color: "#B42318",
                }}
              >
                {error.message}
              </pre>
            ) : null}
          </div>
        </div>
      </body>
    </html>
  );
}
