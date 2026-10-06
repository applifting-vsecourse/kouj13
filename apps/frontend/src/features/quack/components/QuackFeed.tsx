import { useEffect, useId, useState, type ComponentProps } from "react"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

import { QuackList } from "@/features/quack/components/QuackList"

type QuackFeedProps = Omit<ComponentProps<typeof QuackList>, "emptyMessage">

export function QuackFeed({ quacks, ...listProps }: QuackFeedProps) {
  const searchId = useId()
  const [searchInput, setSearchInput] = useState("")
  const [search, setSearch] = useState("")

  useEffect(() => {
    const timeout = setTimeout(() => setSearch(searchInput.trim().toLowerCase()), 300)
    return () => clearTimeout(timeout)
  }, [searchInput])

  const matchingQuacks = search
    ? quacks.filter(
        (quack) =>
          quack.text.toLowerCase().includes(search) ||
          quack.user.name.toLowerCase().includes(search),
      )
    : quacks

  return (
    <>
      <search className="mb-6 space-y-2">
        <Label htmlFor={searchId}>Search quacks</Label>
        <Input
          id={searchId}
          name="search"
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
        />
      </search>
      <QuackList
        {...listProps}
        quacks={matchingQuacks}
        emptyMessage={search ? "No quacks found" : "No quacks yet"}
      />
    </>
  )
}
