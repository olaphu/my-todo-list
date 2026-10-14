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
  announce("無法讀取已儲存的清單。你仍可新增事項；下次儲存將以目前清單為準。", true);
}

function save(message) {
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
    checkbox.addEventListener("change", () => {
      todo.completed = checkbox.checked;
      item.classList.toggle("completed", todo.completed);
      updateSummary();
      updateDeadline(item, todo);
      save(todo.completed ? "已完成一項待辦。" : "已取消完成。 ");
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
    remove.addEventListener("click", () => {
      const visibleIndex = [...list.children].indexOf(item);
      const index = todos.findIndex(entry => entry.id === todo.id);
      todos.splice(index, 1);
      render();
      save("已刪除待辦事項。");
      const buttons = list.querySelectorAll(".delete-button");
      (buttons[Math.min(visibleIndex, buttons.length - 1)] || input).focus();
    });
    item.append(content, remove);
    updateDeadline(item, todo);
    list.append(item);
  });
}

form.addEventListener("submit", event => {
  event.preventDefault();
  const text = input.value.trim();
  if (!text) {
    announce("請輸入待辦事項，不能只有空白。", true);
    input.focus();
    return;
  }
  todos.push({ id: crypto.randomUUID(), text, completed: false,
    category: categoryInput.value, priority: priorityInput.value,
    dueDate: validDate(dueInput.value) ? dueInput.value : "" });
  // Show the new task even when a different category was being viewed.
  categoryFilter.value = "全部";
  render();
  save("已新增待辦事項。");
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
