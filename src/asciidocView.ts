import {  Menu, Notice, TextFileView, TFile } from 'obsidian';
import { WorkspaceLeaf } from 'obsidian';
import { loadPrism, loadMermaid, setIcon, normalizePath } from 'obsidian';

import asciidoctor from 'asciidoctor';
import { AbstractBlock, Reader } from 'asciidoctor';
import { openSearchPanel } from "@codemirror/search";

import { StreamLanguage, defaultHighlightStyle } from "@codemirror/language";
import { EditorView, highlightActiveLine, lineNumbers } from "@codemirror/view";
import { EditorState } from "@codemirror/state";

// syntax highlighting related
import { ViewPlugin, ViewUpdate, Decoration, DecorationSet } from "@codemirror/view";
import { Prec, RangeSetBuilder } from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";
import { SyntaxNodeRef, Tree } from "@lezer/common";
import { Highlighter } from "@lezer/highlight";

import { tokenClassNodeProp } from "@codemirror/stream-parser";

import AsciidocPlugin from "./main"
import { basicExtensions } from "./codemirror";
import { SearchCtx } from "./searchCtx";
import { asciidoc } from "codemirror-asciidoc";
import { KeyInfo, KeyboardCallbacks } from "./keyboardCallbacks";
import { isValidUrl, isRelativePath, myRealpath,
  patchAdmonitionBlock } from "./util";


export const ASCIIDOC_EDITOR_VIEW = "asciidoc-editor-view";

declare const CodeMirror: any;
declare const Prism: any;
declare const mermaid: any;

CodeMirror.defineMode("asciidoc", asciidoc);
CodeMirror.defineMIME("text/asciidoc", "asciidoc");

