import { useState } from "react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"

import { useDeleteQuack } from "@/features/quack/hooks/useDeleteQuack"

export function DeleteQuack({ id }: { id: string }) {
  const [isOpen, setIsOpen] = useState(false)
  const deletion = useDeleteQuack()

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(isNextOpen) => {
        if (deletion.isPending) return
        deletion.reset()
        setIsOpen(isNextOpen)
      }}
    >
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
        >
          Delete
        </Button>
      </DialogTrigger>
      <DialogContent showCloseButton={!deletion.isPending}>
        <DialogHeader>
          <DialogTitle>Delete this quack?</DialogTitle>
          <DialogDescription>
            This permanently deletes this quack and any poll votes.
          </DialogDescription>
        </DialogHeader>
        {deletion.error ? (
          <p
            role="alert"
            className="text-sm text-destructive"
          >
            Couldn&apos;t delete this quack. Please try again.
          </p>
        ) : null}
        <DialogFooter>
          <DialogClose asChild>
            <Button
              variant="outline"
              disabled={deletion.isPending}
            >
              Cancel
            </Button>
          </DialogClose>
          <Button
            variant="destructive"
            disabled={deletion.isPending}
            onClick={() => deletion.mutate(id, { onSuccess: () => setIsOpen(false) })}
          >
            {deletion.isPending ? "Deleting…" : "Delete quack"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
