// @vitest-environment jsdom
import { describe, expect, it, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AccountNotificationsBell from "./AccountNotificationsBell";
import type { UserNotification } from "@/lib/notifications/api";

/**
 * Sino de notificações — comportamento observável.
 *
 * O que estes testes travam, em ordem de importância:
 *   1. o sino NUNCA derruba o painel: API fora → componente continua de pé;
 *   2. badge só existe quando há não lidas, e satura em "99+";
 *   3. clicar numa notificação com destino EXTERNO não navega (open redirect);
 *   4. título/corpo são renderizados como TEXTO — nada de HTML do banco virar
 *      markup;
 *   5. funciona igual nos dois painéis (variant pf | lojista).
 */

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

const fetchUnreadCount = vi.fn();
const fetchNotifications = vi.fn();
const markNotificationAsRead = vi.fn();
const markAllNotificationsAsRead = vi.fn();

vi.mock("@/lib/notifications/api", async (importOriginal) => {
  // Mantém os helpers puros reais (formatBadgeCount, isSafeInternalPath,
  // formatRelativeTime) — testá-los via mock não provaria nada.
  const actual = await importOriginal<typeof import("@/lib/notifications/api")>();
  return {
    ...actual,
    fetchUnreadCount: (...args: unknown[]) => fetchUnreadCount(...args),
    fetchNotifications: (...args: unknown[]) => fetchNotifications(...args),
    markNotificationAsRead: (...args: unknown[]) => markNotificationAsRead(...args),
    markAllNotificationsAsRead: (...args: unknown[]) => markAllNotificationsAsRead(...args),
  };
});

function makeNotification(overrides: Partial<UserNotification> = {}): UserNotification {
  return {
    id: 1,
    recipient_user_id: 10,
    event_type: "sale_request.bid_received",
    title: "Nova oferta recebida",
    body: "Uma loja fez uma oferta pelo seu veículo.",
    entity_type: null,
    entity_id: null,
    action_path: null,
    payload: {},
    read_at: null,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  fetchUnreadCount.mockResolvedValue(0);
  fetchNotifications.mockResolvedValue({ notifications: [], next_cursor: null, limit: 10 });
  markNotificationAsRead.mockResolvedValue(makeNotification({ read_at: new Date().toISOString() }));
  markAllNotificationsAsRead.mockResolvedValue(0);
});

afterEach(cleanup);

describe("badge", () => {
  it("com 0 não lidas NÃO mostra badge", async () => {
    fetchUnreadCount.mockResolvedValue(0);
    render(<AccountNotificationsBell />);

    await waitFor(() => expect(fetchUnreadCount).toHaveBeenCalled());
    expect(screen.queryByTestId("account-notifications-badge")).not.toBeInTheDocument();
  });

  it("com 1 não lida mostra '1'", async () => {
    fetchUnreadCount.mockResolvedValue(1);
    render(<AccountNotificationsBell />);

    expect(await screen.findByTestId("account-notifications-badge")).toHaveTextContent("1");
  });

  it("acima de 99 satura em '99+'", async () => {
    fetchUnreadCount.mockResolvedValue(1240);
    render(<AccountNotificationsBell />);

    expect(await screen.findByTestId("account-notifications-badge")).toHaveTextContent("99+");
  });

  it("o aria-label anuncia a contagem para leitor de tela", async () => {
    fetchUnreadCount.mockResolvedValue(3);
    render(<AccountNotificationsBell />);

    expect(await screen.findByRole("button", { name: /Notificações, 3 não lidas/i })).toBeVisible();
  });

  it("com 1 não lida o aria-label usa o singular", async () => {
    // Caso mais comum de todos; o leitor de tela lê isto por extenso.
    fetchUnreadCount.mockResolvedValue(1);
    render(<AccountNotificationsBell />);

    expect(await screen.findByRole("button", { name: "Notificações, 1 não lida" })).toBeVisible();
  });

  it("sem não lidas o aria-label é apenas 'Notificações'", async () => {
    render(<AccountNotificationsBell />);
    expect(await screen.findByRole("button", { name: "Notificações" })).toBeVisible();
  });
});

describe("dropdown", () => {
  it("a lista só é buscada ao ABRIR (sem polling nem preload)", async () => {
    const user = userEvent.setup();
    render(<AccountNotificationsBell />);

    await waitFor(() => expect(fetchUnreadCount).toHaveBeenCalled());
    expect(fetchNotifications).not.toHaveBeenCalled();

    await user.click(screen.getByTestId("account-notifications-bell"));
    await waitFor(() => expect(fetchNotifications).toHaveBeenCalledTimes(1));
  });

  it("empty state quando não há notificações", async () => {
    const user = userEvent.setup();
    render(<AccountNotificationsBell />);

    await user.click(screen.getByTestId("account-notifications-bell"));

    expect(await screen.findByText(/Você ainda não tem notificações/i)).toBeVisible();
  });

  it("lista as notificações recebidas", async () => {
    fetchNotifications.mockResolvedValue({
      notifications: [
        makeNotification({ id: 1, title: "Nova oferta recebida" }),
        makeNotification({
          id: 2,
          title: "Sua avaliação foi agendada",
          read_at: "2026-08-01T10:00:00Z",
        }),
      ],
      next_cursor: null,
      limit: 10,
    });
    const user = userEvent.setup();
    render(<AccountNotificationsBell />);

    await user.click(screen.getByTestId("account-notifications-bell"));

    expect(await screen.findByText("Nova oferta recebida")).toBeVisible();
    expect(screen.getByText("Sua avaliação foi agendada")).toBeVisible();
  });

  it("distingue não lida de lida", async () => {
    fetchNotifications.mockResolvedValue({
      notifications: [
        makeNotification({ id: 1, read_at: null }),
        makeNotification({ id: 2, read_at: "2026-08-01T10:00:00Z" }),
      ],
      next_cursor: null,
      limit: 10,
    });
    const user = userEvent.setup();
    render(<AccountNotificationsBell />);

    await user.click(screen.getByTestId("account-notifications-bell"));

    const items = await screen.findAllByTestId("account-notification-item");
    expect(items[0]).toHaveAttribute("data-unread", "true");
    expect(items[1]).toHaveAttribute("data-unread", "false");
  });
});

describe("marcar como lida", () => {
  it("clicar numa notificação marca como lida e decrementa o badge", async () => {
    fetchUnreadCount.mockResolvedValue(2);
    fetchNotifications.mockResolvedValue({
      notifications: [makeNotification({ id: 7 })],
      next_cursor: null,
      limit: 10,
    });
    const user = userEvent.setup();
    render(<AccountNotificationsBell />);

    await user.click(screen.getByTestId("account-notifications-bell"));
    await user.click(await screen.findByTestId("account-notification-item"));

    expect(markNotificationAsRead).toHaveBeenCalledWith(7);
    await waitFor(() =>
      expect(screen.getByTestId("account-notifications-badge")).toHaveTextContent("1")
    );
  });

  it("'Marcar todas como lidas' só aparece com não lidas", async () => {
    const user = userEvent.setup();
    fetchUnreadCount.mockResolvedValue(0);
    render(<AccountNotificationsBell />);

    await user.click(screen.getByTestId("account-notifications-bell"));
    await screen.findByText(/Você ainda não tem notificações/i);

    expect(screen.queryByTestId("account-notifications-mark-all")).not.toBeInTheDocument();
  });

  it("'Marcar todas' zera o badge", async () => {
    fetchUnreadCount.mockResolvedValue(4);
    fetchNotifications.mockResolvedValue({
      notifications: [makeNotification({ id: 1 })],
      next_cursor: null,
      limit: 10,
    });
    markAllNotificationsAsRead.mockResolvedValue(4);
    const user = userEvent.setup();
    render(<AccountNotificationsBell />);

    await user.click(screen.getByTestId("account-notifications-bell"));
    await user.click(await screen.findByTestId("account-notifications-mark-all"));

    await waitFor(() =>
      expect(screen.queryByTestId("account-notifications-badge")).not.toBeInTheDocument()
    );
  });
});

describe("navegação — o clique não pode virar open redirect", () => {
  it("navega quando action_path é interno", async () => {
    fetchNotifications.mockResolvedValue({
      notifications: [makeNotification({ id: 1, action_path: "/dashboard/minhas-procuras/5" })],
      next_cursor: null,
      limit: 10,
    });
    const user = userEvent.setup();
    render(<AccountNotificationsBell />);

    await user.click(screen.getByTestId("account-notifications-bell"));
    await user.click(await screen.findByTestId("account-notification-item"));

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/dashboard/minhas-procuras/5"));
  });

  it("NÃO navega quando action_path é externo (mesmo que tenha sido gravado)", async () => {
    fetchNotifications.mockResolvedValue({
      notifications: [makeNotification({ id: 1, action_path: "https://evil.com" })],
      next_cursor: null,
      limit: 10,
    });
    const user = userEvent.setup();
    render(<AccountNotificationsBell />);

    await user.click(screen.getByTestId("account-notifications-bell"));
    await user.click(await screen.findByTestId("account-notification-item"));

    // Marca como lida normalmente, mas não sai do portal.
    await waitFor(() => expect(markNotificationAsRead).toHaveBeenCalled());
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("sem action_path apenas marca como lida", async () => {
    fetchNotifications.mockResolvedValue({
      notifications: [makeNotification({ id: 1, action_path: null })],
      next_cursor: null,
      limit: 10,
    });
    const user = userEvent.setup();
    render(<AccountNotificationsBell />);

    await user.click(screen.getByTestId("account-notifications-bell"));
    await user.click(await screen.findByTestId("account-notification-item"));

    await waitFor(() => expect(markNotificationAsRead).toHaveBeenCalled());
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("se a marcação FALHAR, não navega", async () => {
    markNotificationAsRead.mockRejectedValue(new Error("rede fora"));
    fetchNotifications.mockResolvedValue({
      notifications: [makeNotification({ id: 1, action_path: "/dashboard/x" })],
      next_cursor: null,
      limit: 10,
    });
    const user = userEvent.setup();
    render(<AccountNotificationsBell />);

    await user.click(screen.getByTestId("account-notifications-bell"));
    await user.click(await screen.findByTestId("account-notification-item"));

    await waitFor(() => expect(fetchUnreadCount).toHaveBeenCalledTimes(2));
    expect(mockPush).not.toHaveBeenCalled();
  });
});

describe("resiliência — o sino nunca derruba o painel", () => {
  it("contador com erro: componente continua montado, sem badge", async () => {
    fetchUnreadCount.mockRejectedValue(new Error("API fora"));
    render(<AccountNotificationsBell />);

    await waitFor(() => expect(fetchUnreadCount).toHaveBeenCalled());
    expect(screen.getByTestId("account-notifications-bell")).toBeVisible();
    expect(screen.queryByTestId("account-notifications-badge")).not.toBeInTheDocument();
  });

  it("lista com erro: mostra mensagem discreta e mantém o painel aberto", async () => {
    fetchNotifications.mockRejectedValue(new Error("API fora"));
    const user = userEvent.setup();
    render(<AccountNotificationsBell />);

    await user.click(screen.getByTestId("account-notifications-bell"));

    expect(await screen.findByText(/Não foi possível carregar as notificações/i)).toBeVisible();
    expect(screen.getByTestId("account-notifications-panel")).toBeVisible();
  });

  it("'marcar todas' com erro não quebra o componente", async () => {
    fetchUnreadCount.mockResolvedValue(2);
    fetchNotifications.mockResolvedValue({
      notifications: [makeNotification({ id: 1 })],
      next_cursor: null,
      limit: 10,
    });
    markAllNotificationsAsRead.mockRejectedValue(new Error("falhou"));
    const user = userEvent.setup();
    render(<AccountNotificationsBell />);

    await user.click(screen.getByTestId("account-notifications-bell"));
    await user.click(await screen.findByTestId("account-notifications-mark-all"));

    await waitFor(() => expect(fetchUnreadCount).toHaveBeenCalledTimes(2));
    expect(screen.getByTestId("account-notifications-bell")).toBeVisible();
  });
});

describe("conteúdo do banco é TEXTO, nunca markup", () => {
  it("HTML no título/corpo é escapado, não interpretado", async () => {
    fetchNotifications.mockResolvedValue({
      notifications: [
        makeNotification({
          id: 1,
          title: "<img src=x onerror=alert(1)>",
          body: "<script>alert('xss')</script>",
        }),
      ],
      next_cursor: null,
      limit: 10,
    });
    const user = userEvent.setup();
    render(<AccountNotificationsBell />);

    await user.click(screen.getByTestId("account-notifications-bell"));

    const item = await screen.findByTestId("account-notification-item");
    // O texto aparece literalmente…
    expect(item).toHaveTextContent("<img src=x onerror=alert(1)>");
    // …e não virou elemento no DOM.
    expect(item.querySelector("img")).toBeNull();
    expect(item.querySelector("script")).toBeNull();
  });
});

describe("os dois painéis usam o MESMO componente", () => {
  it.each(["pf", "lojista"] as const)("variant=%s renderiza e funciona", async (variant) => {
    fetchUnreadCount.mockResolvedValue(2);
    const user = userEvent.setup();
    render(<AccountNotificationsBell variant={variant} />);

    expect(await screen.findByTestId(`notifications-bell-${variant}`)).toBeVisible();
    expect(screen.getByTestId("account-notifications-badge")).toHaveTextContent("2");

    await user.click(screen.getByTestId("account-notifications-bell"));
    expect(await screen.findByTestId("account-notifications-panel")).toBeVisible();
  });
});
