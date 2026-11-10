import { useMutation, useQueryClient } from "@tanstack/react-query"

import { deleteQuack } from "@/features/quack/api/deleteQuack"
import { quackKeys } from "@/features/quack/api/quackKeys"
import type { Quack } from "@/features/quack/api/quackSchemas"

// Mirrors the server (ADR 0001): a quack with replies stays as a tombstone,
// any other quack disappears. The refetch afterwards is authoritative.
const applyDeletion = (quack: Quack): Quack[] =>
  quack.replyCount
    ? [{ ...quack, text: "", mood: null, userId: null, user: null, poll: null, deleted: true }]
    : []

export function useDeleteQuack() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: deleteQuack,
    retry: false,
    networkMode: "always",
    onSuccess: async (_, id) => {
      await queryClient.cancelQueries({ queryKey: quackKeys.all() })
      queryClient.setQueriesData<Quack[]>({ queryKey: quackKeys.all() }, (quacks) =>
        quacks?.flatMap((quack) => (quack.id === id ? applyDeletion(quack) : [quack])),
      )
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: quackKeys.all() }),
  })
}
