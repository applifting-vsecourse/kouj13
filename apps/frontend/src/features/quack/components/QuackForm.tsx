import { useEffect, type Ref } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { Loader2 } from "lucide-react"
import { useFieldArray, useForm, useWatch } from "react-hook-form"
import { z } from "zod"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

import { quackMoodLabels, quackMoodSchema, type QuackMood } from "@/features/quack/api/quackSchemas"
import { useAddQuack } from "@/features/quack/hooks/useAddQuack"

// Mirrors the server-side DTO (MaxLength(280)) so the user is told before
// the request is made — the server still validates independently.
const MAX_LENGTH = 280

const schema = z.object({
  text: z
    .string()
    .trim()
    .min(1, "Write something first")
    .max(MAX_LENGTH, `Keep it under ${MAX_LENGTH} characters`),
  mood: z.union([z.literal(""), quackMoodSchema]),
  options: z
    .array(
      z.object({
        label: z
          .string()
          .trim()
          .min(1, "Write an answer")
          .max(80, "Keep answers to 80 characters or fewer"),
      }),
    )
    .max(6)
    .superRefine((options, context) => {
      if (options.length === 1) {
        context.addIssue({ code: "custom", message: "Add at least two answers" })
      }
      const seen = new Set<string>()
      options.forEach((option, index) => {
        const label = option.label.toLowerCase()
        if (seen.has(label)) {
          context.addIssue({
            code: "custom",
            path: [index, "label"],
            message: "Use a different answer",
          })
        }
        seen.add(label)
      })
    }),
})

type FormValues = z.infer<typeof schema>

type QuackFormProps = {
  className?: string
  defaultMood?: QuackMood | null
  textRef?: Ref<HTMLTextAreaElement>
}

export function QuackForm({ className, defaultMood = null, textRef }: QuackFormProps) {
  const addQuack = useAddQuack()
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { text: "", mood: defaultMood ?? "", options: [] },
  })
  const answers = useFieldArray({ control: form.control, name: "options" })

  useEffect(() => {
    if (!form.getFieldState("mood").isDirty) {
      form.resetField("mood", { defaultValue: defaultMood ?? "" })
    }
  }, [defaultMood, form])

  const text = useWatch({ control: form.control, name: "text" })
  const length = text?.length ?? 0

  const handleSubmit = (values: FormValues) => {
    addQuack.mutate(
      {
        text: values.text,
        ...(values.mood ? { mood: values.mood } : {}),
        ...(values.options.length
          ? { poll: { options: values.options.map((option) => option.label) } }
          : {}),
      },
      { onSuccess: () => form.reset({ text: "", mood: defaultMood ?? "", options: [] }) },
    )
  }

  return (
    <Form {...form}>
      <form
        noValidate
        onSubmit={form.handleSubmit(handleSubmit)}
        className={cn("space-y-3", className)}
      >
        {addQuack.error ? (
          <Alert variant="destructive">
            <AlertDescription>{addQuack.error.message}</AlertDescription>
          </Alert>
        ) : null}

        <div className="flex flex-wrap items-start gap-3">
          <FormField
            control={form.control}
            name="text"
            render={({ field }) => (
              <FormItem className="min-w-0 flex-1 basis-64">
                <FormLabel>New quack</FormLabel>
                <FormControl>
                  <Textarea
                    rows={3}
                    placeholder="Quack something..."
                    disabled={addQuack.isPending}
                    {...field}
                    ref={(element) => {
                      field.ref(element)
                      if (typeof textRef === "function") textRef(element)
                      else if (textRef) textRef.current = element
                    }}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="mood"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Mood (optional)</FormLabel>
                <FormControl>
                  <NativeSelect
                    disabled={addQuack.isPending}
                    {...field}
                  >
                    <NativeSelectOption value="">No mood</NativeSelectOption>
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
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {answers.fields.length ? (
          <fieldset
            disabled={addQuack.isPending}
            className="space-y-3 border-t border-border pt-4"
          >
            <legend className="text-sm font-medium">Poll answers</legend>
            <p className="text-sm text-muted-foreground">
              Your post is the question. Choose 2–6 fixed answers.
            </p>
            {answers.fields.map((answer, index) => (
              <div
                key={answer.id}
                className="flex items-start gap-3"
              >
                <FormField
                  control={form.control}
                  name={`options.${index}.label`}
                  render={({ field }) => (
                    <FormItem className="flex-1">
                      <FormLabel>Answer {index + 1}</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button
                  type="button"
                  variant="ghost"
                  className="mt-6"
                  disabled={answers.fields.length <= 2}
                  aria-label={`Remove answer ${index + 1}`}
                  onClick={() => answers.remove(index)}
                >
                  Remove
                </Button>
              </div>
            ))}
            <div className="flex flex-wrap gap-3">
              <Button
                type="button"
                variant="outline"
                disabled={answers.fields.length >= 6}
                onClick={() => answers.append({ label: "" })}
              >
                Add answer
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => answers.replace([])}
              >
                Remove poll
              </Button>
            </div>
          </fieldset>
        ) : (
          <Button
            type="button"
            variant="outline"
            disabled={addQuack.isPending}
            onClick={() => answers.append([{ label: "" }, { label: "" }])}
          >
            Add poll
          </Button>
        )}

        <div className="flex items-center justify-end gap-3">
          <span
            className={cn(
              "text-sm",
              length > MAX_LENGTH ? "text-destructive" : "text-muted-foreground",
            )}
          >
            {length}/{MAX_LENGTH}
          </span>
          <Button
            type="submit"
            size="sm"
            disabled={addQuack.isPending}
          >
            {addQuack.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
            {addQuack.isPending ? "Posting…" : "Quack"}
          </Button>
        </div>
      </form>
    </Form>
  )
}
