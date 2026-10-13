import { api } from "@/lib/api-client"
import { pollSchema } from "@/lib/quack-schemas"

export async function vote({ pollId, optionId }: { pollId: string; optionId: string }) {
  return pollSchema.parse(
    await api.put(`polls/${encodeURIComponent(pollId)}/vote`, { json: { optionId } }).json(),
  )
}
