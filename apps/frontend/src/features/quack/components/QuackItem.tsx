import { useState } from "react"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { formatDate } from "@/lib/date"

import { quackMoodLabels, type Quack, type QuackMood } from "@/features/quack/api/quackSchemas"
import { DeleteQuack } from "@/features/quack/components/DeleteQuack"
import { PollVote } from "@/features/quack/components/PollVote"
import { QuackReplies } from "@/features/quack/components/QuackReplies"
import { UsersName } from "@/features/quack/components/UsersName"
import { UsersUserName } from "@/features/quack/components/UsersUserName"

type QuackItemProps = {
  quack: Quack
  currentUserId?: string
  currentUserRole?: string
  defaultMood?: QuackMood | null
}

const repliesLabel = (count: number) =>
  count === 0 ? "Reply" : count === 1 ? "1 reply" : `${count} replies`

export function QuackItem({ quack, currentUserId, currentUserRole, defaultMood }: QuackItemProps) {
  const [isShowingReplies, setIsShowingReplies] = useState(false)
  // Threads are one level deep and only open in the signed-in feed.
  const canOpenReplies = Boolean(currentUserId) && !quack.parentId
  const replyCount = quack.replyCount ?? 0

  const initials = (quack.user?.name ?? "")
    .split(" ")
    .map((word) => word[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()

  return (
    <article className="flex w-full gap-4 border-b border-border pt-2 pb-4 last:border-b-0">
      <Avatar className="size-12">
        <AvatarFallback>{initials}</AvatarFallback>
      </Avatar>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {quack.deleted || !quack.user ? (
          <p className="text-sm text-muted-foreground">This quack was deleted</p>
        ) : (
          <>
            <div className="flex flex-wrap items-baseline gap-2">
              <span>
                <UsersName name={quack.user.name} />{" "}
                <UsersUserName username={quack.user.username} />
              </span>
              <span className="text-xs text-muted-foreground">·</span>
              <time className="text-xs text-muted-foreground">{formatDate(quack.createdAt)}</time>
              {quack.mood ? (
                <span className="text-xs text-muted-foreground">
                  Mood: {quackMoodLabels[quack.mood]}
                </span>
              ) : null}
              {currentUserId && (currentUserId === quack.userId || currentUserRole === "admin") ? (
                <DeleteQuack id={quack.id} />
              ) : null}
            </div>
            <p className="text-sm break-words whitespace-pre-line">{quack.text}</p>
            {quack.poll ? (
              <PollVote
                poll={quack.poll}
                question={quack.text}
              />
            ) : null}
          </>
        )}

        {canOpenReplies && !(quack.deleted && replyCount === 0) ? (
          <div>
            <Button
              variant="ghost"
              size="sm"
              aria-expanded={isShowingReplies}
              onClick={() => setIsShowingReplies((isShown) => !isShown)}
            >
              {isShowingReplies ? "Hide replies" : repliesLabel(replyCount)}
            </Button>
          </div>
        ) : null}

        {canOpenReplies && isShowingReplies ? (
          <QuackReplies
            quack={quack}
            currentUserId={currentUserId}
            currentUserRole={currentUserRole}
            defaultMood={defaultMood}
          />
        ) : null}
      </div>
    </article>
  )
}
