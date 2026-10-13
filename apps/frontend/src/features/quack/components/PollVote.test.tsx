import {
  focusManager,
  onlineManager,
  QueryClient,
  QueryClientProvider,
  useQuery,
} from "@tanstack/react-query"
import { act, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { api } from "@/lib/api-client"
import { pollSchema, type Poll, type Quack } from "@/lib/quack-schemas"

import { quackKeys } from "@/features/quack/api/quackKeys"
import { quacksQueryOptions } from "@/features/quack/api/quacksQueryOptions"
import { vote } from "@/features/quack/api/vote"
import { PollVote } from "@/features/quack/components/PollVote"
import { QuackList } from "@/features/quack/components/QuackList"

vi.mock("@/features/quack/api/vote", () => ({ vote: vi.fn() }))
vi.mock("@/lib/api-client", async (importOriginal) => ({
  ...(await importOriginal<{ api: typeof api }>()),
  api: { get: vi.fn() },
}))

const poll: Poll = {
  id: "p1",
  options: [
    { id: "o1", label: "Pizza", position: 0, voteCount: 0 },
    { id: "o2", label: "Soup", position: 1, voteCount: 0 },
  ],
  totalVotes: 0,
  myOptionId: null,
}
const quack: Quack = {
  id: "q1",
  text: "Lunch?",
  userId: "a",
  createdAt: new Date(),
  user: { id: "a", name: "Duck", username: "duck" },
  poll,
}
const selected = (optionId: string, count = 1): Poll => ({
  ...poll,
  myOptionId: optionId,
  totalVotes: count,
  options: poll.options.map((option) => ({
    ...option,
    voteCount: option.id === optionId ? count : 0,
  })),
})
let clients: QueryClient[] = []

function renderPoll(
  initial = poll,
  refresh = vi.fn(() => Promise.resolve([{ ...quack, poll: initial }])),
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  clients.push(client)
  client.setQueryData(quackKeys.lists(), [{ ...quack, poll: initial }])
  function Feed() {
    const { data } = useQuery({
      queryKey: quackKeys.lists(),
      queryFn: refresh,
      staleTime: Infinity,
    })
    return (
      <PollVote
        poll={data![0]!.poll}
        question="Lunch?"
      />
    )
  }
  render(
    <QueryClientProvider client={client}>
      <Feed />
    </QueryClientProvider>,
  )
  return { client, refresh }
}

beforeEach(() => {
  vi.mocked(vote).mockReset()
  vi.mocked(api.get).mockReset()
})
afterEach(() => {
  clients.forEach((client) => {
    client.clear()
  })
  clients = []
  focusManager.setFocused(undefined)
  onlineManager.setOnline(true)
  vi.useRealTimers()
})

describe("Poll voting", () => {
  it.each([poll, selected("o2")])(
    "shows immediate first/changed feedback and confirms authoritative totals",
    async (initial) => {
      let finish!: (poll: Poll) => void
      vi.mocked(vote).mockReturnValue(
        new Promise((resolve) => {
          finish = resolve
        }),
      )
      const confirmed = selected("o1", 3)
      renderPoll(
        initial,
        vi.fn(() => Promise.resolve([{ ...quack, poll: confirmed }])),
      )
      const user = userEvent.setup()
      await user.click(screen.getByRole("radio", { name: "Pizza" }))
      expect(screen.getByRole("radio", { name: "Pizza" })).toBeChecked()
      expect(screen.getByRole("radio", { name: "Soup" })).toBeDisabled()
      expect(screen.getByRole("status")).toHaveTextContent("1 voter · Saving vote…")
      expect(screen.getByText("1 vote")).toBeVisible()
      expect(screen.getByText("0 votes")).toBeVisible()
      act(() => finish(confirmed))
      expect(await screen.findByText("3 votes")).toBeVisible()
      expect(screen.getByRole("status")).toHaveTextContent("3 voters")
      expect(screen.getByRole("radio", { name: "Pizza" })).toBeEnabled()
      await user.click(screen.getByRole("radio", { name: "Pizza" }))
      expect(vote).toHaveBeenCalledOnce()
    },
  )

  it("rolls back uncertain feedback, reconciles a saved write, and retries safely", async () => {
    let fail!: (error: Error) => void
    vi.mocked(vote).mockReturnValueOnce(
      new Promise((_resolve, reject) => {
        fail = reject
      }),
    )
    const confirmed = selected("o1")
    const { client, refresh } = renderPoll(
      poll,
      vi.fn(() => Promise.resolve([{ ...quack, poll: confirmed }])),
    )
    client.setQueryData(
      ["quacks", "unrelated"],
      [{ ...quack, id: "other", poll: { ...poll, id: "other-poll" }, text: "Unrelated update" }],
    )
    const user = userEvent.setup()
    await user.click(screen.getByRole("radio", { name: "Pizza" }))
    act(() => fail(new Error("Response lost")))
    expect(await screen.findByText(/Couldn’t confirm your vote/)).toBeVisible()
    await waitFor(() => expect(refresh).toHaveBeenCalledOnce())
    expect(screen.getByRole("radio", { name: "Pizza" })).toBeChecked()
    expect(screen.getByRole("status")).not.toHaveTextContent("Saving")
    expect(client.getQueryData(["quacks", "unrelated"])).toMatchObject([
      { text: "Unrelated update" },
    ])
    vi.mocked(vote).mockResolvedValueOnce(confirmed)
    await user.click(screen.getByRole("button", { name: "Retry" }))
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument())
    expect(vi.mocked(vote).mock.calls[1]![0]).toEqual({ pollId: "p1", optionId: "o1" })
  })

  it("reconciles an unsaved failed vote to the prior persisted choice", async () => {
    vi.mocked(vote).mockRejectedValue(new Error("Offline"))
    renderPoll(selected("o2"))
    await userEvent.click(screen.getByRole("radio", { name: "Pizza" }))
    expect(await screen.findByRole("alert")).toBeVisible()
    await waitFor(() => expect(screen.getByRole("radio", { name: "Soup" })).toBeChecked())
    expect(screen.getByRole("status")).toHaveTextContent("1 voter")
  })

  it("uses keyboard single-choice controls and does not queue offline votes", async () => {
    onlineManager.setOnline(false)
    vi.mocked(vote).mockRejectedValue(new Error("Offline"))
    renderPoll()
    const user = userEvent.setup()
    await user.tab()
    await user.keyboard(" ")
    await waitFor(() => expect(vote).toHaveBeenCalledOnce())
    expect(await screen.findByRole("alert")).toBeVisible()
  })

  it("rejects inconsistent API totals and selections", () => {
    expect(pollSchema.safeParse({ ...poll, totalVotes: 9 }).success).toBe(false)
    expect(pollSchema.safeParse({ ...poll, myOptionId: "outside" }).success).toBe(false)
  })
})

