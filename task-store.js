"use strict";
window.TaskStore = {
  fromRow(row) {
    return { id: row.id, text: row.title, completed: row.is_completed,
      category: ["工作", "生活", "學習"].includes(row.category) ? row.category : "生活",
      priority: ["高", "中", "低"].includes(row.priority) ? row.priority : "中", dueDate: row.due_date || "" };
  },
  toRow(todo, userId) {
    return { id: todo.id, user_id: userId, title: todo.text, category: todo.category,
      priority: todo.priority, due_date: todo.dueDate || null, is_completed: todo.completed };
  },
  async load(userId) {
    const all = [];
    // PostgREST can cap responses at 1000 rows; fetch every page for correct progress.
    for (let start = 0; ; start += 500) {
      const { data, error } = await Cloud.client.from("tasks").select("*").eq("user_id", userId).order("created_at").order("id").range(start, start + 499);
      if (error) throw error;
      all.push(...data.map(this.fromRow));
      if (data.length < 500) return all;
    }
  },
  async add(todo, userId) {
    const { data, error } = await Cloud.client.from("tasks").insert(this.toRow(todo, userId)).select().single();
    if (error) throw error;
    return this.fromRow(data);
  },
  async complete(id, completed, userId) {
    const { data, error } = await Cloud.client.from("tasks").update({ is_completed: completed }).eq("id", id).eq("user_id", userId).select().single();
    if (error) throw error;
    return this.fromRow(data);
  },
  async remove(id, userId) {
    const { data, error } = await Cloud.client.from("tasks").delete().eq("id", id).eq("user_id", userId).select("id").single();
    if (error) throw error;
    return data;
  },
  async importId(localId) {
    // Project + original ID stays stable across retries and accounts. RLS handles conflicts.
    const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${Cloud.project}|my-todo-list.v1|${localId}`)));
    bytes[6] = (bytes[6] & 15) | 80; bytes[8] = (bytes[8] & 63) | 128;
    const hex = [...bytes.slice(0, 16)].map(b => b.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
  },
  async importOne(todo, userId) {
    const id = await this.importId(todo.id);
    const ledgerKey = `my-todo-import:${Cloud.project}:${id}`;
    const old = localStorage.getItem(ledgerKey);
    const claim = old ? JSON.parse(old) : null;
    if (claim && claim.userId !== userId) throw new Error("此本機任務已歸屬其他帳號，不能匯入目前帳號。");
    // Persist ownership before networking. Storage failures must stop the import.
    localStorage.setItem(ledgerKey, JSON.stringify({ userId, state: claim?.state || "pending" }));
    const lookup = async () => {
      const { data, error } = await Cloud.client.from("tasks").select("*").eq("id", id).eq("user_id", userId).maybeSingle();
      if (error) throw error;
      return data;
    };
    let existing = await lookup();
    if (!existing && claim?.state === "done") throw new Error("先前匯入的任務已被刪除，不會自動重新建立。");
    if (!existing) {
      const { error } = await Cloud.client.from("tasks").insert(this.toRow({ ...todo, id }, userId));
      if (error && error.code !== "23505") throw error;
      existing = await lookup();
      if (!existing) throw new Error("無法核對匯入結果；可能有 ID 衝突或權限問題，請重試或檢查設定。");
    }
    if (claim?.state !== "done") {
      const expected = this.toRow({ ...todo, id }, userId);
      if (Object.keys(expected).some(key => expected[key] !== existing[key])) throw new Error("既有雲端任務與本機內容不同，已停止匯入且未覆寫。");
    }
    localStorage.setItem(ledgerKey, JSON.stringify({ userId, state: "done" }));
  }
};
