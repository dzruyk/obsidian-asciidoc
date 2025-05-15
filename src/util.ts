import { setIcon } from 'obsidian';
import { TFolder, TAbstractFile } from 'obsidian';

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

const asciidocLinksRex = new RegExp("(link|xref|image):([^\\[]+)\\[([^\\]]*)\\]", "gi");

export class PagePosition {
  line: number;
  col: number;
  offset: number;
  constructor(line: number, col: number, offset: number) {
    this.line = line;
    this.col = col;
    this.offset = offset;
  }
}

export class DocRef {
  displayText: string;
  link: string;
  original: string;
  position: any;

  constructor(displayText: string, link: string, original: string, pos: PagePosition) {
    this.displayText = displayText;
    this.link = link;
    this.original = original;
    this.position = {
      start: pos,
      stop: new PagePosition(pos.line, pos.col + original.length, pos.offset + original.length)
    };
  }
}

export function adocFindDocumentRefs(doc: string): DocRef[] {
  let res: DocRef[] = [];
  let nline = 0;
  let off = 0;

  doc.split("\n").forEach((ln) => {
    nline += 1;
    let m: RegExpExecArray | null;
    while ((m = asciidocLinksRex.exec(ln)) !== null) {
      const url = m[2];
      const displayText = m[3];
      if (isValidUrl(url))
        continue; // skip non local references
      res.push(
        new DocRef(displayText, url, m[0],
          new PagePosition(nline, m.index, m.index + off)));
    }
    off += ln.length;
  });
  return res;
}

export async function hashString(doc: string, hashName?: string): Promise<string> {
  if (hashName === undefined)
    hashName = "SHA-256"
  const buf = new TextEncoder().encode(doc);
  const binhash = await crypto.subtle.digest(hashName, buf);
  return Buffer.from(binhash).toString('hex');
}

export type ChildPassFunction = (e?: TAbstractFile) => void;

export function filesRecursePassCb (e: TAbstractFile, t: ChildPassFunction) {
  let n: TAbstractFile[] = [];
  for (n = [e]; n.length > 0; ) {
    var i = n.pop();
    if (i && (t(i),
        i instanceof TFolder)) {
      const tmp = i as TFolder;
      let r: TAbstractFile[] = tmp.children;
      n = n.concat(r)
    }
  }
}

