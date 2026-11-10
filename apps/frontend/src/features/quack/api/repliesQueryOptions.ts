import { queryOptions } from "@tanstack/react-query"

import { api } from "@/lib/api-client"

import { quackKeys } from "@/features/quack/api/quackKeys"
import { quacksSchema } from "@/features/quack/api/quackSchemas"

export const repliesQueryOptions = (id: string) =>
  queryOptions({
    queryKey: quackKeys.replies(id),
    queryFn: async () =>
      quacksSchema.parse(await api.get(`quacks/${encodeURIComponent(id)}/replies`).json()),
    refetchInterval: 5000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: "always",
    refetchOnReconnect: "always",
  })
