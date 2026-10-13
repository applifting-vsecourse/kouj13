import { queryOptions } from "@tanstack/react-query"

import { authKeys } from "@/lib/auth-keys"
import { getProfile } from "@/lib/profile"
import { type Session } from "@/lib/session"

import { authClient } from "@/features/auth/lib/auth-client"

export type { Session, SessionUser } from "@/lib/session"

export const authSessionQueryOptions = () =>
  queryOptions({
    queryKey: authKeys.session(),
    queryFn: async (): Promise<Session> => {
      const { data, error } = await authClient.getSession()
      if (error) throw new Error(error.message ?? "Failed to load session")
      if (!data?.user) return null
      const profile = await getProfile()

      const user = data.user as typeof data.user & {
        username?: string | null
        role?: string | null
      }

      return {
        user: {
          email: user.email,
          role: user.role ?? undefined,
          ...profile,
        },
      }
    },
    staleTime: 30_000,
  })
