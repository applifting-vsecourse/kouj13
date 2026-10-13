import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { HTTPError } from "@/lib/api-client"
import { authKeys } from "@/lib/auth-keys"
import { profileKey, profileQueryOptions, updateProfile, type Profile } from "@/lib/profile"
import { quackKeys } from "@/lib/quack-keys"

import { SettingsForm } from "@/features/settings/components/SettingsForm"

vi.mock("@/lib/profile", async (importOriginal) => ({
  ...(await importOriginal<{
    updateProfile: typeof updateProfile
    profileKey: typeof profileKey
    profileQueryOptions: typeof profileQueryOptions
  }>()),
  updateProfile: vi.fn(),
}))

const profile: Profile = {
  id: "me",
  username: "duck",
  name: "Duck",
  bio: "Hello!",
  defaultMood: "happy",
}

function renderForm() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  client.setQueryData(profileKey, profile)
  client.setQueryData(authKeys.session(), { user: { ...profile, email: "duck@example.com" } })
  client.setQueryData(quackKeys.lists(), [
    { id: "q1", userId: "me", user: { id: "me", name: "Duck", username: "duck" } },
    { id: "q2", userId: "other", user: { id: "other", name: "Other", username: "other" } },
  ])
  function FormWithSavedProfile() {
    const { data } = useQuery({ ...profileQueryOptions(), enabled: false })
    return <SettingsForm profile={data ?? profile} />
  }
  render(
    <QueryClientProvider client={client}>
      <FormWithSavedProfile />
    </QueryClientProvider>,
  )
  return client
}

beforeEach(() => {
  vi.mocked(updateProfile).mockReset()
  vi.mocked(updateProfile).mockImplementation((settings) =>
    Promise.resolve({ id: "me", ...settings }),
  )
})

describe("Settings", () => {
  it("starts with saved values and discards all edits", async () => {
    const user = userEvent.setup()
    renderForm()
    expect(screen.getByLabelText("Username")).toHaveValue("duck")
    expect(screen.getByLabelText("Display name")).toHaveValue("Duck")
    expect(screen.getByLabelText("Bio (optional)")).toHaveValue("Hello!")
    expect(screen.getByLabelText("Default mood")).toHaveValue("happy")
    await user.type(screen.getByLabelText("Username"), "_new")
    await user.clear(screen.getByLabelText("Display name"))
    await user.clear(screen.getByLabelText("Bio (optional)"))
    await user.selectOptions(screen.getByLabelText("Default mood"), "sad")
    await user.click(screen.getByRole("button", { name: "Discard changes" }))
    expect(screen.getByLabelText("Username")).toHaveValue("duck")
    expect(screen.getByLabelText("Display name")).toHaveValue("Duck")
    expect(screen.getByLabelText("Bio (optional)")).toHaveValue("Hello!")
    expect(screen.getByLabelText("Default mood")).toHaveValue("happy")
    expect(updateProfile).not.toHaveBeenCalled()
  })

  it("keeps a taken username in the field and supports correcting and saving it", async () => {
    const user = userEvent.setup()
    vi.mocked(updateProfile).mockRejectedValueOnce(
      new HTTPError(
        new Response(null, { status: 409 }),
        new Request("http://localhost/profile"),
        {} as never,
      ),
    )
    const client = renderForm()
    await user.clear(screen.getByLabelText("Username"))
    await user.type(screen.getByLabelText("Username"), "taken")
    await user.click(screen.getByRole("button", { name: "Save changes" }))
    expect(await screen.findByText("This username is already taken")).toBeVisible()
    expect(screen.getByLabelText("Username")).toHaveValue("taken")
    expect(screen.getByLabelText("Username")).toHaveAttribute("aria-invalid", "true")
    expect(client.getQueryData(profileKey)).toEqual(profile)
    await user.clear(screen.getByLabelText("Username"))
    await user.type(screen.getByLabelText("Username"), "new.duck")
    await user.clear(screen.getByLabelText("Display name"))
    await user.type(screen.getByLabelText("Display name"), "New Duck")
    await user.clear(screen.getByLabelText("Bio (optional)"))
    await user.selectOptions(screen.getByLabelText("Default mood"), "silly")
    await user.click(screen.getByRole("button", { name: "Save changes" }))
    expect(await screen.findByRole("status")).toHaveTextContent("Your settings have been saved")
    expect(client.getQueryData(authKeys.session())).toMatchObject({
      user: { username: "new.duck", name: "New Duck", bio: "", defaultMood: "silly" },
    })
    expect(client.getQueryData(quackKeys.lists())).toEqual([
      expect.objectContaining({ user: { id: "me", name: "New Duck", username: "new.duck" } }),
      expect.objectContaining({ user: { id: "other", name: "Other", username: "other" } }),
    ])
    await user.type(screen.getByLabelText("Username"), "_unsaved")
    await user.click(screen.getByRole("button", { name: "Discard changes" }))
    expect(screen.getByLabelText("Username")).toHaveValue("new.duck")
    expect(screen.getByLabelText("Default mood")).toHaveValue("silly")
  })

  it.each(["ab", "a".repeat(31), "bad-name"])(
    "validates username %s before saving",
    async (username) => {
      const user = userEvent.setup()
      renderForm()
      await user.clear(screen.getByLabelText("Username"))
      await user.type(screen.getByLabelText("Username"), username)
      await user.click(screen.getByRole("button", { name: "Save changes" }))
      await waitFor(() =>
        expect(screen.getByLabelText("Username")).toHaveAttribute("aria-invalid", "true"),
      )
      expect(updateProfile).not.toHaveBeenCalled()
    },
  )

  it("validates required display name and bio length", async () => {
    const user = userEvent.setup()
    renderForm()
    await user.clear(screen.getByLabelText("Display name"))
    await user.clear(screen.getByLabelText("Bio (optional)"))
    await user.type(screen.getByLabelText("Bio (optional)"), "a".repeat(161))
    await user.click(screen.getByRole("button", { name: "Save changes" }))
    expect(await screen.findByText("Display name is required")).toBeVisible()
    expect(screen.getByText("Keep your bio to 160 characters or fewer")).toBeVisible()
    expect(updateProfile).not.toHaveBeenCalled()
  })

  it("disables controls while saving and submits no default mood as null", async () => {
    const user = userEvent.setup()
    let finish!: (profile: Profile) => void
    vi.mocked(updateProfile).mockReturnValue(
      new Promise((resolve) => {
        finish = resolve
      }),
    )
    renderForm()
    await user.selectOptions(screen.getByLabelText("Default mood"), "")
    await user.click(screen.getByRole("button", { name: "Save changes" }))
    expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "Discard changes" })).toBeDisabled()
    expect(screen.getByLabelText("Username")).toBeDisabled()
    expect(vi.mocked(updateProfile).mock.calls[0]?.[0]).toMatchObject({ defaultMood: null })
    finish({ ...profile, defaultMood: null })
    expect(await screen.findByRole("status")).toHaveTextContent("saved")
  })
})
