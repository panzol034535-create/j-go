export const clerkLocalization = {
  locale: "zh-TW",
  signIn: {
    start: {
      title: "登入 LookPick",
      subtitle: "登入後即可查看收藏、訂單與購物車",
      actionText: "還沒有帳號？",
      actionLink: "立即註冊",
    },
  },
  signUp: {
    start: {
      title: "註冊 LookPick",
      subtitle: "建立帳號後即可收藏商品、查看訂單與結帳",
      actionText: "已經有帳號？",
      actionLink: "立即登入",
    },
    emailCode: {
      title: "驗證您的 Email",
      subtitle: "請輸入寄送到您 Email 的驗證碼",
      formSubtitle: "請輸入寄送到您 Email 的驗證碼",
      resendButton: "沒收到驗證碼？重新寄送",
    },
    emailLink: {
      title: "驗證您的 Email",
      resendButton: "沒收到驗證碼？重新寄送",
    },
  },
  socialButtonsBlockButton: "使用 {{provider|titleize}} 登入",
  formButtonPrimary: "繼續",
  formFieldLabel__emailAddress: "Email",
  formFieldInputPlaceholder__emailAddress: "請輸入 Email",
  formFieldLabel__password: "密碼",
  formFieldInputPlaceholder__signUpPassword: "請建立密碼",
  unstable__errors: {
    form_password_length_too_short: "密碼至少 8 個字元。",
    form_password_validation_failed: "密碼需包含英文與數字。",
    form_password_not_strong_enough: "密碼強度不足，請避免使用太常見的密碼。",
    passwordComplexity: {
      sentencePrefix: "密碼至少 8 個字元，且需包含英文與數字。",
      minimumLength: "密碼至少 8 個字元。",
      requireNumbers: "密碼需包含英文與數字。",
      requireLowercase: "密碼需包含英文與數字。",
      requireUppercase: "",
      requireSpecialCharacter: "",
      maximumLength: "",
    },
    zxcvbn: {
      notEnough: "密碼強度不足，請避免使用太常見的密碼。",
      warnings: {
        common: "密碼強度不足，請避免使用太常見的密碼。",
        similarToCommon: "密碼強度不足，請避免使用太常見的密碼。",
        topTen: "密碼強度不足，請避免使用太常見的密碼。",
        topHundred: "密碼強度不足，請避免使用太常見的密碼。",
      },
    },
  },
};
