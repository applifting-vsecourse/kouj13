import { type QuackMood } from "@/lib/quack-schemas"

export type SessionUser = {
  id: string
  email: string
  name: string
  username: string
  role?: string
  bio?: string
  defaultMood?: QuackMood | null
}

export type Session = { user: SessionUser } | null
