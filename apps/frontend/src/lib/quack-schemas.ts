import { z } from "zod"

export const quackMoodSchema = z.enum(["happy", "sad", "angry", "silly"])
export type QuackMood = z.infer<typeof quackMoodSchema>

export const quackMoodLabels: Record<QuackMood, string> = {
  happy: "Happy",
  sad: "Sad",
  angry: "Angry",
  silly: "Silly",
}

// Per the Applifting frontend playbook: validate every server payload with zod
// and infer types from the schema rather than auto-generating them.
export const quackUserSchema = z.object({
  id: z.string(),
  name: z.string(),
  username: z.string(),
})

export const pollSchema = z
  .object({
    id: z.string(),
    options: z
      .array(
        z.object({
          id: z.string(),
          label: z.string(),
          position: z.number().int().nonnegative(),
          voteCount: z.number().int().nonnegative(),
        }),
      )
      .min(2)
      .max(6),
    totalVotes: z.number().int().nonnegative(),
    myOptionId: z.string().nullable(),
  })
  .superRefine((poll, context) => {
    if (poll.totalVotes !== poll.options.reduce((sum, option) => sum + option.voteCount, 0)) {
      context.addIssue({ code: "custom", message: "Inconsistent poll totals" })
    }
    if (poll.myOptionId !== null && !poll.options.some((option) => option.id === poll.myOptionId)) {
      context.addIssue({ code: "custom", message: "Invalid selected poll answer" })
    }
  })
export type Poll = z.infer<typeof pollSchema>

export const quackSchema = z.object({
  id: z.string(),
  text: z.string(),
  mood: quackMoodSchema.nullish(),
  userId: z.string(),
  createdAt: z.coerce.date(),
  user: quackUserSchema,
  poll: pollSchema.nullable().optional(),
})

export const quacksSchema = z.array(quackSchema)

export type Quack = z.infer<typeof quackSchema>
