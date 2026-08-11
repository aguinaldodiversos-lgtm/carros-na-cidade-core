// @vitest-environment jsdom
import { describe, expect, it, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AccountNotificationsBell from "./AccountNotificationsBell";
import { AccountNotificationsProvider } from "./AccountNotificationsProvider";
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

/**
 * O sino não tem estado próprio desde a Fase 1.1 — contador, lista e ações
 * vivem no provider. Renderizar sem ele lança de propósito (ver o hook), então
 * todo teste passa por aqui.
 */
function renderBell(props: { variant?: "pf" | "lojista"; placement?: "mobile" | "desktop" } = {}) {
  return render(
    <AccountNotificationsProvider>
      <AccountNotificationsBell {...props} />
    </AccountNotificationsProvider>
  );
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
    renderBell();

    await waitFor(() => expect(fetchUnreadCount).toHaveBeenCalled());
    expect(screen.queryByTestId("account-notifications-badge")).not.toBeInTheDocument();
  });

  it("com 1 não lida mostra '1'", async () => {
    fetchUnreadCount.mockResolvedValue(1);
    renderBell();

    expect(await screen.findByTestId("account-notifications-badge")).toHaveTextContent("1");
  });

  it("acima de 99 satura em '99+'", async () => {
    fetchUnreadCount.mockResolvedValue(1240);
    renderBell();

    expect(await screen.findByTestId("account-notifications-badge")).toHaveTextContent("99+");
  });

  it("o aria-label anuncia a contagem para leitor de tela", async () => {
    fetchUnreadCount.mockResolvedValue(3);
    renderBell();

    expect(await screen.findByRole("button", { name: /Notificações, 3 não lidas/i })).toBeVisible();
  });

  it("com 1 não lida o aria-label usa o singular", async () => {
    // Caso mais comum de todos; o leitor de tela lê isto por extenso.
    fetchUnreadCount.mockResolvedValue(1);
    renderBell();

    expect(await screen.findByRole("button", { name: "Notificações, 1 não lida" })).toBeVisible();
  });

  it("sem não lidas o aria-label é apenas 'Notificações'", async () => {
    renderBell();
    expect(await screen.findByRole("button", { name: "Notificações" })).toBeVisible();
  });
});

describe("dropdown", () => {
  it("a lista só é buscada ao ABRIR (sem polling nem preload)", async () => {
    const user = userEvent.setup();
    renderBell();

    await waitFor(() => expect(fetchUnreadCount).toHaveBeenCalled());
    expect(fetchNotifications).not.toHaveBeenCalled();

    await user.click(screen.getByTestId("account-notifications-bell"));
    await waitFor(() => expect(fetchNotifications).toHaveBeenCalledTimes(1));
  });

  it("empty state quando não há notificações", async () => {
    const user = userEvent.setup();
    renderBell();

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
    renderBell();

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
    renderBell();

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
    renderBell();

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
    renderBell();

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
    renderBell();

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
    renderBell();

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
    renderBell();

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
    renderBell();

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
    renderBell();

    await user.click(screen.getByTestId("account-notifications-bell"));
    await user.click(await screen.findByTestId("account-notification-item"));

    await waitFor(() => expect(fetchUnreadCount).toHaveBeenCalledTimes(2));
    expect(mockPush).not.toHaveBeenCalled();
  });
});

describe("resiliência — o sino nunca derruba o painel", () => {
  it("contador com erro: componente continua montado, sem badge", async () => {
    fetchUnreadCount.mockRejectedValue(new Error("API fora"));
    renderBell();

    await waitFor(() => expect(fetchUnreadCount).toHaveBeenCalled());
    expect(screen.getByTestId("account-notifications-bell")).toBeVisible();
    expect(screen.queryByTestId("account-notifications-badge")).not.toBeInTheDocument();
  });

  it("lista com erro: mostra mensagem discreta e mantém o painel aberto", async () => {
    fetchNotifications.mockRejectedValue(new Error("API fora"));
    const user = userEvent.setup();
    renderBell();

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
    renderBell();

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
    renderBell();

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
    renderBell({ variant });

    expect(await screen.findByTestId(`notifications-bell-${variant}`)).toBeVisible();
    expect(screen.getByTestId("account-notifications-badge")).toHaveTextContent("2");

    await user.click(screen.getByTestId("account-notifications-bell"));
    expect(await screen.findByTestId("account-notifications-panel")).toBeVisible();
  });
});

