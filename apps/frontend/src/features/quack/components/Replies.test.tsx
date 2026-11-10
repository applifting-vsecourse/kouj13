import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query"
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { api } from "@/lib/api-client"

import { addQuack } from "@/features/quack/api/addQuack"
import { deleteQuack } from "@/features/quack/api/deleteQuack"
import { quackKeys } from "@/features/quack/api/quackKeys"
import { quackSchema, type Quack } from "@/features/quack/api/quackSchemas"
import { QuackFeed } from "@/features/quack/components/QuackFeed"

vi.mock("@/features/quack/api/addQuack", () => ({ addQuack: vi.fn() }))
vi.mock("@/features/quack/api/deleteQuack", () => ({ deleteQuack: vi.fn() }))
vi.mock("@/lib/api-client", async (importOriginal) => ({
  ...(await importOriginal<{ api: typeof api }>()),
  api: { get: vi.fn() },
}))

const parent: Quack = {
  id: "q1",
  text: "Bread at noon?",
  userId: "u1",
  createdAt: new Date("2026-01-01T12:00:00Z"),
  user: { id: "u1", name: "Me", username: "me" },
  replyCount: 1,
}
const reply: Quack = {
  id: "r1",
  text: "Only if it's sourdough",
  userId: "u2",
  createdAt: new Date("2026-01-01T12:05:00Z"),
  user: { id: "u2", name: "Bread Critic", username: "critic" },
  parentId: "q1",
  replyCount: 0,
}
const tombstone: Quack = {
  id: "q9",
  text: "",
  userId: null,
  createdAt: new Date("2026-01-01T11:00:00Z"),
  user: null,
  deleted: true,
  replyCount: 1,
}

let serverQuacks: Quack[]
let serverReplies: Record<string, Quack[]>
let client: QueryClient

function Feed() {
  const { data = [] } = useQuery({
    queryKey: quackKeys.lists(),
    queryFn: () => Promise.resolve(serverQuacks),
    initialData: serverQuacks,
  })
  return (
    <QuackFeed
      quacks={data}
      currentUserId="u1"
      currentUserRole="user"
      defaultMood="happy"
    />
  )
}

function renderFeed() {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <Feed />
    </QueryClientProvider>,
  )
}

const articleFor = (text: string) =>
  screen.getAllByRole("article").find((article) => article.textContent?.includes(text))!

beforeEach(() => {
  serverQuacks = [parent]
  serverReplies = { q1: [reply], q9: [{ ...reply, id: "r9", parentId: "q9" }] }
  vi.mocked(api.get).mockImplementation(((path: string) => ({
    json: () => Promise.resolve(serverReplies[path.split("/")[1]!] ?? []),
  })) as never)
  vi.mocked(addQuack).mockReset()
  vi.mocked(deleteQuack).mockReset()
})
afterEach(() => {
  cleanup()
  client?.clear()
})

describe("Replies", () => {
  it("parses the reply fields and a tombstone from the API", () => {
    expect(quackSchema.parse({ ...tombstone, createdAt: "2026-01-01T11:00:00Z" })).toMatchObject({
      deleted: true,
      user: null,
      userId: null,
      replyCount: 1,
    })
  })

  it("opens a thread under the quack and lists its replies", async () => {
    renderFeed()

    await userEvent.click(screen.getByRole("button", { name: "1 reply" }))

    const thread = screen.getByRole("region", { name: "Replies" })
    expect(await within(thread).findByText(reply.text)).toBeInTheDocument()
    expect(within(thread).getByText("Bread Critic")).toBeInTheDocument()
    expect(api.get).toHaveBeenCalledWith("quacks/q1/replies")
    // One level only: a reply has no reply toggle of its own.
    expect(
      within(within(thread).getByRole("article")).queryByRole("button", { name: /repl/i }),
    ).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Hide replies" })).toHaveAttribute(
      "aria-expanded",
      "true",
    )
  })

  it("shows an empty state and posts a reply with the parent id and default mood", async () => {
    serverQuacks = [{ ...parent, replyCount: 0 }]
    serverReplies = { q1: [] }
    vi.mocked(addQuack).mockImplementation((input) => {
      serverReplies = { q1: [{ ...reply, userId: "u1", text: input.text }] }
      return Promise.resolve({ ...reply, text: input.text })
    })
    renderFeed()

    await userEvent.click(screen.getByRole("button", { name: "Reply" }))
    expect(await screen.findByText("Replies to this quack will appear here.")).toBeInTheDocument()
    const thread = screen.getByRole("region", { name: "Replies" })
    expect(within(thread).queryByRole("button", { name: "Add poll" })).not.toBeInTheDocument()

    await userEvent.type(within(thread).getByRole("textbox", { name: "Your reply" }), "Count me in")
    await userEvent.click(within(thread).getByRole("button", { name: "Reply" }))

    await waitFor(() => expect(addQuack).toHaveBeenCalledOnce())
    expect(vi.mocked(addQuack).mock.calls[0]?.[0]).toEqual({
      text: "Count me in",
      mood: "happy",
      parentId: "q1",
    })
    expect(await within(thread).findByText("Count me in")).toBeInTheDocument()
  })

  it("renders a tombstone with no content, author, delete or reply box but keeps its replies", async () => {
    serverQuacks = [tombstone]
    renderFeed()

    const article = articleFor("This quack was deleted")
    expect(within(article).queryByRole("button", { name: "Delete" })).not.toBeInTheDocument()

    await userEvent.click(within(article).getByRole("button", { name: "1 reply" }))
    const thread = screen.getByRole("region", { name: "Replies" })
    expect(await within(thread).findByText(reply.text)).toBeInTheDocument()
    expect(within(thread).queryByRole("textbox", { name: "Your reply" })).not.toBeInTheDocument()
  })

  it("never matches a tombstone in search", async () => {
    serverQuacks = [parent, tombstone]
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
    try {
      renderFeed()
      fireEvent.change(screen.getByRole("textbox", { name: "Search quacks" }), {
        target: { value: "bread" },
      })
      await act(async () => {
        await vi.advanceTimersByTimeAsync(300)
      })
      expect(screen.getAllByRole("article")).toHaveLength(1)
      expect(screen.queryByText("This quack was deleted")).not.toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it("turns a deleted quack with replies into a tombstone in place", async () => {
    vi.mocked(deleteQuack).mockImplementation(() => {
      serverQuacks = [{ ...tombstone, id: "q1" }]
      return Promise.resolve()
    })
    renderFeed()

    await userEvent.click(screen.getByRole("button", { name: "Delete" }))
    await userEvent.click(screen.getByRole("button", { name: "Delete quack" }))

    expect(await screen.findByText("This quack was deleted")).toBeInTheDocument()
    expect(screen.queryByText(parent.text)).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "1 reply" })).toBeInTheDocument()
  })
})
