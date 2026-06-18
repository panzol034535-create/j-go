import type { ComponentType } from "react";
import JGoAppUntyped from "@/components/JGoApp";
import { getHomePageData, type HomePageData } from "@/lib/server/home-data";

export const revalidate = 60;

const JGoApp = JGoAppUntyped as ComponentType<HomePageData>;

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
