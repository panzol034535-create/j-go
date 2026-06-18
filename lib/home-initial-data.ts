export type InitialRankings = {
  salesRankings: unknown[];
  favoriteProductRankings: unknown[];
  favoriteLookbookRankings: unknown[];
};

export function hasInitialRankings(rankings: InitialRankings): boolean {
  return (
    rankings.salesRankings.length > 0 ||
    rankings.favoriteProductRankings.length > 0 ||
    rankings.favoriteLookbookRankings.length > 0
  );
}
