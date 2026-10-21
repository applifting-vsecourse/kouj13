import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query"
import { cleanup, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { deleteQuack } from "@/features/quack/api/deleteQuack"
import { quackKeys } from "@/features/quack/api/quackKeys"
import type { Quack } from "@/features/quack/api/quackSchemas"
import { QuackFeed } from "@/features/quack/components/QuackFeed"

vi.mock("@/features/quack/api/deleteQuack", () => ({ deleteQuack: vi.fn() }))

const mine: Quack = {
  id: "q1",
  text: "My own quack",
  userId: "u1",
  createdAt: new Date(),
  user: { id: "u1", name: "Me", username: "me" },
}
const other: Quack = {
  ...mine,
  id: "q2",
  text: "Someone else's quack",
  userId: "u2",
  user: { id: "u2", name: "Other", username: "other" },
}
let serverQuacks: Quack[]
let client: QueryClient
const onWriteFirst = vi.fn()

function Feed({ role = "user" }: { role?: string }) {
  const { data = [] } = useQuery({
    queryKey: quackKeys.lists(),
    queryFn: () => Promise.resolve(serverQuacks),
    initialData: serverQuacks,
  })
  return (
    <QuackFeed
      quacks={data}
      currentUserId="u1"
      currentUserRole={role}
      onWriteFirst={onWriteFirst}
    />
  )
}
function renderFeed(role = "user") {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <Feed role={role} />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  serverQuacks = [mine, other]
  vi.mocked(deleteQuack).mockReset()
  onWriteFirst.mockReset()
})
afterEach(() => {
  cleanup()
  client.clear()
})

describe("Own quacks", () => {
  it("lets an admin confirm deletion of someone else's quack and refreshes the feed", async () => {
    vi.mocked(deleteQuack).mockImplementation(() => {
      serverQuacks = [mine]
      return Promise.resolve()
    })
    renderFeed("admin")
    const articles = screen.getAllByRole("article")
    expect(screen.getAllByRole("button", { name: "Delete" })).toHaveLength(2)
    await userEvent.click(within(articles[1]!).getByRole("button", { name: "Delete" }))
    expect(screen.getByRole("dialog")).toHaveTextContent("permanently deletes this quack")
    await userEvent.click(screen.getByRole("button", { name: "Delete quack" }))
    await waitFor(() => expect(screen.queryByText(other.text)).not.toBeInTheDocument())
    expect(deleteQuack).toHaveBeenCalledExactlyOnceWith("q2", expect.anything())
    expect(screen.getByText(mine.text)).toBeInTheDocument()
  })

  it("offers Delete only on own posts and switches between All and Mine", async () => {
    renderFeed()
    const articles = screen.getAllByRole("article")
    expect(within(articles[0]!).getByRole("button", { name: "Delete" })).toBeInTheDocument()
    expect(within(articles[1]!).queryByRole("button", { name: "Delete" })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole("tab", { name: "Mine" }))
    expect(screen.getAllByRole("article")).toHaveLength(1)
    expect(screen.queryByText(other.text)).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole("tab", { name: "All" }))
    expect(screen.getAllByRole("article")).toHaveLength(2)
  })

  it("combines Mine with the existing search", async () => {
    renderFeed()
    await userEvent.type(screen.getByRole("textbox", { name: "Search quacks" }), "someone")
    await waitFor(() => expect(screen.getAllByRole("article")).toHaveLength(1))
    await userEvent.click(screen.getByRole("tab", { name: "Mine" }))
    expect(screen.getByText("No quacks found")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Write your first quack" })).not.toBeInTheDocument()
  })

  it("offers to write the first quack when Mine is empty", async () => {
    serverQuacks = [other]
    renderFeed()
    await userEvent.click(screen.getByRole("tab", { name: "Mine" }))
    expect(screen.getByText("You haven't posted any quacks yet")).toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: "Write your first quack" }))
    expect(onWriteFirst).toHaveBeenCalledOnce()
  })

  it("requires confirmation, supports cancel, and removes a confirmed deletion from both tabs", async () => {
    vi.mocked(deleteQuack).mockImplementation(() => {
      serverQuacks = [other]
      return Promise.resolve()
    })
    renderFeed()
    await userEvent.click(screen.getByRole("button", { name: "Delete" }))
    expect(screen.getByRole("dialog", { name: "Delete this quack?" })).toBeInTheDocument()
    expect(deleteQuack).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }))
    expect(screen.getByText(mine.text)).toBeInTheDocument()
    expect(deleteQuack).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole("tab", { name: "Mine" }))
    await userEvent.click(screen.getByRole("button", { name: "Delete" }))
    await userEvent.click(screen.getByRole("button", { name: "Delete quack" }))
    await waitFor(() => expect(screen.queryByText(mine.text)).not.toBeInTheDocument())
    expect(deleteQuack).toHaveBeenCalledExactlyOnceWith("q1", expect.anything())
    expect(screen.getByText("You haven't posted any quacks yet")).toBeInTheDocument()
    await userEvent.click(screen.getByRole("tab", { name: "All" }))
    expect(screen.getAllByRole("article")).toHaveLength(1)
    expect(screen.getByText(other.text)).toBeInTheDocument()
  })

  it("disables repeat submission while deleting and keeps failed deletes available for retry", async () => {
    let rejectDelete!: (error: Error) => void
    vi.mocked(deleteQuack).mockImplementation(
      () =>
        new Promise((_, reject) => {
          rejectDelete = reject
        }),
    )
    renderFeed()
    await userEvent.click(screen.getByRole("button", { name: "Delete" }))
    await userEvent.click(screen.getByRole("button", { name: "Delete quack" }))
    expect(screen.getByRole("button", { name: "Deleting…" })).toBeDisabled()
    expect(screen.getByText(mine.text)).toBeInTheDocument()
    rejectDelete(new Error("Unavailable"))
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't delete this quack")
    expect(screen.getByText(mine.text)).toBeInTheDocument()
    vi.mocked(deleteQuack).mockImplementation(() => {
      serverQuacks = [other]
      return Promise.resolve()
    })
    await userEvent.click(screen.getByRole("button", { name: "Delete quack" }))
    await waitFor(() => expect(screen.queryByText(mine.text)).not.toBeInTheDocument())
  })
})
