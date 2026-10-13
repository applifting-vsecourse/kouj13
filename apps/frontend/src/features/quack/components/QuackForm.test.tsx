import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { addQuack } from "@/features/quack/api/addQuack"
import { QuackForm } from "@/features/quack/components/QuackForm"

vi.mock("@/features/quack/api/addQuack", () => ({ addQuack: vi.fn() }))

function renderForm(defaultMood?: "happy" | "sad" | "angry" | "silly") {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <QuackForm defaultMood={defaultMood} />
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
  it.each(["happy", "sad", "angry", "silly"] as const)(
    "starts and resets new posts with the saved %s mood",
    async (mood) => {
      const user = userEvent.setup()
      renderForm(mood)
      const select = screen.getByRole("combobox", { name: "Mood (optional)" })
      expect(select).toHaveValue(mood)
      await user.type(screen.getByRole("textbox", { name: "New quack" }), "hello")
      await user.selectOptions(select, "")
      await user.click(screen.getByRole("button", { name: "Quack" }))
      await waitFor(() => expect(addQuack).toHaveBeenCalledOnce())
      expect(vi.mocked(addQuack).mock.calls[0]?.[0]).toEqual({ text: "hello" })
      await waitFor(() => expect(select).toHaveValue(mood))
    },
  )
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

describe("Poll composer", () => {
  it("validates blank and duplicate answers, submits trimmed labels, and resets after success", async () => {
    const user = userEvent.setup()
    renderForm()
    await user.click(screen.getByRole("button", { name: "Add poll" }))
    await user.click(screen.getByRole("button", { name: "Quack" }))
    expect(await screen.findByText("Write something first")).toBeVisible()
    expect(screen.getAllByText("Write an answer")).toHaveLength(2)
    await user.type(screen.getByLabelText("New quack"), " Lunch? ")
    await user.type(screen.getByLabelText("Answer 1"), " Pizza ")
    await user.type(screen.getByLabelText("Answer 2"), "pizza")
    await user.click(screen.getByRole("button", { name: "Quack" }))
    expect(await screen.findByText("Use a different answer")).toBeVisible()
    expect(addQuack).not.toHaveBeenCalled()
    await user.clear(screen.getByLabelText("Answer 2"))
    await user.type(screen.getByLabelText("Answer 2"), " Soup ")
    await user.click(screen.getByRole("button", { name: "Quack" }))
    await waitFor(() =>
      expect(addQuack).toHaveBeenCalledWith(
        { text: "Lunch?", poll: { options: ["Pizza", "Soup"] } },
        expect.anything(),
      ),
    )
    await waitFor(() => expect(screen.queryByLabelText("Answer 1")).not.toBeInTheDocument())
    expect(screen.getByLabelText("New quack")).toHaveValue("")
  })

  it("enforces answer limits and allows removing the attachment", async () => {
    const user = userEvent.setup()
    renderForm()
    await user.click(screen.getByRole("button", { name: "Add poll" }))
    expect(screen.getByRole("button", { name: "Remove answer 1" })).toBeDisabled()
    for (let i = 0; i < 4; i++) await user.click(screen.getByRole("button", { name: "Add answer" }))
    expect(screen.getByRole("button", { name: "Add answer" })).toBeDisabled()
    await user.click(screen.getByRole("button", { name: "Remove answer 3" }))
    expect(screen.queryByLabelText("Answer 6")).not.toBeInTheDocument()
    await user.type(screen.getByLabelText("Answer 1"), "a".repeat(81))
    await user.click(screen.getByRole("button", { name: "Quack" }))
    expect(await screen.findByText("Keep answers to 80 characters or fewer")).toBeVisible()
    await user.click(screen.getByRole("button", { name: "Remove poll" }))
    await user.type(screen.getByLabelText("New quack"), "Normal post")
    await user.click(screen.getByRole("button", { name: "Quack" }))
    await waitFor(() =>
      expect(vi.mocked(addQuack).mock.calls[0]![0]).toEqual({ text: "Normal post" }),
    )
  })

  it("disables pending controls and retains question and answers after server failure", async () => {
    let fail!: (error: Error) => void
    vi.mocked(addQuack).mockReturnValue(
      new Promise((_resolve, reject) => {
        fail = reject
      }),
    )
    const user = userEvent.setup()
    renderForm()
    await user.click(screen.getByRole("button", { name: "Add poll" }))
    await user.type(screen.getByLabelText("New quack"), "Lunch?")
    await user.type(screen.getByLabelText("Answer 1"), "Pizza")
    await user.type(screen.getByLabelText("Answer 2"), "Soup")
    await user.click(screen.getByRole("button", { name: "Quack" }))
    expect(screen.getByRole("button", { name: "Posting…" })).toBeDisabled()
    expect(screen.getByLabelText("Answer 1")).toBeDisabled()
    expect(screen.getByRole("button", { name: "Remove poll" })).toBeDisabled()
    fail(new Error("Server unavailable"))
    expect(await screen.findByRole("alert")).toHaveTextContent("Server unavailable")
    expect(screen.getByLabelText("New quack")).toHaveValue("Lunch?")
    expect(screen.getByLabelText("Answer 1")).toHaveValue("Pizza")
    expect(screen.getByLabelText("Answer 2")).toHaveValue("Soup")
    expect(screen.getByRole("button", { name: "Quack" })).toBeEnabled()
  })
})