describe("Feed freshness", () => {
  it("refreshes every five visible seconds, on focus and reconnect, and retains stale results on failure", async () => {
    vi.useFakeTimers()
    focusManager.setFocused(true)
    const json = vi.fn().mockResolvedValue([{ ...quack, poll }])
    vi.mocked(api.get).mockReturnValue({ json } as never)
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    clients.push(client)
    function Feed() {
      const query = useQuery(quacksQueryOptions())
      return (
        <QuackList
          quacks={query.data ?? []}
          error={query.error ?? undefined}
          isLoading={query.isPending}
          onReload={() => void query.refetch()}
        />
      )
    }
    render(
      <QueryClientProvider client={client}>
        <Feed />
      </QueryClientProvider>,
    )
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1)
    })
    json.mockResolvedValue([{ ...quack, poll: selected("o2") }])
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000)
    })
    expect(screen.getByRole("radio", { name: "Soup" })).toBeChecked()
    const calls = json.mock.calls.length
    focusManager.setFocused(false)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000)
    })
    expect(json).toHaveBeenCalledTimes(calls)
    await act(async () => {
      focusManager.setFocused(true)
      await vi.advanceTimersByTimeAsync(1)
    })
    expect(json).toHaveBeenCalledTimes(calls + 1)
    await act(async () => {
      onlineManager.setOnline(false)
      onlineManager.setOnline(true)
      await vi.advanceTimersByTimeAsync(1)
    })
    expect(json).toHaveBeenCalledTimes(calls + 2)
    json.mockRejectedValue(new Error("Refresh failed"))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000)
    })
    expect(screen.getByText("Results may be outdated")).toBeVisible()
    expect(screen.getByRole("radio", { name: "Soup" })).toBeChecked()
    expect(within(screen.getByRole("alert")).getByRole("button", { name: "Retry" })).toBeVisible()
  })
})
