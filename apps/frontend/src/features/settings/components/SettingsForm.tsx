import { useState } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { Loader2 } from "lucide-react"
import { useForm } from "react-hook-form"
import { z } from "zod"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Textarea } from "@/components/ui/textarea"
import { HTTPError } from "@/lib/api-client"
import { type Profile } from "@/lib/profile"
import { quackMoodLabels, quackMoodSchema } from "@/lib/quack-schemas"

import { useUpdateProfile } from "@/features/settings/hooks/useUpdateProfile"

const schema = z.object({
  username: z
    .string()
    .min(3, "Use at least 3 characters")
    .max(30, "Use at most 30 characters")
    .regex(/^[a-zA-Z0-9._]+$/, "Use only letters, numbers, dots and underscores"),
  name: z.string().trim().min(1, "Display name is required"),
  bio: z.string().max(160, "Keep your bio to 160 characters or fewer"),
  defaultMood: z.union([z.literal(""), quackMoodSchema]),
})
type FormValues = z.infer<typeof schema>

const toFormValues = (profile: Profile): FormValues => ({
  username: profile.username,
  name: profile.name,
  bio: profile.bio,
  defaultMood: profile.defaultMood ?? "",
})

export function SettingsForm({ profile }: { profile: Profile }) {
  const save = useUpdateProfile()
  const [isSaved, setSaved] = useState(false)
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: toFormValues(profile),
  })

  const handleSubmit = (values: FormValues) => {
    setSaved(false)
    save.mutate(
      { ...values, defaultMood: values.defaultMood || null },
      {
        onSuccess: (updated) => {
          form.reset(toFormValues(updated))
          setSaved(true)
        },
        onError: (error) => {
          if (error instanceof HTTPError && error.response.status === 409) {
            form.setError(
              "username",
              { type: "server", message: "This username is already taken" },
              { shouldFocus: true },
            )
          } else {
            form.setError("root", { message: error.message })
          }
        },
      },
    )
  }

  return (
    <Form {...form}>
      <form
        noValidate
        onSubmit={form.handleSubmit(handleSubmit)}
        className="space-y-6"
        onChange={() => setSaved(false)}
      >
        {isSaved ? (
          <p
            role="status"
            className="text-sm"
          >
            Your settings have been saved.
          </p>
        ) : null}
        {form.formState.errors.root ? (
          <Alert variant="destructive">
            <AlertDescription>{form.formState.errors.root.message}</AlertDescription>
          </Alert>
        ) : null}
        <FormField
          control={form.control}
          name="username"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Username</FormLabel>
              <FormControl>
                <Input
                  autoComplete="username"
                  disabled={save.isPending}
                  {...field}
                />
              </FormControl>
              <FormDescription>
                3–30 characters: letters, numbers, dots and underscores.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Display name</FormLabel>
              <FormControl>
                <Input
                  autoComplete="name"
                  disabled={save.isPending}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="bio"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Bio (optional)</FormLabel>
              <FormControl>
                <Textarea
                  rows={3}
                  disabled={save.isPending}
                  {...field}
                />
              </FormControl>
              <FormDescription>A little about you, up to 160 characters.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="defaultMood"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Default mood</FormLabel>
              <FormControl>
                <NativeSelect
                  disabled={save.isPending}
                  {...field}
                >
                  <NativeSelectOption value="">None</NativeSelectOption>
                  {quackMoodSchema.options.map((mood) => (
                    <NativeSelectOption
                      key={mood}
                      value={mood}
                    >
                      {quackMoodLabels[mood]}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </FormControl>
              <FormDescription>
                New posts start with this mood. You can change it for each post.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="flex flex-wrap gap-3">
          <Button
            type="submit"
            disabled={save.isPending}
          >
            {save.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
            {save.isPending ? "Saving…" : "Save changes"}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={save.isPending}
            onClick={() => {
              form.reset(toFormValues(profile))
              save.reset()
              setSaved(false)
            }}
          >
            Discard changes
          </Button>
        </div>
      </form>
    </Form>
  )
}
