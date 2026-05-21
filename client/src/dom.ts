type Child = Node | string | number | null | undefined | false;

export function text(value: string | number): Text {
  return document.createTextNode(String(value));
}

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number | boolean | ((event: Event) => void) | null | undefined> = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === false) {
      continue;
    }
    if (key === 'class') {
      node.className = String(value);
    } else if (key === 'disabled' && value === true) {
      node.setAttribute('disabled', '');
    } else if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else {
      node.setAttribute(key, String(value));
    }
  }
  append(node, ...children);
  return node;
}

export function append(parent: Node, ...children: Child[]): void {
  for (const child of children) {
    if (child === null || child === undefined || child === false) {
      continue;
    }
    parent.appendChild(typeof child === 'string' || typeof child === 'number' ? text(child) : child);
  }
}

export function clear(node: HTMLElement): void {
  node.replaceChildren();
}

export function button(label: string, className: string, onClick: () => void, disabled = false): HTMLButtonElement {
  return el('button', { class: className, onclick: onClick, disabled }, label);
}
