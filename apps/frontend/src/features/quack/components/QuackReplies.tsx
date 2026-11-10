import { useQuery } from "@tanstack/react-query"
import { Loader2, RefreshCw } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"

import type { Quack, QuackMood } from "@/features/quack/api/quackSchemas"
import { repliesQueryOptions } from "@/features/quack/api/repliesQueryOptions"
import { QuackForm } from "@/features/quack/components/QuackForm"
import { QuackItem } from "@/features/quack/components/QuackItem"

type QuackRepliesProps = {
  quack: Quack
  currentUserId?: string
  currentUserRole?: string
  defaultMood?: QuackMood | null
}

export function QuackReplies({
  quack,
  currentUserId,
  currentUserRole,
  defaultMood,
}: QuackRepliesProps) {
  const replies = useQuery(repliesQueryOptions(quack.id))
  const items = replies.data ?? []

  return (
    <section
      aria-label="Replies"
      className="mt-3 flex flex-col gap-3 border-l border-border pl-4"
    >
      {replies.isLoading ? (
        <div
          role="status"
          aria-label="Loading replies"
          className="flex items-center py-2 text-muted-foreground"
        >
          <Loader2 className="size-4 animate-spin" />
        </div>
      ) : null}

      {replies.error ? (
        <Alert variant="destructive">
          <AlertTitle>
            {items.length ? "Replies may be outdated" : "Couldn't load replies"}
          </AlertTitle>
          <AlertDescription className="flex items-center justify-between gap-3">
            <span>{replies.error.message}</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void replies.refetch()}
            >
              <RefreshCw className="size-4" />
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      {!replies.isLoading && !replies.error && items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Replies to this quack will appear here.</p>
      ) : null}

      {items.length ? (
        <div className="flex flex-col">
          {items.map((reply) => (
            <QuackItem
              key={reply.id}
              quack={reply}
              currentUserId={currentUserId}
              currentUserRole={currentUserRole}
            />
          ))}
        </div>
      ) : null}

      {quack.deleted ? null : (
        <QuackForm
          parentId={quack.id}
          defaultMood={defaultMood}
        />
      )}
    </section>
  )
}
