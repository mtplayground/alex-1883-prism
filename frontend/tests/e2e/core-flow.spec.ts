import { expect, test, type Page, type Route } from "@playwright/test";

const USER_SUB = "e2e-user-1";
const TODAY = "2026-07-19";
const TOMORROW = "2026-07-20";

interface ClientRecord {
  id: string;
  user_sub: string;
  name: string;
  initials: string;
  color: string;
  created_at: string;
  updated_at: string;
}

interface TimeBlockPayload {
  day: string;
  start_time: string;
  end_time: string;
  title?: string | null;
  category: "client" | "personal";
  client_id?: string | null;
}

interface TimeBlockRecord extends TimeBlockPayload {
  id: string;
  user_sub: string;
  color: string;
  initials: string;
  client_name: string | null;
  created_at: string;
  updated_at: string;
}

test("core planner flow persists clients and day-specific blocks", async ({
  page,
}) => {
  const api = await installMockApi(page);

  await page.goto("/planner");

  await expect(page.getByText("E2E User")).toBeVisible();
  await expect(page.getByLabel("Planner date")).toHaveValue(TODAY);

  const clientManager = page
    .getByRole("heading", { name: "Client manager" })
    .locator("xpath=ancestor::section");
  await clientManager.getByLabel("Name").fill("Acme Studio");
  await clientManager.getByLabel("Initials").fill("AC");
  await clientManager.getByLabel("Color hex").fill("#2563EB");
  await clientManager.getByRole("button", { name: "Add" }).click();

  await expect(clientManager.getByText("Acme Studio").first()).toBeVisible();
  expect(api.clients).toHaveLength(1);

  await dragOnTimeline(page, 12, 84);
  const quickCreate = page.getByTestId("quick-create-form");
  await quickCreate.getByLabel("Title").fill("Design review");
  await quickCreate.getByLabel("Category").selectOption("client:client-1");
  await quickCreate.getByRole("button", { name: "Save" }).click();

  const block = page.getByTestId("time-block-block-1");
  await expect(block).toContainText("Design review");
  await expect(block).toContainText("AC");
  expect(api.blocksByDay.get(TODAY)).toMatchObject([
    {
      client_id: "client-1",
      day: TODAY,
      end_time: "01:00",
      start_time: "00:00",
      title: "Design review",
    },
  ]);

  await dragElement(page, block, 72);
  await expect(block).toContainText("1:00 AM - 2:00 AM");

  const resizeHandle = page.getByTestId("time-block-block-1-resize-end");
  await dragElement(page, resizeHandle, 72);
  await expect(block).toContainText("1:00 AM - 3:00 AM");
  expect(api.blocksByDay.get(TODAY)?.[0]).toMatchObject({
    end_time: "03:00",
    start_time: "01:00",
  });

  await page.getByLabel("Planner date").fill(TOMORROW);
  await expect(page.getByLabel("Planner date")).toHaveValue(TOMORROW);
  await expect(page.getByText("0 blocks")).toBeVisible();
  await expect(page.getByText("Design review")).toHaveCount(0);

  await page.getByRole("button", { name: "Previous" }).click();
  await expect(page.getByLabel("Planner date")).toHaveValue(TODAY);
  await expect(page.getByTestId("time-block-block-1")).toContainText(
    "1:00 AM - 3:00 AM",
  );
  await expect(page.getByText("Acme Studio").first()).toBeVisible();
});

