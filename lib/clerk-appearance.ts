import { LOOKPICK_BRAND } from "@/lib/brand";

export const clerkAppearance = {
  layout: {
    logoImageUrl: LOOKPICK_BRAND.headerLogoSrc,
    logoLinkUrl: "/",
    socialButtonsPlacement: "top",
    socialButtonsVariant: "blockButton",
  },
  variables: {
    colorPrimary: "#111111",
    colorText: "#111111",
    colorTextSecondary: "#737373",
    colorBackground: "#ffffff",
    colorInputBackground: "#ffffff",
    colorInputText: "#111111",
    colorNeutral: "#111111",
    borderRadius: "20px",
    fontFamily: 'var(--font-geist-sans), Arial, Helvetica, sans-serif',
  },
  elements: {
    rootBox: {
      width: "100%",
      maxWidth: "420px",
    },
    cardBox: {
      width: "100%",
    },
    card: {
      borderRadius: "20px",
      border: "1px solid #e5e5e5",
      boxShadow: "0 12px 30px rgba(0, 0, 0, 0.08)",
      backgroundColor: "#ffffff",
    },
    headerTitle: {
      fontWeight: "900",
      letterSpacing: "-0.02em",
    },
    headerSubtitle: {
      color: "#737373",
    },
    formButtonPrimary: {
      backgroundColor: "#111111",
      color: "#ffffff",
      borderRadius: "20px",
      boxShadow: "none",
      "&:hover": {
        backgroundColor: "#000000",
      },
    },
    socialButtonsBlockButton: {
      backgroundColor: "#ffffff",
      color: "#111111",
      border: "1px solid #e5e5e5",
      borderRadius: "20px",
      boxShadow: "none",
      "&:hover": {
        backgroundColor: "#fafafa",
      },
    },
    socialButtonsBlockButtonText: {
      color: "#111111",
      fontWeight: "700",
    },
    formFieldInput: {
      borderRadius: "20px",
      border: "1px solid #e5e5e5",
      boxShadow: "none",
    },
    formFieldLabel: {
      fontWeight: "700",
    },
    footerActionLink: {
      color: "#111111",
      fontWeight: "700",
    },
    identityPreviewEditButton: {
      color: "#111111",
    },
    formResendCodeLink: {
      color: "#111111",
    },
    alternativeMethodsBlockButton: {
      borderRadius: "20px",
      border: "1px solid #e5e5e5",
    },
    logoBox: {
      height: "auto",
      justifyContent: "center",
    },
    logoImage: {
      maxHeight: "56px",
      height: "auto",
      width: "auto",
      objectFit: "contain",
    },
  },
};