const MAX_PREPROCESS_DEPTH = 10;
// borrowed from lib/asciidoctor/rx.rb
const IncludeDirectiveRx = /^(\\)?include::([^\s\[](?:[^\[]*[^\s\[])?)\[(#{CC_ANY}+)?\]$/gm;


loadPrism().then(_ => { });
loadMermaid().then(_ => { });

async function mermaidDraw(htmlItem: HTMLElement) {
  if (!htmlItem.lastChild)
    return;
  let firstChild = htmlItem.children[0];
  if (!(firstChild instanceof HTMLElement)) {
    return;
  }

  const txt = firstChild.innerText;
  htmlItem.removeChild(htmlItem.lastChild);
  let randId =  "Z" + Math.random().toString(36).substring(2, 16);
  let tmp = await mermaid.render(randId, txt);
  const parser = new DOMParser();
  let diagramDoc: any = parser.parseFromString(tmp.svg, "application/xml");
  let svg;
  if (diagramDoc) {
    for (let child of diagramDoc.childNodes) {
      if (child.tagName != "svg")
        continue;
      svg = child;
      break;
    }
  }
  htmlItem.appendChild(svg);
}


const tokenInfoPropId: number = tokenClassNodeProp.id;

function getHighlighters(state:any) {
  return [defaultHighlightStyle];
}

// Since Obsidian uses modified Codemirror version we can't rely on
// regular syntaxHighlighting and need to implement our highlighter from scratch
class TreeHighlighterEx {
  decorations: DecorationSet
  decoratedTo: number
  tree: Tree
  tokenCache: {[cls: string]: Decoration}

  constructor(view: EditorView) {
    this.tree = syntaxTree(view.state)
    this.decorations = this.buildDeco(view, getHighlighters(view.state))
    this.decoratedTo = view.viewport.to
    this.tokenCache = Object.create(null)
  }

  update(update: ViewUpdate) {
    let tree = syntaxTree(update.state), highlighters = getHighlighters(update.state)
    let styleChange = highlighters != getHighlighters(update.startState)
    let {viewport} = update.view, decoratedToMapped = update.changes.mapPos(this.decoratedTo, 1)
    if (tree.length < viewport.to && !styleChange && tree.type == this.tree.type && decoratedToMapped >= viewport.to) {
      this.decorations = this.decorations.map(update.changes)
      this.decoratedTo = decoratedToMapped
    } else if (tree != this.tree || update.viewportChanged || styleChange) {
      this.tree = tree
      this.decorations = this.buildDeco(update.view, highlighters)
      this.decoratedTo = viewport.to
    }
  }

  buildDeco(view: EditorView, highlighters: readonly Highlighter[] | null) {
    if (!highlighters || !this.tree.length) return Decoration.none

    let builder = new RangeSetBuilder<Decoration>()

    for (let rangeIter of view.visibleRanges) {
      let _this = this;

      function treeHandler (n: any/*SyntaxNodeRef*/) {
        try {
          let nm = n.type.props[tokenInfoPropId];
          if (!nm)
            return
          let cachedEntry
          if (!(cachedEntry = _this.tokenCache[nm])) {
            let m = {
              class: nm.split(" ").map((item: string) => "cm-" + item).join(" "),
                attributes: {
                spellcheck: "false"
              }
            }
            cachedEntry = _this.tokenCache[nm] = Decoration.mark(m)
          }
          builder.add(n.from, n.to, cachedEntry)
        } catch (err) {
          console.log(err);
        }
      }

      this.tree.iterate({
        from: rangeIter.from,
        to: rangeIter.to,
        enter: treeHandler,
      })
    }
    return builder.finish()
  }
}

const treeHighlighterEx =Prec.high(ViewPlugin.fromClass(TreeHighlighterEx, {
    decorations: v => v.decorations
}));


function deleteChildNodes(el: any) {
    while (el.hasChildNodes())
      el.removeChild(el.children[0]);
}

let isEditMode = true;

function mermaidBlockProcessor() {
  this.block(function() {
    const self = this
    self.named('mermaid')
    self.onContext(['listing'])
    self.process(function (parent: AbstractBlock, reader: Reader) {
      const diagramText = reader.read()
      return this.createPassBlock(parent, `<pre class='highlight'><code class='language-mermaid'>${diagramText}</code></pre>`)
    })
  })
}

export class AsciidocView extends TextFileView {
  private plugin: AsciidocPlugin;
  private div: HTMLElement;
  private actionElem: HTMLElement;
  private adoc: any;
  private sctx: SearchCtx;

  private editorView: EditorView;
  private keyMap: KeyboardCallbacks;
  private isEditMode: boolean;

  constructor(plugin: AsciidocPlugin, leaf: WorkspaceLeaf) {
    super(leaf);
    this.plugin = plugin;
    this.div = this.contentEl.createEl("div", { cls: "adoc-view" });
    this.isEditMode = isEditMode; // initialize with global value

    // For viewer mode
    this.adoc = asciidoctor();

    this.adoc.Extensions.register(mermaidBlockProcessor);

    this.keyMap = new KeyboardCallbacks();

    let editorState = EditorState.create({
      extensions: [
        basicExtensions,
        lineNumbers(),
        treeHighlighterEx,
        highlightActiveLine(),
        StreamLanguage.define(asciidoc),
        EditorView.updateListener.of((update) => {
          if (!update.docChanged) {
            return;
          }
          this.save(false);
        }),
      ],
    });
    this.editorView = new EditorView({
      state: editorState,
      //parent: this.contentEl,
    });

    this.actionElem = this.addAction("book-open", "preview/editor mode", (_: MouseEvent ) => { this.changeViewMode() });
    this.setModeIcon();

    // this code triggers codemirror styles load into separate obsidian window
    this.app.workspace.on("window-open", (win, window) => {
      setTimeout(() => {
        this.editorView.setRoot(this.contentEl.getRootNode() as Document);
      }, 200);
    });
  }

  private setModeIcon() {
    if (this.isEditMode) {
      setIcon(this.actionElem, "book-open");
      this.actionElem.setAttribute("aria-label", "Current view: editing\nclick to read")
    } else {
      setIcon(this.actionElem, "edit-3");
      this.actionElem.setAttribute("aria-label", "Current view: reading\nclick to edit")
    }
  }

  private changeViewMode() {
    isEditMode = this.isEditMode = !this.isEditMode
    this.setModeIcon();
    this.renderCurrentMode();
  }

  private renderCurrentMode() {
    if (!this.div) {
      console.log("No target div, SHOULD NOT REACH");
      return;
    }

    if (isEditMode) {
      this.div.replaceChildren(this.editorView.dom);
      this.editorView.setRoot(this.contentEl.getRootNode() as Document);
    } else {
      this.renderViewerMode(this.div);
    }
  }

  private getViewerOptions() {
    let attributes : Record<string, any> = {
      'showtitle': true,
      'outfilesuffix': '.adoc',
    };

    return {
      standalone: false,
      safe: 'safe',
      attributes: attributes
    };
  }

  private async resolveInclude(filePath: string, params?: string): Promise<string | undefined> {
    /*
     * Lets ignore params! Because I don't use them, so anyone shouldn't!
     */
    let path = this.canonicalizePath(filePath);
    let f = this.app.vault.getFileByPath(path);
    if (f === null) {
      console.warn(`can't resolve include ${f} for path ${this.app.workspace.getActiveFile()!.path}`);
      return undefined;
    }
    return await this.app.vault.read(f);
  }

  private async preprocessAdoc(doc: string, preprocessDepth?: number): Promise<string> {
    if (preprocessDepth === undefined) {
      preprocessDepth = 0;
    }
    if (preprocessDepth >= MAX_PREPROCESS_DEPTH) {
      console.error("preprocess depth exceeded!");
      return "**preprocess depth exceeded!**\n";
    }

    let matches = [...doc.matchAll(IncludeDirectiveRx)];
    if (matches.length == 0) {
      return doc;
    }
    let startIdx = 0;
    let outString = "";
    for (const m of matches) {
      outString += doc.substring(startIdx, m.index! - 1);
      startIdx = m.index! + m[0].length;
      let includeFilePath = m[2];
      let includeParams = m[4];
      if (includeFilePath === undefined) {
        console.error(`can't parse include FilePath for ${m[0]}`)
        continue
      }
      let s = await this.resolveInclude(includeFilePath, includeParams);
      if (s === undefined) {
        outString += "**Can't resolve include**\n";
      } else {
        outString += await this.preprocessAdoc(s, preprocessDepth + 1);
      }
    }
    outString += doc.substring(startIdx);

    return outString;
  }

  private async renderViewerMode(parentEl: HTMLElement) {
    const contents = this.editorView.state.doc.toString();
    const htmlStr = this.adoc.convert(await this.preprocessAdoc(contents), this.getViewerOptions());

    const parser = new window.DOMParser();

    let root = document.createElement("div");
    const dataEl = root.createEl("div", { cls : "markdown-preview-view markdown-rendered node-insert-event allow-fold-headings show-indentation-guide allow-fold-lists show-properties adoc-preview" });

    const parsedDoc = parser.parseFromString(htmlStr, "text/html")
    if (parsedDoc.body && parsedDoc.body.childNodes.length > 0) {
      let chldArr = parsedDoc.body.childNodes
      for (let i = 0; i < chldArr.length; i++) {
        dataEl.appendChild(chldArr[i])
      }
    }

    try {
      let collection : any = dataEl.getElementsByTagName("a");

      for (let item of collection) {
        let path = item.getAttribute("href").trim();
        item.className = "internal-link"

        const menu = new Menu();
        if (!path.startsWith("app://") && isValidUrl(path)) {
          item.className = "external-link"
        } else {
          path = this.canonicalizePath(path);
          item.onclick = (evt: Event) => {
            this.app.workspace.openLinkText(path, '', false);
            evt.preventDefault();
          }
          menu.addItem((item) =>
            item
            .setTitle('Open')
            .onClick(() => this.app.workspace.openLinkText(path, '', false))
          )
        }
        menu.addItem((item) =>
           item
           .setTitle('Copy URL')
           .setIcon('documents')
           .onClick(() => {
             new Notice('Copied');
             navigator.clipboard.writeText(path);
        }));

        item.addEventListener("contextmenu",
          (ev: MouseEvent) => menu.showAtMouseEvent(ev),
          false
        )
        item.setAttribute("rel", "noopener")
        item.setAttribute("target", "_blank")
      }

      collection = dataEl.getElementsByTagName("pre");
      for (let item of collection) {
        if (item.className == "highlight" && item.children.length == 1) {
          let className = item.children[0].className;
          if (className == "language-diagram") {
            // render drawio svg image (for processing asciidoc wiki.js pages)
            let html = Buffer.from(item.children[0].innerText, "base64").toString('utf8');
            //sanitize html contents for security reasons
            const parser = new DOMParser();
            let diagramDoc: any = parser.parseFromString(html, "application/xml");
            let svg;
            if (diagramDoc) {
              for (let child of diagramDoc.childNodes) {
                if (child.tagName != "svg")
                  continue;
                svg = child;
                break;
              }
            }
            if (svg) {
              for (let child of svg.children) {
                if (child.tagName && child.tagName.toLowerCase() == "script")
                  svg.removeChild(child);
              }
              item.replaceChild(svg, item.lastChild);
            }
          } else if (className.startsWith("language-mermaid")) {
            mermaidDraw(item);
          } else if (className.startsWith("language-")) {
            item.className = className;
            Prism.highlightElement(item);
          }
        }
      }

      collection = dataEl.getElementsByTagName("img");
      for (let item of collection) {
        let path = item.attributes.src.value;
        if (isValidUrl(path)) {
          continue;
        }
        path = this.canonicalizePath(path);
        let file = app.metadataCache.getFirstLinkpathDest(path, "");
        if (file instanceof TFile) {
          item.src = this.app.vault.getResourcePath(file);
        }
      }

      // Try to mimic admotions for callouts
      collection = dataEl.getElementsByClassName("admonitionblock");
      while (collection.length > 0) {
        patchAdmonitionBlock(collection[0]);
      }
    } catch (err) {
      console.log(err);
    }

    this.sctx = new SearchCtx(dataEl, root);
    parentEl.replaceChildren(root);
  }

  async onOpen() {
    await super.onOpen();
  }

  async onLoadFile(file: TFile) {

    this.renderCurrentMode()
    this.addKeyEvents();
    await super.onLoadFile(file);
  }

  async onUnloadFile(file: TFile) {
    window.removeEventListener('keydown', this.keyHandle, true);
    await super.onUnloadFile(file);
    deleteChildNodes(this.div);
  }

  async onClose() {
    await super.onClose();
  }

  onResize() {
  }

  getContext(file?: TFile) {
    return file?.path ?? this.file?.path;
  }

  getViewType() {
    return ASCIIDOC_EDITOR_VIEW;
  }

  getViewData = () => {
    return this.editorView.state.doc.toString();
  }

  setViewData = (data: string, clear: boolean) => {
    this.editorView.dispatch({
      changes: {
        from: 0,
        to: this.editorView.state.doc.length,
        insert: data}
    })
    if (clear) {
      if (!isEditMode) {
        this.renderViewerMode(this.div);
      }
    }
  }

  clear = () => {
    this.editorView.dispatch({
      changes: {
        from: 0,
        to: this.editorView.state.doc.length,
        insert: ""}
    })
  }

  addKeyEvents() {
    // For our Asciidoc view We need to override some obsidian markdown related hotkeys
    let getHotkey = (nm: string) => {
      // @ts-ignore
      if (this.app.hotkeyManager) {
        // @ts-ignore
        let tmp =  this.app.hotkeyManager.customKeys[nm]
        if (tmp && tmp.length)
          return tmp[0]
      }

      // @ts-ignore
      let command = this.app.commands.findCommand(nm)

      if (command.hotkeys && command.hotkeys.length > 0) {
        return command.hotkeys[0];
      }
      return undefined;
    }

    this.keyMap.registerObsidianHotkey(getHotkey("markdown:toggle-preview"),
        new KeyInfo("E", false, true, false),
        () => { this.changeViewMode() } )
    this.keyMap.registerObsidianHotkey(getHotkey("editor:open-search"),
        new KeyInfo("F", false, true, false),
        () => { this.commandFind() })
    this.keyMap.registerKey(new KeyInfo("Escape"), () => { this.commandEsc() })

    window.addEventListener('keydown', this.keyHandle, true);
  }

  private keyHandle = (event: KeyboardEvent) => {
    if (this.app.workspace.activeLeaf != this.leaf)
      return;

    this.keyMap.handleKeyboardEvent(event);
  }

  commandFind() {
    if (isEditMode) {
      openSearchPanel(this.editorView);
    } else {
      this.sctx.focus();
    }
  }

  commandEsc() {
    if (isEditMode)
      return;
    this.sctx.resetSearch();
  }

  canonicalizePath(path: string): string {
    if (isValidUrl(path))
      return path;

    path = normalizePath(path);
    if (path.startsWith("#")) {
      const currentFile = this.app.workspace.getActiveFile();
      if (currentFile instanceof TFile) {
        return `${currentFile.path}${path}`;
      }
    } else if (isRelativePath(path)) {
      const currentFile = this.app.workspace.getActiveFile();
      if (currentFile instanceof TFile) {
        const tmp = currentFile.path;
        const currentDir = tmp.substr(0, tmp.lastIndexOf('/'));
        path = myRealpath(`${currentDir}/${path}`);
      }
    }
    return path;
  }
}

