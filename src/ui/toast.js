export function toast(message, type = 'info', timeout = 3600) {
  if (typeof window.toastV70 === 'function') {
    window.toastV70(message, type, timeout);
    return;
  }
  let stack = document.getElementById('phoenixToastStack');
  if (!stack) {
    stack = document.createElement('div');
    stack.id = 'phoenixToastStack';
    stack.className = 'phx-v78-toast-stack';
    document.body.appendChild(stack);
  }
  const item = document.createElement('div');
  item.className = `phx-v78-toast ${type}`;
  item.textContent = message;
  stack.appendChild(item);
  setTimeout(() => item.remove(), timeout);
}
