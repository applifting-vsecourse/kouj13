export const quackKeys = {
  all: () => ["quacks"] as const,
  lists: () => [...quackKeys.all(), "list"] as const,
  replies: (id: string) => [...quackKeys.all(), "replies", id] as const,
}
