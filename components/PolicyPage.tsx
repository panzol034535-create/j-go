import Link from "next/link";
import { LOOKPICK_BRAND } from "@/lib/brand";

type PolicySection = {
  title: string;
  body: string[];
};

type PolicyPageProps = {
  title: string;
  description: string;
  updatedAt: string;
  sections: PolicySection[];
};

export function PolicyPage({
  title,
  description,
  updatedAt,
  sections,
}: PolicyPageProps) {
  return (
    <main className="min-h-screen bg-neutral-50 px-5 py-8 text-neutral-950">
      <div className="mx-auto max-w-3xl">
        <Link
          href="/"
          className="inline-flex items-center text-sm font-bold text-neutral-500 transition hover:text-neutral-950"
        >
          ← 回到 {LOOKPICK_BRAND.name}
        </Link>

        <section className="mt-6 rounded-[32px] border border-neutral-200 bg-white p-6 shadow-sm md:p-10">
          <p className="text-xs font-black uppercase tracking-[0.28em] text-neutral-400">
            {LOOKPICK_BRAND.name}
          </p>
          <h1 className="mt-3 text-3xl font-black tracking-tight md:text-4xl">
            {title}
          </h1>
          <p className="mt-4 text-base leading-7 text-neutral-600">
            {description}
          </p>
          <p className="mt-3 text-sm font-bold text-neutral-400">
            最後更新：{updatedAt}
          </p>

          <div className="mt-8 space-y-8">
            {sections.map((section) => (
              <section key={section.title}>
                <h2 className="text-xl font-black tracking-tight">
                  {section.title}
                </h2>
                <div className="mt-3 space-y-3 text-sm leading-7 text-neutral-700 md:text-base">
                  {section.body.map((paragraph) => (
                    <p key={paragraph}>{paragraph}</p>
                  ))}
                </div>
              </section>
            ))}
          </div>

          <div className="mt-10 rounded-3xl bg-neutral-100 p-5 text-sm leading-7 text-neutral-600">
            若您對本頁內容有任何疑問，請透過 LookPick 網站中的人工客服、
            LINE、Instagram 或 Email 與我們聯繫。
          </div>
        </section>
      </div>
    </main>
  );
}
