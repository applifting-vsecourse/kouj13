import { useMutation, useQueryClient } from "@tanstack/react-query"

import { authKeys } from "@/lib/auth-keys"
import { profileKey, updateProfile } from "@/lib/profile"
import { quackKeys } from "@/lib/quack-keys"
import { type Quack } from "@/lib/quack-schemas"
import { type Session } from "@/lib/session"

export function useUpdateProfile() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: updateProfile,
    onSuccess: async (profile) => {
      await Promise.all([
        queryClient.cancelQueries({ queryKey: authKeys.session() }),
        queryClient.cancelQueries({ queryKey: profileKey }),
        queryClient.cancelQueries({ queryKey: quackKeys.all() }),
      ])
      queryClient.setQueryData(profileKey, profile)
      queryClient.setQueryData<Session>(authKeys.session(), (session) =>
        session ? { ...session, user: { ...session.user, ...profile } } : session,
      )
      queryClient.setQueriesData<Quack[]>({ queryKey: quackKeys.all() }, (quacks) =>
        quacks?.map((quack) =>
          quack.userId === profile.id
            ? { ...quack, user: { ...quack.user, name: profile.name, username: profile.username } }
            : quack,
        ),
      )
      void queryClient.invalidateQueries({ queryKey: quackKeys.all() })
    },
  })
}