/**
 * Fase 1.1 — o requisito mais importante desta revisão.
 *
 * O shell alterna barra mobile e topbar desktop por CSS, então AS DUAS ficam
 * montadas no DOM. Com dois sinos renderizados, se cada um tivesse estado
 * próprio haveria dois `fetchUnreadCount()` por carga e dois listeners de
 * `focus` — exatamente a duplicação que a Fase 1.1 tinha que evitar.
 *
 * Estes testes montam os DOIS sinos como o shell faz e afirmam sobre a REDE.
 */
describe("dois sinos montados — uma única busca (anti-duplicação)", () => {
  function renderBothBells() {
    return render(
      <AccountNotificationsProvider>
        <AccountNotificationsBell variant="pf" placement="mobile" />
        <AccountNotificationsBell variant="pf" placement="desktop" />
      </AccountNotificationsProvider>
    );
  }

  it("dois sinos no DOM disparam UM ÚNICO fetchUnreadCount", async () => {
    fetchUnreadCount.mockResolvedValue(5);
    renderBothBells();

    await waitFor(() => expect(fetchUnreadCount).toHaveBeenCalled());
    // O número que interessa: 1, não 2.
    expect(fetchUnreadCount).toHaveBeenCalledTimes(1);
    expect(screen.getAllByTestId("account-notifications-bell")).toHaveLength(2);
  });

  it("registra UM ÚNICO listener de focus para os dois sinos", async () => {
    const addSpy = vi.spyOn(window, "addEventListener");
    fetchUnreadCount.mockResolvedValue(1);
    renderBothBells();

    await waitFor(() => expect(fetchUnreadCount).toHaveBeenCalled());

    const focusListeners = addSpy.mock.calls.filter(([type]) => type === "focus");
    expect(focusListeners).toHaveLength(1);
    addSpy.mockRestore();
  });

  it("abrir por um sino também busca a lista UMA vez", async () => {
    const user = userEvent.setup();
    renderBothBells();

    await user.click(screen.getAllByTestId("account-notifications-bell")[0]);

    await waitFor(() => expect(fetchNotifications).toHaveBeenCalled());
    expect(fetchNotifications).toHaveBeenCalledTimes(1);
  });

  it("o contador é o MESMO nos dois — estado compartilhado, não cópias", async () => {
    fetchUnreadCount.mockResolvedValue(7);
    renderBothBells();

    const badges = await screen.findAllByTestId("account-notifications-badge");
    expect(badges).toHaveLength(2);
    expect(badges.every((b) => b.textContent === "7")).toBe(true);
  });

  it("marcar todas por um sino zera o badge do outro", async () => {
    fetchUnreadCount.mockResolvedValue(3);
    fetchNotifications.mockResolvedValue({
      notifications: [makeNotification({ id: 1 })],
      next_cursor: null,
      limit: 10,
    });
    markAllNotificationsAsRead.mockResolvedValue(3);
    const user = userEvent.setup();
    renderBothBells();

    await user.click(screen.getAllByTestId("account-notifications-bell")[0]);
    await user.click((await screen.findAllByTestId("account-notifications-mark-all"))[0]);

    await waitFor(() =>
      expect(screen.queryAllByTestId("account-notifications-badge")).toHaveLength(0)
    );
  });
});

/**
 * Acessibilidade — dois achados que a auditoria da Fase 1.1 pegou e que os
 * testes anteriores não cobriam.
 */
