import { setIcon } from 'obsidian';

export function createEl(tagName: string, attrs?: any): HTMLElement {
  const c = document.createElement(tagName)
  if (!attrs)
    return c
  for (let p in attrs) {
    if (!p || !Object.prototype.hasOwnProperty.call(attrs, p))
      continue
    if (p == "textContent") {
      c.setText(attrs[p])
    } else {
      c.setAttribute(p, attrs[p])
    }
  }
  return c
}

const adocSpecificTypes = ["important", "caution"];
const admotionIcons: Map<string, string> = new Map([
  ["danger", "zap"],
  ["note", "pencil"],
  ["tip", "flame"],
  ["warning", "alert-triangle"]
]);

export function patchAdmonitionBlock(item: HTMLElement)
{
  let abType = item.className.replace("admonitionblock ", "");
  if (adocSpecificTypes.includes(abType)) {
    abType = "danger";
  }
  const iconElement = item.getElementsByClassName("icon");
  item.setAttribute("data-callout", abType);
  item.className = "callout";

  let calloutTitle = createEl("div", { class: "callout-title" });
  const calloutIcon = createEl("div", { class: "callout-icon" });
  let iconName = admotionIcons.get(abType);
  if (iconName == undefined)
    iconName = "pencil";
  setIcon(calloutIcon, iconName);

  calloutTitle.appendChild(calloutIcon)
  if (iconElement.length > 0 && iconElement[0]) {
    calloutTitle.appendChild(iconElement[0])
    item.insertBefore(calloutTitle, item.firstChild);
  }
}

