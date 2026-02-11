import { useEffect, useState } from "react";
import axios from "axios";

export default function Alertas() {
  const [alerts, setAlerts] = useState([]);
  const [form, setForm] = useState({
    city: "",
    brand: "",
    model: "",
    price_max: "",
    year_min: "",
  });

  const token = localStorage.getItem("token");

  const api = axios.create({
    baseURL: "https://carros-na-cidade-api.onrender.com/api",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  async function loadAlerts() {
    try {
      const res = await api.get("/alerts");
      setAlerts(res.data);
    } catch (err) {
      console.error("Erro ao carregar alertas");
    }
  }

  useEffect(() => {
    loadAlerts();
  }, []);

  async function createAlert(e) {
    e.preventDefault();

    try {
      await api.post("/alerts", form);
      setForm({
        city: "",
        brand: "",
        model: "",
        price_max: "",
        year_min: "",
      });
      loadAlerts();
    } catch (err) {
      alert("Erro ao criar alerta");
    }
  }

  async function deleteAlert(id) {
    try {
      await api.delete(`/alerts/${id}`);
      loadAlerts();
    } catch (err) {
      alert("Erro ao excluir alerta");
    }
  }

  return (
    <div style={{ padding: 30 }}>
      <h2>Meus alertas</h2>

      <form onSubmit={createAlert} style={{ marginBottom: 20 }}>
        <input
          placeholder="Cidade"
          value={form.city}
          onChange={(e) => setForm({ ...form, city: e.target.value })}
          required
        />
        <input
          placeholder="Marca"
          value={form.brand}
          onChange={(e) => setForm({ ...form, brand: e.target.value })}
        />
        <input
          placeholder="Modelo"
          value={form.model}
          onChange={(e) => setForm({ ...form, model: e.target.value })}
        />
        <input
          placeholder="Preço máximo"
          type="number"
          value={form.price_max}
          onChange={(e) =>
            setForm({ ...form, price_max: e.target.value })
          }
        />
        <input
          placeholder="Ano mínimo"
          type="number"
          value={form.year_min}
          onChange={(e) =>
            setForm({ ...form, year_min: e.target.value })
          }
        />

        <button type="submit">Criar alerta</button>
      </form>

      {alerts.map((alert) => (
        <div
          key={alert.id}
          style={{
            border: "1px solid #ddd",
            padding: 15,
            marginBottom: 10,
          }}
        >
          <p><strong>Cidade:</strong> {alert.city}</p>
          {alert.brand && <p><strong>Marca:</strong> {alert.brand}</p>}
          {alert.model && <p><strong>Modelo:</strong> {alert.model}</p>}
          {alert.price_max && (
            <p><strong>Preço máx:</strong> R$ {alert.price_max}</p>
          )}
          {alert.year_min && (
            <p><strong>Ano mín:</strong> {alert.year_min}</p>
          )}

          <button onClick={() => deleteAlert(alert.id)}>
            Excluir
          </button>
        </div>
      ))}
    </div>
  );
}
