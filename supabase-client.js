"use strict";
window.Cloud = {
  client: null,
  async initialize() {
    const { url, key } = window.SUPABASE_CONFIG || {};
    if (!url || !key) throw new Error("尚未設定 Supabase Project URL 與公開金鑰；本機清單仍可使用。");
    let project;
    try { project = new URL(url); } catch { throw new Error("Supabase Project URL 格式不正確。"); }
    if (project.protocol !== "https:" || !/^[a-z0-9]+\.supabase\.co$/.test(project.hostname) || project.pathname !== "/" || project.search || project.hash || project.username || project.password || /example|your[-_]|placeholder/i.test(url + key)) {
      throw new Error("請填入正式的 Supabase HTTPS Project URL，不能使用範例設定。");
    }
    let publicKey = /^sb_publishable_[A-Za-z0-9_-]+$/.test(key);
    if (!publicKey && key.split(".").length === 3) {
      try {
        const payload = JSON.parse(atob(key.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
        publicKey = payload.role === "anon";
      } catch { /* Invalid keys remain rejected. */ }
    }
    if (!publicKey) throw new Error("只接受 publishable 或 anon 公開金鑰；禁止使用 secret、service_role 或資料庫密碼。");
    const { createClient } = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.1/+esm");
    this.client = createClient(project.origin, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: "implicit" } });
    this.project = project.origin;
    return this.client;
  },
  message(error) {
    const text = error?.message || "";
    if (/invalid login credentials/i.test(text)) return "Email 或密碼不正確。";
    if (/email not confirmed/i.test(text)) return "Email 尚未確認，請先開啟確認信中的連結。";
    if (/rate limit|too many/i.test(text)) return "操作太頻繁，請稍後再試。";
    if (/fetch|network/i.test(text)) return "無法連線，請檢查網路後重試。";
    if (/permission|row.level|42501/i.test(text)) return "操作被資料權限政策拒絕，請確認登入狀態與 RLS 設定。";
    return "操作失敗，請確認設定、帳號與網路後重試。";
  }
};
