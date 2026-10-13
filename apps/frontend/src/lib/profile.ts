import { queryOptions } from "@tanstack/react-query"
import { z } from "zod"

import { api } from "@/lib/api-client"
import { quackMoodSchema } from "@/lib/quack-schemas"

export const profileSchema = z.object({
  id: z.string(),
  username: z.string(),
  name: z.string(),
  bio: z.string(),
  defaultMood: quackMoodSchema.nullable(),
})
export type Profile = z.infer<typeof profileSchema>
export type ProfileSettings = Omit<Profile, "id">

export const profileKey = ["profile", "me"] as const

export async function getProfile(): Promise<Profile> {
  return profileSchema.parse(await api.get("profile").json())
}

export const profileQueryOptions = () => queryOptions({ queryKey: profileKey, queryFn: getProfile })

export async function updateProfile(settings: ProfileSettings): Promise<Profile> {
  return profileSchema.parse(await api.put("profile", { json: settings }).json())
}
