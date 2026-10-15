"use strict";

const STORAGE_KEY = "my-todo-list.v1";
const form = document.querySelector("#todo-form");
const input = document.querySelector("#todo-input");
const list = document.querySelector("#todo-list");
const count = document.querySelector("#count");
const emptyState = document.querySelector("#empty-state");
const status = document.querySelector("#status");
const categoryInput = document.querySelector("#category");
const priorityInput = document.querySelector("#priority");
const dueInput = document.querySelector("#due-date");
const categoryFilter = document.querySelector("#category-filter");
const categories = ["工作", "生活", "學習"];
const priorities = ["高", "中", "低"];
let todos = [];
let localTodos = [];
let localReadable = true;
let user = null;
let generation = 0;
let busy = false;
let cloudReady = false;
let backupReady = false;
let importCandidates = [];
const authMessage = document.querySelector("#auth-message");

function setBusy(value) {
  busy = value;
  form.setAttribute("aria-busy", String(value));
  form.querySelectorAll("input, select, button").forEach(el => { el.disabled = value || (!!user && !cloudReady); });
  list.querySelectorAll("input, button").forEach(el => { el.disabled = value || (!!user && !cloudReady); });
  document.querySelector("#reload-cloud").disabled = value;
  document.querySelector("#import-tasks").disabled = value || !backupReady || !document.querySelector("#import-consent").checked || !importCandidates.length;
}
function current(token, id) { return generation === token && user?.id === id; }
function showAuth(message, error = false) {
  authMessage.textContent = message;
  authMessage.classList.toggle("error", error);
}

