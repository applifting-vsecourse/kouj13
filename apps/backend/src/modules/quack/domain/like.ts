export type LikeState = { likeCount: number; likedByMe: boolean };
export type QuackLikeState = LikeState & { quackId: string };
