import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { addQuack } from "@/features/quack/api/addQuack"
import { QuackForm } from "@/features/quack/components/QuackForm"

vi.mock("@/features/quack/api/addQuack", () => ({ addQuack: vi.fn() }))

function renderForm() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <QuackForm />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.mocked(addQuack).mockReset()
  vi.mocked(addQuack).mockResolvedValue({
    id: "q1",
    text: "hello",
    mood: null,
    userId: "u1",
    createdAt: new Date(),
    user: { id: "u1", name: "Duck", username: "duck" },
  })
})

describe("QuackForm moods", () => {
  it.each(["happy", "sad", "angry", "silly"])(
    "submits the selected %s mood and resets it after success",
    async (mood) => {
      const user = userEvent.setup()
      renderForm()
      const text = screen.getByRole("textbox", { name: "New quack" })
      const select = screen.getByRole("combobox", { name: "Mood (optional)" })

      await user.type(text, "hello")
      await user.selectOptions(select, mood)
      await user.click(screen.getByRole("button", { name: "Quack" }))

      await waitFor(() => expect(addQuack).toHaveBeenCalledOnce())
      expect(vi.mocked(addQuack).mock.calls[0]?.[0]).toEqual({ text: "hello", mood })
      await waitFor(() => {
        expect(text).toHaveValue("")
        expect(select).toHaveValue("")
      })
    },
  )

  it("allows posting without a mood and clearing a selection", async () => {
    const user = userEvent.setup()
    renderForm()
    const select = screen.getByRole("combobox", { name: "Mood (optional)" })
    expect(select).toHaveValue("")

    await user.type(screen.getByRole("textbox", { name: "New quack" }), "hello")
    await user.selectOptions(select, "angry")
    await user.selectOptions(select, "")
    await user.click(screen.getByRole("button", { name: "Quack" }))

    await waitFor(() => expect(addQuack).toHaveBeenCalledOnce())
    expect(vi.mocked(addQuack).mock.calls[0]?.[0]).toEqual({ text: "hello" })
  })
})