async function installMockApi(page: Page) {
  const clients: ClientRecord[] = [];
  const blocksByDay = new Map<string, TimeBlockRecord[]>([[TODAY, []]]);

  await page.addInitScript((today) => {
    const fixedNow = new Date(`${today}T12:00:00`);
    class FixedDate extends Date {
      constructor(...args: ConstructorParameters<DateConstructor>) {
        if (args.length === 0) {
          super(fixedNow.getTime());
          return;
        }
        super(...args);
      }

      static now() {
        return fixedNow.getTime();
      }
    }

    window.Date = FixedDate as DateConstructor;
  }, TODAY);

  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();

    if (!url.pathname.startsWith("/api/")) {
      return route.continue();
    }

    if (url.pathname === "/api/config" && method === "GET") {
      return json(route, {
        auth_jwks_configured: true,
        auth_login_url: "/login",
        database_configured: true,
        self_url: "http://127.0.0.1:4173",
      });
    }

    if (url.pathname === "/api/auth/me" && method === "GET") {
      return json(route, {
        user: {
          created_at: "2026-07-19T00:00:00Z",
          email: "e2e@example.com",
          last_seen_at: "2026-07-19T00:00:00Z",
          name: "E2E User",
          picture_url: null,
          sub: USER_SUB,
          updated_at: "2026-07-19T00:00:00Z",
        },
      });
    }

    if (url.pathname === "/api/clients" && method === "GET") {
      return json(route, {
        clients,
        personal_color: "#64748B",
      });
    }

    if (url.pathname === "/api/clients" && method === "POST") {
      const payload = (await request.postDataJSON()) as {
        color: string;
        initials: string;
        name: string;
      };
      const client = {
        ...payload,
        created_at: "2026-07-19T00:00:00Z",
        id: `client-${clients.length + 1}`,
        updated_at: "2026-07-19T00:00:00Z",
        user_sub: USER_SUB,
      };
      clients.push(client);
      return json(route, { client }, 201);
    }

    if (url.pathname === "/api/time-blocks" && method === "GET") {
      const day = url.searchParams.get("day") ?? TODAY;
      return json(route, {
        blocks: blocksByDay.get(day) ?? [],
      });
    }

    if (url.pathname === "/api/time-blocks" && method === "POST") {
      const payload = (await request.postDataJSON()) as TimeBlockPayload;
      const block = materializeBlock(payload, clients, "block-1");
      blocksByDay.set(payload.day, [
        ...(blocksByDay.get(payload.day) ?? []),
        block,
      ]);
      return json(route, { block }, 201);
    }

    const blockMatch = url.pathname.match(/^\/api\/time-blocks\/([^/]+)$/);
    if (blockMatch && method === "PATCH") {
      const blockId = decodeURIComponent(blockMatch[1]);
      const payload = (await request.postDataJSON()) as TimeBlockPayload;
      const existing = [...blocksByDay.values()]
        .flat()
        .find((block) => block.id === blockId);
      const block = materializeBlock(payload, clients, blockId, existing);

      for (const [day, blocks] of blocksByDay) {
        blocksByDay.set(
          day,
          blocks.filter((candidate) => candidate.id !== blockId),
        );
      }
      blocksByDay.set(payload.day, [
        ...(blocksByDay.get(payload.day) ?? []),
        block,
      ]);
      return json(route, { block });
    }

    return json(route, { error: "unhandled mock route" }, 404);
  });

  return { blocksByDay, clients };
}

function materializeBlock(
  payload: TimeBlockPayload,
  clients: ClientRecord[],
  id: string,
  existing?: TimeBlockRecord,
): TimeBlockRecord {
  const client =
    payload.category === "client"
      ? clients.find((candidate) => candidate.id === payload.client_id)
      : null;

  return {
    ...payload,
    client_id:
      payload.category === "client" ? (payload.client_id ?? null) : null,
    client_name: client?.name ?? null,
    color: client?.color ?? "#64748B",
    created_at: existing?.created_at ?? "2026-07-19T00:00:00Z",
    id,
    initials: client?.initials ?? "P",
    title: payload.title ?? null,
    updated_at: "2026-07-19T00:00:00Z",
    user_sub: USER_SUB,
  };
}

async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({
    body: JSON.stringify(body),
    contentType: "application/json",
    status,
  });
}

async function dragOnTimeline(page: Page, startY: number, endY: number) {
  const timeline = page.getByTestId("day-timeline-grid");
  await timeline.evaluate((element) =>
    element.scrollIntoView({ block: "start", inline: "nearest" }),
  );
  const timelineBox = await timeline.boundingBox();
  if (!timelineBox) {
    throw new Error("timeline grid should be visible");
  }

  const x = timelineBox.x + timelineBox.width / 2;
  await page.mouse.move(x, timelineBox.y + startY);
  await page.mouse.down();
  await page.mouse.move(x, timelineBox.y + endY, { steps: 6 });
  await page.mouse.up();
}

async function dragElement(
  page: Page,
  locator: ReturnType<Page["getByTestId"]>,
  deltaY: number,
) {
  const box = await locator.boundingBox();
  if (!box) {
    throw new Error("draggable element should be visible");
  }

  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y + deltaY);
  await page.mouse.up();
}
