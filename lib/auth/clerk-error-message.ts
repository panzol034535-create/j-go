import { isClerkAPIResponseError } from "@clerk/nextjs/errors";

const ERROR_MESSAGES: Record<string, string> = {
  form_identifier_not_found: "找不到此 Email，請先註冊或改用其他登入方式",
  form_identifier_exists: "此 Email 已註冊，請直接登入",
  form_code_incorrect: "驗證碼錯誤，請重新輸入",
  verification_expired: "驗證碼已過期，請重新取得",
  too_many_requests: "操作過於頻繁，請稍後再試",
  session_exists: "您已登入，正在導向首頁",
  oauth_access_denied: "已取消授權，請重新選擇登入方式",
  not_allowed_access: "目前無法使用此登入方式，請稍後再試",
};

export function getClerkErrorMessage(error: unknown, fallback = "登入失敗，請稍後再試"): string {
  if (!isClerkAPIResponseError(error)) {
    return error instanceof Error && error.message ? error.message : fallback;
  }

  const firstError = error.errors[0];
  if (!firstError) {
    return fallback;
  }

  if (firstError.code && ERROR_MESSAGES[firstError.code]) {
    return ERROR_MESSAGES[firstError.code];
  }

  return firstError.longMessage || firstError.message || fallback;
}