describe("acessibilidade", () => {
  it("o foco NÃO se perde quando 'Marcar todas' desaparece", async () => {
    // O botão desmonta a si mesmo ao zerar o contador, enquanto tem o foco.
    // Sem devolver o foco ao painel, o cursor do leitor de tela sai do
    // dropdown e volta ao início do documento.
    fetchUnreadCount.mockResolvedValue(3);
    fetchNotifications.mockResolvedValue({
      notifications: [makeNotification({ id: 1 })],
      next_cursor: null,
      limit: 10,
    });
    markAllNotificationsAsRead.mockResolvedValue(3);
    const user = userEvent.setup();
    renderBell();

    await user.click(screen.getByTestId("account-notifications-bell"));
    await user.click(await screen.findByTestId("account-notifications-mark-all"));

    await waitFor(() =>
      expect(screen.queryByTestId("account-notifications-mark-all")).not.toBeInTheDocument()
    );
    // O foco ficou DENTRO do painel, não no <body>.
    const panel = screen.getByTestId("account-notifications-panel");
    expect(document.activeElement).toBe(panel);
    expect(document.activeElement).not.toBe(document.body);
  });

  it("'não lida' é anunciado por TEXTO, não só por cor", async () => {
    fetchNotifications.mockResolvedValue({
      notifications: [
        makeNotification({ id: 1, title: "Não lida", read_at: null }),
        makeNotification({ id: 2, title: "Já lida", read_at: "2026-08-01T10:00:00Z" }),
      ],
      next_cursor: null,
      limit: 10,
    });
    const user = userEvent.setup();
    renderBell();

    await user.click(screen.getByTestId("account-notifications-bell"));
    const itens = await screen.findAllByTestId("account-notification-item");

    // O item não lido carrega o texto para leitor de tela; o lido, não.
    expect(itens[0]).toHaveTextContent("Não lida.");
    expect(itens[1].textContent).not.toContain("Não lida.");
  });

  it("o painel é focável por código, mas não entra na ordem do Tab", async () => {
    const user = userEvent.setup();
    renderBell();

    await user.click(screen.getByTestId("account-notifications-bell"));
    expect(await screen.findByTestId("account-notifications-panel")).toHaveAttribute(
      "tabindex",
      "-1"
    );
  });
});

describe("posicionamento responsivo do painel", () => {
  it("o wrapper é static no mobile e relative só a partir de lg", async () => {
    // Isto é o que faz o painel se ancorar na LINHA da barra no mobile (que o
    // shell marca como `relative`) em vez de no próprio botão — o botão fica no
    // meio da barra, e ancorar nele jogaria 340px para fora da tela.
    renderBell({ placement: "mobile" });

    const wrapper = await screen.findByTestId("notifications-bell-pf");
    expect(wrapper.className).toContain("static");
    expect(wrapper.className).toContain("lg:relative");
  });

  it("o painel usa largura da viewport no mobile e a fixa só em lg", async () => {
    const user = userEvent.setup();
    renderBell();

    await user.click(screen.getByTestId("account-notifications-bell"));
    const panel = await screen.findByTestId("account-notifications-panel");

    // Mobile: ancorado nas bordas da barra (sem largura fixa).
    expect(panel.className).toContain("inset-x-4");
    expect(panel.className).toContain("top-full");
    // Desktop: exatamente o comportamento anterior.
    expect(panel.className).toContain("lg:w-[340px]");
    expect(panel.className).toContain("lg:right-0");
  });

  it("a lista limita altura por viewport no mobile (landscape não estoura)", async () => {
    const user = userEvent.setup();
    renderBell();

    await user.click(screen.getByTestId("account-notifications-bell"));
    const panel = await screen.findByTestId("account-notifications-panel");
    const scroller = panel.querySelector(".overflow-y-auto");

    expect(scroller?.className).toContain("max-h-[55vh]");
    expect(scroller?.className).toContain("lg:max-h-[360px]");
  });

  it("o botão é menor no mobile e mantém 40px no desktop", async () => {
    renderBell();

    const button = await screen.findByTestId("account-notifications-bell");
    expect(button.className).toContain("h-9");
    expect(button.className).toContain("lg:h-10");
  });

  it("expõe a região no DOM para diagnóstico", async () => {
    renderBell({ placement: "mobile" });
    expect(await screen.findByTestId("notifications-bell-pf")).toHaveAttribute(
      "data-placement",
      "mobile"
    );
  });
});
