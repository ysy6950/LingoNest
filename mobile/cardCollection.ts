import { isReviewDue, type ReviewState } from './reviewScheduler';
import type { WordCard } from './store/useLingoStore';

export type CardSortMode = 'newest' | 'az' | 'due';

/** Keep the group grid and card browsing in the same visible order. */
export function getVisibleGroupCards(
  cards: WordCard[],
  groupId: number,
  reviews: Record<number, ReviewState>,
  search: string,
  sort: CardSortMode,
  nowMs = Date.now(),
): WordCard[] {
  const query = search.trim().toLocaleLowerCase();
  return cards
    .filter((card) => card.groupId === groupId)
    .filter((card) =>
      !query ||
      card.word.toLocaleLowerCase().includes(query) ||
      card.meaning.toLocaleLowerCase().includes(query),
    )
    .sort((a, b) => {
      if (sort === 'az') return a.word.localeCompare(b.word, 'en');
      if (sort === 'due') {
        const dueA = isReviewDue(reviews[a.id], nowMs) ? 1 : 0;
        const dueB = isReviewDue(reviews[b.id], nowMs) ? 1 : 0;
        return dueB - dueA || b.createdAt - a.createdAt;
      }
      return b.createdAt - a.createdAt;
    });
}
