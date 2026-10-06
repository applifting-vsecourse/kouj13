// Example component test — the pattern to copy for your own components.
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { quackMoodLabels, quackSchema, type Quack } from "@/features/quack/api/quackSchemas"
import { QuackList } from "@/features/quack/components/QuackList"

const quack = (overrides: Partial<Quack> = {}): Quack => ({
  id: "q1",
  text: "quack quack",
  userId: "u1",
  createdAt: new Date("2026-01-01T12:00:00Z"),
  user: { id: "u1", name: "Caffeinated Duck", username: "CaffeinatedDuck" },
  ...overrides,
})

describe("QuackList", () => {
  it.each(["happy", "sad", "angry", "silly"] as const)(
    "renders the %s mood from a fetched post",
    (mood) => {
      const fetched = quackSchema.parse({ ...quack(), mood })
      render(<QuackList quacks={[fetched]} />)

      expect(screen.getByText(`Mood: ${quackMoodLabels[mood]}`)).toBeInTheDocument()
    },
  )

  it("keeps the rendered markup identical for missing and null moods", () => {
    const { container, rerender } = render(<QuackList quacks={[quack()]} />)
    const original = container.innerHTML

    rerender(<QuackList quacks={[quack({ mood: null })]} />)

    expect(container.innerHTML).toBe(original)
    expect(screen.queryByText(/Mood:/)).not.toBeInTheDocument()
  })

  it("renders quacks with author info", () => {
    render(<QuackList quacks={[quack()]} />)

    expect(screen.getByText("quack quack")).toBeInTheDocument()
    expect(screen.getByText("Caffeinated Duck")).toBeInTheDocument()
    expect(screen.getByText("@CaffeinatedDuck")).toBeInTheDocument()
  })

  it("shows an error with a working reload button", async () => {
    const onReload = vi.fn()
    render(
      <QuackList
        quacks={[]}
        error={new Error("Server unreachable")}
        onReload={onReload}
      />,
    )

    expect(screen.getByText("Couldn't load quacks")).toBeInTheDocument()
    expect(screen.getByText("Server unreachable")).toBeInTheDocument()

    await userEvent.click(screen.getByRole("button", { name: /reload/i }))
    expect(onReload).toHaveBeenCalledOnce()
  })
})
