import JGoApp from "@/components/JGoApp";
import { getHomePageData } from "@/lib/server/home-data";

export const revalidate = 60;

export default async function HomePage() {
  const { initialProducts, initialLookbooks, initialRankings } = await getHomePageData();

  return (
    <JGoApp
      initialProducts={initialProducts}
      initialLookbooks={initialLookbooks}
      initialRankings={initialRankings}
    />
  );
}
