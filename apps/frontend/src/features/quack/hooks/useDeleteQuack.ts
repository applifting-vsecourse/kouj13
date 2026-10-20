import { useMutation, useQueryClient } from "@tanstack/react-query"

import { deleteQuack } from "@/features/quack/api/deleteQuack"
import { quackKeys } from "@/features/quack/api/quackKeys"
import type { Quack } from "@/features/quack/api/quackSchemas"

export function useDeleteQuack() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: deleteQuack,
    retry: false,
    networkMode: "always",
    onSuccess: async (_, id) => {
      await queryClient.cancelQueries({ queryKey: quackKeys.all() })
      queryClient.setQueriesData<Quack[]>({ queryKey: quackKeys.lists() }, (quacks) =>
        quacks?.filter((quack) => quack.id !== id),
      )
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: quackKeys.all() }),
  })
}
