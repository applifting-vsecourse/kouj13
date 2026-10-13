import { useId } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { HTTPError } from "@/lib/api-client"
import { type Poll, type Quack } from "@/lib/quack-schemas"

import { quackKeys } from "@/features/quack/api/quackKeys"
import { vote } from "@/features/quack/api/vote"

export function PollVote({ poll, question }: { poll: Poll; question: string }) {
  const id = useId()
  const client = useQueryClient()
  const save = useMutation({
    mutationFn: vote,
    retry: false,
    // Never silently defer an offline vote until reconnect.
    networkMode: "always",
    onSuccess: async (confirmed) => {
      await client.cancelQueries({ queryKey: quackKeys.all() })
      client.setQueriesData<Quack[]>({ queryKey: quackKeys.all() }, (previous) =>
        previous?.map((quack) =>
          quack.poll?.id === confirmed.id ? { ...quack, poll: confirmed } : quack,
        ),
      )
      void client.invalidateQueries({ queryKey: quackKeys.all() })
    },
    onError: () => {
      void client.invalidateQueries({ queryKey: quackKeys.all() })
    },
  })
  // Overlay only this poll, so rollback cannot clobber unrelated refreshed posts.
  const pendingOption = save.isPending ? save.variables?.optionId : undefined
  const selected = pendingOption ?? poll.myOptionId
  const isChangingChoice = pendingOption !== undefined && pendingOption !== poll.myOptionId
  const total = poll.totalVotes + (isChangingChoice && poll.myOptionId === null ? 1 : 0)
  const isUncertain =
    save.error && (!(save.error instanceof HTTPError) || save.error.response.status >= 500)

  return (
    <div className="mt-3 space-y-3 border-t border-border pt-3">
      <RadioGroup
        aria-label={`Poll: ${question}`}
        value={selected ?? ""}
        disabled={save.isPending}
        onValueChange={(optionId) => {
          if (optionId !== poll.myOptionId && !save.isPending) {
            save.mutate({ pollId: poll.id, optionId })
          }
        }}
      >
        {poll.options.map((option) => {
          const count =
            option.voteCount +
            (isChangingChoice && option.id === pendingOption ? 1 : 0) -
            (isChangingChoice && option.id === poll.myOptionId ? 1 : 0)
          return (
            <div
              key={option.id}
              className="flex items-center gap-3"
            >
              <RadioGroupItem
                id={`${id}-${option.id}`}
                aria-describedby={`${id}-${option.id}-count`}
                value={option.id}
              />
              <Label
                htmlFor={`${id}-${option.id}`}
                className="flex-1 break-words"
              >
                {option.label}
              </Label>
              <span
                id={`${id}-${option.id}-count`}
                className="text-sm text-muted-foreground"
              >
                {count} {count === 1 ? "vote" : "votes"}
              </span>
            </div>
          )
        })}
      </RadioGroup>
      <p
        className="text-sm text-muted-foreground"
        role="status"
      >
        {total} {total === 1 ? "voter" : "voters"}
        {save.isPending ? " · Saving vote…" : ""}
      </p>
      {save.error ? (
        <Alert variant="destructive">
          <AlertDescription>
            <span>
              {isUncertain
                ? "Couldn’t confirm your vote. Refreshing saved results; retrying is safe."
                : save.error.message}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => save.variables && save.mutate(save.variables)}
            >
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}
    </div>
  )
}
