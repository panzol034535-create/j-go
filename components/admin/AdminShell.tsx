"use client";

import { useUser } from "@clerk/nextjs";
import Link from "next/link";
import { isAdminEmail } from "@/lib/auth/admin";

type AdminShellProps = {
  title: string;
  children: React.ReactNode;
};

export function AdminShell({ title, children }: AdminShellProps) {
  const { user, isLoaded } = useUser();
  const isAdmin = isAdminEmail(user?.primaryEmailAddress?.emailAddress);

  if (!isLoaded) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-50 text-neutral-500">
        載入中...
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-50 px-5">
        <div className="w-full max-w-md rounded-3xl border border-neutral-200 bg-white p-8 text-center shadow-sm">
          <p className="text-lg font-black tracking-tight text-neutral-900">沒有權限</p>
          <p className="mt-2 text-sm text-neutral-500">此頁面僅限管理員使用</p>
          <Link
            href="/"
            className="mt-6 inline-block rounded-2xl bg-neutral-900 px-6 py-3 text-sm font-bold text-white"
          >
            返回首頁
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900">
      <div className="mx-auto flex min-h-screen max-w-md flex-col bg-white shadow-2xl">
        <header className="sticky top-0 z-10 border-b border-neutral-100 bg-white/90 px-5 py-4 backdrop-blur">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-bold tracking-widest text-neutral-400">LOOKPICK ADMIN</p>
              <h1 className="text-xl font-black tracking-tight">{title}</h1>
            </div>
            <Link href="/" className="text-xs font-bold text-neutral-500 hover:text-neutral-900">
              首頁
            </Link>
          </div>
          <nav className="mt-4 flex gap-2">
            <Link
              href="/admin/import-product"
              className="rounded-full border border-neutral-200 px-3 py-1.5 text-xs font-bold text-neutral-700"
            >
              匯入商品
            </Link>
            <Link
              href="/admin/drafts"
              className="rounded-full border border-neutral-200 px-3 py-1.5 text-xs font-bold text-neutral-700"
            >
              Draft 管理
            </Link>
            <Link
              href="/admin/stock-monitor"
              className="rounded-full border border-neutral-200 px-3 py-1.5 text-xs font-bold text-neutral-700"
            >
              庫存監控
            </Link>
          </nav>
        </header>
        <main className="flex-1 px-5 py-6">{children}</main>
      </div>
    </div>
  );
}
