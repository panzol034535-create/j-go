"use client";

import { useClerk, useUser } from "@clerk/nextjs";
import { Heart, LogOut, Package, User } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

type LookPickMemberMenuProps = {
  onNavigateAccount: () => void;
  onNavigateOrders: () => void;
  onNavigateFavorites: () => void;
  onSignOut?: () => void | Promise<void>;
};

type MenuItem = {
  key: string;
  label: string;
  icon: React.ReactNode;
  onSelect: () => void;
  tone?: "default" | "danger";
};

export function LookPickMemberMenu({
  onNavigateAccount,
  onNavigateOrders,
  onNavigateFavorites,
  onSignOut,
}: LookPickMemberMenuProps) {
  const { isLoaded, isSignedIn, user } = useUser();
  const { signOut } = useClerk();
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuPlacement, setMenuPlacement] = useState<"bottom" | "top">("bottom");

  const closeMenu = useCallback(() => {
    setOpen(false);
  }, []);

  const updateMenuPlacement = useCallback(() => {
    const trigger = containerRef.current;
    const menu = menuRef.current;
    if (!trigger || !menu) {
      return;
    }

    const triggerRect = trigger.getBoundingClientRect();
    const menuHeight = menu.offsetHeight;
    const viewportPadding = 12;
    const spaceBelow = window.innerHeight - triggerRect.bottom - viewportPadding;
    const spaceAbove = triggerRect.top - viewportPadding;

    if (spaceBelow < menuHeight && spaceAbove > spaceBelow) {
      setMenuPlacement("top");
      return;
    }

    setMenuPlacement("bottom");
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }

    updateMenuPlacement();

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null;
      if (!target || containerRef.current?.contains(target)) {
        return;
      }
      closeMenu();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeMenu();
      }
    };

    const handleResize = () => {
      updateMenuPlacement();
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", handleResize);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", handleResize);
    };
  }, [closeMenu, open, updateMenuPlacement]);

  const handleSignOut = async () => {
    if (signingOut) {
      return;
    }

    setSigningOut(true);
    closeMenu();

    try {
      if (onSignOut) {
        await onSignOut();
      }

      await signOut({ redirectUrl: "/" });
    } catch {
      window.location.assign("/");
    } finally {
      setSigningOut(false);
    }
  };

  if (!isLoaded) {
    return (
      <button
        type="button"
        disabled
        aria-label="會員選單載入中"
        className="rounded-full border border-neutral-200 bg-white p-3 text-neutral-300"
      >
        <User size={20} />
      </button>
    );
  }

  if (!isSignedIn) {
    return (
      <button
        type="button"
        onClick={() => window.location.assign("/sign-in")}
        className="rounded-full border border-neutral-200 bg-white p-3 text-neutral-700 transition hover:bg-neutral-50 active:scale-[0.98] active:bg-neutral-100"
        aria-label="登入"
      >
        <User size={20} />
      </button>
    );
  }

  const displayName = user?.fullName || user?.firstName || "LookPick 會員";
  const initial = (displayName || "L").slice(0, 1).toUpperCase();

  const menuItems: MenuItem[] = [
    {
      key: "account",
      label: "我的帳號",
      icon: <User size={16} />,
      onSelect: () => {
        closeMenu();
        onNavigateAccount();
      },
    },
    {
      key: "orders",
      label: "我的訂單",
      icon: <Package size={16} />,
      onSelect: () => {
        closeMenu();
        onNavigateOrders();
      },
    },
    {
      key: "favorites",
      label: "我的收藏",
      icon: <Heart size={16} />,
      onSelect: () => {
        closeMenu();
        onNavigateFavorites();
      },
    },
    {
      key: "sign-out",
      label: signingOut ? "登出中..." : "登出",
      icon: <LogOut size={16} />,
      onSelect: () => {
        void handleSignOut();
      },
      tone: "danger",
    },
  ];

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-label="會員選單"
        aria-haspopup="menu"
        aria-expanded={open}
        className="rounded-full border border-neutral-200 bg-white p-0.5 transition hover:bg-neutral-50 active:scale-[0.98] active:bg-neutral-100"
      >
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-neutral-900 text-sm font-black text-white ring-2 ring-[#f08f92]/40">
          {initial}
        </span>
      </button>

      {open ? (
        <div
          ref={menuRef}
          role="menu"
          aria-label="LookPick 會員選單"
          className={`absolute right-0 z-50 w-52 overflow-hidden rounded-2xl border border-neutral-100 bg-white shadow-xl ring-1 ring-black/5 ${
            menuPlacement === "bottom" ? "top-[calc(100%+0.5rem)]" : "bottom-[calc(100%+0.5rem)]"
          }`}
        >
          <div className="border-b border-neutral-100 px-4 py-3">
            <p className="truncate text-sm font-black text-neutral-900">{displayName}</p>
            <p className="truncate text-xs font-medium text-neutral-500">
              {user?.primaryEmailAddress?.emailAddress || "LookPick 會員"}
            </p>
          </div>

          <div className="py-1">
            {menuItems.map((item) => (
              <button
                key={item.key}
                type="button"
                role="menuitem"
                disabled={item.key === "sign-out" && signingOut}
                onClick={item.onSelect}
                className={`flex w-full items-center gap-3 px-4 py-3 text-left text-sm font-bold transition ${
                  item.tone === "danger"
                    ? "text-red-600 hover:bg-red-50"
                    : "text-neutral-800 hover:bg-neutral-50"
                } disabled:cursor-not-allowed disabled:opacity-60`}
              >
                <span className={item.tone === "danger" ? "text-red-500" : "text-[#f08f92]"}>{item.icon}</span>
                {item.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
