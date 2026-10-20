import { useEffect, useId, useState, type ComponentProps } from "react"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

import { QuackList } from "@/features/quack/components/QuackList"

type QuackFeedProps = Omit<ComponentProps<typeof QuackList>, "emptyMessage">

export function QuackFeed({ quacks, currentUserId, onWriteFirst, ...listProps }: QuackFeedProps) {
  const searchId = useId()
  const [searchInput, setSearchInput] = useState("")
  const [search, setSearch] = useState("")
  const [tab, setTab] = useState("all")

  useEffect(() => {
    const timeout = setTimeout(() => setSearch(searchInput.trim().toLowerCase()), 300)
    return () => clearTimeout(timeout)
  }, [searchInput])

  const scopedQuacks =
    tab === "mine" ? quacks.filter((quack) => quack.userId === currentUserId) : quacks
  const matchingQuacks = search
    ? scopedQuacks.filter(
        (quack) =>
          quack.text.toLowerCase().includes(search) ||
          quack.user.name.toLowerCase().includes(search),
      )
    : scopedQuacks

  return (
    <Tabs
      value={tab}
      onValueChange={setTab}
    >
      <TabsList aria-label="Quack feed">
        <TabsTrigger value="all">All</TabsTrigger>
        <TabsTrigger value="mine">Mine</TabsTrigger>
      </TabsList>
      <search className="mb-6 space-y-2">
        <Label htmlFor={searchId}>Search quacks</Label>
        <Input
          id={searchId}
          name="search"
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
        />
      </search>
      <TabsContent value={tab}>
        <QuackList
          {...listProps}
          currentUserId={currentUserId}
          quacks={matchingQuacks}
          emptyMessage={
            tab === "mine" && scopedQuacks.length === 0
              ? "You haven't posted any quacks yet"
              : search
                ? "No quacks found"
                : "No quacks yet"
          }
          onWriteFirst={tab === "mine" && scopedQuacks.length === 0 ? onWriteFirst : undefined}
        />
      </TabsContent>
    </Tabs>
  )
}
