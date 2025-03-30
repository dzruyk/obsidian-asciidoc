import { setIcon } from 'obsidian';

const adocSpecificTypes = ["important", "caution"];
const admotionIcons: Map<string, string> = new Map([
  ["danger", "zap"],
  ["note", "pencil"],
  ["tip", "flame"],
  ["warning", "alert-triangle"]
]);

export function isRelativePath(path: string): boolean {
  if (path.startsWith("./") || path.startsWith("../"))
    return true;
  return false;
}

export function isValidUrl(str: string): boolean {
  let url;
  try {
    url = new URL(str);
  } catch (_) {
    return false;
  }
  return true;
}

export function patchAdmonitionBlock(item: HTMLElement) {
  let abType = item.className.replace("admonitionblock ", "");
  if (adocSpecificTypes.includes(abType)) {
    abType = "danger";
  }
  const iconElement = item.getElementsByClassName("icon");
  item.setAttribute("data-callout", abType);
  item.className = "callout";

  let calloutTitle = createEl("div", { cls: "callout-title" });
  let iconName = admotionIcons.get(abType);
  if (iconName == undefined)
    iconName = "pencil";

  const calloutIcon = calloutTitle.createEl("div", {cls: "callout-icon" });
  setIcon(calloutIcon, iconName);
  if (iconElement.length > 0 && iconElement[0]) {
    calloutTitle.appendChild(iconElement[0]);
    item.insertBefore(calloutTitle, item.firstChild);
  }
}

export function myRealpath(path: string): string {
    path = path.trim();
    const segments = path.split('/');
    const stack = [];

    for (const segment of segments) {
        if (segment === '' || segment === '.') {
            continue;
        } else if (segment === '..') {
            if (stack.length > 0) {
                stack.pop();
            }
        } else {
            stack.push(segment);
        }
    }
    const canonicalPath = stack.join('/');
    return canonicalPath;
}

