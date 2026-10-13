export type Poll = {
  id: string;
  options: { id: string; label: string; position: number; voteCount: number }[];
  totalVotes: number;
  myOptionId: string | null;
};
