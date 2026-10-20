import { api } from "@/lib/api-client"

export async function deleteQuack(id: string): Promise<void> {
  await api.delete(`quacks/${encodeURIComponent(id)}`)
}
