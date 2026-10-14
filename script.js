"use strict";

const STORAGE_KEY = "my-todo-list.v1";
const form = document.querySelector("#todo-form");
const input = document.querySelector("#todo-input");
const list = document.querySelector("#todo-list");
const count = document.querySelector("#count");
const emptyState = document.querySelector("#empty-state");
const status = document.querySelector("#status");
let todos = [];

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
    todos = parsed;
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
  count.textContent = `${todos.filter(todo => !todo.completed).length} 項待完成`;
  emptyState.hidden = todos.length > 0;
  todos.forEach(todo => {
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
      count.textContent = `${todos.filter(entry => !entry.completed).length} 項待完成`;
      save(todo.completed ? "已完成一項待辦。" : "已取消完成。 ");
    });
    label.append(checkbox, text);
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "delete-button";
    remove.textContent = "刪除";
    remove.setAttribute("aria-label", `刪除「${todo.text}」`);
    remove.addEventListener("click", () => {
      const index = todos.findIndex(entry => entry.id === todo.id);
      todos.splice(index, 1);
      render();
      save("已刪除待辦事項。");
      const buttons = list.querySelectorAll(".delete-button");
      (buttons[Math.min(index, buttons.length - 1)] || input).focus();
    });
    item.append(label, remove);
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
  todos.push({ id: crypto.randomUUID(), text, completed: false });
  render();
  save("已新增待辦事項。");
  input.value = "";
  input.focus();
});

render();
