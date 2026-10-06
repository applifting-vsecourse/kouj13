import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { Quack } from "@/features/quack/api/quackSchemas"
import { QuackFeed } from "@/features/quack/components/QuackFeed"

const quacks: Quack[] = [
  {
    id: "q1",
    text: "Hello from the pond",
    userId: "u1",
    createdAt: new Date("2026-01-03T12:00:00Z"),
    user: { id: "u1", name: "Mallard Duck", username: "mallard" },
  },
  {
    id: "q2",
    text: "A sunny afternoon",
    userId: "u2",
    createdAt: new Date("2026-01-02T12:00:00Z"),
    user: { id: "u2", name: "Hello Duck", username: "sunshine" },
  },
  {
    id: "q3",
    text: "Time for a swim",
    userId: "u3",
    createdAt: new Date("2026-01-01T12:00:00Z"),
    user: { id: "u3", name: "Swimming Duck", username: "hello" },
  },
]

describe("QuackFeed search", () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] }))
  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  const changeInput = (input: HTMLElement, value: string) =>
    fireEvent.change(input, { target: { value } })
  const advanceTime = async (milliseconds = 300) => {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(milliseconds)
    })
  }

  it.each(["hello", "HELLO", "  hello  "])(
    "matches text or displayed author name for %j, preserving feed order",
    async (search) => {
      render(<QuackFeed quacks={quacks} />)

      changeInput(screen.getByRole("textbox", { name: "Search quacks" }), search)
      expect(screen.getAllByRole("article")).toHaveLength(3)

      await advanceTime()

      const results = screen.getAllByRole("article")
      expect(results).toHaveLength(2)
      expect(results[0]).toHaveTextContent("Hello from the pond")
      expect(results[1]).toHaveTextContent("A sunny afternoon")
      expect(screen.queryByText("Time for a swim")).not.toBeInTheDocument()
    },
  )

  it("keeps the search available when no matches are found and allows another search", async () => {
    render(<QuackFeed quacks={quacks} />)
    const input = screen.getByRole("textbox", { name: "Search quacks" })

    changeInput(input, "missing")
    await advanceTime()

    expect(screen.getByText("No quacks found")).toBeInTheDocument()
    expect(screen.queryByRole("article")).not.toBeInTheDocument()
    expect(input).toBeEnabled()

    changeInput(input, "mallard")
    await advanceTime()

    expect(screen.getAllByRole("article")).toHaveLength(1)
    expect(screen.getByText("Hello from the pond")).toBeInTheDocument()
    expect(screen.queryByText("No quacks found")).not.toBeInTheDocument()
  })

  it.each(["", "   "])("restores the normal feed when the input becomes %j", async (search) => {
    render(<QuackFeed quacks={quacks} />)
    const input = screen.getByRole("textbox", { name: "Search quacks" })

    changeInput(input, "sunny")
    await advanceTime()
    expect(screen.getAllByRole("article")).toHaveLength(1)

    changeInput(input, search)
    expect(screen.getAllByRole("article")).toHaveLength(1)
    await advanceTime()

    expect(screen.getAllByRole("article")).toHaveLength(3)
  })

  it("distinguishes an empty feed from an empty search result", async () => {
    render(<QuackFeed quacks={[]} />)
    const input = screen.getByRole("textbox", { name: "Search quacks" })

    expect(screen.getByText("No quacks yet")).toBeInTheDocument()
    changeInput(input, "hello")
    await advanceTime()
    expect(screen.getByText("No quacks found")).toBeInTheDocument()
    expect(screen.queryByText("No quacks yet")).not.toBeInTheDocument()

    changeInput(input, "")
    await advanceTime()
    expect(screen.getByText("No quacks yet")).toBeInTheDocument()
  })

  it("applies the active search to refreshed feed data", async () => {
    const { rerender } = render(<QuackFeed quacks={quacks} />)

    changeInput(screen.getByRole("textbox", { name: "Search quacks" }), "hello")
    await advanceTime()
    rerender(<QuackFeed quacks={[quacks[2]!]} />)

    expect(screen.getByText("No quacks found")).toBeInTheDocument()
    expect(screen.queryByRole("article")).not.toBeInTheDocument()
  })

  it("waits 300 ms after the latest edit and cancels earlier searches", async () => {
    render(<QuackFeed quacks={quacks} />)
    const input = screen.getByRole("textbox", { name: "Search quacks" })
    expect(screen.queryByRole("button", { name: "Search" })).not.toBeInTheDocument()

    changeInput(input, "hello")
    await advanceTime(200)
    changeInput(input, "sunny")
    await advanceTime(299)
    expect(screen.getAllByRole("article")).toHaveLength(3)

    await advanceTime(1)
    expect(screen.getAllByRole("article")).toHaveLength(1)
    expect(screen.getByText("A sunny afternoon")).toBeInTheDocument()
  })
})