// Compare local calendar dates; UTC conversions can shift the deadline by a day.
function today() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function validDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00`);
  return !Number.isNaN(date.getTime()) && date.getFullYear() === Number(value.slice(0, 4)) && date.getMonth() + 1 === Number(value.slice(5, 7)) && date.getDate() === Number(value.slice(8, 10));
}

function updateSummary() {
  const completed = todos.filter(todo => todo.completed).length;
  const percent = todos.length ? Math.round(completed / todos.length * 100) : 0;
  count.textContent = `${todos.length - completed} 項待完成`;
  document.querySelector("#progress-text").textContent = `已完成 ${completed} / ${todos.length} 項 · ${percent}%`;
  document.querySelector("#progress").value = percent;
}

function updateDeadline(item, todo) {
  const date = item.querySelector(".deadline");
  if (!date) return;
  const overdue = !todo.completed && todo.dueDate < today();
  date.classList.toggle("overdue", overdue);
  date.textContent = `${overdue ? "逾期未完成 · " : "截止 "}${todo.dueDate}`;
}

function announce(message, error = false) {
  status.textContent = message;
  status.classList.toggle("error", error);
}

try {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved !== null) {
    const parsed = JSON.parse(saved);
    if (!Array.isArray(parsed) || !parsed.every(item => item && typeof item.id === "string" && typeof item.text === "string" && item.text.trim() && typeof item.completed === "boolean") || new Set(parsed.map(item => item.id)).size !== parsed.length) {
      throw new Error("無效的清單資料");
    }
    todos = parsed.map(item => ({
      ...item,
      category: categories.includes(item.category) ? item.category : "生活",
      priority: priorities.includes(item.priority) ? item.priority : "中",
      dueDate: validDate(item.dueDate) ? item.dueDate : ""
    }));
  }
} catch {
  localReadable = false;
  announce("無法讀取本機清單；為保護原資料，已停止本機寫入及匯入。請先下載備份並修復資料。", true);
}

localTodos = todos;

function save(message) {
  if (!localReadable) {
    announce("本機資料無法讀取，未覆寫原始清單。請先備份並修復資料。", true);
    return;
  }
  localTodos = todos;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(todos));
    announce(message);
  } catch {
    announce("無法儲存清單，可能是瀏覽器限制或儲存空間已滿。目前變更將在離開頁面後遺失。", true);
  }
}

function render() {
  list.replaceChildren();
  updateSummary();
  const visible = todos.filter(todo => categoryFilter.value === "全部" || todo.category === categoryFilter.value);
  emptyState.hidden = visible.length > 0;
  emptyState.querySelector("h3").textContent = todos.length ? "這個分類還沒有待辦事項" : "今天，從一件小事開始";
  visible.forEach(todo => {
    const item = document.createElement("li");
    item.className = `todo-item${todo.completed ? " completed" : ""}`;
    const label = document.createElement("label");
    label.className = "todo-label";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = todo.completed;
    const text = document.createElement("span");
    text.className = "todo-text";
    text.textContent = todo.text;
    checkbox.addEventListener("change", async () => {
      const desired = checkbox.checked;
      if (user) {
        const token = generation, id = user.id;
        checkbox.checked = todo.completed;
        setBusy(true);
        try {
          const updated = await TaskStore.complete(todo.id, desired, id);
          if (!current(token, id)) return;
          Object.assign(todo, updated);
          render();
          announce(desired ? "已完成並儲存至雲端。" : "已取消完成並儲存至雲端。");
        } catch (error) { if (current(token, id)) announce(Cloud.message(error) + "請再次勾選重試。", true); }
        finally { if (current(token, id)) setBusy(false); }
      } else {
        todo.completed = desired;
        item.classList.toggle("completed", desired);
        updateSummary(); updateDeadline(item, todo);
        save(desired ? "已完成一項待辦。" : "已取消完成。");
      }
    });
    label.append(checkbox, text);
    const content = document.createElement("div");
    content.className = "todo-content";
    const meta = document.createElement("div");
    meta.className = "task-meta";
    const category = document.createElement("span");
    category.className = "badge";
    category.textContent = todo.category;
    const priority = document.createElement("span");
    priority.className = `badge priority-${{ "高": "high", "中": "medium", "低": "low" }[todo.priority]}`;
    priority.textContent = `${todo.priority}優先`;
    meta.append(category, priority);
    if (todo.dueDate) {
      const deadline = document.createElement("span");
      deadline.className = "deadline";
      meta.append(deadline);
    }
    content.append(label, meta);
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "delete-button";
    remove.textContent = "刪除";
    remove.setAttribute("aria-label", `刪除「${todo.text}」`);
    remove.addEventListener("click", async () => {
      const token = generation, id = user?.id;
      const visibleIndex = [...list.children].indexOf(item);
      if (id) {
        setBusy(true);
        try { await TaskStore.remove(todo.id, id); }
        catch (error) { if (current(token, id)) { announce(Cloud.message(error) + "請再次按刪除重試。", true); setBusy(false); } return; }
        if (!current(token, id)) return;
      }
      todos.splice(todos.findIndex(entry => entry.id === todo.id), 1);
      render();
      if (id) { announce("已從雲端刪除待辦事項。"); setBusy(false); }
      else save("已刪除待辦事項。");
      const buttons = list.querySelectorAll(".delete-button");
      (buttons[Math.min(visibleIndex, buttons.length - 1)] || input).focus();
    });
    item.append(content, remove);
    updateDeadline(item, todo);
    list.append(item);
  });
  setBusy(busy);
}

form.addEventListener("submit", async event => {
  if (busy || (user && !cloudReady)) { event.preventDefault(); return; }
  event.preventDefault();
  const text = input.value.trim();
  if (!text) {
    announce("請輸入待辦事項，不能只有空白。", true);
    input.focus();
    return;
  }
  const todo = { id: crypto.randomUUID(), text, completed: false,
    category: categoryInput.value, priority: priorityInput.value,
    dueDate: validDate(dueInput.value) ? dueInput.value : "" };
  const token = generation, id = user?.id;
  if (id) {
    setBusy(true);
    try {
      const added = await TaskStore.add(todo, id);
      if (!current(token, id)) return;
      todos.push(added);
    } catch (error) {
      if (current(token, id)) announce(Cloud.message(error) + "輸入已保留，請按新增重試。", true);
      return;
    } finally { if (current(token, id)) setBusy(false); }
  } else todos.push(todo);
  // Show the new task even when a different category was being viewed.
  categoryFilter.value = "全部";
  render();
  if (id) announce("已新增並儲存至雲端。");
  else save("已新增待辦事項。");
  input.value = "";
  input.focus();
});

categoryFilter.addEventListener("change", render);
// Refresh overdue reminders across midnight without rebuilding focused controls.
setInterval(() => {
  const visible = todos.filter(todo => categoryFilter.value === "全部" || todo.category === categoryFilter.value);
  [...list.children].forEach((item, index) => updateDeadline(item, visible[index]));
}, 60000);
render();

async function refreshImport() {
  const token = generation, id = user?.id;
  const panel = document.querySelector("#import-panel");
  panel.hidden = !id;
  importCandidates = [];
  backupReady = false;
  document.querySelector("#import-consent").checked = false;
  document.querySelector("#import-status").textContent = "";
  const preview = document.querySelector("#import-preview");
  preview.replaceChildren();
  if (!id) return;
  try {
    if (!localReadable) throw new Error("本機資料格式有誤，請先下載原始備份；目前禁止匯入。");
    for (const todo of localTodos) {
      const importId = await TaskStore.importId(todo.id);
      if (!current(token, id)) return;
      const raw = localStorage.getItem(`my-todo-import:${Cloud.project}:${importId}`);
      const claim = raw ? JSON.parse(raw) : null;
      const available = !claim || (claim.userId === id && claim.state !== "done");
      if (available) importCandidates.push(todo);
      const item = document.createElement("li");
      item.textContent = `${todo.text} · ${todo.category} · ${todo.priority}優先 · ${todo.dueDate || "無截止日期"} · ${todo.completed ? "已完成" : "未完成"}${claim ? (claim.userId !== id ? " · 已歸屬其他帳號（不匯入）" : claim.state === "done" ? " · 已匯入（不重複匯入）" : " · 可重試匯入") : ""}`;
      preview.append(item);
    }
    document.querySelector("#import-summary").textContent = `目前帳號：${user.email}。本機共 ${localTodos.length} 項，可匯入 ${importCandidates.length} 項。`;
  } catch (error) {
    if (!current(token, id)) return;
    importCandidates = [];
    document.querySelector("#import-summary").textContent = error.message;
  }
  if (current(token, id)) setBusy(busy);
}

async function loadCloud(token = generation, id = user?.id) {
  if (!id) return;
  cloudReady = false; setBusy(true);
  announce("正在載入個人雲端任務…");
  try {
    const loaded = await TaskStore.load(id);
    if (!current(token, id)) return;
    todos = loaded; cloudReady = true; render();
    announce("已載入個人雲端清單。");
  } catch (error) {
    if (current(token, id)) announce(Cloud.message(error) + "請按「重新載入雲端清單」重試。", true);
  } finally { if (current(token, id)) setBusy(false); }
}

async function changeUser(next) {
  // Same-account refresh tokens must not reset in-progress operations.
  if (user?.id && next?.id === user.id) { user = next; return; }
  const token = ++generation;
  user = next; todos = next ? [] : localTodos; busy = false; cloudReady = false;
  input.value = "";
  categoryFilter.value = "全部";
  document.querySelector("#auth-form").hidden = !!next;
  document.querySelector("#logout").hidden = !next;
  document.querySelector("#reload-cloud").hidden = !next;
  document.querySelector("#auth-status").textContent = next ? `已登入：${next.email}` : "尚未登入 · 本機模式";
  document.querySelector("#mode-label").textContent = next ? `雲端模式 · ${next.email} · 僅顯示此帳號任務` : "本機模式 · 資料儲存在這個瀏覽器";
  announce(""); render();
  const preview = refreshImport();
  if (next) await loadCloud(token, next.id);
  await preview;
}

const authForm = document.querySelector("#auth-form");
authForm.addEventListener("submit", async event => {
  event.preventDefault();
  if (!Cloud.client) { showAuth("Supabase 尚未就緒，請確認公開設定並重新整理。", true); return; }
  const email = document.querySelector("#email").value.trim();
  const password = document.querySelector("#password").value;
  const signup = event.submitter?.id === "signup";
  authForm.querySelectorAll("button").forEach(el => { el.disabled = true; });
  showAuth(signup ? "正在註冊…" : "正在登入…");
  try {
    const result = signup ? await Cloud.client.auth.signUp({ email, password,
      options: { emailRedirectTo: new URL("./", location.href).href } }) : await Cloud.client.auth.signInWithPassword({ email, password });
    if (result.error) throw result.error;
    document.querySelector("#password").value = "";
    if (result.data.session) await changeUser(result.data.session.user);
    showAuth(signup && !result.data.session ? "請查收 Email 確認信並開啟連結；確認後回到網站登入。若已註冊，請直接登入。" : "登入成功，已切換至個人雲端清單。");
  } catch (error) { showAuth(Cloud.message(error), true); }
  finally { authForm.querySelectorAll("button").forEach(el => { el.disabled = false; }); }
});
document.querySelector("#logout").addEventListener("click", async () => {
  const button = document.querySelector("#logout"); button.disabled = true;
  try {
    const { error } = await Cloud.client.auth.signOut({ scope: "local" });
    if (error) throw error;
    await changeUser(null); showAuth("已登出此瀏覽器，回到本機清單。");
  } catch (error) { showAuth(Cloud.message(error) + "登出未完成，請重試。", true); }
  finally { button.disabled = false; }
});
document.querySelector("#reload-cloud").addEventListener("click", () => loadCloud());
document.querySelector("#backup").addEventListener("click", () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) || "[]";
    const url = URL.createObjectURL(new Blob([raw], { type: "application/json" }));
    const link = document.createElement("a"); link.href = url; link.download = "我的待辦清單-本機備份.json"; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    backupReady = true; setBusy(busy);
    document.querySelector("#import-status").textContent = "已提供備份下載，請確認檔案已保存，再勾選匯入確認。";
  } catch { document.querySelector("#import-status").textContent = "無法讀取備份，匯入已停止。"; }
});
document.querySelector("#import-consent").addEventListener("change", () => setBusy(busy));
document.querySelector("#import-tasks").addEventListener("click", async () => {
  if (!user || busy || !backupReady || !document.querySelector("#import-consent").checked) return;
  const id = user.id, token = generation, selected = [...importCandidates];
  setBusy(true);
  let done = 0; const failed = [];
  for (const todo of selected) {
    if (!current(token, id)) return;
    try { await TaskStore.importOne(todo, id); done++; }
    catch (error) { failed.push(`${todo.text}：${error.message?.includes("任務") || error.message?.includes("匯入") ? error.message : Cloud.message(error)}`); }
    if (!current(token, id)) return;
    document.querySelector("#import-status").textContent = `正在匯入 ${done + failed.length} / ${selected.length} 項…`;
  }
  if (!current(token, id)) return;
  await loadCloud(token, id);
  if (!current(token, id)) return;
  await refreshImport();
  if (!current(token, id)) return;
  document.querySelector("#import-status").textContent = `已核對 ${done} 項；失敗 ${failed.length} 項。原始本機資料未清除。${failed.length ? "請重新備份並確認後重試。 " + failed.join("；") : ""}`;
  setBusy(false);
});

(async () => {
  try {
    const client = await Cloud.initialize();
    // Schedule work outside the synchronous Auth callback to avoid SDK lock deadlocks.
    let authRevision = 0;
    client.auth.onAuthStateChange((_event, session) => {
      authRevision++;
      setTimeout(() => changeUser(session?.user || null), 0);
    });
    const revision = authRevision;
    const { data, error } = await client.auth.getSession();
    if (error) throw error;
    if (revision === authRevision) await changeUser(data.session?.user || null);
    const params = new URLSearchParams(location.hash.slice(1));
    if (params.has("error_description")) showAuth("Email 確認連結失效或已使用，請重新註冊或聯絡管理者重寄確認信。", true);
    // Remove auth callback tokens/errors from the address bar after SDK processing.
    if (/access_token|refresh_token|error_description/.test(location.hash)) history.replaceState(null, "", location.pathname + location.search);
  } catch (error) {
    document.querySelector("#auth-status").textContent = "雲端服務尚未就緒 · 本機模式";
    showAuth(error.message?.startsWith("尚未設定") || /公開金鑰|Project URL|範例設定/.test(error.message || "") ? error.message : Cloud.message(error), true);
  }
})();
