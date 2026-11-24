import { useRef, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { Heart } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { api } from "@/lib/api-client"
import { likeStateSchema, type Quack } from "@/lib/quack-schemas"

import { quackKeys } from "@/features/quack/api/quackKeys"
import { quacksQueryOptions } from "@/features/quack/api/quacksQueryOptions"
import { repliesQueryOptions } from "@/features/quack/api/repliesQueryOptions"

export function LikeQuack({ quack }: { quack: Quack }) {
  const client = useQueryClient()
  const [phase, setPhase] = useState<"idle" | "saving" | "refreshing" | "uncertain">("idle")
  const [error, setError] = useState<string | null>(null)
  const [snapshot, setSnapshot] = useState<{ likeCount: number; likedByMe: boolean } | null>(null)
  const inFlight = useRef(false)
  const options = quack.parentId ? repliesQueryOptions(quack.parentId) : quacksQueryOptions()
  const confirmed = snapshot ?? {
    likeCount: quack.likeCount ?? 0,
    likedByMe: quack.likedByMe ?? false,
  }
  const isBusy = phase === "saving" || phase === "refreshing"

  async function reconcile() {
    setPhase("refreshing")
    try {
      // Cancel older reads so reconciliation always starts after the write.
      await client.cancelQueries({ queryKey: options.queryKey, exact: true })
      await client.invalidateQueries({
        queryKey: options.queryKey,
        exact: true,
        refetchType: "none",
      })
      const refresh = { staleTime: 0, retry: false, networkMode: "always" } as const
      if (quack.parentId) {
        await client.fetchQuery({ ...repliesQueryOptions(quack.parentId), ...refresh })
      } else {
        await client.fetchQuery({ ...quacksQueryOptions(), ...refresh })
      }
      setSnapshot(null)
      setPhase("idle")
    } catch {
      setError("Couldn’t refresh saved likes. Retry to confirm the current state.")
      setPhase("uncertain")
    }
  }

  async function save() {
    if (inFlight.current || phase !== "idle") return
    inFlight.current = true
    setSnapshot(confirmed)
    setPhase("saving")
    setError(null)
    try {
      const path = `quacks/${encodeURIComponent(quack.id)}/like`
      const response = await (confirmed.likedByMe ? api.delete(path) : api.put(path)).json()
      const saved = likeStateSchema.parse(response)
      await client.cancelQueries({ queryKey: options.queryKey, exact: true })
      client.setQueriesData<Quack[]>({ queryKey: quackKeys.all() }, (previous) =>
        previous?.map((item) => (item.id === quack.id ? { ...item, ...saved } : item)),
      )
      setSnapshot(saved)
    } catch {
      setError("Couldn’t save your like. Refreshing saved state.")
    }
    await reconcile()
    inFlight.current = false
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          aria-label={confirmed.likedByMe ? "Unlike quack" : "Like quack"}
          aria-pressed={confirmed.likedByMe}
          aria-busy={isBusy}
          disabled={phase !== "idle"}
          onClick={() => void save()}
        >
          <Heart
            className="size-4"
            fill={confirmed.likedByMe ? "currentColor" : "none"}
          />
          {confirmed.likedByMe ? "Unlike" : "Like"}
          {isBusy ? " · Saving…" : ""}
        </Button>
        <span
          aria-label="Like count"
          className="text-sm text-muted-foreground"
        >
          {confirmed.likeCount}
        </span>
      </div>
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>
            <span>{error}</span>
            {phase === "uncertain" ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setError(null)
                  void reconcile()
                }}
              >
                Retry
              </Button>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}
    </div>
  )
}
